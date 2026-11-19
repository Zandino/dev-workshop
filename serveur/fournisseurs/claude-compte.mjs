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

/** Entrée qui n'envoie jamais rien : on lit ce que l'outil annonce au démarrage, sans appeler le modèle. */
async function* muet() {
  await new Promise(() => {});
}

const commandesEnCache = new Map();

/**
 * Commandes « / » d'un compte Claude pour un dossier (celles du projet comprises), lues au démarrage de
 * l'outil, sans rien envoyer au modèle. Gardées 10 minutes : l'écran les montre avant la première demande.
 */
export async function commandesDuCompte(compte, dossier) {
  const cle = `${compte?.id || 'defaut'}|${dossier}`;
  const deja = commandesEnCache.get(cle);
  if (deja && Date.now() - deja.le < 10 * 60 * 1000) return deja.liste;
  const q = query({ prompt: muet(), options: { cwd: dossier, settingSources: ['user', 'project', 'local'], ...(compte?.dossier ? { env: environnement(compte) } : {}) } });
  try {
    const init = await Promise.race([
      q.initializationResult(),
      new Promise((_, refuser) => setTimeout(() => refuser(new Error('delai')), 25000)),
    ]);
    const liste = (init.commands || []).map((c) => ({ nom: c.name, description: c.description || '', argument: c.argumentHint || '' }));
    commandesEnCache.set(cle, { le: Date.now(), liste });
    return liste;
  } catch {
    return [];
  } finally {
    try { q.close(); } catch { /* déjà fermée */ }
  }
}

/** Interroge un compte Claude sans rien envoyer au modèle : connecté ou non, et sous quel abonnement. */
export async function etatCompte(compte) {
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
