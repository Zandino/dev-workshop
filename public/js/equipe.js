// Équipe en direct, à droite de la conversation (ou en grand) : la discussion comme un appel d'équipe. Chaque IA et
// chaque sous-agent a son personnage, son prénom, sa fonction et son état ; celui qui a besoin de toi, sinon celui
// qui vient d'agir, passe au premier plan avec son écran partagé (fichier modifié, terminal, navigateur). Une voix
// (celle du système : rien ne part ailleurs) lit ce qu'ils disent, un à la fois.
// Le modèle est dans equipe-etat.js ; les personnages dans avatars.js. Remplace l'ancienne vue « En direct » et le
// bureau du 22/11/2026.
import { h } from './dom.js';
import { t, ajouterTextes, langue } from './i18n.js';
import { pastilleLogo } from './logos.js';
import { detailOutil } from './outils.js';
import { avatar, couleurDe } from './avatars.js';
import { creerEquipe } from './equipe-etat.js';

ajouterTextes({
  fr: {
    equipe: 'Équipe en direct', equipe_fermer: 'Fermer', equipe_agrandir: 'Agrandir', equipe_reduire: 'Réduire',
    equipe_vide: 'L’équipe apparaîtra ici dès que l’IA travaille : chacun avec son prénom, sa fonction, ce qu’il fait et son écran.',
    voix_oui: 'Voix activée', voix_non: 'Voix coupée', voix_choix: 'Voix',
    eq_pret: 'à l’écoute', eq_reflechit: 'réfléchit…', eq_ecrit: 'écrit…', eq_travaille: 'travaille', eq_attend: 'attend {qui}',
    eq_besoin: 'a besoin de toi ✋', eq_bloque: 'sans nouvelles depuis 3 min', eq_fini: 'a fini ✓', eq_erreur: 'en échec',
    eq_echecs: '{n} échec(s)', eq_longue: 'commande longue', eq_boucle: 'tourne en rond ?', eq_ordre: 'Mission : {ordre}',
    eq_renommer: 'Clique pour changer', eq_epingler: 'Clique pour le garder au premier plan (encore : il suit l’action)',
    onglet_fichier: 'Fichier', onglet_terminal: 'Terminal', onglet_navigateur: 'Navigateur',
    rien_fichier: 'Aucun fichier modifié pour l’instant.', rien_terminal: 'Aucune commande pour l’instant.', rien_navigateur: 'Pas de navigateur pour l’instant.',
    capture_non_gardee: 'Capture non gardée (elle ne s’affiche qu’en direct).', en_cours: 'en cours…', dit_accord: '{nom} a besoin de toi.',
  },
  en: {
    equipe: 'Live team', equipe_fermer: 'Close', equipe_agrandir: 'Enlarge', equipe_reduire: 'Shrink',
    equipe_vide: 'The team will show here as soon as the AI works: each one with a first name, a role, what it is doing and its screen.',
    voix_oui: 'Voice on', voix_non: 'Voice off', voix_choix: 'Voice',
    eq_pret: 'listening', eq_reflechit: 'thinking…', eq_ecrit: 'writing…', eq_travaille: 'working', eq_attend: 'waiting for {qui}',
    eq_besoin: 'needs you ✋', eq_bloque: 'no news for 3 min', eq_fini: 'done ✓', eq_erreur: 'failed',
    eq_echecs: '{n} failure(s)', eq_longue: 'long command', eq_boucle: 'going in circles?', eq_ordre: 'Mission: {ordre}',
    eq_renommer: 'Click to change', eq_epingler: 'Click to keep it in front (again: it follows the action)',
    onglet_fichier: 'File', onglet_terminal: 'Terminal', onglet_navigateur: 'Browser',
    rien_fichier: 'No file edited yet.', rien_terminal: 'No command yet.', rien_navigateur: 'No browser yet.',
    capture_non_gardee: 'Screenshot not kept (it only shows live).', en_cours: 'running…', dit_accord: '{nom} needs you.',
  },
});

const zone = () => document.getElementById('equipe');
let equipe = creerEquipe();
let sessionId = '';
let personnalises = {};
let ouvert = false;
let grand = false;
let prevu = false;
let fige = false; // un prénom ou une fonction en cours de saisie
let epingle = null; // clé du membre gardé au premier plan
let ongletChoisi = null;
let parle = null; // clé du membre dont la voix est en cours
const etatsVus = new Map(); // pour la fête (fini) et le sursaut (échec), une fois
let voixActive = lire('devworkshop.voix') !== 'non';
let voixChoisie = lire('devworkshop.voix.nom') || '';

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, v) {
  try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ }
}

/** Une autre discussion s'affiche : l'équipe repart de zéro (prénoms et fonctions choisis à la main restent). */
export function nouvelleEquipe(sig, session = '') {
  sessionId = session || '';
  try { personnalises = JSON.parse(lire(`devworkshop.equipe.${sessionId}`) || '{}'); } catch { personnalises = {}; }
  equipe = creerEquipe({ session: sessionId, principal: sig ? { nom: sig.nom, compte: sig.compte } : null, personnalises });
  epingle = null;
  ongletChoisi = null;
  etatsVus.clear();
  window.speechSynthesis?.cancel();
  redessiner();
}

// --- Voix ---
function pourLaVoix(texte) {
  const propre = String(texte || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ').replace(/[#*_>|~-]{1,}/g, ' ').replace(/\s+/g, ' ').trim();
  if (propre.length <= 320) return propre;
  const coupe = propre.slice(0, 320);
  return coupe.slice(0, Math.max(coupe.lastIndexOf('. '), 160) + 1);
}

function voixDisponibles() {
  const code = langue();
  return (window.speechSynthesis?.getVoices?.() || []).filter((v) => v.lang?.toLowerCase().startsWith(code));
}

function parler(m, texte) {
  const s = window.speechSynthesis;
  const phrase = pourLaVoix(texte);
  if (!voixActive || !ouvert || !s || !phrase || typeof SpeechSynthesisUtterance === 'undefined') return;
  const u = new SpeechSynthesisUtterance(phrase);
  const voix = voixDisponibles();
  u.voice = voix.find((v) => v.name === voixChoisie) || voix[0] || null;
  u.onstart = () => { parle = m.cle; redessiner(); };
  u.onend = () => { if (parle === m.cle) parle = null; redessiner(); };
  s.speak(u); // la synthèse du système les met en file : un seul parle à la fois
}

/** Chaque événement de la discussion. `rejeu` : histoire déjà passée, rien n'est lu à voix haute. */
export function surEvenementEquipe(e, rejeu = false) {
  const m = equipe.recevoir(e);
  if (m && !rejeu) {
    if (e.t === 'assistant') parler(m, m.parole);
    else if (e.t === 'permission') parler(m, t('dit_accord', { nom: m.prenom }));
  }
  if (['delta', 'assistant', 'resultat_outil', 'permission', 'permission_fin', 'tour', 'etat', 'delegation'].includes(e.t)) redessiner();
}

// --- Écran partagé ---
function ecranFichier(f) {
  if (!f) return h('p.vide', {}, t('rien_fichier'));
  return h('div', {}, h('div.chemin-equipe', {}, f.chemin), detailOutil(f.nom, f.entree) || h('p.vide', {}, f.nom));
}
function ecranTerminal(x) {
  if (!x) return h('p.vide', {}, t('rien_terminal'));
  return h('pre.terminal-equipe' + (x.erreur ? '.erreur' : ''), {}, `$ ${x.commande}\n`, x.sortie === null ? h('span.en-cours', {}, t('en_cours')) : x.sortie);
}
function ecranNavigateur(n) {
  if (!n) return h('p.vide', {}, t('rien_navigateur'));
  return h('div', {}, h('div.chemin-equipe', {}, [n.action, n.adresse].filter(Boolean).join(' · ')),
    n.image ? h('img.capture-equipe', { src: n.image, alt: n.adresse || n.action || '' }) : h('p.vide', {}, n.perdue ? t('capture_non_gardee') : t('en_cours')));
}
function ecranPartage(m) {
  const onglet = ongletChoisi || m.ecran.dernier || 'fichier';
  const bouton = (nom) => h('button.onglet-equipe' + (onglet === nom ? '.actif' : '') + (m.ecran[nom] ? '.plein' : ''), { type: 'button', onclick: () => {
    ongletChoisi = ongletChoisi === nom ? null : nom; // second clic : l'onglet suit de nouveau l'action
    redessiner();
  } }, t('onglet_' + nom));
  const contenu = onglet === 'terminal' ? ecranTerminal(m.ecran.terminal) : onglet === 'navigateur' ? ecranNavigateur(m.ecran.navigateur) : ecranFichier(m.ecran.fichier);
  return h('section.ecran-equipe', {}, h('nav.onglets-equipe', {}, bouton('fichier'), bouton('terminal'), bouton('navigateur')), h('div.contenu-ecran', {}, contenu));
}

// --- Prénom et fonction modifiables ---
function editable(m, champ, valeur) {
  return h('span.editable', { title: t('eq_renommer'), tabIndex: 0, onclick: (ev) => {
    ev.stopPropagation();
    const cible = ev.currentTarget;
    fige = true;
    const champSaisie = h('input.saisie-equipe', { type: 'text', value: valeur, maxLength: 40 });
    const finir = (garder) => {
      if (!fige) return;
      fige = false;
      const v = champSaisie.value.trim();
      if (garder && v && v !== valeur) {
        personnalises[m.cle] = { ...(personnalises[m.cle] || {}), [champ]: v };
        if (champ === 'prenom') m.prenom = v;
        ecrire(`devworkshop.equipe.${sessionId}`, JSON.stringify(personnalises));
      }
      redessiner(true);
    };
    champSaisie.addEventListener('keydown', (k) => {
      k.stopPropagation();
      if (k.key === 'Enter') finir(true);
      if (k.key === 'Escape') finir(false);
    });
    champSaisie.addEventListener('blur', () => finir(true));
    champSaisie.addEventListener('click', (k) => k.stopPropagation());
    cible.replaceWith(champSaisie);
    champSaisie.focus();
    champSaisie.select();
  } }, valeur);
}

// --- Tuiles ---
function phraseEtat(m, v) {
  if (v.etat === 'travaille') return m.action || t('eq_travaille');
  if (v.etat === 'attend') return t('eq_attend', { qui: v.attend.join(', ') || '…' });
  return t('eq_' + v.etat);
}

function tuile(m, niveau, vedette) {
  const v = equipe.vue(m);
  const avant = etatsVus.get(m.cle);
  etatsVus.set(m.cle, v.etat);
  const fete = avant && avant !== 'fini' && v.etat === 'fini';
  const sursaut = avant && avant !== 'erreur' && v.etat === 'erreur';
  const badges = [
    m.echecs ? h('span.badge-equipe.rouge', {}, t('eq_echecs', { n: m.echecs })) : null,
    v.commandeLongue ? h('span.badge-equipe', {}, '⏱ ' + t('eq_longue')) : null,
    m.boucle ? h('span.badge-equipe.orange', {}, '↻ ' + t('eq_boucle')) : null,
  ].filter(Boolean);
  const classes = ['tuile', `etat-${v.etat}`, parle === m.cle ? 'parle' : '', fete ? 'fete' : '', sursaut ? 'sursaut' : '', vedette ? 'vedette' : '', epingle === m.cle ? 'epinglee' : ''].filter(Boolean).join('.');
  return h('article.' + classes, {
    style: `--couleur-membre: ${couleurDe(m.style)}; --niveau: ${niveau}`,
    title: vedette ? '' : t('eq_epingler'),
    onclick: () => { epingle = epingle === m.cle ? null : m.cle; ongletChoisi = null; redessiner(); },
  },
  avatar(m.style),
  h('div.identite', {},
    h('div.nom-equipe', {}, niveau ? h('span.lien', {}, '↳ ') : null, editable(m, 'prenom', m.prenom), h('span.fonction', {}, ' · ', editable(m, 'fonction', equipe.fonctionDe(m)))),
    h('div.ia-equipe', {}, pastilleLogo(m.ia.compte, m.ia.nom), h('span', {}, m.ia.nom)),
    h('div.etat-equipe', {}, phraseEtat(m, v)),
    badges.length ? h('div.badges-equipe', {}, badges) : null,
    vedette && m.ordre ? h('p.ordre-equipe', {}, t('eq_ordre', { ordre: String(m.ordre).slice(0, 300) })) : null,
    vedette && m.parole ? h('p.bulle-equipe', {}, pourLaVoix(m.parole) || String(m.parole).slice(0, 300)) : null));
}

function redessiner(force = false) {
  if (!ouvert || (fige && !force) || prevu) return;
  prevu = true;
  requestAnimationFrame(() => {
    prevu = false;
    const z = zone();
    if (!z || !ouvert || fige) return;
    const liste = equipe.liste();
    const vedette = (epingle && equipe.membres.get(epingle)) || equipe.vedette();
    const voix = voixDisponibles();
    z.replaceChildren(
      h('header.entete-equipe', {},
        h('strong', {}, t('equipe')),
        h('button.discret', { type: 'button', onclick: () => {
          voixActive = !voixActive;
          ecrire('devworkshop.voix', voixActive ? 'oui' : 'non');
          if (!voixActive) window.speechSynthesis?.cancel();
          redessiner();
        } }, voixActive ? '🔊 ' + t('voix_oui') : '🔇 ' + t('voix_non')),
        voix.length > 1 ? h('select', { title: t('voix_choix'), onchange: (e) => { voixChoisie = e.target.value; ecrire('devworkshop.voix.nom', voixChoisie); } },
          voix.map((x) => h('option', { value: x.name, selected: x.name === voixChoisie }, x.name))) : null,
        h('button', { type: 'button', title: grand ? t('equipe_reduire') : t('equipe_agrandir'), onclick: () => agrandir(!grand) }, grand ? '⤡' : '⤢'),
        h('button', { type: 'button', title: t('equipe_fermer'), onclick: () => montrerEquipe(false) }, '✕')),
      liste.length && vedette
        ? h('div.scene', {},
          h('div.premier-plan', {}, tuile(vedette, 0, true), ecranPartage(vedette)),
          h('div.grille-equipe', {}, liste.filter((x) => x.m !== vedette).map((x) => tuile(x.m, x.niveau, false))))
        : h('p.vide', {}, t('equipe_vide')),
    );
  });
}

function agrandir(oui) {
  grand = oui;
  document.body.classList.toggle('equipe-grande', oui);
  ecrire('devworkshop.equipe.grande', oui ? 'oui' : 'non');
  redessiner();
}

/** La colonne de droite est partagée avec l'aperçu : ouvrir l'un ferme l'autre. */
export function montrerEquipe(oui) {
  ouvert = oui;
  zone().hidden = !oui;
  document.body.classList.toggle('avec-equipe', oui);
  if (oui) document.dispatchEvent(new CustomEvent('colonne-droite', { detail: 'equipe' }));
  else window.speechSynthesis?.cancel();
  ecrire('devworkshop.equipe', oui ? 'oui' : 'non');
  redessiner();
}

export const basculerEquipe = () => montrerEquipe(!ouvert);

export function initEquipe() {
  document.getElementById('ouvrir-direct')?.addEventListener('click', basculerEquipe);
  document.addEventListener('colonne-droite', (e) => {
    if (e.detail !== 'equipe' && ouvert) montrerEquipe(false);
  });
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => redessiner());
  // Les états qui dépendent du temps (silence, commande longue, départ d'un sous-agent) se recalculent.
  setInterval(() => redessiner(), 5000);
  if (lire('devworkshop.equipe.grande') === 'oui') agrandir(true);
  if (lire('devworkshop.equipe') === 'oui') montrerEquipe(true);
}
