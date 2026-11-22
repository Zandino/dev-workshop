// Essai : une discussion enregistrée ne s'ouvre qu'une fois, même sur quatre clics d'affilée (vécu le 22/11/2026 :
// quatre copies de la même session) ; une session interne (Claude d'une discussion à plusieurs, sous-agent) n'est pas
// listée. Sans modèle : les discussions sont fabriquées et l'essai n'envoie aucun message. Lance lui-même le serveur.
// Écrit dans le dossier de Claude Code du HOME : refuse de tourner si HOME n'est pas jetable.
//   HOME=/tmp/x/home DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=/tmp/x/projets (projet « essai ») DEVWORKSHOP_PORT=5357 node tests/doublons.mjs
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

const dossier = path.join(realpathSync(process.env.DEVWORKSHOP_ROOT), 'essai');
const ici = path.join(HOME, '.claude', 'projects', dossier.replace(/[^a-zA-Z0-9]/g, '-'));
mkdirSync(ici, { recursive: true });
function fabriquer(titre, premier) {
  const id = randomUUID();
  const base = { sessionId: id, cwd: dossier, isSidechain: false, userType: 'external', version: '2.1.0', gitBranch: '' };
  writeFileSync(path.join(ici, `${id}.jsonl`), [
    { ...base, type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: premier } },
    { ...base, type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-01T10:00:05.000Z', message: { id: 'm1', type: 'message', role: 'assistant', model: 'essai', content: [{ type: 'text', text: 'Bonjour.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
    { type: 'custom-title', customTitle: titre, sessionId: id },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  return id;
}
const longue = fabriquer('Longue discussion', 'Bonjour');
const interne = fabriquer('Concertation et répartition du travail', '[Utilisateur]\ncontinu\n\n[Animateur]\nPhase de concertation.');
// Le registre que tient le serveur quand il ouvre lui-même une session interne (sessions-internes.mjs).
writeFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'sessions-internes.json'), JSON.stringify([interne]));

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

dire({ t: 'historique', projet: 'essai' });
const liste = (await attendre((m) => m.t === 'historique'))?.sessions || [];
noter('la discussion ordinaire est listée', liste.some((s) => s.id === longue));
noter('la session interne ne l’est pas', !liste.some((s) => s.id === interne), liste.map((s) => s.titre).join(' | '));

for (let i = 0; i < 4; i += 1) dire({ t: 'ouvrir', projet: 'essai', compte: 'defaut', reprise: longue, titre: 'Longue discussion' });
await pause(3000);
dire({ t: 'general' });
const g = await attendre((m) => m.t === 'general');
const copies = g?.vivantes.filter((v) => v.origine === longue || v.sessionId === longue) || [];
noter('quatre clics : une seule discussion ouverte', copies.length === 1, `${copies.length} ouverte(s)`);
const rejoues = recus.filter((m) => m.t === 'rejouer');
noter('… et chaque clic la rejoint', rejoues.length >= 1 && rejoues.every((m) => m.session === copies[0]?.id));

for (const c of copies) dire({ t: 'fermer', session: c.id });
await pause(500);
ws.close();
serveur.kill('SIGTERM');
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
