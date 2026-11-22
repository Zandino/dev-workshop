// Essai de la reprise d'une discussion interrompue dont un compte a été supprimé entre-temps : elle reprend sans
// lui (le fil le dit), seule avec la dernière IA s'il n'en reste qu'une. Vécu le 21/11/2026 : « Compte inconnu ».
// Les IA sont jouées par une FAUSSE API locale. Lance lui-même le serveur (redémarrages compris) :
//   HOME=… DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=… (projet « essai » existant) DEVWORKSHOP_PORT=5347 node tests/reprise-comptes.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT);
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const faux = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    if (req.url.endsWith('/models')) return res.end('{"data":[{"id":"faux"}]}');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Entendu. ACCORD_VALIDE SANS_TRAVAIL' } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${faux.address().port}/v1`;

const demarrer = async () => {
  const p = spawn(process.execPath, [path.join(racine, 'serveur/index.mjs')], { stdio: 'ignore' });
  await pause(2500);
  return p;
};
async function connexion() {
  const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'jeton'), 'utf8').trim();
  const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
  const recus = [];
  ws.on('message', (d) => recus.push(JSON.parse(d.toString())));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'bonjour', jeton }));
  const attendre = async (test, ms = 20000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) { const i = recus.findIndex(test); if (i >= 0) return recus.splice(i, 1)[0]; await pause(50); }
    return null;
  };
  return { dire: (o) => ws.send(JSON.stringify(o)), attendre, fermer: () => ws.close() };
}

/** Ouvre un salon, échange une fois, attend la sauvegarde, puis arrête le serveur. Rend l'id de la discussion. */
async function salonInterrompu(serveur, c, participants) {
  c.dire({ t: 'ouvrir', projet: 'essai', participants, echanges: 2 });
  const s = (await c.attendre((m) => m.t === 'rejouer'))?.session;
  c.dire({ t: 'envoyer', session: s, texte: 'Le mot secret est cormoran.' });
  await c.attendre((m) => m.t === 'salon_pause' && m.session === s, 20000);
  await pause(6000);
  c.fermer();
  serveur.kill('SIGTERM');
  await pause(1500);
  return s;
}

let serveur = await demarrer();
let c = await connexion();
await c.attendre((m) => m.t === 'general');
for (const nom of ['Un API', 'Deux API', 'Trois API']) c.dire({ t: 'creer_compte', type: 'api', nom, url, modele: 'faux' });
const comptes = (await c.attendre((m) => m.t === 'general' && m.comptes.some((x) => x.nom === 'Trois API')))?.comptes || [];
const [A, B, C] = ['Un API', 'Deux API', 'Trois API'].map((n) => comptes.find((x) => x.nom === n).id);

// 1. Salon à trois, interrompu ; un compte est supprimé avant la reprise.
const s1 = await salonInterrompu(serveur, c, [{ compte: A, nom: 'Un' }, { compte: B, nom: 'Deux' }, { compte: C, nom: 'Trois' }]);
serveur = await demarrer();
c = await connexion();
await c.attendre((m) => m.t === 'general');
c.dire({ t: 'supprimer_compte', id: C });
await c.attendre((m) => m.t === 'general' && !m.comptes.some((x) => x.id === C));
c.dire({ t: 'reprendre_interrompue', id: s1 });
const r1 = await c.attendre((m) => m.t === 'rejouer' || m.t === 'refus');
noter('compte supprimé : la reprise n’est plus refusée', r1?.t === 'rejouer', r1?.t === 'refus' ? r1.code : '');
noter('elle reprend à deux, sans lui', r1?.resume?.participants?.join() === 'Un,Deux', JSON.stringify(r1?.resume?.participants));
noter('le fil dit pourquoi', r1?.evenements?.some((e) => e.t === 'info' && e.code === 'comptes_supprimes' && e.qui === 'Trois'));
noter('l’historique est là', r1?.evenements?.some((e) => e.t === 'utilisateur' && e.texte.includes('cormoran')));
const s1bis = r1?.session;

// 2. Salon à deux : l'un des comptes supprimé, l'IA restante continue seule.
c.dire({ t: 'fermer', session: s1bis });
await c.attendre((m) => m.t === 'general');
const s2 = await salonInterrompu(serveur, c, [{ compte: A, nom: 'Un' }, { compte: B, nom: 'Deux' }]);
serveur = await demarrer();
c = await connexion();
await c.attendre((m) => m.t === 'general');
c.dire({ t: 'supprimer_compte', id: B });
await c.attendre((m) => m.t === 'general' && !m.comptes.some((x) => x.id === B));
c.dire({ t: 'reprendre_interrompue', id: s2 });
const r2 = await c.attendre((m) => m.t === 'rejouer' || m.t === 'refus');
noter('une seule IA restante : elle continue seule', r2?.t === 'rejouer' && r2.resume.compte === A && !r2.resume.participants, JSON.stringify(r2?.resume && { compte: r2.resume.compte, participants: r2.resume.participants }));
noter('… et le fil le dit', r2?.evenements?.some((e) => e.t === 'info' && e.code === 'comptes_supprimes' && e.qui === 'Deux'));

c.dire({ t: 'fermer', session: r2?.session });
c.dire({ t: 'supprimer_compte', id: A });
await pause(500);
serveur.kill('SIGTERM');
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
