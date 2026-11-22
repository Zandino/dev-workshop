// Essai des skins (serveur/skins.mjs) : seuls les skins complets sont proposés, avec leur prénom ; la route /skins ne
// sert que leurs images (pas d'autre fichier, pas de sortie du dossier).
//   DEVWORKSHOP_CONFIG=<dossier jetable> DEVWORKSHOP_ROOT=<dossier> node tests/skins.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const config = process.env.DEVWORKSHOP_CONFIG;
const ETATS = ['idle', 'working', 'thinking', 'waiting', 'needs-you', 'blocked', 'done', 'error'];
const lea = path.join(config, 'skins', 'lea');
const moitie = path.join(config, 'skins', 'moitie');
mkdirSync(lea, { recursive: true });
mkdirSync(moitie, { recursive: true });
for (const e of ETATS) writeFileSync(path.join(lea, `${e}.jpg`), `image ${e}`);
for (const e of ETATS.slice(0, 4)) writeFileSync(path.join(moitie, `${e}.png`), 'x');
writeFileSync(path.join(lea, 'skin.json'), JSON.stringify({ prenom: 'Léa', feminin: true }));
writeFileSync(path.join(config, 'secret.txt'), 'à ne pas servir');

const { listerSkins, servirSkin } = await import('../serveur/skins.mjs');
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};

const skins = listerSkins();
noter('seul le skin complet est proposé, avec son prénom', skins.length === 1 && skins[0].nom === 'lea' && skins[0].prenom === 'Léa' && skins[0].feminin === true && skins[0].images.working === 'working.jpg', JSON.stringify(skins));

// Un vrai petit serveur HTTP : le chemin brut part tel quel (pas de normalisation des « .. » côté client).
const serveur = http.createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!servirSkin(chemin, req, res)) res.writeHead(418).end();
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const appeler = (chemin) => new Promise((ok) => {
  http.get({ host: '127.0.0.1', port: serveur.address().port, path: chemin }, (res) => {
    let corps = '';
    res.on('data', (d) => (corps += d));
    res.on('end', () => ok({ statut: res.statusCode, corps }));
  });
});
const r1 = await appeler('/skins/lea/working.jpg');
noter('une image du skin est servie', r1?.statut === 200 && r1.corps === 'image working');
noter('un état inconnu : 404', (await appeler('/skins/lea/autre.jpg'))?.statut === 404);
noter('sortie du dossier : rien n’est servi', ![200].includes((await appeler('/skins/../secret.txt')).statut) && !(await appeler('/skins/lea/..%2F..%2Fsecret.txt')).corps.includes('ne pas'));
noter('nom de skin invalide : rien n’est servi', (await appeler('/skins/..%2f/working.jpg')).statut !== 200 && (await appeler('/skins/LEA/working.jpg')).statut === 404);
noter('un autre chemin n’est pas pris', (await appeler('/index.html')).statut === 418);
serveur.close();

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
