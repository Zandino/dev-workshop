// Essai du renommage d'une discussion (ordre « renommer_discussion ») : enregistrée (le titre va à Claude Code et la
// liste du projet le montre), ouverte (la barre de tous les écrans suit), titre vide refusé. Sans modèle : la
// discussion enregistrée est fabriquée, l'ouverte parle à une FAUSSE API locale. Lance lui-même le serveur.
// Écrit dans le dossier de Claude Code du HOME : refuse de tourner si HOME n'est pas jetable.
//   HOME=/tmp/x/home DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=/tmp/x/projets (projet « essai ») DEVWORKSHOP_PORT=5348 node tests/renommer.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WS from 'ws';

const HOME = homedir();
if (!HOME.startsWith('/tmp/')) {
  console.error(`Refus : HOME (${HOME}) doit être un dossier jetable sous /tmp.`);
  process.exit(2);
}
const PORT = Number(process.env.DEVWORKSHOP_PORT);
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Une discussion Claude Code enregistrée dans le projet « essai ».
const dossier = path.join(realpathSync(process.env.DEVWORKSHOP_ROOT), 'essai');
const id = randomUUID();
const base = { sessionId: id, cwd: dossier, isSidechain: false, userType: 'external', version: '2.1.0', gitBranch: '' };
const ici = path.join(HOME, '.claude', 'projects', dossier.replace(/[^a-zA-Z0-9]/g, '-'));
mkdirSync(ici, { recursive: true });
writeFileSync(path.join(ici, `${id}.jsonl`), [
  { ...base, type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: 'Bonjour' } },
  { ...base, type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-01T10:00:05.000Z', message: { id: 'm1', type: 'message', role: 'assistant', model: 'essai', content: [{ type: 'text', text: 'Bonjour.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
  { type: 'custom-title', customTitle: 'Ancien titre', sessionId: id },
].map((l) => JSON.stringify(l)).join('\n') + '\n');

const faux = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    if (req.url.endsWith('/models')) return res.end('{"data":[{"id":"faux"}]}');
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

// 1. Discussion enregistrée.
dire({ t: 'historique', projet: 'essai' });
const avant = await attendre((m) => m.t === 'historique');
noter('la discussion fabriquée est listée', avant?.sessions.some((s) => s.id === id && s.titre === 'Ancien titre'));
dire({ t: 'renommer_discussion', projet: 'essai', id, titre: '  Nouveau\ttitre  ' });
const apres = await attendre((m) => m.t === 'historique');
noter('renommée : la liste du projet suit', apres?.sessions.find((s) => s.id === id)?.titre === 'Nouveau titre', apres?.sessions.find((s) => s.id === id)?.titre);
noter('le titre est écrit chez Claude Code', readFileSync(path.join(ici, `${id}.jsonl`), 'utf8').includes('"customTitle":"Nouveau titre"'));
dire({ t: 'renommer_discussion', projet: '../x', id, titre: 'x' });
noter('projet hors racine refusé', (await attendre((m) => m.t === 'refus'))?.code?.startsWith('dossier'));

// 2. Discussion ouverte.
dire({ t: 'creer_compte', type: 'api', nom: 'Fausse API', url: `http://127.0.0.1:${faux.address().port}/v1`, modele: 'faux' });
const compte = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Fausse API')))?.comptes.find((c) => c.nom === 'Fausse API');
dire({ t: 'ouvrir', projet: 'essai', compte: compte.id, titre: 'Titre de départ' });
const s = (await attendre((m) => m.t === 'rejouer'))?.session;
dire({ t: 'renommer_discussion', session: s, titre: 'Titre changé' });
const vue = await attendre((m) => m.t === 'vivantes' && m.vivantes.some((x) => x.id === s && x.titre === 'Titre changé'));
noter('ouverte : la barre de tous les écrans suit', vue);
dire({ t: 'renommer_discussion', session: s, titre: '   ' });
noter('titre vide refusé', (await attendre((m) => m.t === 'refus'))?.code === 'titre_invalide');

dire({ t: 'fermer', session: s });
dire({ t: 'supprimer_compte', id: compte.id });
await pause(500);
ws.close();
serveur.kill('SIGTERM');
faux.close();
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
