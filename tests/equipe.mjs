// Essai du changement d'équipe d'une discussion ouverte : une IA → plusieurs → une autre composition → une seule,
// et l'orchestre, sans ouvrir de nouvelle discussion et en gardant l'historique. Les IA sont jouées par une FAUSSE
// API locale (aucun modèle n'est appelé, sauf le démarrage d'un Claude sans message pour l'orchestre).
// Usage, sur un serveur jetable (DEVWORKSHOP_CONFIG d'essai, projet existant) :
//   DEVWORKSHOP_PORT=5342 DEVWORKSHOP_CONFIG=… node tests/equipe.mjs <projet>
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { register } from 'node:module';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const origine = `http://127.0.0.1:${PORT}`;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Fausse API : garde les consignes reçues ; « lent » fait attendre ; dans un salon, tous s'accordent tout de suite.
const recu = [];
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', async () => {
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'faux' }] }));
    const { messages } = JSON.parse(corps);
    recu.push({ consigne: messages.find((m) => m.role === 'system')?.content || '', dernier: messages.at(-1).content });
    if (messages.at(-1).content.includes('lent')) await pause(2500);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Entendu. ACCORD_VALIDE SANS_TRAVAIL' } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${faux.address().port}/v1`;

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
const tourFini = (s) => attendre((m) => m.session === s && ((m.t === 'tour' && !m.auteur) || m.t === 'salon_pause'), 60000);

await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');
for (const nom of ['Alpha API', 'Bravo API']) dire({ t: 'creer_compte', type: 'api', nom, url, modele: 'faux', cle: 'cle-d-essai-123456' });
const comptes = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Bravo API')))?.comptes || [];
const A = comptes.find((c) => c.nom === 'Alpha API').id;
const B = comptes.find((c) => c.nom === 'Bravo API').id;

// 1. Une seule IA, un premier échange.
dire({ t: 'ouvrir', projet, compte: A });
const s = (await attendre((m) => m.t === 'rejouer'))?.session;
dire({ t: 'envoyer', session: s, texte: 'Premier message : le mot secret est cormoran.' });
await tourFini(s);

// 2. Elle devient une discussion à deux, sans nouvelle session.
recus.splice(0);
recu.splice(0);
dire({ t: 'changer_equipe', session: s, participants: [{ compte: A, nom: 'Alpha' }, { compte: B, nom: 'Bravo' }], echanges: 2 });
const deux = await attendre((m) => m.t === 'rejouer');
noter('à deux : même discussion, rejouée', deux?.session === s && deux.resume.participants?.join() === 'Alpha,Bravo', JSON.stringify(deux?.resume.participants));
noter('l’historique reste affiché', deux?.evenements.some((e) => e.t === 'utilisateur' && e.texte.includes('cormoran')));
noter('note « nouvelle équipe » dans le fil', deux?.evenements.some((e) => e.t === 'info' && e.code === 'equipe' && e.qui === 'Alpha, Bravo'));
noter('équipe et échanges connus de l’écran', deux?.resume.equipe?.length === 2 && deux.resume.echanges === 2);
const gen = await attendre((m) => m.t === 'general');
noter('aucune discussion de plus', gen?.vivantes.length === 1 && gen.vivantes[0].id === s, `${gen?.vivantes.length} ouverte(s)`);
dire({ t: 'envoyer', session: s, texte: 'Deuxième message.' });
await tourFini(s);
const consignes = recu.map((r) => r.consigne);
noter('chacune des deux reçoit l’historique', consignes.length >= 2 && consignes.every((c) => c.includes('cormoran') && c.includes("changer l'équipe")), `${consignes.length} appel(s)`);

// 3. Une troisième la rejoint.
recus.splice(0);
dire({ t: 'changer_equipe', session: s, participants: [{ compte: A, nom: 'Alpha' }, { compte: B, nom: 'Bravo' }, { compte: A, nom: 'Charlie' }], echanges: 3 });
const trois = await attendre((m) => m.t === 'rejouer');
noter('à trois', trois?.session === s && trois.resume.participants?.length === 3 && trois.resume.echanges === 3);

// 4. Retour à une seule IA : elle sait ce que les autres ont dit, signé.
recus.splice(0);
recu.splice(0);
dire({ t: 'changer_equipe', session: s, compte: B });
const une = await attendre((m) => m.t === 'rejouer');
noter('une seule IA : Bravo', une?.session === s && une.resume.compte === B && !une.resume.participants && !une.resume.equipe);
dire({ t: 'envoyer', session: s, texte: 'Troisième message.' });
await tourFini(s);
noter('elle reçoit l’historique, réponses signées', recu[0]?.consigne.includes('cormoran') && recu[0].consigne.includes('[Alpha]') && recu[0].consigne.includes('[Bravo]'));

// 5. Refus : IA au travail, trop d'IA, noms en double.
recus.splice(0);
dire({ t: 'envoyer', session: s, texte: 'lent' });
await attendre((m) => m.session === s && m.t === 'etat' && m.occupe === true);
dire({ t: 'changer_equipe', session: s, participants: [{ compte: A, nom: 'X' }, { compte: B, nom: 'Y' }] });
noter('pendant un tour : refusé', (await attendre((m) => m.t === 'refus' && m.ordre === 'changer_equipe'))?.code === 'changement_occupe');
await tourFini(s);
dire({ t: 'changer_equipe', session: s, participants: [1, 2, 3, 4, 5].map((i) => ({ compte: A, nom: `N${i}` })) });
noter('cinq IA : refusé', (await attendre((m) => m.t === 'refus' && m.ordre === 'changer_equipe'))?.code === 'trop_de_participants');
dire({ t: 'changer_equipe', session: s, participants: [{ compte: A, nom: 'Même' }, { compte: B, nom: 'Même' }] });
noter('noms en double : refusé', (await attendre((m) => m.t === 'refus' && m.ordre === 'changer_equipe'))?.code === 'noms_en_double');

// 6. L'orchestre (cheffe Claude ; aucun message ne lui est envoyé ici), puis retour.
recus.splice(0);
dire({ t: 'changer_equipe', session: s, orchestre: true });
const orch = await attendre((m) => m.t === 'rejouer');
noter('orchestre : même discussion', orch?.session === s && orch.resume.orchestre === true && orch.resume.compte === 'defaut');
recus.splice(0);
dire({ t: 'changer_equipe', session: s, compte: A });
noter('retour à une IA depuis l’orchestre', (await attendre((m) => m.t === 'rejouer'))?.resume.orchestre === false);

// 7. La vraie page : 👥 part de l'équipe et l'applique à cette discussion ; la liste des IA en fait autant.
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
  constructor(u) { super(u, { origin: origine }); }
};
register('./crochets.mjs', import.meta.url);
const erreurs = [];
process.on('uncaughtException', (e) => erreurs.push(e));
window.addEventListener('error', (e) => erreurs.push(e.error || e.message));
await import(path.join(racine, 'public/js/app.js'));
const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
async function voir(condition, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = condition();
    if (v) return v;
    await pause(100);
  }
  return null;
}
const cliquer = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const ouverte = await voir(() => $$('.sous-liste .ligne').find((l) => l.querySelector('.titre')?.textContent.includes('cormoran')));
cliquer(ouverte);
noter('page : discussion ouverte', await voir(() => $('.message.utilisateur')));
cliquer($('#ouvrir-salon'));
const panneau = await voir(() => !$('#panneau-salon').hidden && $('#panneau-salon'));
const boutons = $$('#panneau-salon .actions button').map((b) => b.textContent);
noter('page : 👥 propose d’appliquer à cette discussion', boutons.includes('Appliquer à cette discussion') && boutons.includes('Démarrer une nouvelle discussion'), boutons.join(' | '));
noter('page : l’IA en place est dans l’équipe proposée', panneau && $$('#panneau-salon .participant select')[0]?.value === A);
cliquer($$('#panneau-salon .actions button').find((b) => b.textContent === 'Appliquer à cette discussion'));
noter('page : à deux, même discussion', await voir(() => $('#compte').value === 'salon' && $$('.fil .fin-tour').some((n) => n.textContent.includes('Nouvelle équipe'))));
noter('page : la liste des IA dit « Plusieurs IA »', $('#compte').selectedOptions[0]?.textContent.includes('Plusieurs IA'));
$('#compte').value = B;
$('#compte').dispatchEvent(new window.Event('change'));
noter('page : choisir une IA dans la liste revient à une seule IA', await voir(() => $('#compte').value === B && $$('.fil .fin-tour').filter((n) => n.textContent.includes('Nouvelle équipe')).length >= 2));
$('#compte').value = 'orchestre';
$('#compte').dispatchEvent(new window.Event('change'));
noter('page : « Orchestre » dans la liste passe la discussion en orchestre', await voir(() => $('#compte').value === 'orchestre' && $$('.fil .fin-tour').some((n) => n.textContent.includes('cheffe d’orchestre'))));
const g = await voir(() => recus.findLast((m) => m.t === 'vivantes')); // la veille du serveur, vue par la 1re connexion
noter('page : toujours une seule discussion ouverte', g?.vivantes.length === 1);
noter('aucune erreur de script', !erreurs.length, erreurs.map(String).join(' | ').slice(0, 300));

dire({ t: 'fermer', session: s });
for (const id of [A, B]) dire({ t: 'supprimer_compte', id });
await pause(500);
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
