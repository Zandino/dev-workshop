// Essai : ranger une discussion OUVERTE dans un autre projet (demenager-session.mjs), chemin « avec historique »
// (une IA par API, jouée par une FAUSSE API locale). Elle change de projet sans changer d'id, le fil le dit, l'IA
// reçoit l'historique et répond ensuite ; refus pendant qu'elle travaille, vers le même projet, ou d'un nom invalide.
// Le chemin « Claude du serveur » (reprise native de sa session) demande un vrai Claude : essai à part, avec modèle.
// Lance lui-même le serveur :
//   HOME=… DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=… (projet « essai ») DEVWORKSHOP_PORT=5349 node tests/demenager.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
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

let lent = false;
const demandes = [];
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', async () => {
    if (req.url.endsWith('/models')) return res.end('{"data":[{"id":"faux"}]}');
    demandes.push(JSON.parse(corps || '{}'));
    if (lent) await pause(3000);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Entendu.' } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));

const serveur = spawn(process.execPath, [path.join(racine, 'serveur/index.mjs')], { stdio: 'ignore' });
await pause(2500);
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'jeton'), 'utf8').trim();
const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const recus = [];
ws.on('message', (d) => recus.push(JSON.parse(d.toString())));
await new Promise((r) => ws.on('open', r));
const dire = (o) => ws.send(JSON.stringify(o));
const attendre = async (test, ms = 15000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const i = recus.findIndex(test); if (i >= 0) return recus.splice(i, 1)[0]; await pause(50); }
  return null;
};
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');
dire({ t: 'creer_compte', type: 'api', nom: 'Fausse API', url: `http://127.0.0.1:${faux.address().port}/v1`, modele: 'faux' });
const compte = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Fausse API')))?.comptes.find((c) => c.nom === 'Fausse API');

dire({ t: 'ouvrir', projet: 'essai', compte: compte.id, titre: 'À ranger' });
const s = (await attendre((m) => m.t === 'rejouer'))?.session;
dire({ t: 'envoyer', session: s, texte: 'Le mot secret est héron.' });
await attendre((m) => m.t === 'tour' && m.session === s);

// Refus
dire({ t: 'deplacer_discussion', session: s, vers: 'essai' });
noter('vers son propre projet : refusé', (await attendre((m) => m.t === 'refus'))?.code === 'meme_projet');
dire({ t: 'deplacer_discussion', session: s, vers: '../ailleurs' });
noter('nom invalide : refusé', (await attendre((m) => m.t === 'refus'))?.code === 'nom_invalide');
lent = true;
dire({ t: 'envoyer', session: s, texte: 'Prends ton temps.' });
await pause(500);
dire({ t: 'deplacer_discussion', session: s, vers: 'rangement', creer: true });
noter('pendant qu’elle travaille : refusé', (await attendre((m) => m.t === 'refus'))?.code === 'discussion_occupee');
noter('… sans créer le projet d’arrivée', !existsSync(path.join(process.env.DEVWORKSHOP_ROOT, 'rangement')));
await attendre((m) => m.t === 'tour' && m.session === s);
lent = false;

// Rangement
dire({ t: 'deplacer_discussion', session: s, vers: 'rangement', creer: true });
const r = await attendre((m) => m.t === 'rejouer' && m.session === s);
noter('même discussion, nouveau projet', r?.resume?.projet === 'rangement' && r.session === s, r?.resume?.projet);
noter('le fil dit où elle est rangée', r?.evenements?.some((e) => e.t === 'info' && e.code === 'discussion_rangee_ici' && e.de === 'essai' && e.vers === 'rangement'));
noter('l’historique est toujours là', r?.evenements?.some((e) => e.t === 'utilisateur' && e.texte.includes('héron')));
noter('confirmation pour l’écran', await attendre((m) => m.t === 'discussion_deplacee' && m.vers === 'rangement'));
const v = await attendre((m) => m.t === 'vivantes' && m.vivantes.some((x) => x.id === s && x.projet === 'rangement'));
noter('la barre la montre dans le nouveau projet', v);

const avant = demandes.length;
dire({ t: 'envoyer', session: s, texte: 'Quel est le mot secret ?' });
await attendre((m) => m.t === 'tour' && m.session === s);
const derniere = JSON.stringify(demandes[avant] || {});
noter('l’IA répond après le rangement, avec l’historique et son nouveau projet', demandes.length > avant && derniere.includes('héron') && derniere.includes('ranger cette conversation dans un autre projet (essai → rangement)'), derniere.slice(0, 120));

dire({ t: 'fermer', session: s });
dire({ t: 'supprimer_compte', id: compte.id });
await pause(500);
ws.close();
serveur.kill('SIGTERM');
faux.close();
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
