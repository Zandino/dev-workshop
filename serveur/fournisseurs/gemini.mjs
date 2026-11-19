// Fournisseur « Gemini » (Google) : pilote `gemini --acp` par le moteur ACP commun (acp.mjs).
// Noms des méthodes et des mises à jour relevés dans l'outil lui-même (gemini-cli 0.69.0).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  // Gemini n'a pas de classifieur : « automatique » = autoEdit.
  modes: { default: 'default', auto: 'autoEdit', acceptEdits: 'autoEdit', plan: 'plan', bypassPermissions: 'yolo' },
};

export const etatCompte = (compte) => etatAcp(FICHE, compte);
export const ouvrir = (options, emettre) => ouvrirAcp(FICHE, options, emettre);
