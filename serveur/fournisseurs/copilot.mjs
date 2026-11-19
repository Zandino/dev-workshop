// Fournisseur « GitHub Copilot » : pilote `copilot --acp` (GitHub Copilot CLI) par le moteur ACP commun.
// Connexion par compte GitHub (`copilot login`, depuis le panneau « Comptes ») ou par jeton GitHub enregistré
// pour le compte. Chaque compte a son propre dossier : Copilot y range sa configuration (~/.copilot).
import { binaire } from './jsonrpc.mjs';
import { cleDe } from '../comptes.mjs';
import { etatAcp, ouvrirAcp } from './acp.mjs';

/** Le dossier du compte tient lieu de dossier personnel pour Copilot ; le jeton, s'il y en a un, passe avant. */
export function envCopilot(compte) {
  const cle = cleDe(compte.id);
  return { ...process.env, HOME: compte.dossier, ...(cle ? { COPILOT_GITHUB_TOKEN: cle } : {}) };
}

const FICHE = {
  nom: 'Copilot',
  binaire: () => binaire('copilot'),
  args: (modele) => ['--acp', ...(modele ? ['--model', modele] : [])],
  env: envCopilot,
  // Les modes de Copilot ne sont appliqués que s'il les annonce sous ces noms ; sinon, il reste en manuel.
  modes: { default: 'default', auto: 'auto', acceptEdits: 'acceptEdits', plan: 'plan', bypassPermissions: 'yolo' },
};

export const etatCompte = (compte) => etatAcp(FICHE, compte);
export const ouvrir = (options, emettre) => ouvrirAcp(FICHE, options, emettre);
