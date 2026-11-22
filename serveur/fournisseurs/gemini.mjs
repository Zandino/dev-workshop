// Fournisseur « Gemini » (Google) : pilote `gemini --acp` par le moteur ACP commun (acp.mjs).
// Noms des méthodes et des mises à jour relevés dans l'outil lui-même (gemini-cli 0.69.0).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { binaire } from './jsonrpc.mjs';
import { reglesCommunes } from './regles.mjs';
import { cleDe } from '../comptes.mjs';
import { etatAcp, ouvrirAcp } from './acp.mjs';

/** Avec une clé d'API enregistrée pour le compte, Gemini s'en sert ; sinon, connexion par compte Google. */
export function envGemini(compte) {
  const cle = cleDe(compte.id);
  return { ...process.env, GEMINI_CLI_HOME: compte.dossier, ...(cle ? { GEMINI_API_KEY: cle } : {}) };
}

/** Gemini lit ses consignes générales dans <dossier du compte>/.gemini/GEMINI.md : on y range les règles communes. */
function poserRegles(compte) {
  const regles = reglesCommunes();
  if (!regles) return;
  const dossier = path.join(compte.dossier, '.gemini');
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(dossier, 'GEMINI.md'), regles + '\n', { mode: 0o600 });
}

/**
 * Gemini ne retient pas, d'une fois sur l'autre, la méthode de connexion choisie par le protocole : sans ce
 * réglage, il cherche une clé d'API et refuse d'ouvrir une session alors que la connexion Google est faite.
 * On inscrit la méthode du compte (clé d'API si elle est enregistrée, sinon compte Google) dans ses réglages.
 */
function poserConnexionGoogle(compte) {
  const dossier = path.join(compte.dossier, '.gemini');
  const fichier = path.join(dossier, 'settings.json');
  let reglages = {};
  try { reglages = JSON.parse(readFileSync(fichier, 'utf8')); } catch { /* pas encore de réglages */ }
  const methode = cleDe(compte.id) ? 'gemini-api-key' : 'oauth-personal';
  if (reglages?.security?.auth?.selectedType === methode) return;
  reglages.security = { ...(reglages.security || {}), auth: { ...(reglages.security?.auth || {}), selectedType: methode } };
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  writeFileSync(fichier, JSON.stringify(reglages, null, 2) + '\n', { mode: 0o600 });
}

const FICHE = {
  nom: 'Gemini',
  binaire: () => binaire('gemini'),
  args: (modele) => ['--acp', ...(modele ? ['-m', modele] : [])],
  env: envGemini,
  preparer(compte) {
    poserRegles(compte);
    poserConnexionGoogle(compte);
  },
  // Sans clé d'API ni connexion Google enregistrée, Gemini attend une connexion qui ne vient pas (au lieu de
  // refuser) : on ne le lance pas. Ses identifiants Google sont rangés dans <dossier du compte>/.gemini.
  sansConnexion(compte) {
    if (cleDe(compte.id)) return null;
    const dossier = path.join(compte.dossier, '.gemini');
    const enregistree = ['oauth_creds.json', 'gemini-credentials.json'].some((f) => existsSync(path.join(dossier, f)));
    return enregistree ? null : 'aucune clé ni connexion Google';
  },
  // Gemini n'a pas de classifieur : « automatique » = autoEdit.
  modes: { default: 'default', auto: 'autoEdit', acceptEdits: 'autoEdit', plan: 'plan', bypassPermissions: 'yolo' },
};

/**
 * La clé d'API acceptée par Google ? Ouvrir une session Gemini ne le dit pas : l'outil ne la vérifie qu'à la
 * première demande (relevé le 21/11/2026 : un compte « connecté » dont la clé était refusée, « API key not
 * valid »). Rend { refusee: true, message } si Google la refuse, { refusee: false } sinon, y compris quand Google
 * ne répond pas (on ne bloque pas sur un doute ; `injoignable` le signale).
 */
export async function verifierCleGemini(cle) {
  const base = process.env.DEVWORKSHOP_GOOGLE_API || 'https://generativelanguage.googleapis.com';
  try {
    const r = await fetch(`${base}/v1beta/models?pageSize=1`, { headers: { 'x-goog-api-key': cle }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) return { refusee: false };
    const corps = await r.json().catch(() => ({}));
    // 400 (clé invalide), 401, 403 (clé restreinte, API non activée) : refus de Google. Le reste (429, 5xx) : doute.
    if ([400, 401, 403].includes(r.status)) {
      return { refusee: true, message: `Google refuse cette clé (${String(corps?.error?.message || `HTTP ${r.status}`).slice(0, 160)})` };
    }
    return { refusee: false, injoignable: true };
  } catch {
    return { refusee: false, injoignable: true };
  }
}

/** Connecté ? D'abord la clé auprès de Google (si le compte en a une), puis l'outil lui-même. */
export async function etatCompte(compte) {
  const cle = cleDe(compte.id);
  if (cle) {
    const v = await verifierCleGemini(cle);
    if (v.refusee) return { connecte: false, adresse: null, organisation: null, abonnement: null, motif: v.message };
  }
  return etatAcp(FICHE, compte);
}
export const ouvrir = (options, emettre) => ouvrirAcp(FICHE, options, emettre);
