// Relais : quand l'IA d'une session atteint sa limite (abonnement, quota), une autre IA connectée prend la
// suite, avec l'historique de la conversation, et reprend la dernière demande. D'abord les autres comptes
// Claude, puis ChatGPT, Gemini, et en dernier les IA par API (sans outils).
import { tousLesComptes } from './comptes.mjs';
import { etatDuCompte, fournisseurDe } from './fournisseurs/index.mjs';
import { estLimite } from './fournisseurs/claude-normaliser.mjs';
import { consigneDeProjet } from './projets.mjs';
import { connecteursPour } from './connecteurs.mjs';

const ORDRE = { claude: 0, codex: 1, copilot: 1, gemini: 2, qwen: 3, api: 4 };
const MAX_HISTOIRE = 20_000;

/** Prochaine IA connectée qui n'a pas encore été essayée dans cette session, ou null. */
export async function choisirRelais(essayes) {
  const candidats = tousLesComptes().filter((c) => !essayes.has(c.id) && c.type in ORDRE).sort((a, b) => ORDRE[a.type] - ORDRE[b.type]);
  for (const c of candidats) {
    if (c.type === 'api') return c; // pas d'outil de vérification : l'API répondra, ou échouera à son tour
    try {
      const etat = await Promise.race([etatDuCompte(c), new Promise((_, ko) => setTimeout(() => ko(new Error('delai')), 30000))]);
      if (etat.connecte) return c;
    } catch { /* injoignable : au suivant */ }
  }
  return null;
}

/** L'histoire de la conversation (demandes et réponses), pour que l'IA qui prend le relais sache où on en est. */
function histoire(journal) {
  const lignes = [];
  for (const e of journal) {
    if (e.t === 'utilisateur') lignes.push(`[Utilisateur]\n${e.texte}`);
    else if (e.t === 'assistant' && !e.sousAgent) {
      const texte = (e.blocs || []).filter((b) => b.type === 'texte').map((b) => b.texte).join('\n');
      const outils = (e.blocs || []).filter((b) => b.type === 'outil').map((b) => b.nom);
      if (texte) lignes.push(`[IA]\n${texte}`);
      if (outils.length) lignes.push(`[IA : outils utilisés] ${outils.join(', ')}`);
    }
  }
  const tout = lignes.join('\n\n');
  return tout.length > MAX_HISTOIRE ? '…\n' + tout.slice(-MAX_HISTOIRE) : tout;
}

/**
 * `motif` : 'limite' (l'IA précédente a atteint sa limite ; la demande est renvoyée), 'demande' (changement
 * d'IA voulu par l'utilisateur), 'redemarrage' (session reprise après un redémarrage du serveur).
 */
export function consigneRelais(ancien, journal, motif = 'limite') {
  const debut = {
    limite: `Tu prends le relais d'une autre IA (« ${ancien} ») qui a atteint sa limite d'utilisation au milieu de cette conversation.`,
    demande: `Tu prends le relais d'une autre IA (« ${ancien} »), à la demande de l'utilisateur, au milieu de cette conversation.`,
    redemarrage: "Tu reprends une conversation interrompue par un redémarrage du serveur (ce qui était en cours s'est arrêté).",
  }[motif];
  return [
    debut,
    motif === 'limite'
      ? "Voici la conversation jusqu'ici. La dernière demande de l'utilisateur va t'être renvoyée : continue le travail là où il s'est arrêté, sans refaire ce qui est fait. Vérifie l'état réel des fichiers avant d'agir."
      : "Voici la conversation jusqu'ici. Attends la prochaine demande de l'utilisateur, sans refaire ce qui est déjà fait. Vérifie l'état réel des fichiers avant d'agir.",
    '--- Conversation ---',
    histoire(journal),
    '--- Fin de la conversation ---',
  ].join('\n\n');
}

export const nomCompte = (c) => (c.defaut ? 'Claude (compte du serveur)' : c.nom);

/**
 * Pilote d'une session à une seule IA, avec relais : si l'IA atteint sa limite, la suivante prend la main.
 * `s` est la session (son journal sert d'historique ; son compte change au relais).
 */
export function piloteAvecRelais({ s, compte, dossier, modele, mode, reprise, effort, consigneReprise }, emettre) {
  const essayes = new Set([compte.id]); // une IA déjà essayée ne revient pas : pas de va-et-vient
  let actuel = compte;
  let generation = 0;
  let pilote = null;
  let dernier = null;
  let masquerUtilisateur = false;
  let enRelais = false;

  function ouvrirPour(c, consigneEnPlus) {
    const g = ++generation;
    const premier = c === compte;
    const recevoir = (e) => {
      if (g !== generation) return; // l'IA remplacée ne parle plus dans la session
      if (e.t === 'utilisateur' && masquerUtilisateur) return void (masquerUtilisateur = false); // demande déjà affichée
      if (e.t === 'tour' && !e.ok && !enRelais && (e.limite || estLimite(e.message))) {
        emettre({ ...e, limite: true });
        relayer();
        return;
      }
      emettre(e);
    };
    return fournisseurDe(c).ouvrir({
      compte: c,
      dossier,
      mode,
      modele: premier ? modele : undefined,
      reprise: premier ? reprise : undefined,
      effort: premier ? effort : undefined,
      consigne: [consigneDeProjet(dossier), consigneEnPlus].filter(Boolean).join('\n\n'),
      connecteurs: connecteursPour(c),
    }, recevoir);
  }

  async function relayer() {
    enRelais = true;
    try {
      const suivant = await choisirRelais(essayes);
      if (!suivant) {
        emettre({ t: 'info', code: 'relais_aucun' });
        return;
      }
      essayes.add(suivant.id);
      const ancien = actuel;
      const remplace = pilote;
      pilote = ouvrirPour(suivant, consigneRelais(nomCompte(ancien), s.journal));
      remplace.fermer();
      actuel = suivant;
      s.compte = suivant.id;
      s.avecOutils = suivant.type !== 'api';
      emettre({ t: 'relais', de: ancien.id, vers: suivant.id });
      emettre({ t: 'info', code: 'relais', de: nomCompte(ancien), vers: nomCompte(suivant) });
      if (dernier) {
        masquerUtilisateur = true;
        pilote.envoyer(dernier);
      }
    } finally {
      enRelais = false;
    }
  }

  /** Changement d'IA demandé par la personne : la nouvelle IA reçoit l'historique et attend la suite. */
  function changerIa(c) {
    if (c.id === actuel.id) return;
    essayes.add(c.id);
    const ancien = actuel;
    const remplace = pilote;
    pilote = ouvrirPour(c, consigneRelais(nomCompte(ancien), s.journal, 'demande'));
    remplace.fermer();
    actuel = c;
    s.compte = c.id;
    s.avecOutils = c.type !== 'api';
    emettre({ t: 'relais', de: ancien.id, vers: c.id, manuel: true });
    emettre({ t: 'info', code: 'changement_ia', de: nomCompte(ancien), vers: nomCompte(c) });
  }

  pilote = ouvrirPour(compte, consigneReprise || null);
  return {
    changerIa,
    envoyer(texte) {
      dernier = texte;
      pilote.envoyer(texte);
    },
    interrompre: () => pilote.interrompre(),
    reglerModele: (m) => pilote.reglerModele(m),
    reglerMode: (m) => pilote.reglerMode(m),
    reglerEffort: (e) => (pilote.reglerEffort ? pilote.reglerEffort(e) : Promise.reject(new Error('effort_sans_objet'))),
    repondrePermission: (id, reponse) => pilote.repondrePermission(id, reponse),
    fermer() {
      generation += 1;
      pilote.fermer();
    },
  };
}
