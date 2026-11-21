// Essai de la clé d'API Gemini : présentée à Google avant d'être enregistrée, et vérifiée par « Vérifier ».
// Google est joué par un FAUX serveur local, sur un port fixe que le serveur d'essai connaît :
//   serveur jetable lancé avec DEVWORKSHOP_GOOGLE_API=http://127.0.0.1:5349, puis
//   DEVWORKSHOP_PORT=5345 DEVWORKSHOP_CONFIG=… node tests/cle-gemini.mjs
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Faux Google : seules les clés de `acceptees` passent ; il note les clés reçues.
const acceptees = new Set(['AIza-bonne-cle-essai']);
const vues = [];
const google = http.createServer((req, res) => {
  const cle = req.headers['x-goog-api-key'];
  vues.push(cle);
  res.setHeader('Content-Type', 'application/json');
  if (acceptees.has(cle)) return res.end('{"models":[{"name":"models/gemini-essai"}]}');
  res.statusCode = 400;
  res.end(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }));
});
await new Promise((r) => google.listen(5349, '127.0.0.1', r));

const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const recus = [];
ws.on('message', (d) => recus.push(JSON.parse(d.toString())));
const dire = (o) => ws.send(JSON.stringify(o));
async function attendre(test, ms = 60000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const i = recus.findIndex(test);
    if (i >= 0) return recus.splice(i, 1)[0];
    await pause(50);
  }
  return null;
}

await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');
dire({ t: 'creer_compte', type: 'gemini', nom: 'Gemini essai' });
const id = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Gemini essai')))?.comptes.find((c) => c.nom === 'Gemini essai')?.id;
noter('compte Gemini créé', id);

dire({ t: 'cle_compte', id, cle: 'AIza-mauvaise-cle' });
noter('clé refusée par Google : refus clair', (await attendre((m) => m.t === 'refus' && m.ordre === 'cle_compte'))?.code === 'cle_gemini_refusee');
const etatRefus = await attendre((m) => m.t === 'etat_compte' && m.id === id);
noter('… et le panneau dit pourquoi', etatRefus?.connecte === false && /Google refuse cette clé/.test(etatRefus.motif || '') && /API key not valid/.test(etatRefus.motif), etatRefus?.motif);
dire({ t: 'general' });
noter('… et elle n’est pas enregistrée', (await attendre((m) => m.t === 'general'))?.comptes.find((c) => c.id === id)?.cle === 0);

dire({ t: 'cle_compte', id, cle: '  AIza-bonne-cle-essai  ' });
const apres = await attendre((m) => m.t === 'general' && m.comptes.find((c) => c.id === id)?.cle);
noter('clé acceptée : enregistrée (espaces retirés)', apres?.comptes.find((c) => c.id === id)?.cle === 'AIza-bonne-cle-essai'.length);
const etatOk = await attendre((m) => m.t === 'etat_compte' && m.id === id, 90000);
noter('l’état du compte suit tout seul, sans refus de Google', etatOk && !/Google refuse/.test(etatOk.motif || ''), JSON.stringify(etatOk)?.slice(0, 160));

acceptees.clear(); // Google retire la clé (révoquée, quota…)
dire({ t: 'etat_compte', id });
const verif = await attendre((m) => m.t === 'etat_compte' && m.id === id);
noter('« Vérifier » : une clé que Google refuse n’est plus « connectée »', verif?.connecte === false && /Google refuse/.test(verif.motif || ''), verif?.motif);

await new Promise((r) => google.close(r)); // Google injoignable : on ne bloque pas sur un doute
dire({ t: 'cle_compte', id, cle: 'AIza-autre-cle' });
const sansGoogle = await attendre((m) => m.t === 'general' && m.comptes.find((c) => c.id === id)?.cle === 'AIza-autre-cle'.length, 30000);
noter('Google injoignable : la clé est enregistrée quand même', sansGoogle);
noter('la clé n’apparaît jamais dans ce que reçoit l’écran', !JSON.stringify(recus).includes('AIza-'));

dire({ t: 'supprimer_compte', id });
await pause(500);
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
