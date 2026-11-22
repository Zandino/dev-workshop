// Skins de l'équipe en direct : des personnages en images, un dossier par personnage dans le dossier des réglages
// (skins/<nom>/), avec une image par état. Ils restent sur le serveur (jamais dans le dépôt) : ce sont les créations
// de la personne, faites par exemple avec un générateur d'images (voir README.fr.md, « Équipe en direct »).
// Un skin n'est proposé que s'il a au moins son image au repos (idle) ; un état sans image prend celle-là, que l'écran
// anime. skin.json (facultatif) donne son prénom et son genre.
import { readdirSync, readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG, EN_TETES_SECURITE } from './securite.mjs';

const DOSSIER = path.join(DOSSIER_CONFIG, 'skins');
const NOM = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const ETATS_SKIN = ['idle', 'working', 'thinking', 'waiting', 'needs-you', 'blocked', 'done', 'error'];
// Une vidéo en boucle l'emporte sur l'image fixe du même état : le personnage est animé.
const TYPES = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.gif': 'image/gif', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const MAX_OCTETS = 20 * 1024 * 1024;

/** L'image d'un état dans le dossier d'un skin (premier format trouvé), ou null. */
function image(dossier, etat) {
  for (const ext of Object.keys(TYPES)) {
    const f = path.join(dossier, etat + ext);
    if (existsSync(f) && statSync(f).isFile() && statSync(f).size <= MAX_OCTETS) return etat + ext;
  }
  return null;
}

/** Les skins complets : [{ nom, prenom, feminin, images: { etat: fichier } }]. */
export function listerSkins() {
  let noms = [];
  try { noms = readdirSync(DOSSIER, { withFileTypes: true }).filter((d) => d.isDirectory() && NOM.test(d.name)).map((d) => d.name); } catch { return []; }
  const skins = [];
  for (const nom of noms.sort()) {
    const dossier = path.join(DOSSIER, nom);
    const images = Object.fromEntries(ETATS_SKIN.map((e) => [e, image(dossier, e)]));
    if (!images.idle) continue; // sans image au repos : pas proposé
    for (const e of ETATS_SKIN) images[e] ||= images.idle; // un état sans image prend celle au repos (animée par l'écran)
    let fiche = {};
    try { fiche = JSON.parse(readFileSync(path.join(dossier, 'skin.json'), 'utf8')); } catch { /* facultatif */ }
    skins.push({ nom, prenom: String(fiche.prenom || nom).slice(0, 30), feminin: fiche.feminin === true, images });
  }
  return skins;
}

/** GET /skins/<nom>/<etat>.<ext> : rend true si la requête était pour un skin (et y a été répondu). */
export function servirSkin(chemin, req, res) {
  const m = /^\/skins\/([^/]+)\/([^/]+)$/.exec(chemin);
  if (!m) return false;
  const [, nom, fichier] = m;
  const ext = path.extname(fichier).toLowerCase();
  const etat = fichier.slice(0, -ext.length);
  if (!NOM.test(nom) || !ETATS_SKIN.includes(etat) || !TYPES[ext]) {
    res.writeHead(404, EN_TETES_SECURITE).end();
    return true;
  }
  const f = path.join(DOSSIER, nom, etat + ext);
  if (!existsSync(f) || statSync(f).size > MAX_OCTETS) {
    res.writeHead(404, EN_TETES_SECURITE).end();
    return true;
  }
  // Les images d'un skin ne changent pas sous le même nom : le navigateur peut les garder une heure.
  res.writeHead(200, { ...EN_TETES_SECURITE, 'Content-Type': TYPES[ext], 'Cache-Control': 'private, max-age=3600' });
  if (req.method === 'HEAD') return res.end(), true;
  createReadStream(f).pipe(res);
  return true;
}
