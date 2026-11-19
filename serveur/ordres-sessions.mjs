// Ordres du canal pour la corbeille des sessions : y mettre une session (en cours ou passée), la restaurer,
// l'effacer pour de bon. Seules les sessions du compte Claude du serveur sont enregistrées (et donc archivables).
import path from 'node:path';
import { resoudreProjet, RACINE_PROJETS } from './securite.mjs';
import { session, fermerSession, ouvrirSession } from './sessions.mjs';
import { chargerInterrompue, oublierSession } from './sauvegarde-sessions.mjs';
import { consigneRelais } from './relais.mjs';
import { listerComptes } from './comptes.mjs';
import * as claude from './fournisseurs/claude.mjs';
import { mettreSessionCorbeille, restaurerSession, effacerSession } from './corbeille-sessions.mjs';
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
    // native de sa session ; autres IA : l'historique leur est donné en consigne).
    async reprendre_interrompue(m) {
      const d = chargerInterrompue(String(m.id || ''));
      resoudreProjet(nomProjet(d.dossier));
      const vues = listerComptes();
      const commun = { dossier: d.dossier, titre: d.titre, mode: d.etat?.mode || 'default', effort: d.etat?.effort };
      let s;
      if (d.participants) {
        const participants = d.participants.map((p) => ({ compte: compte(p.compte), modele: p.modele || undefined, nom: p.nom, externe: Boolean(vues.find((v) => v.id === p.compte)?.externe) }));
        s = await ouvrirSession({ ...commun, participants, journalInitial: d.journal });
      } else {
        const c = compte(d.compte);
        const reprise = c.defaut && d.etat?.sessionId ? d.etat.sessionId : undefined;
        s = await ouvrirSession({
          ...commun, compte: c, modele: d.etat?.modele, orchestre: d.orchestre, reprise,
          journalInitial: reprise ? undefined : d.journal,
          consigneReprise: reprise || d.orchestre ? undefined : consigneRelais('', d.journal, 'redemarrage'),
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

    async corbeille_session_effacer(m) {
      await effacerSession(String(m.id || ''));
      general();
      corbeille();
    },
  };
}
