// Ordres du canal pour les projets (contexte, corbeille), les fichiers joints et les connecteurs partagés.
// Même règle que le reste du canal : l'écran demande, le serveur vérifie tout.
import { resoudreProjet } from './securite.mjs';
import { listerVivantes } from './sessions.mjs';
import { listerComptes, compte } from './comptes.mjs';
import { commandesDuCompte } from './fournisseurs/claude-compte.mjs';
import { homedir } from 'node:os';
import { ticketApercu } from './apercu.mjs';
import { deconnecterCompte } from './connexion.mjs';
import { etatDuCompte } from './fournisseurs/index.mjs';
import { lireContexte, ecrireContexte, ajouterAuContexte, mettreALaCorbeille, listerCorbeille, restaurer, effacerDefinitivement, DUREE_CORBEILLE } from './projets.mjs';
import { receptions } from './fichiers.mjs';
import { vueConnecteurs, definirConnecteur, supprimerConnecteur, reglerAcces, importerConnecteurs } from './connecteurs.mjs';
import { listerSessionsCorbeille } from './corbeille-sessions.mjs';
import { ordresSessions } from './ordres-sessions.mjs';
import { reglesDu, enregistrerRegles } from './regles-accord.mjs';
import { definirOrdreProjets, definirOrdreDiscussions } from './ordre.mjs';

const dansProjet = (s, nom) => s.projet === nom || s.projet.startsWith(nom + '/');

/** Ordres propres à une connexion. `general()` renvoie l'état général ; `attacher(id)` y abonne la connexion. */
export function ordresProjets(envoyer, general, attacher) {
  const fichiers = receptions();
  const corbeille = () => envoyer({ t: 'corbeille', projets: listerCorbeille(), sessions: listerSessionsCorbeille(), dureeJours: DUREE_CORBEILLE / 86_400_000 });
  const connecteurs = () => envoyer({ t: 'connecteurs', ...vueConnecteurs(listerComptes()) });

  const ordres = {
    // Ordre choisi dans la barre (glisser-déposer, flèches) : voir ordre.mjs.
    ordre_projets(m) {
      definirOrdreProjets(m.liste);
      general();
    },

    ordre_discussions(m) {
      definirOrdreDiscussions(String(m.projet || ''), m.liste);
      general();
    },

    projet_lire(m) {
      const nom = String(m.nom || '');
      resoudreProjet(nom);
      envoyer({ t: 'projet', nom, contexte: lireContexte(nom), regles: reglesDu(nom), sessions: listerVivantes().filter((s) => dansProjet(s, nom)).length });
    },

    projet_regles(m) {
      const nom = String(m.nom || '');
      resoudreProjet(nom);
      envoyer({ t: 'projet_regles', nom, regles: enregistrerRegles(nom, m.regles) });
    },

    projet_contexte(m) {
      ecrireContexte(String(m.nom || ''), m.contexte);
      envoyer({ t: 'projet_enregistre', nom: m.nom });
    },

    // « Retenir pour le projet » : ce que la personne a relu et validé s'ajoute à la fin de la fiche.
    projet_retenir(m) {
      ajouterAuContexte(String(m.nom || ''), typeof m.texte === 'string' ? m.texte.slice(0, 20000) : '');
      envoyer({ t: 'projet_retenu', nom: m.nom });
    },

    // La confirmation (nom retapé) est vérifiée ici aussi : l'écran seul ne suffit pas.
    projet_supprimer(m) {
      const nom = String(m.nom || '');
      if (m.confirmation !== nom) throw new Error('confirmation_invalide');
      resoudreProjet(nom);
      mettreALaCorbeille(nom, listerVivantes().filter((s) => dansProjet(s, nom)).length);
      general();
      corbeille();
    },

    corbeille_lire: corbeille,

    corbeille_restaurer(m) {
      const nom = restaurer(String(m.id || ''));
      general();
      corbeille();
      envoyer({ t: 'projet_restaure', nom });
    },

    corbeille_effacer(m) {
      effacerDefinitivement(String(m.id || ''));
      corbeille();
    },

    // Un morceau de fichier joint ; au dernier, l'écran reçoit le chemin à citer dans le message.
    fichier(m) {
      const projet = resoudreProjet(String(m.projet || ''));
      const fini = fichiers.morceau(projet, m);
      if (fini) envoyer({ t: 'fichier_recu', ...fini });
      else envoyer({ t: 'fichier_avance', id: m.id, index: m.index });
    },

    fichier_annuler(m) {
      fichiers.abandonner(String(m.id || ''));
    },

    // Commandes « / » avant la première demande (Claude seulement : les autres outils n'en exposent pas).
    async commandes(m) {
      const c = listerComptes().find((x) => x.id === String(m.compte || 'defaut'));
      if (!c || c.type !== 'claude') return envoyer({ t: 'commandes', compte: m.compte, commandes: [] });
      const dossier = m.projet ? resoudreProjet(String(m.projet)) : homedir();
      envoyer({ t: 'commandes', compte: c.id, commandes: await commandesDuCompte(compte(c.id), dossier) });
    },

    // Ticket d'aperçu des fichiers du projet (panneau de droite), valable 30 minutes.
    apercu_ticket(m) {
      envoyer({ t: 'apercu_ticket', projet: m.projet, ...ticketApercu(resoudreProjet(String(m.projet || ''))) });
    },

    // Déconnexion d'un compte (commande officielle de son outil), puis son nouvel état.
    async deconnecter_compte(m) {
      const c = compte(String(m.id || ''));
      await deconnecterCompte(c);
      envoyer({ t: 'etat_compte', id: c.id, ...(await etatDuCompte(c)) });
      general();
    },

    connecteurs_lire: connecteurs,

    // Reprend les connecteurs déjà déclarés dans Claude Code et Gemini sur le serveur.
    connecteurs_importer() {
      const comptes = listerComptes().filter((c) => !c.defaut).map((c) => compte(c.id));
      envoyer({ t: 'connecteurs_importes', ...importerConnecteurs(comptes, homedir()) });
      connecteurs();
    },

    connecteur_definir(m) {
      definirConnecteur(m.connecteur);
      connecteurs();
    },

    connecteur_supprimer(m) {
      supprimerConnecteur(m.nom);
      connecteurs();
    },

    connecteur_acces(m) {
      const c = listerComptes().find((x) => x.id === String(m.id));
      if (!c || c.type === 'api') throw new Error('compte_inconnu');
      reglerAcces(c.id, m.autorise === true);
      connecteurs();
    },
  };
  Object.assign(ordres, ordresSessions(envoyer, general, corbeille, attacher));
  return { ordres, fermer: () => fichiers.toutAbandonner() };
}
