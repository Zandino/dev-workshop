// Registre des fournisseurs d'IA, choisis d'après le type du compte.
// Chaque fournisseur exporte : ouvrir(options, emettre) -> pilote, et au besoin historique / lireHistorique.
// Un pilote expose : envoyer(texte), interrompre(), reglerModele(m), reglerMode(m),
//   repondrePermission(id, reponse), fermer().
// Les événements émis sont listés dans le README (« Brancher une autre IA »).
import * as claude from './claude.mjs';
import * as api from './api.mjs';
import * as codex from './codex.mjs';
import * as gemini from './gemini.mjs';
import * as copilot from './copilot.mjs';
import * as qwen from './qwen.mjs';
import { etatCompte as etatClaude } from './claude-compte.mjs';

const FOURNISSEURS = { claude, api, codex, gemini, copilot, qwen };

/** Connecté ou non, demandé à l'outil officiel du compte. */
export function etatDuCompte(compte) {
  if (compte.type === 'claude') return etatClaude(compte);
  if (FOURNISSEURS[compte.type]?.etatCompte) return FOURNISSEURS[compte.type].etatCompte(compte);
  throw new Error('compte_inconnu');
}

export function fournisseurDe(compte) {
  const f = FOURNISSEURS[compte.type];
  if (!f) throw new Error('fournisseur_indisponible');
  return f;
}
