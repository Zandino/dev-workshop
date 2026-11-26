// Fichiers cités par une IA, ouverts depuis l'écran (serveur/ouvrir-fichier.mjs et le ticket d'aperçu sans fichiers
// cachés de serveur/apercu.mjs) : ce qui s'ouvre, ce qui est refusé (caché, hors du dossier personnel, lien symbolique
// vers un dossier caché), la liste d'un dossier, le service HTTP du fichier et le téléchargement.
//   node tests/ouvrir-fichier.mjs   (HOME, DEVWORKSHOP_ROOT : dossiers jetables ; projet « essai »)
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const B = mkdtempSync(path.join(tmpdir(), 'dw-fichiers-'));
process.env.HOME = path.join(B, 'home');
process.env.DEVWORKSHOP_ROOT ||= path.join(B, 'projets');
process.env.DEVWORKSHOP_CONFIG ||= path.join(B, 'config');
const H = process.env.HOME;
const P = path.join(process.env.DEVWORKSHOP_ROOT, 'essai');
for (const d of [path.join(H, 'maquettes'), path.join(H, '.ssh'), path.join(P, '.devworkshop', 'fichiers'), path.join(P, 'src')]) mkdirSync(d, { recursive: true });
writeFileSync(path.join(H, 'maquettes', 'page.html'), '<img src="capture.png">');
writeFileSync(path.join(H, 'maquettes', 'capture.png'), 'PNG');
writeFileSync(path.join(H, 'maquettes', '.env'), 'SECRET=1');
writeFileSync(path.join(H, '.ssh', 'id_ed25519'), 'CLE');
writeFileSync(path.join(P, '.devworkshop', 'fichiers', 'joint.txt'), 'joint');
writeFileSync(path.join(P, 'src', 'app.js'), 'console.log(1)');
writeFileSync(path.join(P, '.env'), 'SECRET=2');
symlinkSync(path.join(H, '.ssh'), path.join(H, 'raccourci-cles'));
const AUTRE = mkdtempSync(path.join(tmpdir(), 'dw-dehors-'));
writeFileSync(path.join(AUTRE, 'x.txt'), 'dehors');

const { ouvrirFichier } = await import('../serveur/ouvrir-fichier.mjs');
const { servirApercu } = await import('../serveur/apercu.mjs');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const refus = (f) => {
  try { f(); return null; } catch (e) { return e.message; }
};

// Ce qui s'ouvre.
const page = ouvrirFichier('~/maquettes/page.html');
noter('« ~/… » : ouvert, avec un ticket', !page.dossier && page.nom === 'page.html' && /^[A-Za-z0-9_-]{24}$/.test(page.ticket));
noter('chemin absolu : ouvert', ouvrirFichier(path.join(H, 'maquettes', 'capture.png')).nom === 'capture.png');
noter('relatif : depuis le dossier du projet', ouvrirFichier('src/app.js', 'essai').chemin === realpathSync(path.join(P, 'src', 'app.js')));
noter('.devworkshop/fichiers du projet : ouvert', ouvrirFichier('.devworkshop/fichiers/joint.txt', 'essai').nom === 'joint.txt');
const dossier = ouvrirFichier('~/maquettes/');
noter('dossier : sa liste, sans les fichiers cachés', dossier.dossier && JSON.stringify(dossier.entrees.map((e) => e.nom)) === '["capture.png","page.html"]', JSON.stringify(dossier.entrees));

// Ce qui est refusé.
noter('dossier caché du dossier personnel : refusé', refus(() => ouvrirFichier('~/.ssh/id_ed25519')) === 'fichier_interdit');
noter('fichier caché d’un projet : refusé', refus(() => ouvrirFichier('.env', 'essai')) === 'fichier_interdit');
noter('lien symbolique vers un dossier caché : refusé', refus(() => ouvrirFichier('~/raccourci-cles/id_ed25519')) === 'fichier_interdit');
noter('hors du dossier personnel et des projets : refusé', refus(() => ouvrirFichier(path.join(AUTRE, 'x.txt'))) === 'fichier_interdit');
noter('« .. » pour sortir : refusé', refus(() => ouvrirFichier('~/../../etc/hostname')) !== null);
noter('absent : introuvable', refus(() => ouvrirFichier('~/maquettes/absent.png')) === 'fichier_introuvable');
noter('relatif sans projet : introuvable', refus(() => ouvrirFichier('src/app.js')) === 'fichier_introuvable');
noter('vide : invalide', refus(() => ouvrirFichier('  ')) === 'fichier_invalide');

// Service HTTP du ticket : le fichier et ses voisins, jamais un voisin caché ; téléchargement.
const serveur = http.createServer((req, res) => {
  if (!servirApercu(decodeURIComponent(new URL(req.url, 'http://x').pathname), req, res)) { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => serveur.on('listening', r));
const base = `http://127.0.0.1:${serveur.address().port}/apercu/${page.ticket}/`;
const r1 = await fetch(base + 'page.html');
noter('la page est servie, isolée (sandbox)', r1.status === 200 && (await r1.text()).includes('capture.png') && (r1.headers.get('content-security-policy') || '').includes('sandbox'));
noter('son image voisine aussi', (await fetch(base + 'capture.png')).status === 200);
noter('jamais un voisin caché (.env)', (await fetch(base + '.env')).status === 403);
noter('ni une remontée hors du dossier', [403, 404].includes((await fetch(base + '..%2F.ssh%2Fid_ed25519')).status));
const r2 = await fetch(base + 'page.html?telecharger=1');
noter('téléchargement : pièce jointe, nom du fichier', r2.status === 200 && r2.headers.get('content-disposition') === "attachment; filename*=UTF-8''page.html" && r2.headers.get('content-type') === 'application/octet-stream');
serveur.close();

const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
