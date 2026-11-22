// Essai des voix naturelles (serveur/voix.mjs), de bout en bout : installation depuis zéro (environnement Python,
// Piper, voix françaises : ~300 Mo téléchargés), puis une phrase par voix, et une voix inconnue refusée.
// Lance lui-même le serveur. À faire tourner sur une instance jetable (réglages jetables) : c'est long et ça télécharge.
//   DEVWORKSHOP_CONFIG=<dossier jetable> DEVWORKSHOP_ROOT=… DEVWORKSHOP_PORT=5363 node tests/voix.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT);
const code = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const serveur = spawn(process.execPath, [path.join(code, 'serveur/index.mjs')], { stdio: 'ignore' });
await pause(2500);
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'jeton'), 'utf8').trim();
const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const recus = [];
ws.on('message', (d) => recus.push(JSON.parse(d.toString())));
await new Promise((r) => ws.on('open', r));
const dire = (o) => ws.send(JSON.stringify(o));
const attendre = async (test, ms) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const i = recus.findIndex(test); if (i >= 0) return recus.splice(i, 1)[0]; await pause(200); }
  return null;
};
dire({ t: 'bonjour', jeton });
const g = await attendre((m) => m.t === 'general', 10_000);
noter('au départ : pas installées', g?.voix && !g.voix.installee && !g.voix.voix.length);

dire({ t: 'voix_dire', id: 'avant', texte: 'Bonjour', voix: 'siwis' });
noter('avant l’installation : voix absente', (await attendre((m) => m.t === 'voix_audio' && m.id === 'avant', 10_000))?.erreur === 'voix_absente');

const debut = Date.now();
dire({ t: 'voix_installer', langue: 'fr' });
const pret = await attendre((m) => m.t === 'voix_etat' && m.installee && m.voix.length >= 3 && !m.installation, 15 * 60_000);
noter('installation depuis zéro : Piper et 3 voix françaises', pret, `${Math.round((Date.now() - debut) / 1000)} s · ${pret?.voix.map((v) => v.cle).join(', ')}`);

for (const cle of ['siwis', 'jessica', 'pierre']) {
  const t0 = Date.now();
  dire({ t: 'voix_dire', id: cle, texte: 'Bonjour, je travaille sur le point trente-huit, les tests passent.', voix: cle, vitesse: 1 });
  const r = await attendre((m) => m.t === 'voix_audio' && m.id === cle, 60_000);
  const secondes = r?.pcm ? Buffer.from(r.pcm, 'base64').length / 2 / r.taux : 0;
  noter(`voix « ${cle} » : de la parole`, secondes > 1.5 && secondes < 15, `${secondes.toFixed(1)} s d’audio en ${Date.now() - t0} ms, ${r?.taux} Hz${r?.erreur ? ' · ' + r.erreur : ''}`);
}
dire({ t: 'voix_dire', id: 'tom', texte: 'x', voix: 'tom' });
noter('voix écartée (tom) : plus proposée', (await attendre((m) => m.t === 'voix_audio' && m.id === 'tom', 10_000))?.erreur === 'voix_absente');
dire({ t: 'voix_dire', id: 'inconnue', texte: 'x', voix: 'zorglub' });
noter('voix inconnue : refusée', (await attendre((m) => m.t === 'voix_audio' && m.id === 'inconnue', 10_000))?.erreur === 'voix_absente');

ws.close();
serveur.kill('SIGTERM');
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
