// Ranger une discussion OUVERTE dans un autre projet : pour elle, c'est un redémarrage dans un autre dossier.
// - Le Claude du serveur, avec sa propre session Claude Code (équipe jamais changée en route) : on l'arrête, on déplace
//   sa session (deplacer-session.mjs), et il la reprend dans le nouveau dossier avec tout son contexte. Échec du
//   déplacement : il la reprend là où elle était (l'original n'est retiré qu'une fois la copie reconnue).
// - Sinon (plusieurs IA, autre compte, orchestre ou équipe changée) : la même équipe repart dans le nouveau dossier
//   avec l'historique en consigne (changerEquipe), et la discussion Claude Code d'origine, s'il y en a une, suit.
// Refusé pendant qu'elle travaille, attend ton accord ou traite un message d'une autre discussion ; pendant le
// rangement, rien ne lui est remis (s.demenagement : voir canal.mjs et entre-discussions.mjs).
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { session, changerEquipe, emetteurDe, rejouerAuxAbonnes } from './sessions.mjs';
import { deplacerSession } from './deplacer-session.mjs';
import { dossierDeClaude } from './sessions-claude.mjs';
import { piloteAvecRelais } from './relais.mjs';
import { ouvrirOrchestre } from './orchestre.mjs';
import { compte, listerComptes } from './comptes.mjs';

const existe = (id) => listerComptes().some((v) => v.id === id);
import { preparerParticipants } from './salon.mjs';
import { signaler } from './veille.mjs';
import { RACINE_PROJETS } from './securite.mjs';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const relatif = (dossier) => path.relative(RACINE_PROJETS, dossier);

/** Refuse (code court) si la discussion ne peut pas être rangée maintenant. */
export function verifierDemenageable(s, vers) {
  if (s.demenagement || s.etat.occupe || s.attente.size || s.livraison || s.fileDiscussions?.length) throw new Error('discussion_occupee');
  if (s.dossier === vers) throw new Error('meme_projet');
}

/** Claude Code finit d'écrire sa session après la fermeture : on attend que le fichier ne bouge plus (10 s au plus). */
async function fichierStable(fichier) {
  let avant = -2;
  for (let i = 0; i < 20; i += 1) {
    const taille = existsSync(fichier) ? statSync(fichier).size : -1;
    if (taille === avant) return;
    avant = taille;
    await pause(500);
  }
}

async function natif(s, c, sessionId, vers, note) {
  const de = s.dossier;
  const { mode, effort } = s.etat;
  const modele = s.etat.modele && s.etat.modele !== 'default' ? s.etat.modele : undefined; // il garde son modèle
  s.generation += 1; // l'ancien pilote ne parle plus ici, sa fermeture comprise
  s.pilote.fermer();
  await fichierStable(path.join(dossierDeClaude(de), `${sessionId}.jsonl`));
  let ici = de;
  try {
    await deplacerSession({ id: sessionId, de, vers, bloquee: () => false });
    ici = vers;
  } finally {
    // Rangée ou non, Claude reprend sa session : dans le nouveau dossier, ou dans l'ancien si le déplacement a échoué.
    // Fermée entre-temps (par la personne) : rien à relancer.
    s.dossier = ici;
    if (!s.etat.ferme) {
      const emettre = emetteurDe(s);
      s.pilote = s.orchestre
        ? ouvrirOrchestre({ session: s.id, compte: c, dossier: ici, modele, mode, effort, reprise: sessionId }, emettre)
        : piloteAvecRelais({ s, compte: c, dossier: ici, modele, mode, effort, reprise: sessionId }, emettre);
    }
  }
  if (s.etat.ferme) return;
  s.emettre(note);
  s.aSauver = true;
  rejouerAuxAbonnes(s);
  signaler();
}

async function avecHistorique(s, c, vers, note) {
  const de = s.dossier;
  const modele = s.etat.modele && s.etat.modele !== 'default' ? s.etat.modele : undefined;
  // Un compte supprimé depuis quitte l'équipe ; s'il ne reste qu'une IA, elle continue seule.
  const restants = (s.participantsComplets || []).filter((p) => existe(p.compte));
  const equipe = restants.length > 1
    ? { participants: preparerParticipants(restants), echanges: s.echanges }
    : s.participants ? { compte: compte(restants[0]?.compte || 'defaut') }
      : s.orchestre ? { orchestre: c, modele } : { compte: c, modele };
  changerEquipe(s.id, equipe, { ailleurs: vers, note }); // en cas d'échec, l'équipe en place continue, intacte
  // Puis la discussion Claude Code dont celle-ci est partie la suit (sinon l'ancien projet en garderait la copie).
  // Au mieux : si elle ne peut pas suivre, la discussion est rangée quand même.
  if (s.origine) {
    await deplacerSession({ id: s.origine, de, vers, bloquee: () => false }).catch((e) => {
      if (e.message !== 'session_inconnue') console.error('[dev-workshop] discussion d’origine non déplacée :', e.message);
    });
  }
}

/** Range la discussion ouverte `id` dans le dossier de projet `vers` (chemin réel, déjà vérifié). */
export async function demenagerSession(id, vers) {
  const s = session(id);
  verifierDemenageable(s, vers);
  s.demenagement = true;
  try {
    const c = s.compte ? compte(s.compte) : null;
    const note = { t: 'info', code: 'discussion_rangee_ici', de: relatif(s.dossier), vers: relatif(vers) };
    const sessionId = s.etat.sessionId;
    if (c?.defaut && sessionId && !s.equipeChangee) await natif(s, c, sessionId, vers, note);
    else await avecHistorique(s, c, vers, note);
  } finally {
    s.demenagement = false;
  }
}
