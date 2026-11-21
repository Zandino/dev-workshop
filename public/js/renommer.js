// Renommer une discussion depuis la barre : ✎ au survol (ou F2), le titre devient un champ ; Entrée enregistre,
// Échap annule. La barre ne se redessine pas pendant la saisie.
import { h } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { figer, liberer } from './ordre-barre.js';

ajouterTextes({
  fr: { renommer: 'Renommer (F2)', refus_titre_invalide: 'Titre vide : la discussion garde le sien.' },
  en: { renommer: 'Rename (F2)', refus_titre_invalide: 'Empty title: the conversation keeps its own.' },
});

/**
 * Met en saisie le titre de `ligne` (conteneur d'une ligne de la barre) ; `enregistrer(titre)` s'il change. Le champ
 * se pose par-dessus la ligne, à côté d'elle dans le conteneur : un champ dans un bouton ne se saisit pas partout.
 */
function editer(ligne, actuel, enregistrer) {
  const titre = ligne.querySelector('.titre');
  if (!titre || ligne.querySelector('input.renommer')) return;
  figer();
  const champ = h('input.renommer', { type: 'text', maxLength: 80, value: actuel || '', 'aria-label': t('renommer') });
  let fini = false;
  const finir = (garder) => {
    if (fini) return;
    fini = true;
    const nouveau = champ.value.trim();
    champ.remove();
    if (garder && nouveau && nouveau !== actuel) {
      titre.textContent = nouveau;
      enregistrer(nouveau);
    }
    liberer();
  };
  champ.addEventListener('keydown', (e) => {
    e.stopPropagation(); // ni Alt+flèches, ni Entrée sur la ligne elle-même
    if (e.key === 'Enter') { e.preventDefault(); finir(true); }
    if (e.key === 'Escape') { e.preventDefault(); finir(false); }
  });
  for (const type of ['click', 'mousedown', 'dragstart']) champ.addEventListener(type, (e) => e.stopPropagation());
  champ.addEventListener('blur', () => finir(true));
  ligne.append(champ);
  champ.focus();
  champ.select();
}

/** Ajoute à `conteneur` (ligne avec ses boutons au survol) le bouton ✎ et la touche F2. */
export function rendreRenommable(conteneur, actuel, enregistrer) {
  const bouton = h('button.renommer-bouton', { type: 'button', title: t('renommer'), 'aria-label': t('renommer'), onclick: (e) => {
    e.stopPropagation();
    editer(conteneur, actuel, enregistrer);
  } }, '✎');
  conteneur.append(bouton);
  conteneur.classList.add('avec-renommer');
  conteneur.addEventListener('keydown', (e) => {
    if (e.key !== 'F2') return;
    e.preventDefault();
    editer(conteneur, actuel, enregistrer);
  });
}
