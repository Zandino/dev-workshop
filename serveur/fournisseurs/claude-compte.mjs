// Plusieurs comptes Claude sur le même serveur : chaque compte a son dossier de configuration.
// Le compte par défaut reste ~/.claude, sans rien changer.
import { homedir } from 'node:os';
import { reglesCommunes } from './regles.mjs';
import { query } from '@anthropic-ai/claude-agent-sdk';

function environnement(compte) {
  // Le SDK remplace l'environnement entier quand `env` est fourni : on repart donc de celui du serveur.
  return { ...process.env, CLAUDE_CONFIG_DIR: compte.dossier };
}

/** Options du SDK propres au compte et à la consigne (rôle dans une discussion à plusieurs). */
export function optionsDeCompte(compte, consigne) {
  const autre = Boolean(compte?.dossier);
  const ajout = [autre ? reglesCommunes() : '', consigne || ''].filter(Boolean).join('\n\n');
  const options = { systemPrompt: { type: 'preset', preset: 'claude_code', ...(ajout ? { append: ajout } : {}) } };
  if (autre) options.env = environnement(compte);
  return options;
}

/** Interroge un compte Claude sans rien envoyer au modèle : connecté ou non, et sous quel abonnement. */
export async function etatCompte(compte) {
  async function* muet() {
    await new Promise(() => {});
  }
  const q = query({ prompt: muet(), options: { cwd: homedir(), ...(compte?.dossier ? { env: environnement(compte) } : {}) } });
  try {
    const init = await Promise.race([
      q.initializationResult(),
      new Promise((_, refuser) => setTimeout(() => refuser(new Error('delai')), 25000)),
    ]);
    const a = init.account || {};
    return {
      connecte: Boolean(a.email || a.apiKeySource),
      adresse: a.email || null,
      organisation: a.organization || null,
      abonnement: a.subscriptionType || null,
    };
  } catch {
    return { connecte: false, adresse: null, organisation: null, abonnement: null, injoignable: true };
  } finally {
    try { q.close(); } catch { /* déjà fermée */ }
  }
}
