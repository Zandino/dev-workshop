// Branchement des modules ajoutés à l'atelier : fichiers joints, réglages du projet et corbeille,
// connecteurs partagés, export de la session, vue « En direct », dictée.
import { initPieces } from './pieces.js';
import { initProjet } from './projet.js';
import { initConnecteurs } from './connecteurs.js';
import { basculerDirect } from './direct.js';
import { versMarkdown, telecharger, nomExport } from './export.js';
import { dire, ecouter } from './canal.js';
import { definirCommandes } from './commandes.js';
import { initApercu } from './apercu.js';
import { initTravail } from './travail.js';
import { initAbsence } from './absence.js';
import { initDictee } from './dictee.js';

/**
 * `ecran` : l'état de l'écran (app.js) ; `compte()` : le compte choisi ; `libelle(compte)` : son nom affiché ;
 * `projetSupprime()` : remet l'écran à zéro quand le projet affiché part à la corbeille.
 */
export function brancherAjouts({ ecran, compte, libelle, projetSupprime }) {
  // Exporte la session affichée en Markdown ; faux s'il n'y a rien à exporter.
  const exporter = () => {
    if (!ecran.journal.length) return false;
    const c = compte();
    const nom = ecran.salon ? null : c && libelle(c);
    telecharger(nomExport(ecran.titre || ecran.projet), versMarkdown({ titre: ecran.titre, projet: ecran.projet, compte: nom, evenements: ecran.journal }));
    return true;
  };
  document.getElementById('ouvrir-direct').addEventListener('click', basculerDirect);

  // Commandes « / » dès le choix d'un projet ou d'un compte, sans attendre la première réponse d'une session
  // (avant, la palette restait vide tant que rien n'avait été envoyé).
  const choixCompte = document.getElementById('compte');
  const demanderCommandes = () => {
    const id = choixCompte.value === 'orchestre' ? 'defaut' : choixCompte.value || 'defaut';
    dire({ t: 'commandes', compte: id, projet: ecran.projet || undefined });
  };
  let demandees = false;
  choixCompte.addEventListener('change', demanderCommandes);
  ecouter((m) => {
    if (m.t === 'general' && !demandees) {
      demandees = true;
      demanderCommandes();
    } else if (m.t === 'historique') demanderCommandes(); // un projet vient d'être choisi
    else if (m.t === 'commandes' && (!ecran.session || ecran.etat.ferme)) definirCommandes(m.commandes);
  });
  initPieces(() => ecran.projet);
  initConnecteurs(() => ecran.general?.comptes || []);
  initProjet({ exporter, projetSupprime });
  initApercu({ projet: () => ecran.projet, session: () => ecran.session });
  initTravail({ ecran, compte, libelle, comptes: () => ecran.general?.comptes || [] });
  initAbsence();
  initDictee();
}
