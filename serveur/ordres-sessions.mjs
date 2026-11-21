// Ordres du canal pour la corbeille des sessions : y mettre une session (en cours ou passée), la restaurer,
// l'effacer pour de bon. Seules les sessions du compte Claude du serveur sont enregistrées (et donc archivables).
import path from 'node:path';
import { resoudreProjet, RACINE_PROJETS } from './securite.mjs';
import { mkdirSync, existsSync } from 'node:fs';
import { session, fermerSession, ouvrirSession, listerVivantes, interrompues, changerEquipe } from './sessions.mjs';
import { preparerParticipants } from './salon.mjs';
import { deplacerSession, enDeplacement } from './deplacer-session.mjs';
import { NOM_PROJET } from './projets.mjs';
import { chargerInterrompue, oublierSession } from './sauvegarde-sessions.mjs';
import { consigneRelais } from './relais.mjs';
import { listerComptes } from './comptes.mjs';
import * as claude from './fournisseurs/claude.mjs';
import { mettreSessionCorbeille, restaurerSession, effacerSession, listerSessionsCorbeille } from './corbeille-sessions.mjs';
import { compte } from './comptes.mjs';

const nomProjet = (dossier) => path.relative(RACINE_PROJETS, dossier).split(path.sep)[0];

/** `corbeille()` renvoie le contenu de la corbeille à l'écran ; `general()`, l'état général ; `attacher(id)` abonne. */
export function ordresSessions(envoyer, general, corbeille, attacher) {
  const historique = async (projet) => {
    try {
      envoyer({ t: 'historique', projet, sessions: await claude.historique(resoudreProjet(projet)) });
    } catch { /* projet disparu entre-temps */ }
  };

  return {
    // Session interrompue par un redémarrage : on la rouvre avec son historique (Claude du serveur : reprise
    // native de sa session ; autres IA, salon, ou équipe changée en route : l'historique leur est donné en consigne).
    async reprendre_interrompue(m) {
      const d = chargerInterrompue(String(m.id || ''));
      resoudreProjet(nomProjet(d.dossier));
      const vues = listerComptes();
      const commun = { dossier: d.dossier, titre: d.titre, mode: d.etat?.mode || 'default', effort: d.etat?.effort, equipeChangee: d.equipeChangee };
      const histoire = consigneRelais('', d.journal, 'redemarrage');
      let s;
      if (d.participants) {
        const participants = d.participants.map((p) => ({ compte: compte(p.compte), modele: p.modele || undefined, nom: p.nom, externe: Boolean(vues.find((v) => v.id === p.compte)?.externe) }));
        s = await ouvrirSession({ ...commun, participants, echanges: d.echanges || undefined, journalInitial: d.journal, consigneReprise: histoire });
      } else {
        const c = compte(d.compte);
        // Après un changement d'équipe, la session Claude Code ne porte que la suite : on repart du journal.
        const reprise = c.defaut && d.etat?.sessionId && !d.equipeChangee ? d.etat.sessionId : undefined;
        s = await ouvrirSession({
          ...commun, compte: c, modele: d.etat?.modele, orchestre: d.orchestre, reprise,
          // Claude seul repris : son historique se relit dans sa session ; l'orchestre garde le journal à l'écran.
          journalInitial: reprise && !d.orchestre ? undefined : d.journal,
          consigneReprise: reprise ? undefined : histoire,
        });
      }
      oublierSession(d.id);
      attacher(s.id);
      general();
    },

    oublier_interrompue(m) {
      oublierSession(String(m.id || ''));
      general();
    },

    // Changer d'IA en cours de session (une seule IA) : la nouvelle reprend avec l'historique.
    changer_ia(m) {
      const s = session(String(m.session || ''));
      if (!s.pilote.changerIa || s.orchestre) throw new Error('changement_impossible');
      if (s.etat.occupe) throw new Error('changement_occupe');
      s.pilote.changerIa(compte(String(m.compte || '')));
      general();
    },

    // Changer l'équipe d'une discussion ouverte, sans en ouvrir une autre : plusieurs IA (m.participants),
    // l'orchestre (m.orchestre) ou une seule (m.compte). L'historique suit ; voir changerEquipe (sessions.mjs).
    changer_equipe(m) {
      const s = session(String(m.session || ''));
      if (Array.isArray(m.participants) && m.participants.length > 1) {
        changerEquipe(s.id, { participants: preparerParticipants(m.participants), echanges: m.echanges });
      } else if (m.orchestre === true) {
        changerEquipe(s.id, { orchestre: compte('defaut') });
      } else {
        changerEquipe(s.id, { compte: compte(String(m.compte || '')) });
      }
      general();
    },

    // m.session : session en cours (fermée d'abord) ; sinon m.projet + m.id : session passée.
    async session_corbeille(m) {
      let cible;
      if (m.session) {
        const s = session(String(m.session));
        cible = s.compte === 'defaut' && s.etat.sessionId ? { id: s.etat.sessionId, dossier: s.dossier, projet: nomProjet(s.dossier), titre: s.titre } : null;
        fermerSession(s.id);
      } else {
        const projet = String(m.projet || '');
        cible = { id: String(m.id || ''), dossier: resoudreProjet(projet), projet, titre: m.titre };
      }
      if (cible) await mettreSessionCorbeille(cible);
      general();
      corbeille();
      if (cible) await historique(cible.projet);
    },

    async corbeille_session_restaurer(m) {
      const projet = await restaurerSession(String(m.id || ''));
      general();
      corbeille();
      await historique(projet);
    },

    // Range une discussion dans un autre projet (créé au passage si `creer`). Refus si elle est ouverte,
    // interrompue ou à la corbeille. Voir deplacer-session.mjs.
    async deplacer_discussion(m) {
      const projet = String(m.projet || '');
      const vers = String(m.vers || '');
      if (!NOM_PROJET.test(projet) || !NOM_PROJET.test(vers)) throw new Error('nom_invalide');
      const id = String(m.id || '');
      const de = resoudreProjet(projet);
      const bloquee = (x) => listerVivantes().some((s) => s.sessionId === x)
        || interrompues().some((s) => s.sessionId === x)
        || listerSessionsCorbeille().some((s) => s.id === x);
      // Vérifié avant de créer le projet d'arrivée : un refus ne laisse pas de dossier vide.
      if (enDeplacement(id) || bloquee(id)) throw new Error('discussion_occupee');
      if (m.creer === true && !existsSync(path.join(RACINE_PROJETS, vers))) mkdirSync(path.join(RACINE_PROJETS, vers));
      const arrivee = resoudreProjet(vers);
      await deplacerSession({ id, de, vers: arrivee, bloquee });
      envoyer({ t: 'discussion_deplacee', id: m.id, de: projet, vers });
      general();
      await historique(projet);
      await historique(vers);
    },

    async corbeille_session_effacer(m) {
      await effacerSession(String(m.id || ''));
      general();
      corbeille();
    },
  };
}
