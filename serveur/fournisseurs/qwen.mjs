// Fournisseur « agent par clé » : Qwen Code (`qwen --acp`) branché sur n'importe quelle API compatible OpenAI
// (DeepSeek, Mistral, Grok, Qwen/DashScope, OpenRouter, un modèle local…). À la différence d'un compte « API »
// simple, l'IA a alors des outils : lire et modifier les fichiers, lancer des commandes (avec accord).
import path from 'node:path';
import { binaire } from './jsonrpc.mjs';
import { cleDe } from '../comptes.mjs';
import { etatAcp, ouvrirAcp } from './acp.mjs';

export function envQwen(compte) {
  return {
    ...process.env,
    QWEN_HOME: path.join(compte.dossier, '.qwen'),
    OPENAI_API_KEY: cleDe(compte.id) || 'local',
    OPENAI_BASE_URL: compte.url,
    OPENAI_MODEL: compte.modele,
  };
}

const FICHE = {
  nom: 'Qwen Code',
  binaire: () => binaire('qwen'),
  args: (modele) => ['--acp', '--auth-type', 'openai', ...(modele ? ['-m', modele] : [])],
  env: envQwen,
  // Qwen Code annonce une seule méthode de connexion : la clé d'API compatible OpenAI.
  methodeAuth: 'openai',
  modes: { default: 'default', auto: 'auto-edit', acceptEdits: 'auto-edit', plan: 'plan', bypassPermissions: 'yolo' },
};

export const etatCompte = (compte) => etatAcp(FICHE, compte);
export const ouvrir = (options, emettre) => ouvrirAcp(FICHE, options, emettre);
