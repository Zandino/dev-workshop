// Garde-fous du serveur : jeton d'accès, contrôle d'origine, dossiers bornés.
// Cette page donne la main sur le serveur : tout ce que l'écran interdit, le serveur l'interdit aussi.
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** Dossier des réglages (jeton, comptes, clés). Lisible par le seul propriétaire. */
export const DOSSIER_CONFIG = process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config', 'dev-workshop');
const FICHIER_JETON = path.join(DOSSIER_CONFIG, 'jeton');

/** Racine des projets : rien ne s'ouvre en dehors. */
export const RACINE_PROJETS = realpathSync(process.env.DEVWORKSHOP_ROOT || path.join(homedir(), 'dev'));

/** Lit le jeton, ou le crée à la première exécution (fichier lisible par le seul propriétaire). */
export function chargerJeton() {
  try {
    const lu = readFileSync(FICHIER_JETON, 'utf8').trim();
    if (lu.length >= 32) return lu;
  } catch { /* premier lancement */ }
  mkdirSync(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  const jeton = randomBytes(32).toString('base64url');
  writeFileSync(FICHIER_JETON, jeton + '\n', { mode: 0o600 });
  chmodSync(FICHIER_JETON, 0o600);
  return jeton;
}

/** Comparaison à temps constant, sans fuite de longueur. */
export function jetonValide(attendu, recu) {
  if (typeof recu !== 'string' || !recu) return false;
  const a = createHash('sha256').update(attendu).digest();
  const b = createHash('sha256').update(recu).digest();
  return timingSafeEqual(a, b);
}

/**
 * Noms d'hôte acceptés : l'adresse locale, quel que soit le port (une redirection SSH ou VS Code
 * peut en choisir un autre). Bloque les attaques par résolution DNS détournée.
 */
export function hoteAutorise(enTeteHost) {
  const nom = String(enTeteHost || '').toLowerCase().replace(/:\d{1,5}$/, '');
  return nom === '127.0.0.1' || nom === 'localhost' || nom === '[::1]';
}

/** Une autre page ouverte dans le navigateur ne doit pas pouvoir piloter le port. */
export function origineAutorisee(origine, enTeteHost) {
  if (!origine) return false;
  try {
    return new URL(origine).host.toLowerCase() === String(enTeteHost || '').toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Résout un dossier de projet demandé par l'écran et refuse tout ce qui sort de la racine
 * (chemins relatifs, liens symboliques compris).
 */
export function resoudreProjet(demande) {
  if (typeof demande !== 'string' || !demande || demande.includes('\0')) {
    throw new Error('dossier_invalide');
  }
  const brut = path.isAbsolute(demande) ? demande : path.join(RACINE_PROJETS, demande);
  let reel;
  try {
    reel = realpathSync(brut);
  } catch {
    throw new Error('dossier_introuvable');
  }
  const dedans = reel === RACINE_PROJETS || reel.startsWith(RACINE_PROJETS + path.sep);
  if (!dedans) throw new Error('dossier_hors_racine');
  if (!statSync(reel).isDirectory()) throw new Error('dossier_invalide');
  return reel;
}

/** En-têtes posés sur toutes les réponses HTTP. */
export const EN_TETES_SECURITE = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "connect-src 'self' ws://localhost:* ws://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};
