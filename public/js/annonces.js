// Annonces à voix haute, pour toutes les discussions ouvertes, même équipe fermée : « Léa a besoin de toi sur
// intervizio », « Travail terminé sur intervizio », « Le travail s'est arrêté sur intervizio ». Elles suivent les
// alertes du serveur (serveur/veille.mjs). Réglage « Voix » (bas de la barre, ou en-tête de l'équipe) :
//   tout      : l'équipe affichée lit ce que disent les IA, et les autres discussions sont annoncées ;
//   essentiel : seulement ces annonces (besoin de toi, terminé, arrêté) ;
//   non       : muet.
// Seule la fenêtre principale annonce : la fenêtre détachée de l'équipe ne charge pas ce module (pas de doublon).
import { t, ajouterTextes } from './i18n.js';
import { ecouter } from './canal.js';
import { parlerMembre, modeVoix, choisirModeVoix, surModeVoix, MODES_VOIX, volumeVoix, choisirVolume } from './voix-equipe.js';
import { equipeAffichee, prenomMembre } from './equipe.js';

ajouterTextes({
  fr: {
    voix_reglage: 'Voix', annonce_ia: 'L’IA',
    annonce_accord: '{qui} a besoin de toi sur {projet}.', annonce_fini: 'Travail terminé sur {projet}.', annonce_echec: 'Le travail s’est arrêté sur {projet}.',
  },
  en: {
    voix_reglage: 'Voice', annonce_ia: 'The AI',
    annonce_accord: '{qui} needs you on {projet}.', annonce_fini: 'Work finished on {projet}.', annonce_echec: 'Work stopped on {projet}.',
  },
});

const NARRATRICE = { cle: 'annonces', feminin: true }; // toujours la même voix pour les annonces
const GENRES = { accord: 'annonce_accord', fini: 'annonce_fini', echec: 'annonce_echec' };

/**
 * La phrase d'une alerte, ou null si elle ne s'annonce pas. `ici` : c'est la discussion affichée (l'IA y a un prénom
 * dans l'équipe). Pur : testé seul.
 */
export function phraseAnnonce(a, { ici = false, prenom = null } = {}) {
  const cle = GENRES[a?.genre];
  if (!cle) return null;
  const projet = a.projet || '';
  const qui = (ici && prenom) || a.auteur || t('annonce_ia');
  return t(cle, { qui, projet });
}

/**
 * Faut-il annoncer cette alerte ? En « tout », l'équipe qui se voit lit déjà ce que dit la discussion affichée :
 * on n'y répète rien.
 */
export function aAnnoncer(a, { mode, ici, equipeVisible }) {
  if (!GENRES[a?.genre] || mode === 'non') return false;
  return !(mode === 'tout' && ici && equipeVisible);
}

/** `lecteurs.session()` : la discussion affichée. */
export function initAnnonces(lecteurs) {
  ecouter((m) => {
    if (m.t !== 'alerte') return;
    const ici = m.id === lecteurs.session();
    if (!aAnnoncer(m, { mode: modeVoix(), ici, equipeVisible: equipeAffichee() })) return;
    parlerMembre(NARRATRICE, phraseAnnonce(m, { ici, prenom: prenomMembre(m.auteur) }));
  });
  const volume = document.getElementById('voix-volume');
  if (volume) {
    volume.value = String(volumeVoix());
    volume.title = t('voix_volume');
    volume.addEventListener('input', () => choisirVolume(volume.value));
    surModeVoix(() => { if (document.activeElement !== volume) volume.value = String(volumeVoix()); });
  }
  const choix = document.getElementById('voix-mode');
  if (!choix) return;
  const remplir = () => {
    choix.replaceChildren(...MODES_VOIX.map((mode) => {
      const o = document.createElement('option');
      o.value = mode;
      o.textContent = t('voix_mode_' + mode);
      o.selected = mode === modeVoix();
      return o;
    }));
    choix.title = t('voix_mode_aide');
  };
  remplir();
  choix.addEventListener('change', () => choisirModeVoix(choix.value));
  surModeVoix(remplir);
}
