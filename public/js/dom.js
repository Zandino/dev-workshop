// Petits outils d'affichage : création d'éléments, Markdown assaini, nombres lisibles.
import { marked } from '/tiers/marked.js';
import DOMPurify from '/tiers/purify.js';
import { langue } from './i18n.js';

/** h('div.classe', { onclick }, enfant, 'texte') */
export function h(selecteur, attributs = {}, ...enfants) {
  const [balise, ...classes] = selecteur.split('.');
  const el = document.createElement(balise || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [cle, valeur] of Object.entries(attributs || {})) {
    if (valeur === false || valeur == null) continue;
    if (cle.startsWith('on')) el.addEventListener(cle.slice(2), valeur);
    else if (cle === 'dataset') Object.assign(el.dataset, valeur);
    else if (cle in el && cle !== 'list') el[cle] = valeur;
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat()) {
    if (enfant == null || enfant === false) continue;
    el.append(enfant.nodeType ? enfant : document.createTextNode(String(enfant)));
  }
  return el;
}

marked.setOptions({ gfm: true, breaks: false });
DOMPurify.addHook('afterSanitizeAttributes', (noeud) => {
  if (noeud.tagName === 'A') {
    noeud.setAttribute('target', '_blank');
    noeud.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Markdown -> fragment sûr. Tout texte venu du modèle ou d'un outil passe par ici ou par textContent. */
export function markdown(texte) {
  const brut = marked.parse(String(texte || ''));
  const propre = DOMPurify.sanitize(brut, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'img'],
    FORBID_ATTR: ['style', 'class', 'id'],
  });
  const boite = h('div.markdown');
  boite.innerHTML = propre;
  return boite;
}

/** 48 529 -> « 48,5 k » ; 1 000 000 -> « 1 M ». */
export function jetons(n) {
  if (n == null) return '–';
  const f = (v, s) => new Intl.NumberFormat(langue(), { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v) + s;
  if (n >= 1e6) return f(n / 1e6, ' M');
  if (n >= 1e3) return f(n / 1e3, ' k');
  return String(n);
}

export function nombre(n) {
  return n == null ? '–' : new Intl.NumberFormat(langue()).format(n);
}

export function dollars(n) {
  if (n == null) return '–';
  return new Intl.NumberFormat(langue(), { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 ? 3 : 2 }).format(n);
}

export function duree(ms) {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function dateCourte(ms) {
  return new Intl.DateTimeFormat(langue(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

/** Recherche sans accents ni casse. */
export function normaliser(texte) {
  return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
