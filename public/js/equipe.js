// Équipe en direct : la discussion comme un appel vidéo, en plein écran par-dessus la conversation. En haut, les
// compteurs (jetons, contexte, au travail, en attente, terminés, durée) et les vues Appel / Arbre ; à gauche, les
// agents par urgence ; au centre, une tuile par membre (son personnage à son bureau, dans son décor), le premier plan
// pour celui qui a besoin de toi ou qui vient d'agir, avec sa bulle ; quand il travaille sur un fichier, un terminal ou
// un navigateur, il « partage son écran » en grand et sa tuile passe en incrustation. Une voix (celle du système :
// rien ne part ailleurs) lit ce qu'ils disent, un à la fois.
// Modèle : equipe-etat.js ; personnages et décors : avatars.js.
import { h } from './dom.js';
import { t, ajouterTextes, langue } from './i18n.js';
import { pastilleLogo } from './logos.js';
import { detailOutil } from './outils.js';
import { scene, couleurDe } from './avatars.js';
import { creerEquipe } from './equipe-etat.js';

ajouterTextes({
  fr: {
    equipe: 'Équipe en direct', equipe_retour: 'Retour à la conversation', vue_appel: 'Appel', vue_arbre: 'Arbre',
    equipe_vide: 'L’équipe apparaîtra ici dès que l’IA travaille : chacun avec son prénom, sa fonction, ce qu’il fait et son écran.',
    agents_n: 'Agents · {n}', jetons_n: '{n} jetons', au_travail_n: '{n} au travail', en_attente_n: '{n} en attente', termines_n: '{n} terminés',
    voix_oui: 'Voix activée', voix_non: 'Voix coupée', voix_choix: 'Voix',
    eq_pret: 'à l’écoute', eq_reflechit: 'réfléchit…', eq_ecrit: 'écrit…', eq_travaille: 'travaille', eq_attend: 'attend {qui}',
    eq_besoin: 'a besoin de toi', eq_bloque: 'sans nouvelles depuis 3 min', eq_fini: 'terminé', eq_erreur: 'en échec',
    eq_longue: 'commande longue', eq_boucle: 'tourne en rond ?', eq_de: 'de {qui}', eq_mission: 'Mission : {ordre}',
    eq_renommer: 'Clique pour changer', eq_partage: '{nom} partage son écran',
    toi: 'Toi', humain: 'Humain', toi_attendu: '{qui} t’attend', repondre_conversation: 'Répondre',
    rien_fichier: 'Aucun fichier modifié pour l’instant.', rien_terminal: 'Aucune commande pour l’instant.', rien_navigateur: 'Pas de navigateur pour l’instant.',
    capture_non_gardee: 'Capture non gardée (elle ne s’affiche qu’en direct).', en_cours: 'en cours…', dit_accord: '{nom} a besoin de toi.',
  },
  en: {
    equipe: 'Live team', equipe_retour: 'Back to the conversation', vue_appel: 'Call', vue_arbre: 'Tree',
    equipe_vide: 'The team will show here as soon as the AI works: each one with a first name, a role, what it is doing and its screen.',
    agents_n: 'Agents · {n}', jetons_n: '{n} tokens', au_travail_n: '{n} working', en_attente_n: '{n} waiting', termines_n: '{n} done',
    voix_oui: 'Voice on', voix_non: 'Voice off', voix_choix: 'Voice',
    eq_pret: 'listening', eq_reflechit: 'thinking…', eq_ecrit: 'writing…', eq_travaille: 'working', eq_attend: 'waiting for {qui}',
    eq_besoin: 'needs you', eq_bloque: 'no news for 3 min', eq_fini: 'done', eq_erreur: 'failed',
    eq_longue: 'long command', eq_boucle: 'going in circles?', eq_de: 'for {qui}', eq_mission: 'Mission: {ordre}',
    eq_renommer: 'Click to change', eq_partage: '{nom} is sharing their screen',
    toi: 'You', humain: 'Human', toi_attendu: '{qui} is waiting for you', repondre_conversation: 'Answer',
    rien_fichier: 'No file edited yet.', rien_terminal: 'No command yet.', rien_navigateur: 'No browser yet.',
    capture_non_gardee: 'Screenshot not kept (it only shows live).', en_cours: 'running…', dit_accord: '{nom} needs you.',
  },
});

const PARTAGE_RECENT = 30_000; // un écran touché il y a moins de 30 s est « partagé » en grand
const ICONE = { travaille: '⚙', ecrit: '✎', reflechit: '…', attend: '🔗', besoin: '✋', bloque: '⌛', fini: '✓', erreur: '✕', pret: '●' };

const zone = () => document.getElementById('equipe');
let equipe = creerEquipe();
let sessionId = '';
let personnalises = {};
let ouvert = false;
let vueCourante = 'appel';
let prevu = false;
let fige = false; // un prénom ou une fonction en cours de saisie
let epingle = null; // clé du membre gardé au premier plan
let parle = null; // clé du membre dont la voix est en cours
const etatsVus = new Map(); // pour la fête (fini) et le sursaut (échec), une seule fois
let voixActive = lire('devworkshop.voix') !== 'non';
let voixChoisie = lire('devworkshop.voix.nom') || '';

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, v) {
  try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ }
}

const jetonsCourts = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));
const duree = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Une autre discussion s'affiche : l'équipe repart de zéro (prénoms et fonctions choisis à la main restent). */
export function nouvelleEquipe(sig, session = '') {
  sessionId = session || '';
  try { personnalises = JSON.parse(lire(`devworkshop.equipe.${sessionId}`) || '{}'); } catch { personnalises = {}; }
  equipe = creerEquipe({ session: sessionId, principal: sig ? { nom: sig.nom, compte: sig.compte } : null, personnalises });
  epingle = null;
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
  if (['delta', 'assistant', 'resultat_outil', 'permission', 'permission_fin', 'tour', 'etat', 'delegation', 'contexte'].includes(e.t)) redessiner();
}

// --- Écran partagé ---
function contenuEcran(m, genre) {
  const ecran = m.ecran[genre];
  if (genre === 'terminal') {
    if (!ecran) return h('p.vide', {}, t('rien_terminal'));
    return h('pre.terminal-equipe' + (ecran.erreur ? '.erreur' : ''), {}, h('span.invite', {}, '❯ '), `${ecran.commande}\n`, ecran.sortie === null ? h('span.en-cours', {}, t('en_cours')) : ecran.sortie);
  }
  if (genre === 'navigateur') {
    if (!ecran) return h('p.vide', {}, t('rien_navigateur'));
    return ecran.image ? h('img.capture-equipe', { src: ecran.image, alt: ecran.adresse || ecran.action || '' }) : h('p.vide', {}, ecran.perdue ? t('capture_non_gardee') : t('en_cours'));
  }
  if (!ecran) return h('p.vide', {}, t('rien_fichier'));
  if (ecran.lecture) {
    if (ecran.contenu === null) return h('p.vide', {}, t('en_cours'));
    return h('pre.code-equipe', {}, ecran.contenu);
  }
  return detailOutil(ecran.nom, ecran.entree) || h('p.vide', {}, ecran.nom);
}

function titreFenetre(m, genre) {
  const e = m.ecran[genre];
  if (genre === 'terminal') return `${m.prenom} — terminal`;
  if (genre === 'navigateur') return `${m.prenom} — ${e?.adresse || 'navigateur'}`;
  return `${m.prenom} — ${String(e?.chemin || '').split('/').slice(-2).join('/') || 'fichier'}`;
}

function fenetrePartagee(m, genre) {
  return h('section.fenetre-partagee', {},
    h('header.barre-fenetre', {}, h('span.feux', {}, h('i'), h('i'), h('i')), h('span.titre-fenetre', {}, titreFenetre(m, genre)),
      h('span.puce-partage', {}, '🖥 ' + t('eq_partage', { nom: m.prenom }))),
    h('div.contenu-fenetre', {}, contenuEcran(m, genre)),
    m.ecran.terminal && genre === 'terminal' && m.ecran.terminal.sortie !== null ? h('footer.pied-fenetre', {}, `✓ ${m.ecran.terminal.commande.split(' ')[0]}`) : null);
}

// --- Prénom et fonction modifiables (liste des agents, arbre) ---
function editable(m, champ, valeur) {
  return h('span.editable', { title: t('eq_renommer'), tabIndex: 0, onclick: (ev) => {
    ev.stopPropagation();
    const cible = ev.currentTarget;
    fige = true;
    const saisie = h('input.saisie-equipe', { type: 'text', value: valeur, maxLength: 40 });
    const finir = (garder) => {
      if (!fige) return;
      fige = false;
      const v = saisie.value.trim();
      if (garder && v && v !== valeur) {
        personnalises[m.cle] = { ...(personnalises[m.cle] || {}), [champ]: v };
        if (champ === 'prenom') m.prenom = v;
        ecrire(`devworkshop.equipe.${sessionId}`, JSON.stringify(personnalises));
      }
      redessiner(true);
    };
    saisie.addEventListener('keydown', (k) => {
      k.stopPropagation();
      if (k.key === 'Enter') finir(true);
      if (k.key === 'Escape') finir(false);
    });
    saisie.addEventListener('blur', () => finir(true));
    saisie.addEventListener('click', (k) => k.stopPropagation());
    cible.replaceWith(saisie);
    saisie.focus();
    saisie.select();
  } }, valeur);
}

function phraseEtat(m, v) {
  if (v.etat === 'travaille') return m.action || t('eq_travaille');
  if (v.etat === 'attend') return t('eq_attend', { qui: v.attend.join(', ') || '…' });
  return t('eq_' + v.etat);
}

// --- Tuiles de l'appel ---
function tuile(m, { vedette = false, incrustee = false } = {}) {
  const v = equipe.vue(m);
  const avant = etatsVus.get(m.cle);
  if (!incrustee) etatsVus.set(m.cle, v.etat);
  const fete = avant && avant !== 'fini' && v.etat === 'fini';
  const sursaut = avant && avant !== 'erreur' && v.etat === 'erreur';
  const chef = m.parent ? equipe.membres.get(m.parent) : null;
  const classes = ['tuile-appel', `etat-${v.etat}`, parle === m.cle ? 'parle' : '', fete ? 'fete' : '', sursaut ? 'sursaut' : '', vedette ? 'vedette' : '', incrustee ? 'incrustee' : '', epingle === m.cle ? 'epinglee' : ''].filter(Boolean).join('.');
  return h('article.' + classes, {
    style: `--couleur-membre: ${couleurDe(m.style)}`,
    onclick: () => {
      if (v.etat === 'besoin') return montrerEquipe(false); // il t'attend : retour à la conversation pour répondre
      epingle = epingle === m.cle ? null : m.cle;
      redessiner();
    },
  },
  scene(m.style),
  h('span.puce-etat', {}, `${ICONE[v.etat] || ''} ${phraseEtat(m, v)}`),
  m.echecs ? h('span.puce-echecs', {}, `✕ ${m.echecs}`) : null,
  v.commandeLongue || m.boucle ? h('span.puce-alerte', {}, v.commandeLongue ? '⏱ ' + t('eq_longue') : '↻ ' + t('eq_boucle')) : null,
  vedette && m.parole && !incrustee ? h('p.bulle-parole', {}, pourLaVoix(m.parole) || String(m.parole).slice(0, 280)) : null,
  vedette && !m.parole && m.ordre && !incrustee ? h('p.bulle-parole', {}, t('eq_mission', { ordre: String(m.ordre).slice(0, 200) })) : null,
  h('footer.puces-bas', {},
    h('span.puce-nom', {}, m.prenom),
    incrustee ? null : h('span.puce', {}, chef ? `${equipe.fonctionDe(m)} · ${t('eq_de', { qui: chef.prenom })}` : equipe.fonctionDe(m)),
    incrustee || !m.jetons ? null : h('span.puce', {}, `⚡${jetonsCourts(m.jetons)}`)));
}

function tuileToi() {
  const attendu = [...equipe.membres.values()].filter((m) => equipe.vue(m).etat === 'besoin').map((m) => m.prenom);
  return h('article.tuile-appel.toi' + (attendu.length ? '.attendu' : ''), { onclick: () => attendu.length && montrerEquipe(false) },
    h('div.scene-toi', {}, h('span.icone-toi', {}, attendu.length ? '✋' : '🙂')),
    attendu.length ? h('span.puce-etat', {}, `✋ ${t('toi_attendu', { qui: attendu.join(', ') })}`) : null,
    attendu.length ? h('button.principal.repondre-toi', { type: 'button', onclick: (e) => { e.stopPropagation(); montrerEquipe(false); } }, t('repondre_conversation')) : null,
    h('footer.puces-bas', {}, h('span.puce-nom', {}, t('toi')), h('span.puce', {}, t('humain'))));
}

/** Qui partage son écran : le premier plan, s'il vient de toucher un fichier, un terminal ou un navigateur. */
function partage(vedette) {
  const v = equipe.vue(vedette);
  if (!vedette.ecran.dernier || !vedette.ecran.le || ['fini', 'pret', 'erreur'].includes(v.etat)) return null;
  return equipe.maintenant() - vedette.ecran.le < PARTAGE_RECENT || v.etat === 'travaille' ? vedette.ecran.dernier : null;
}

function salleAppel() {
  const liste = equipe.liste().map((x) => x.m);
  if (!liste.length) return h('p.vide-appel', {}, t('equipe_vide'));
  const vedette = (epingle && equipe.membres.get(epingle)) || equipe.vedette();
  const autres = liste.filter((m) => m !== vedette);
  const genre = partage(vedette);
  if (genre) {
    return h('div.salle.avec-partage', {},
      h('div.zone-partage', {}, fenetrePartagee(vedette, genre), tuile(vedette, { vedette: true, incrustee: true })),
      h('div.rangee-tuiles', {}, autres.map((m) => tuile(m)), tuileToi()));
  }
  return h('div.salle.grille-appel', {}, tuile(vedette, { vedette: true }), autres.map((m) => tuile(m)), tuileToi());
}

function arbre() {
  return h('div.arbre-equipe', {}, equipe.liste().map(({ m, niveau }) => {
    const v = equipe.vue(m);
    return h('div.ligne-arbre.etat-' + v.etat, { style: `--niveau: ${niveau}; --couleur-membre: ${couleurDe(m.style)}` },
      h('span.point-membre'),
      h('strong', {}, editable(m, 'prenom', m.prenom)), h('span.fonction', {}, editable(m, 'fonction', equipe.fonctionDe(m))),
      h('span.ia-arbre', {}, pastilleLogo(m.ia.compte, m.ia.nom), m.ia.nom),
      h('span.etat-arbre', {}, `${ICONE[v.etat] || ''} ${phraseEtat(m, v)}`),
      m.jetons ? h('span.jetons-arbre', {}, `⚡${jetonsCourts(m.jetons)}`) : null,
      niveau && m.ordre ? h('p.mission-arbre', {}, t('eq_mission', { ordre: String(m.ordre).slice(0, 240) })) : null);
  }));
}

function listeAgents() {
  const membres = equipe.parUrgence();
  return h('aside.liste-agents', {},
    h('h3', {}, t('agents_n', { n: membres.length })),
    membres.map((m) => {
      const v = equipe.vue(m);
      return h('div.carte-agent.etat-' + v.etat + (epingle === m.cle ? '.epinglee' : ''), { style: `--couleur-membre: ${couleurDe(m.style)}`, onclick: () => { epingle = epingle === m.cle ? null : m.cle; redessiner(); } },
        h('div.ligne-carte', {}, h('span.point-membre'), h('strong', {}, editable(m, 'prenom', m.prenom)), h('span.fonction', {}, editable(m, 'fonction', equipe.fonctionDe(m)), m.parent && equipe.membres.get(m.parent) ? ` · ${t('eq_de', { qui: equipe.membres.get(m.parent).prenom })}` : '')),
        h('div.etat-carte', {}, `${ICONE[v.etat] || ''} ${phraseEtat(m, v)}`));
    }));
}

function entete() {
  const c = equipe.compteurs();
  const voix = voixDisponibles();
  const puce = (classe, texte) => h('span.compteur.' + classe, {}, texte);
  return h('header.entete-appel', {},
    h('div.titre-appel', {}, h('strong', {}, t('equipe'))),
    h('div.compteurs', {},
      c.jetons ? puce('jetons', '⚡ ' + t('jetons_n', { n: jetonsCourts(c.jetons) })) : null,
      c.contexte !== null ? puce('ctx', `ctx ${c.contexte}%`) : null,
      puce('travail', '⚙ ' + t('au_travail_n', { n: c.travaillent })),
      c.attendent ? puce('attente', '🔗 ' + t('en_attente_n', { n: c.attendent })) : null,
      c.finis ? puce('finis', '✓ ' + t('termines_n', { n: c.finis })) : null,
      puce('membres', `👥 ${c.membres}  ${duree(c.duree)}`)),
    h('nav.vues-appel', {}, ['appel', 'arbre'].map((nom) => h('button' + (vueCourante === nom ? '.actif' : ''), { type: 'button', onclick: () => { vueCourante = nom; redessiner(); } }, t('vue_' + nom)))),
    h('button.discret', { type: 'button', title: voixActive ? t('voix_oui') : t('voix_non'), onclick: () => {
      voixActive = !voixActive;
      ecrire('devworkshop.voix', voixActive ? 'oui' : 'non');
      if (!voixActive) window.speechSynthesis?.cancel();
      redessiner();
    } }, voixActive ? '🔊' : '🔇'),
    voix.length > 1 ? h('select', { title: t('voix_choix'), onchange: (e) => { voixChoisie = e.target.value; ecrire('devworkshop.voix.nom', voixChoisie); } },
      voix.map((x) => h('option', { value: x.name, selected: x.name === voixChoisie }, x.name))) : null,
    h('button', { type: 'button', onclick: () => montrerEquipe(false) }, '← ' + t('equipe_retour')));
}

function redessiner(force = false) {
  if (!ouvert || (fige && !force) || prevu) return;
  prevu = true;
  requestAnimationFrame(() => {
    prevu = false;
    const z = zone();
    if (!z || !ouvert || fige) return;
    z.replaceChildren(entete(), h('div.corps-appel', {}, listeAgents(), h('main.centre-appel', {}, vueCourante === 'arbre' ? arbre() : salleAppel())));
  });
}

/** L'équipe s'ouvre en plein écran, par-dessus la conversation (et l'aperçu). */
export function montrerEquipe(oui) {
  ouvert = oui;
  zone().hidden = !oui;
  document.body.classList.toggle('avec-equipe', oui);
  if (!oui) window.speechSynthesis?.cancel();
  ecrire('devworkshop.equipe', oui ? 'oui' : 'non');
  redessiner();
}

export const basculerEquipe = () => montrerEquipe(!ouvert);

export function initEquipe() {
  document.getElementById('ouvrir-direct')?.addEventListener('click', basculerEquipe);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ouvert && !fige) montrerEquipe(false);
  });
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => redessiner());
  // Ce qui dépend du temps (durée, silence, commande longue, départ d'un sous-agent, partage récent) se recalcule.
  setInterval(() => redessiner(), 1000);
  if (lire('devworkshop.equipe') === 'oui') montrerEquipe(true);
}
