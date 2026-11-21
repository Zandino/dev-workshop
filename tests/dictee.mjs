// Essai de la dictée : le canal (Whisper sur le serveur, installé à la demande ; un compte API joué par un FAUX
// serveur local) puis la vraie page dans jsdom, avec un faux micro qui lit un fichier WAV.
// Le fichier : de la parole, en WAV PCM 16 bits, 16 kHz, mono (par exemple la synthèse vocale du système).
// L'essai installe la bibliothèque si elle manque (~750 Mo, réseau) et télécharge le modèle « rapide » (~250 Mo).
// Usage, sur un serveur jetable (DEVWORKSHOP_CONFIG d'essai, projet existant) :
//   DEVWORKSHOP_PORT=5340 DEVWORKSHOP_CONFIG=… node tests/dictee.mjs <projet> <voix.wav> "<mots attendus>"
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { register } from 'node:module';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const [projet = 'essai', fichierWav, attendus = ''] = process.argv.slice(2);
const origine = `http://127.0.0.1:${PORT}`;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const wav = readFileSync(fichierWav);
const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length - ((wav.length - 44) % 2)));
const mots = attendus.toLowerCase().split(/\s+/).filter(Boolean);
const reconnu = (texte) => mots.every((m) => String(texte).toLowerCase().includes(m));

// Faux service en ligne : garde ce qu'il reçoit ; « /incapable » joue un compte qui ne transcrit pas.
const recu = [];
const faux = http.createServer((req, res) => {
  const morceaux = [];
  req.on('data', (d) => morceaux.push(d));
  req.on('end', () => {
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'x' }] }));
    recu.push({ url: req.url, autorisation: req.headers.authorization, corps: Buffer.concat(morceaux).toString('latin1') });
    if (req.url.startsWith('/incapable')) { res.writeHead(404); return res.end('{}'); }
    res.end(JSON.stringify({ text: 'bonjour depuis le service en ligne' }));
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));
const urlFaux = `http://127.0.0.1:${faux.address().port}`;

// 1. Le canal.
const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: origine });
const recus = [];
const attentes = new Set();
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  recus.push(m);
  for (const a of [...attentes]) if (a.test(m)) { attentes.delete(a); a.ok(m); }
});
const dire = (o) => ws.send(JSON.stringify(o));
function attendre(test, ms = 30000) {
  const deja = recus.find(test);
  if (deja) { recus.splice(recus.indexOf(deja), 1); return Promise.resolve(deja); }
  return new Promise((ok) => {
    const a = { test, ok: (m) => { recus.splice(recus.indexOf(m), 1); ok(m); } };
    attentes.add(a);
    setTimeout(() => { attentes.delete(a); ok(null); }, ms);
  });
}
const base64 = (x) => Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('base64');
/** Une dictée complète par le canal : rend le texte ou le code du refus. */
async function dicter(moteur, son, id = Math.random().toString(36).slice(2)) {
  dire({ t: 'dictee_debut', id, moteur, langue: 'fr' });
  for (let i = 0; i < son.length; i += 16000) dire({ t: 'dictee_morceau', id, donnees: base64(son.subarray(i, i + 16000)) });
  dire({ t: 'dictee_fin', id });
  const r = await attendre((m) => (m.t === 'dictee_texte' && m.id === id) || (m.t === 'refus' && /^dictee_/.test(m.ordre)), 900000);
  return r?.t === 'dictee_texte' ? { texte: r.texte } : { refus: r?.code };
}

await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');
dire({ t: 'dictee_etat' });
const depart = await attendre((m) => m.t === 'dictee_etat');
noter('état de la dictée sur le serveur', ['absent', 'pret'].includes(depart?.local), depart?.local);
if (depart?.local === 'absent') {
  noter('pas installée : refus clair', (await dicter('rapide', pcm)).refus === 'dictee_absente');
  const t0 = Date.now();
  dire({ t: 'dictee_installer' });
  noter('installation annoncée', (await attendre((m) => m.t === 'dictee_etat'))?.local === 'installation');
  const fin = await attendre((m) => m.t === 'dictee_etat' && m.local !== 'installation', 900000);
  noter('installation terminée', fin?.local === 'pret', `${Math.round((Date.now() - t0) / 1000)} s`);
}
let t0 = Date.now();
const ici = await dicter('rapide', pcm);
noter('Whisper sur le serveur : texte reconnu', reconnu(ici.texte), `${Date.now() - t0} ms — ${ici.texte ?? ici.refus}`);
t0 = Date.now();
const encore = await dicter('rapide', pcm);
noter('seconde dictée (modèle déjà chargé)', reconnu(encore.texte), `${Date.now() - t0} ms`);
noter('trop courte : refusée', (await dicter('rapide', pcm.subarray(0, 3000))).refus === 'dictee_vide');
noter('plus de 3 minutes : refusée', (await dicter('rapide', new Int16Array(16000 * 185))).refus === 'dictee_trop_longue');
noter('moteur inconnu : refusé', (await dicter('nimporte', pcm)).refus === 'compte_inconnu');

dire({ t: 'creer_compte', type: 'api', nom: 'Transcription', url: `${urlFaux}/v1`, modele: 'x', cle: 'cle-d-essai-123456' });
dire({ t: 'creer_compte', type: 'api', nom: 'Incapable', url: `${urlFaux}/incapable`, modele: 'x' });
const comptes = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Incapable')))?.comptes || [];
const enLigne = comptes.find((c) => c.nom === 'Transcription');
const enLigneTexte = await dicter(enLigne.id, pcm);
const requete = recu.find((r) => r.url === '/v1/audio/transcriptions');
noter('en ligne : texte du service', enLigneTexte.texte === 'bonjour depuis le service en ligne', JSON.stringify(enLigneTexte));
noter('en ligne : WAV, modèle, langue et clé envoyés', requete && requete.corps.includes('RIFF') && requete.corps.includes('WAVEfmt') && requete.corps.includes('whisper-1') && /name="language"\r\n\r\nfr/.test(requete.corps) && requete.autorisation === 'Bearer cle-d-essai-123456');
noter('compte qui ne transcrit pas : refus clair', (await dicter(comptes.find((c) => c.nom === 'Incapable').id, pcm)).refus === 'dictee_compte_incapable');

// 2. La vraie page, avec un faux micro qui joue le fichier.
const dom = new JSDOM(readFileSync(path.join(racine, 'public/index.html'), 'utf8'), { url: `${origine}/#jeton=${jeton}`, pretendToBeVisual: true });
const { window } = dom;
window.localStorage.setItem('devworkshop.langue', 'fr');
window.localStorage.setItem('devworkshop.projet', projet);
window.Element.prototype.scrollIntoView = () => {};
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'Event']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
globalThis.WebSocket = class extends WS {
  constructor(url) { super(url, { origin: origine }); }
};
let pistesArretees = 0;
let microRefuse = false;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => {
  if (microRefuse) throw new Error('NotAllowedError');
  return { getTracks: () => [{ stop: () => pistesArretees++ }] };
} } } });
/** Faux AudioContext : le nœud reçoit le fichier par blocs de 4096 échantillons, quatre fois plus vite que la voix. */
globalThis.AudioContext = class {
  constructor({ sampleRate }) { this.taux = sampleRate; }
  createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
  createScriptProcessor(taille) {
    let i = 0;
    const noeud = { onaudioprocess: null, connect: () => {}, disconnect: () => clearInterval(noeud.minuterie) };
    noeud.minuterie = setInterval(() => {
      const bloc = Float32Array.from(pcm.subarray(i, i + taille), (v) => v / 32768);
      i += taille;
      if (bloc.length) noeud.onaudioprocess?.({ inputBuffer: { getChannelData: () => bloc } });
    }, (taille / 16000) * 250);
    return noeud;
  }
  get destination() { return {}; }
  close() { return Promise.resolve(); }
};
globalThis.confirm = () => true;

register('./crochets.mjs', import.meta.url);
const erreurs = [];
process.on('uncaughtException', (e) => erreurs.push(e));
window.addEventListener('error', (e) => erreurs.push(e.error || e.message));
await import(path.join(racine, 'public/js/app.js'));
const $ = (s) => document.querySelector(s);
async function voir(condition, ms = 60000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = condition();
    if (v) return v;
    await pause(100);
  }
  return null;
}
const cliquer = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const bouton = await voir(() => !$('#dicter').disabled && $('#dicter'));
noter('page : 🎤 actif dans la saisie', bouton);
noter('page : moteurs proposés (Whisper ici, compte en ligne)', await voir(() => [...$('#dictee-moteur').options].map((o) => o.textContent).join(' | ').includes('Transcription (en ligne)')), [...$('#dictee-moteur').options].map((o) => o.textContent).join(' | '));
$('#champ').value = 'Avant :';
cliquer(bouton);
noter('page : écoute en cours', await voir(() => $('#dicter').classList.contains('ecoute') && /\d s/.test($('#dicter-temps').textContent)));
await pause(Math.ceil((pcm.length / 16000) * 250) + 1500); // le temps que le faux micro ait tout joué
cliquer(bouton);
noter('page : micro relâché', pistesArretees === 1 && $('#dicter').classList.contains('transcription'));
const rempli = await voir(() => $('#champ').value.length > 10 && !$('#dicter').classList.contains('transcription') && $('#champ').value, 120000);
noter('page : texte ajouté après ce qui était écrit', rempli?.startsWith('Avant : ') && reconnu(rempli), rempli);
noter('page : rien n’est envoyé sans toi', !$('.message.utilisateur'));

cliquer(bouton);
await voir(() => $('#dicter').classList.contains('ecoute'));
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
noter('page : Échap annule', await voir(() => !$('#dicter').classList.contains('ecoute') && pistesArretees === 2 && $$notes('Dictée annulée')));
microRefuse = true;
cliquer(bouton);
noter('page : micro refusé, message clair', await voir(() => $$notes('Micro inaccessible')));
noter('aucune erreur de script', !erreurs.length, erreurs.map(String).join(' | ').slice(0, 300));
function $$notes(texte) { return [...document.querySelectorAll('.notification')].some((n) => n.textContent.includes(texte)); }

for (const c of comptes.filter((x) => x.type === 'api')) dire({ t: 'supprimer_compte', id: c.id });
await pause(500);
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
