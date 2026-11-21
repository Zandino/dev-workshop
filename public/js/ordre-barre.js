// Ordre de la barre choisi à la main : une ligne (projet, ou discussion d'un projet) se glisse avant ou après une
// autre du même groupe, ou monte / descend d'un cran (flèches au survol, Alt+↑ / Alt+↓). Le serveur garde l'ordre
// (serveur/ordre.mjs) pour tous les écrans.
import { h } from './dom.js';
import { t, ajouterTextes } from './i18n.js';

ajouterTextes({
  fr: { monter: 'Monter (Alt+↑)', descendre: 'Descendre (Alt+↓)' },
  en: { monter: 'Move up (Alt+↑)', descendre: 'Move down (Alt+↓)' },
});

const TYPE = 'application/x-devworkshop-ordre';
let glisse = null; // { groupe, cle } de la ligne en cours de glisser
let enCours = false;
let enRetard = null;

/**
 * Pendant un glisser, la barre ne se redessine pas : elle est refaite à chaque nouvelle de la veille (plusieurs fois
 * par seconde quand une IA travaille), ce qui détruirait la ligne tenue. Rend true si `redessiner` est remis à la fin.
 */
export function differer(redessiner) {
  if (!enCours) return false;
  enRetard = redessiner;
  return true;
}
export function debutGlisse() {
  enCours = true;
}
export function finGlisse() {
  enCours = false;
  const f = enRetard;
  enRetard = null;
  f?.();
}

/** `liste` avec `cle` déplacée d'un cran (`sens` -1 / +1), ou juste avant / après `cible`. */
export function reordonner(liste, cle, { sens, cible, apres }) {
  const reste = liste.filter((x) => x !== cle);
  let i;
  if (cible !== undefined) {
    i = reste.indexOf(cible);
    if (i < 0) return liste;
    if (apres) i += 1;
  } else {
    i = Math.max(0, Math.min(reste.length, liste.indexOf(cle) + sens));
  }
  reste.splice(i, 0, cle);
  return reste;
}

/** ▲ ▼ au survol d'une ligne. */
export function fleches(liste, cle, changer) {
  const bouger = (sens) => (e) => {
    e.stopPropagation();
    changer(reordonner(liste, cle, { sens }));
  };
  const i = liste.indexOf(cle);
  return h('span.fleches', {},
    h('button', { type: 'button', title: t('monter'), 'aria-label': t('monter'), disabled: i <= 0, onclick: bouger(-1) }, '▲'),
    h('button', { type: 'button', title: t('descendre'), 'aria-label': t('descendre'), disabled: i < 0 || i >= liste.length - 1, onclick: bouger(1) }, '▼'));
}

/** `el` se glisse avant ou après les autres lignes de son `groupe` ; `changer(nouvelleListe)` enregistre l'ordre. */
export function rendreOrdonnable(el, { groupe, cle, liste, changer }) {
  el.draggable = true;
  const nettoyer = () => el.classList.remove('inserer-avant', 'inserer-apres');
  el.addEventListener('dragstart', (e) => {
    glisse = { groupe, cle };
    e.dataTransfer.setData(TYPE, cle);
    e.dataTransfer.effectAllowed = 'move';
    debutGlisse();
  });
  el.addEventListener('dragend', () => {
    glisse = null;
    for (const x of document.querySelectorAll('.inserer-avant, .inserer-apres')) x.classList.remove('inserer-avant', 'inserer-apres');
    finGlisse();
  });
  const accepte = () => glisse && glisse.groupe === groupe && glisse.cle !== cle;
  const apres = (e) => {
    const r = el.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };
  el.addEventListener('dragover', (e) => {
    if (!accepte()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const a = apres(e);
    el.classList.toggle('inserer-apres', a);
    el.classList.toggle('inserer-avant', !a);
  });
  el.addEventListener('dragleave', nettoyer);
  el.addEventListener('drop', (e) => {
    if (!accepte()) return;
    e.preventDefault();
    nettoyer();
    changer(reordonner(liste, glisse.cle, { cible: cle, apres: apres(e) }));
  });
  el.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    changer(reordonner(liste, cle, { sens: e.key === 'ArrowUp' ? -1 : 1 }));
  });
}
