// Accueil : liste des serveurs enregistrés, ajout et modification, connexion avec son avancement.
'use strict';
const $ = (id) => document.getElementById(id);
let textes = {};
let langue = 'fr';
let serveurs = [];
/** Avancement par serveur : { etape } ou { erreur, detail }. */
const etats = new Map();
let enCours = null;

function t(cle, valeurs = {}) {
  return String(textes[cle] ?? cle).replace(/\{(\w+)\}/g, (_, k) => valeurs[k] ?? '');
}

function h(balise, attributs = {}, ...enfants) {
  const [nom, ...classes] = balise.split('.');
  const el = document.createElement(nom);
  if (classes.length) el.className = classes.join(' ');
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur == null || valeur === false) continue;
    if (cle.startsWith('on')) el.addEventListener(cle.slice(2), valeur);
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat()) if (enfant != null && enfant !== false) el.append(enfant);
  return el;
}

function traduire() {
  document.documentElement.lang = langue;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
}

function dateLisible(iso) {
  return new Intl.DateTimeFormat(langue, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function blocEtat(s) {
  const e = etats.get(s.id);
  if (!e) return null;
  if (e.erreur) {
    return h('div.etat.erreur', {},
      h('div', {}, t(e.erreur, { hote: s.hote })),
      e.detail ? h('details', {}, h('summary', {}, t('detail')), h('pre', {}, e.detail)) : null);
  }
  return h('div.etat', {}, e.etape === 'ouvert' ? null : h('span.rond'), t('etape_' + e.etape));
}

function carte(s) {
  const occupe = enCours === s.id;
  return h('article.serveur', {},
    h('div.puce', { 'aria-hidden': 'true' }, s.nom.trim().charAt(0).toUpperCase() || '?'),
    h('div.nom', {}, s.nom),
    h('div.infos', {},
      h('code', {}, s.hote + (s.portSsh ? `:${s.portSsh}` : '')),
      h('span', {}, s.derniereConnexion ? t('derniere', { date: dateLisible(s.derniereConnexion) }) : t('jamais'))),
    h('div.actions', {},
      h('button.discret', { type: 'button', disabled: occupe, onclick: () => ouvrirFormulaire(s) }, t('modifier')),
      h('button.discret.danger', { type: 'button', disabled: occupe, onclick: () => retirer(s) }, t('supprimer')),
      h('button.principal', { type: 'button', disabled: Boolean(enCours), onclick: () => connecter(s) }, t('se_connecter'))),
    blocEtat(s));
}

function afficher() {
  $('vide').hidden = serveurs.length > 0;
  $('liste').replaceChildren(...serveurs.map(carte));
}

async function charger() {
  const r = await window.bureau.lister();
  if (r.ok) serveurs = r.valeur;
  afficher();
}

async function connecter(s) {
  enCours = s.id;
  etats.set(s.id, { etape: 'ssh' });
  afficher();
  const r = await window.bureau.connecter(s.id);
  enCours = null;
  if (!r.ok) etats.set(s.id, { erreur: r.cle, detail: r.detail });
  else setTimeout(() => { etats.delete(s.id); charger(); }, 1500);
  await charger();
}

async function retirer(s) {
  if (!confirm(t('confirmer_suppression', { nom: s.nom }))) return;
  const r = await window.bureau.supprimer(s.id);
  if (r.ok) serveurs = r.valeur;
  etats.delete(s.id);
  afficher();
}

let edite = null;

function ouvrirFormulaire(s = null) {
  edite = s;
  const form = $('form-serveur');
  form.reset();
  $('form-erreur').hidden = true;
  $('form-titre').textContent = s ? t('modifier') : t('ajouter');
  if (s) {
    for (const champ of ['nom', 'hote', 'portSsh', 'port', 'dossier', 'racine']) form.elements[champ].value = s[champ] ?? '';
  }
  $('formulaire').showModal();
  form.elements.nom.focus();
}

async function envoyerFormulaire(e) {
  e.preventDefault();
  const form = e.target;
  const saisie = Object.fromEntries(['nom', 'hote', 'portSsh', 'port', 'dossier', 'racine'].map((c) => [c, form.elements[c].value.trim()]));
  if (edite) saisie.id = edite.id;
  const r = await window.bureau.enregistrer(saisie);
  if (!r.ok) {
    $('form-erreur').textContent = t(r.cle);
    $('form-erreur').hidden = false;
    return;
  }
  serveurs = r.valeur;
  $('formulaire').close();
  afficher();
}

async function demarrer() {
  const r = await window.bureau.textes();
  if (r.ok) ({ langue, textes } = r.valeur);
  traduire();
  window.bureau.surAvancement(({ id, etape }) => {
    etats.set(id, { etape });
    afficher();
  });
  $('ajouter').addEventListener('click', () => ouvrirFormulaire());
  $('form-annuler').addEventListener('click', () => $('formulaire').close());
  $('form-serveur').addEventListener('submit', envoyerFormulaire);
  $('code-source').addEventListener('click', (e) => {
    e.preventDefault();
    window.bureau.codeSource();
  });
  $('confidentialite').addEventListener('click', (e) => {
    e.preventDefault();
    window.bureau.confidentialite();
  });
  const maj = await window.bureau.majAuto();
  $('maj-auto').checked = maj.ok ? maj.valeur : true;
  $('maj-auto').title = t('maj_auto_aide');
  $('maj-auto').addEventListener('change', async (e) => {
    const r = await window.bureau.definirMajAuto(e.target.checked);
    if (r.ok) e.target.checked = r.valeur;
  });
  await charger();
}

demarrer();
