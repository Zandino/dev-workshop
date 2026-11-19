// Discussion à plusieurs : choix des participants (compte, modèle, nom) et du nombre d'échanges.
import { h } from './dom.js';
import { t } from './i18n.js';
import { libelleCompte } from './comptes.js';

const MAX = 4;
let comptes = [];
let lignes = [];
let demarrer = () => {};
let nombreEchanges = 4;

export function initSalon(action) {
  demarrer = action;
}

export function majComptesSalon(liste) {
  comptes = liste;
}

export function ouvrirSalon() {
  if (lignes.length < 2) lignes = [{ compte: 'defaut', modele: '', nom: 'Claude A' }, { compte: 'defaut', modele: '', nom: 'Claude B' }];
  document.getElementById('panneau-salon').hidden = false;
  dessiner();
}

function fermer() {
  document.getElementById('panneau-salon').hidden = true;
}

function ligne(p, i) {
  const compte = h('select', { onchange: (e) => {
    p.compte = e.target.value;
    dessiner();
  } }, comptes.map((c) => h('option', { value: c.id, selected: c.id === p.compte }, libelleCompte(c))));
  const choisi = comptes.find((c) => c.id === p.compte);
  return h(
    'div.participant',
    {},
    h('input', { type: 'text', maxLength: 30, value: p.nom, placeholder: t('nom_participant'), oninput: (e) => (p.nom = e.target.value) }),
    compte,
    h('input', { type: 'text', maxLength: 120, value: p.modele, placeholder: choisi?.type === 'api' ? choisi.modele : t('modele_defaut'), oninput: (e) => (p.modele = e.target.value) }),
    choisi?.externe ? h('span.badge.externe', {}, t('externe')) : h('span'),
    lignes.length > 2 ? h('button.discret', { type: 'button', onclick: () => {
      lignes.splice(i, 1);
      dessiner();
    } }, '✕') : h('span'),
  );
}

function dessiner() {
  const echanges = h('input', { type: 'number', min: 1, max: 10, value: nombreEchanges, oninput: (e) => (nombreEchanges = Number(e.target.value) || 4) });
  const externe = lignes.some((p) => comptes.find((c) => c.id === p.compte)?.externe);
  document.getElementById('panneau-salon').replaceChildren(
    h('form.boite', { onsubmit: (e) => {
      e.preventDefault();
      demarrer({ participants: lignes.map((p) => ({ compte: p.compte, modele: p.modele.trim() || undefined, nom: p.nom.trim() })), echanges: Number(echanges.value) });
      fermer();
    } },
      h('header', {}, h('h2', {}, t('salon_titre')), h('button', { type: 'button', onclick: fermer }, t('fermer'))),
      h('p.aide', {}, t('salon_aide')),
      lignes.map(ligne),
      lignes.length < MAX ? h('button', { type: 'button', onclick: () => {
        lignes.push({ compte: 'defaut', modele: '', nom: `IA ${lignes.length + 1}` });
        dessiner();
      } }, t('ajouter_participant')) : null,
      h('label.echanges', {}, t('salon_echanges'), echanges),
      externe ? h('p.alerte', {}, t('salon_externe')) : null,
      h('button.principal', { type: 'submit' }, t('salon_demarrer')),
    ),
  );
}
