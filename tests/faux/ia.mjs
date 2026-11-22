// Fausses IA et faux comptes pour tests/relais-limite.mjs (chargés à la place des vrais par tests/faux/crochet.mjs) :
// fournisseurs (index.mjs et claude.mjs), comptes.mjs et memoire.mjs. Chaque compte répond selon le comportement
// que l'essai lui donne ; tout ce qui est ouvert et envoyé est noté.

// --- comptes.mjs
export const COMPTES = [
  { id: 'defaut', type: 'claude', nom: 'Claude', defaut: true },
  { id: 'perso', type: 'claude', nom: 'Perso' },
  { id: 'gpt', type: 'codex', nom: 'GPT' },
  { id: 'gemini', type: 'gemini', nom: 'Gemini' },
];
let comptes = [...COMPTES];
export const definirComptes = (liste) => { comptes = liste; };
export const tousLesComptes = () => comptes;
export function compte(id) {
  const c = comptes.find((x) => x.id === id);
  if (!c) throw new Error('compte_inconnu');
  return c;
}
export const listerComptes = () => comptes.map((c) => ({ ...c, externe: c.type !== 'claude' }));
export const cleDe = () => null;
export const oublierCle = () => {};

// --- memoire.mjs : toujours de la place pour une IA ; jamais assez pour travailler « en même temps » (essai déterministe).
export const assezPour = (_n, enPlus = 0) => !enPlus;
export const REGLE_MEMOIRE = 'Règle de mémoire.';

// --- fournisseurs
export const ouvertures = []; // { compte, consigne }
export const envois = []; // { compte, texte }
export const fermetures = []; // compte
/** comportements[compte](texte, recevoir) : ce que dit l'IA de ce compte à chaque message reçu. */
export const comportements = {};
export const etatDuCompte = async () => ({ connecte: true });

function piloteFaux(opts, recevoir) {
  const id = opts.compte.id;
  ouvertures.push({ compte: id, consigne: opts.consigne || '' });
  return {
    envoyer(texte) {
      envois.push({ compte: id, texte });
      setTimeout(() => comportements[id]?.(texte, recevoir), 5);
    },
    fermer() { fermetures.push(id); },
    interrompre: async () => {},
    reglerMode: async () => {},
    reglerModele: async () => {},
    reglerEffort: async () => {},
    repondrePermission: () => false,
  };
}
export const ouvrir = piloteFaux; // fournisseurs/claude.mjs (la cheffe de l'orchestre)
export const fournisseurDe = () => ({ ouvrir: piloteFaux });

// Réponses toutes faites.
export const repondre = (texte) => (_t, recevoir) => {
  recevoir({ t: 'assistant', blocs: [{ type: 'texte', texte }] });
  recevoir({ t: 'tour', ok: true, motif: 'success' });
};
/** Limite atteinte, avec l'heure de remise à zéro annoncée (comme Claude) ou sans. */
export const limite = (retablieLe = null) => (_t, recevoir) => {
  if (retablieLe) recevoir({ t: 'limite', statut: 'rejected', type: 'five_hour', retablieLe });
  recevoir({ t: 'tour', ok: false, motif: 'limite', limite: true, message: "You've hit your 5-hour limit · resets 3:20pm (Europe/Paris)" });
};
