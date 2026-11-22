// Essai : une copie de travail git (worktree, dont le « .git » est un fichier) n'apparaît pas comme un projet ; son
// projet en compte une. Lance lui-même le serveur, sans modèle.
//   DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=<dossier jetable> DEVWORKSHOP_PORT=5362 node tests/projets-copies.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import WS from 'ws';

const racine = process.env.DEVWORKSHOP_ROOT;
const PORT = Number(process.env.DEVWORKSHOP_PORT);
mkdirSync(path.join(racine, 'depot', '.git', 'worktrees', 'depot-38'), { recursive: true });
mkdirSync(path.join(racine, 'depot-38'), { recursive: true });
writeFileSync(path.join(racine, 'depot-38', '.git'), `gitdir: ${path.join(racine, 'depot', '.git', 'worktrees', 'depot-38')}\n`);
mkdirSync(path.join(racine, 'ordinaire'), { recursive: true });

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const code = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const serveur = spawn(process.execPath, [path.join(code, 'serveur/index.mjs')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'jeton'), 'utf8').trim();
const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const general = await new Promise((ok) => {
  ws.on('open', () => ws.send(JSON.stringify({ t: 'bonjour', jeton })));
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'general') ok(m); });
});
noter('la copie de travail n’est pas un projet', !general.projets.includes('depot-38') && general.projets.includes('depot') && general.projets.includes('ordinaire'), general.projets.join(','));
noter('son projet en compte une', general.copiesDeTravail?.depot === 1 && !general.copiesDeTravail.ordinaire, JSON.stringify(general.copiesDeTravail));
ws.close();
serveur.kill('SIGTERM');
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
