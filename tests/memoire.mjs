// Essai de la mémoire : le serveur ne lance pas plus d'IA qu'il ne peut en porter, arrête le travail avant de se
// figer, et la discussion à plusieurs travaille en même temps quand la place le permet (chacune son tour sinon),
// ses IA ne tournant que lorsqu'on a besoin d'elles. Les IA sont jouées par une FAUSSE API locale.
// La mémoire est simulée : le serveur lit DEVWORKSHOP_MEMINFO (même format que /proc/meminfo), que l'essai réécrit.
// Usage, sur un serveur jetable lancé avec DEVWORKSHOP_MEMINFO=<fichier> et DEVWORKSHOP_VEILLE_MEMOIRE_MS=500 :
//   DEVWORKSHOP_PORT=5344 DEVWORKSHOP_CONFIG=… DEVWORKSHOP_MEMINFO=<fichier> node tests/memoire.mjs <projet>
import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const MEMINFO = process.env.DEVWORKSHOP_MEMINFO;
if (!MEMINFO) throw new Error('DEVWORKSHOP_MEMINFO manquant : cet essai simule la mémoire du serveur');
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const memoire = (disponibleMo, totalMo = 6144) => writeFileSync(MEMINFO, `MemTotal:       ${totalMo * 1024} kB\nMemFree:        ${disponibleMo * 1024} kB\nMemAvailable:   ${disponibleMo * 1024} kB\n`);

// Fausse API : concertation → répartition acceptée ; exécution → 1,5 s de travail ; « lent » → 8 s.
const appels = [];
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', async () => {
    if (req.url.endsWith('/models')) return res.end('{"data":[{"id":"faux"}]}');
    const { messages } = JSON.parse(corps);
    const dernier = messages.at(-1).content;
    const appel = { debut: Date.now(), fin: null, consigne: messages.find((m) => m.role === 'system')?.content || '', dernier };
    appels.push(appel);
    let texte = 'RIEN_A_AJOUTER';
    if (dernier.includes('Phase de concertation')) texte = 'Un : la partie A. Deux : la partie B. ACCORD_VALIDE';
    else if (dernier.includes("Phase d'exécution")) {
      await pause(1500);
      texte = 'Fait.';
    } else if (dernier.includes('lent')) await pause(8000).then(() => (texte = 'Fini.'));
    else if (!dernier.startsWith('[')) texte = 'Entendu.';
    appel.fin = Date.now();
    if (res.destroyed) return;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: texte } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${faux.address().port}/v1`;

const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const recus = [];
ws.on('message', (d) => recus.push(JSON.parse(d.toString())));
const dire = (o) => ws.send(JSON.stringify(o));
async function attendre(test, ms = 30000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const i = recus.findIndex(test);
    if (i >= 0) return recus.splice(i, 1)[0];
    await pause(50);
  }
  return null;
}
const executions = (depuis) => appels.filter((a) => a.debut >= depuis && a.dernier.includes("Phase d'exécution"));

memoire(5000);
await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');
dire({ t: 'creer_compte', type: 'api', nom: 'Un API', url, modele: 'faux' });
dire({ t: 'creer_compte', type: 'api', nom: 'Deux API', url, modele: 'faux' });
const comptes = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Deux API')))?.comptes || [];
const [A, B] = ['Un API', 'Deux API'].map((n) => comptes.find((c) => c.nom === n).id);

// 1. Mémoire à l'aise : les IA démarrent à leur tour, puis travaillent en même temps.
dire({ t: 'ouvrir', projet, participants: [{ compte: A, nom: 'Un' }, { compte: B, nom: 'Deux' }], echanges: 2 });
const s = (await attendre((m) => m.t === 'rejouer'))?.session;
noter('salon ouvert : aucune IA appelée avant qu’on en ait besoin', s && appels.length === 0);
let t0 = Date.now();
dire({ t: 'envoyer', session: s, texte: 'Faites le travail.' });
await attendre((m) => m.t === 'salon_pause' && m.session === s, 30000);
noter('mémoire à l’aise : « en même temps » annoncé', recus.some((m) => m.t === 'info' && m.code === 'salon_parallele'));
let ex = executions(t0);
noter('les deux travaillent en même temps', ex.length === 2 && Math.abs(ex[0].debut - ex[1].debut) < 700 && ex[1].debut < ex[0].fin, ex.map((a) => a.debut - t0).join(' / ') + ' ms');

// 2. Mémoire juste : chacune son tour, et une IA arrêtée après son tour est relancée avec la discussion.
recus.splice(0);
memoire(1400);
t0 = Date.now();
dire({ t: 'envoyer', session: s, texte: 'Encore du travail.' });
await attendre((m) => m.t === 'salon_pause' && m.session === s, 30000);
noter('mémoire juste : « chacune son tour » annoncé', recus.some((m) => m.t === 'info' && m.code === 'salon_chacun_son_tour'));
ex = executions(t0);
noter('l’une après l’autre', ex.length === 2 && ex[1].debut >= ex[0].fin, ex.map((a) => `${a.debut - t0}→${a.fin - t0}`).join(' / ') + ' ms');
noter('une IA relancée reçoit ce qui s’est dit', appels.some((a) => a.debut >= t0 && a.consigne.includes('Tu rejoins cette discussion à plusieurs en cours') && a.consigne.includes('Faites le travail.')));
dire({ t: 'fermer', session: s });
await attendre((m) => m.t === 'general');

// 3. Mémoire insuffisante : on n'ouvre pas.
recus.splice(0);
memoire(500);
dire({ t: 'ouvrir', projet, participants: [{ compte: A, nom: 'Un' }, { compte: B, nom: 'Deux' }] });
noter('pas assez de mémoire : salon refusé', (await attendre((m) => m.t === 'refus' && m.ordre === 'ouvrir'))?.code === 'memoire_insuffisante');
dire({ t: 'ouvrir', projet, compte: A });
noter('pas assez de mémoire : discussion refusée', (await attendre((m) => m.t === 'refus' && m.ordre === 'ouvrir'))?.code === 'memoire_insuffisante');

// 4. Mémoire qui se remplit pendant le travail : on arrête avant que le serveur ne se fige.
recus.splice(0);
memoire(5000);
dire({ t: 'ouvrir', projet, compte: A });
const seule = (await attendre((m) => m.t === 'rejouer'))?.session;
dire({ t: 'envoyer', session: seule, texte: 'lent' });
await attendre((m) => m.session === seule && m.t === 'etat' && m.occupe === true);
memoire(150);
const info = await attendre((m) => m.session === seule && m.t === 'info' && m.code === 'memoire_pleine', 5000);
noter('mémoire presque pleine : le travail est arrêté, et le fil le dit', info && info.libre === 150, JSON.stringify(info));
noter('l’écran est prévenu (alerte « mémoire »)', await attendre((m) => m.t === 'alerte' && m.genre === 'memoire' && m.id === seule, 3000));
noter('la discussion est libérée', await attendre((m) => m.session === seule && m.t === 'etat' && m.occupe === false, 5000));
memoire(5000);
dire({ t: 'fermer', session: seule });

// 5. Ce que les IA ont lancé : les plus gros programmes sont tués, jamais les IA elles-mêmes (enfants directs).
// Ici, le rôle du serveur est tenu par cet essai : un enfant direct (« l'IA ») et, sous un shell, un petit-enfant
// gourmand (« la compilation »).
const { spawn } = await import('node:child_process');
const { tuerLesPlusGros } = await import('../serveur/memoire.mjs');
const gourmand = 'const b = Buffer.alloc(200 * 1024 * 1024, 1); setInterval(() => b[0]++, 1000);';
const ia = spawn(process.execPath, ['-e', gourmand], { stdio: 'ignore' });
const shell = spawn('sh', ['-c', `${process.execPath} -e '${gourmand}'; sleep 60`], { stdio: 'ignore' });
await pause(2500);
const tues = tuerLesPlusGros(100 * 1024 * 1024);
const vivant = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
noter('le programme lancé (petit-enfant) est tué, le plus gros d’abord', tues.length >= 1 && tues[0].nom === 'node' && tues[0].mo >= 150, JSON.stringify(tues));
noter('l’IA elle-même (enfant direct) n’est pas touchée', vivant(ia.pid) && vivant(shell.pid));
ia.kill('SIGKILL');
shell.kill('SIGKILL');

for (const id of [A, B]) dire({ t: 'supprimer_compte', id });
await pause(500);
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
