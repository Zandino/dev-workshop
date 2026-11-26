// Aperçu des fichiers d'un projet (panneau de droite) : l'écran reçoit un ticket temporaire par le canal
// authentifié, puis lit les fichiers par HTTP sous /apercu/<ticket>/<chemin>. Une page HTML du projet s'y
// affiche dans un cadre « sandbox » sans origine propre : elle ne peut ni lire le stockage de l'atelier ni
// parler au canal (son origine « null » y est refusée).
import { randomBytes } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const DUREE = 30 * 60 * 1000;
const MAX = 20 * 1024 * 1024;
const MAX_TELECHARGEMENT = 500 * 1024 * 1024;
const tickets = new Map();

/** Un chemin relatif passe-t-il par un fichier ou un dossier caché ? `.devworkshop` (fichiers joints) n'en est pas un. */
export const cache = (relatif) => String(relatif).split(/[\\/]/).some((s) => s.startsWith('.') && s !== '.devworkshop' && s !== '.' && s !== '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
};

/**
 * Ticket d'aperçu pour un dossier (déjà vérifié par l'appelant) : un projet, ou le dossier d'un fichier cité par une
 * IA (ouvrir-fichier.mjs). `masques: false` : rien de caché n'y est servi (segment en « . »), sauf `.devworkshop`.
 */
export function ticketApercu(dossier, { masques = true } = {}) {
  const maintenant = Date.now();
  for (const [k, v] of tickets) if (v.expire < maintenant) tickets.delete(k);
  const ticket = randomBytes(18).toString('base64url');
  tickets.set(ticket, { dossier: realpathSync(dossier), expire: maintenant + DUREE, masques });
  return { ticket, dossier: realpathSync(dossier), dureeMs: DUREE };
}

/** En-têtes de l'aperçu : la page du projet tourne isolée (sandbox), mais peut être affichée dans l'atelier. */
const EN_TETES = {
  'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-modals allow-popups; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

/** Traite /apercu/<ticket>/<chemin> ; rend faux si l'adresse n'est pas un aperçu. */
export function servirApercu(chemin, req, res) {
  const m = chemin.match(/^\/apercu\/([A-Za-z0-9_-]{24})\/(.*)$/);
  if (!m) return false;
  const repondre = (code, texte) => {
    res.writeHead(code, { ...EN_TETES, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(texte);
  };
  const t = tickets.get(m[1]);
  if (!t || t.expire < Date.now()) return repondre(410, 'Aperçu expiré'), true;
  let fichier;
  try {
    fichier = realpathSync(path.join(t.dossier, m[2] || 'index.html'));
  } catch {
    return repondre(404, 'Introuvable'), true;
  }
  // Rien hors du projet, liens symboliques compris.
  if (fichier !== t.dossier && !fichier.startsWith(t.dossier + path.sep)) return repondre(403, 'Hors du projet'), true;
  if (t.masques === false && cache(path.relative(t.dossier, fichier))) return repondre(403, 'Fichier caché'), true;
  let infos = statSync(fichier);
  if (infos.isDirectory()) {
    try {
      fichier = realpathSync(path.join(fichier, 'index.html'));
      infos = statSync(fichier);
    } catch {
      return repondre(404, 'Introuvable'), true;
    }
  }
  if (!infos.isFile()) return repondre(404, 'Introuvable'), true;
  // « ?telecharger » : le fichier part tel quel vers le PC (bouton Télécharger de l'aperçu), jusqu'à 500 Mo.
  const telecharger = new URL(req.url, 'http://x').searchParams.has('telecharger');
  if (infos.size > (telecharger ? MAX_TELECHARGEMENT : MAX)) return repondre(413, 'Fichier trop gros'), true;
  const type = TYPES[path.extname(fichier).toLowerCase()] || 'text/plain; charset=utf-8';
  const nom = encodeURIComponent(path.basename(fichier));
  res.writeHead(200, {
    ...EN_TETES,
    'Content-Type': telecharger ? 'application/octet-stream' : type,
    'Content-Length': infos.size,
    ...(telecharger ? { 'Content-Disposition': `attachment; filename*=UTF-8''${nom}` } : {}),
  });
  if (req.method === 'HEAD') return res.end(), true;
  createReadStream(fichier).pipe(res);
  return true;
}
