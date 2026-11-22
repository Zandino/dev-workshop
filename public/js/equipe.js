// Équipe en direct : la discussion comme un appel vidéo. Trois façons de l'afficher : en panneau à droite du fil
// (par défaut, largeur réglable à la poignée), en grand par-dessus la conversation, ou détachée dans sa propre
// fenêtre (equipe.html + equipe-fenetre.js, à poser sur un autre écran). En haut, les compteurs (jetons, contexte, au
// travail, en attente, terminés, durée) et les vues Appel / Arbre ; à gauche (en grand), les agents par urgence ; au
// centre, une tuile par membre (son personnage à son bureau, dans son décor), le premier plan pour celui qui a besoin
// de toi ou qui vient d'agir, avec sa bulle ; quand il travaille sur un fichier, un terminal ou un navigateur, il
// « partage son écran » en grand et sa tuile passe en incrustation. Une voix lit ce qu'ils disent, un à la fois.
// Modèle : equipe-etat.js ; personnages et décors : avatars.js ; voix : voix-equipe.js.
import { h, notifier } from './dom.js';
import { t, ajouterTextes, langue } from './i18n.js';
import { pastilleLogo } from './logos.js';
import { detailOutil } from './outils.js';
import { scene, couleurDe } from './avatars.js';
import { creerEquipe } from './equipe-etat.js';
import { parlerMembre, taire, etatVoix, moteurVoix, choisirMoteur, installerVoix, modeVoix, choisirModeVoix, surModeVoix, MODES_VOIX, volumeVoix, choisirVolume } from './voix-equipe.js';

ajouterTextes({
  fr: {
    equipe: 'Équipe en direct', vue_appel: 'Appel', vue_arbre: 'Arbre',
    equipe_vide: 'L’équipe apparaîtra ici dès que l’IA travaille : chacun avec son prénom, sa fonction, ce qu’il fait et son écran.',
    agents_n: 'Agents · {n}', jetons_n: '{n} jetons', au_travail_n: '{n} au travail', en_attente_n: '{n} en attente', termines_n: '{n} terminés',
    voix_choix: 'Voix', parle: 'parle',
    voix_naturelles: 'Voix naturelles', voix_installer: 'Voix naturelles : installer (~300 Mo)', voix_installation: 'Installation des voix… ({fait}/{total})', voix_systeme: 'Voix du système',
    eq_pret: 'à l’écoute', eq_reflechit: 'réfléchit…', eq_ecrit: 'écrit…', eq_travaille: 'travaille', eq_attend: 'attend {qui}',
    eq_besoin: 'a besoin de toi', eq_bloque: 'sans nouvelles depuis 3 min', eq_fini: 'terminé', eq_erreur: 'en échec',
    eq_longue: 'commande longue', eq_boucle: 'tourne en rond ?', eq_de: 'de {qui}', eq_mission: 'Mission : {ordre}',
    eq_renommer: 'Clique pour changer', eq_partage: '{nom} partage son écran',
    toi: 'Toi', humain: 'Humain', toi_attendu: '{qui} t’attend', repondre_conversation: 'Répondre',
    rien_fichier: 'Aucun fichier modifié pour l’instant.', rien_terminal: 'Aucune commande pour l’instant.', rien_navigateur: 'Pas de navigateur pour l’instant.',
    capture_non_gardee: 'Capture non gardée (elle ne s’affiche qu’en direct).', en_cours: 'en cours…', dit_accord: '{nom} a besoin de toi.',
    voix_volume: 'Volume des voix', voix_mode_tout: '🔊 Tout dire', voix_mode_essentiel: '🔔 L’essentiel', voix_mode_non: '🔇 Muet',
    voix_mode_aide: 'L’essentiel : seulement « … a besoin de toi » et « travail terminé », pour toutes les discussions',
    equipe_agrandir: 'Agrandir', equipe_reduire: 'Remettre à droite du fil', equipe_detacher: 'Détacher dans une fenêtre',
    equipe_rattacher: 'Remettre dans la fenêtre principale', equipe_fermer: 'Fermer l’équipe', equipe_largeur: 'Glisser pour changer la largeur (double-clic : largeur d’origine)',
    detacher_impossible: 'La fenêtre détachée n’a pas pu s’ouvrir : le logiciel de bureau doit être mis à jour (ou le navigateur bloque les fenêtres). En attendant, « Agrandir » montre l’équipe en grand.',
    fenetre_sans_jeton: 'Ouvre d’abord Dev Workshop dans la fenêtre principale, puis détache l’équipe depuis elle.',
  },
  en: {
    equipe: 'Live team', vue_appel: 'Call', vue_arbre: 'Tree',
    equipe_vide: 'The team will show here as soon as the AI works: each one with a first name, a role, what it is doing and its screen.',
    agents_n: 'Agents · {n}', jetons_n: '{n} tokens', au_travail_n: '{n} working', en_attente_n: '{n} waiting', termines_n: '{n} done',
    voix_choix: 'Voice', parle: 'speaking',
    voix_naturelles: 'Natural voices', voix_installer: 'Natural voices: install (~300 MB)', voix_installation: 'Installing voices… ({fait}/{total})', voix_systeme: 'System voices',
    eq_pret: 'listening', eq_reflechit: 'thinking…', eq_ecrit: 'writing…', eq_travaille: 'working', eq_attend: 'waiting for {qui}',
    eq_besoin: 'needs you', eq_bloque: 'no news for 3 min', eq_fini: 'done', eq_erreur: 'failed',
    eq_longue: 'long command', eq_boucle: 'going in circles?', eq_de: 'for {qui}', eq_mission: 'Mission: {ordre}',
    eq_renommer: 'Click to change', eq_partage: '{nom} is sharing their screen',
    toi: 'You', humain: 'Human', toi_attendu: '{qui} is waiting for you', repondre_conversation: 'Answer',
    rien_fichier: 'No file edited yet.', rien_terminal: 'No command yet.', rien_navigateur: 'No browser yet.',
    capture_non_gardee: 'Screenshot not kept (it only shows live).', en_cours: 'running…', dit_accord: '{nom} needs you.',
    voix_volume: 'Voice volume', voix_mode_tout: '🔊 Say everything', voix_mode_essentiel: '🔔 Essentials', voix_mode_non: '🔇 Muted',
    voix_mode_aide: 'Essentials: only “… needs you” and “work finished”, for every conversation',
    equipe_agrandir: 'Enlarge', equipe_reduire: 'Back to the right of the thread', equipe_detacher: 'Detach into a window',
    equipe_rattacher: 'Back into the main window', equipe_fermer: 'Close the team', equipe_largeur: 'Drag to change the width (double-click: original width)',
    detacher_impossible: 'The detached window could not open: the desktop app needs an update (or the browser blocks windows). Meanwhile, “Enlarge” shows the team full size.',
    fenetre_sans_jeton: 'Open Dev Workshop in the main window first, then detach the team from there.',
  },
});

const PARTAGE_RECENT = 30_000; // un écran touché il y a moins de 30 s est « partagé » en grand
const ICONE = { travaille: '⚙', ecrit: '✎', reflechit: '…', attend: '🔗', besoin: '✋', bloque: '⌛', fini: '✓', erreur: '✕', pret: '●' };

const zone = () => document.getElementById('equipe');
let equipe = creerEquipe();
let skins = []; // personnages en images disponibles sur le serveur

/** L'état général a changé : les skins disponibles (pour la prochaine équipe). */
export function definirSkins(liste) {
  skins = Array.isArray(liste) ? liste : [];
}

/** Fichier du skin pour un état affiché. */
const IMAGE_ETAT = { pret: 'idle', travaille: 'working', ecrit: 'working', reflechit: 'thinking', attend: 'waiting', besoin: 'needs-you', bloque: 'blocked', fini: 'done', erreur: 'error' };
/**
 * Ce qui s'anime par-dessus l'image d'un skin, selon l'état : l'image reste immobile (la faire bouger en entier,
 * décor compris, faisait trembler toute la tuile), seuls ces petits effets bougent.
 */
function effets(etat) {
  const points = () => [h('i'), h('i'), h('i')];
  if (etat === 'travaille' || etat === 'ecrit') return h('div.effets.frappe', {}, h('span.bulle-frappe', {}, points()));
  if (etat === 'reflechit') return h('div.effets.pensee', {}, h('span.bulle-pensee', {}, points()));
  if (etat === 'besoin') return h('div.effets.besoin', {}, h('span.main-effet', {}, '✋'));
  if (etat === 'bloque') return h('div.effets.dodo', {}, h('span', {}, 'z'), h('span', {}, 'z'), h('span', {}, 'z'));
  if (etat === 'fini') return h('div.effets.confettis', {}, Array.from({ length: 14 }, () => h('i')));
  if (etat === 'erreur') return h('div.effets.alerte');
  if (etat === 'attend') return h('div.effets.attente', {}, h('span.sablier-effet', {}, '⏳'));
  return null;
}

/** Une image, ou une vidéo en boucle (muette, sans contrôles) pour un skin animé. */
const media = (src) => (/\.(mp4|webm)$/i.test(src)
  ? h('video.scene-img', { src, autoplay: true, muted: true, loop: true, playsInline: true, disablePictureInPicture: true })
  : h('img.scene-img', { src, alt: '' }));
const imageSkin = (skin, etat) => `/skins/${skin.nom}/${skin.images[IMAGE_ETAT[etat] || 'idle']}`;
let sessionId = '';
let signatureCourante = null;
let personnalises = {};
// 'ferme', 'panneau' (à droite du fil), 'grand' (par-dessus la conversation) ou 'fenetre' (la page détachée elle-même).
let affichage = 'ferme';
let ouvert = false; // cette page montre l'équipe
let enFenetre = false; // cette page EST la fenêtre détachée
let detachee = false; // (page principale) la fenêtre détachée est ouverte : c'est elle qui montre l'équipe et parle
let vueCourante = 'appel';
let prevu = false;
let fige = false; // un prénom ou une fonction en cours de saisie
let epingle = null; // clé du membre gardé au premier plan
let parle = null; // clé du membre dont la voix est en cours
const etatsVus = new Map(); // pour la fête (fini) et le sursaut (échec), une seule fois
// Entre la page principale et la fenêtre détachée (même origine) : quelle discussion suivre, qui est ouvert.
const liaison = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('devworkshop-equipe');
const poster = (m) => { try { liaison?.postMessage(m); } catch { /* fenêtre fermée */ } };

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
  signatureCourante = sig || null;
  if (!enFenetre) poster({ t: 'session', session: sessionId, signature: signatureCourante }); // la fenêtre détachée suit
  try { personnalises = JSON.parse(lire(`devworkshop.equipe.${sessionId}`) || '{}'); } catch { personnalises = {}; }
  equipe = creerEquipe({ session: sessionId, principal: sig ? { nom: sig.nom, compte: sig.compte } : null, personnalises, skins });
  // Les images des skins se chargent d'avance : changer d'état ne fait pas clignoter la tuile.
  if (typeof Image !== 'undefined') for (const s of skins) for (const f of Object.values(s.images)) new Image().src = `/skins/${s.nom}/${f}`;
  epingle = null;
  etatsVus.clear();
  zone()?.replaceChildren();
  taire();
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

/** Chaque membre parle avec sa voix, un à la fois (voix-equipe.js) ; sa tuile le montre pendant qu'il parle. */
function parler(m, texte) {
  if (modeVoix() !== 'tout' || !ouvert) return; // « l'essentiel » : annonces.js s'en charge, pour toutes les discussions
  parlerMembre(m, pourLaVoix(texte), (cle) => {
    parle = cle;
    redessiner();
  });
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
function editable(m, champ, affiche) {
  return h('span.editable', { title: t('eq_renommer'), tabIndex: 0, onclick: (ev) => {
    ev.stopPropagation();
    const valeur = champ === 'prenom' ? m.prenom : equipe.fonctionDe(m);
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
  } }, affiche);
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
    dataset: { cle: m.cle + (incrustee ? ':incrustee' : '') },
    onclick: () => {
      if (equipe.vue(m).etat === 'besoin') return allerRepondre(); // il t'attend : vers la conversation pour répondre
      epingle = epingle === m.cle ? null : m.cle;
      redessiner();
    },
  },
  m.skin ? media(imageSkin(m.skin, v.etat)) : scene(m.style),
  m.skin && !/\.(mp4|webm)$/i.test(imageSkin(m.skin, v.etat)) ? effets(v.etat) : null,
  h('span.puce-etat', {}, `${ICONE[v.etat] || ''} ${phraseEtat(m, v)}`),
  parle === m.cle ? h('span.ondes', { title: t('parle') }, h('i'), h('i'), h('i'), h('i')) : null,
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
  return h('article.tuile-appel.toi' + (attendu.length ? '.attendu' : ''), { onclick: () => attendu.length && allerRepondre() },
    h('div.scene-toi', {}, h('span.icone-toi', {}, attendu.length ? '✋' : '🙂')),
    attendu.length ? h('span.puce-etat', {}, `✋ ${t('toi_attendu', { qui: attendu.join(', ') })}`) : null,
    attendu.length ? h('button.principal.repondre-toi', { type: 'button', onclick: (e) => { e.stopPropagation(); allerRepondre(); } }, t('repondre_conversation')) : null,
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
    return h('div.ligne-arbre.etat-' + v.etat, { style: `--niveau: ${niveau}; --couleur-membre: ${couleurDe(m.style)}`, dataset: { cle: m.cle } },
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
      return h('div.carte-agent.etat-' + v.etat + (epingle === m.cle ? '.epinglee' : ''), { style: `--couleur-membre: ${couleurDe(m.style)}`, dataset: { cle: m.cle }, onclick: () => { epingle = epingle === m.cle ? null : m.cle; redessiner(); } },
        h('div.ligne-carte', {}, h('span.point-membre'), h('strong', {}, editable(m, 'prenom', m.prenom)), h('span.fonction', {}, editable(m, 'fonction', equipe.fonctionDe(m)), m.parent && equipe.membres.get(m.parent) ? ` · ${t('eq_de', { qui: equipe.membres.get(m.parent).prenom })}` : '')),
        h('div.etat-carte', {}, `${ICONE[v.etat] || ''} ${phraseEtat(m, v)}`));
    }));
}

/** Moteur de voix : naturelles (serveur, à installer une fois) ou celles du système. */
function choixMoteur() {
  const e = etatVoix();
  const naturelle = e.installee ? t('voix_naturelles')
    : e.installation ? t('voix_installation', { fait: e.installation.fait, total: e.installation.total })
      : t('voix_installer');
  return h('select', { title: t('voix_choix'), onchange: (ev) => {
    const choix = ev.target.value;
    if (choix === 'naturelle' && !e.installee && !e.installation) installerVoix();
    choisirMoteur(choix);
    taire();
    redessiner();
  } },
  h('option', { value: 'naturelle', selected: moteurVoix() === 'naturelle' || (!e.installee && lire('devworkshop.voix.moteur') !== 'systeme') }, naturelle),
  h('option', { value: 'systeme', selected: moteurVoix() === 'systeme' && lire('devworkshop.voix.moteur') === 'systeme' }, t('voix_systeme')));
}

function entete() {
  const c = equipe.compteurs();
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
    choixModeVoix(),
    modeVoix() === 'non' ? null : curseurVolume(),
    modeVoix() === 'non' ? null : choixMoteur(),
    boutonsAffichage());
}

/** Ce que la voix dit : tout, l'essentiel (annonces seulement), ou rien. */
function choixModeVoix() {
  const mode = modeVoix();
  return h('select.mode-voix', { title: t('voix_mode_aide'), onchange: (ev) => {
    choisirModeVoix(ev.target.value);
    if (ev.target.value !== 'tout') taire();
    redessiner();
  } }, MODES_VOIX.map((m) => h('option', { value: m, selected: mode === m }, t('voix_mode_' + m))));
}

/** Le volume des voix (la phrase en cours suit le curseur). */
const curseurVolume = () => h('input.volume-voix', { type: 'range', min: '0', max: '1', step: '0.05', value: String(volumeVoix()), title: t('voix_volume'), 'aria-label': t('voix_volume'), oninput: (ev) => choisirVolume(ev.target.value) });

/** Agrandir / remettre à droite, détacher (ou rattacher, dans la fenêtre détachée), fermer. */
function boutonsAffichage() {
  const bouton = (icone, titre, faire) => h('button.icone-appel', { type: 'button', title: titre, 'aria-label': titre, onclick: faire }, icone);
  if (enFenetre) return h('span.boutons-appel', {}, bouton('⇱', t('equipe_rattacher'), () => { poster({ t: 'rattacher' }); window.close(); }));
  return h('span.boutons-appel', {},
    affichage === 'grand' ? bouton('⤡', t('equipe_reduire'), () => afficher('panneau')) : bouton('⤢', t('equipe_agrandir'), () => afficher('grand')),
    bouton('⧉', t('equipe_detacher'), detacher),
    bouton('✕', t('equipe_fermer'), () => afficher('ferme')));
}

/** La poignée du panneau : glisser change sa largeur (gardée), double-clic la remet d'origine. */
function poignee() {
  return h('div.poignee-equipe', { dataset: { cle: 'poignee' }, title: t('equipe_largeur'), ondblclick: () => {
    document.body.style.removeProperty('--largeur-equipe');
    ecrire('devworkshop.equipe.largeur', '');
  }, onpointerdown: (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('tire');
    const bouger = (ev) => {
      // Au moins 320 px pour l'équipe, et 360 px pour le fil à côté de la barre des projets.
      const largeur = Math.round(Math.max(320, Math.min(window.innerWidth - ev.clientX, window.innerWidth - 620)));
      document.body.style.setProperty('--largeur-equipe', `${largeur}px`);
    };
    const finir = () => {
      el.classList.remove('tire');
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', finir);
      el.removeEventListener('pointercancel', finir);
      ecrire('devworkshop.equipe.largeur', document.body.style.getPropertyValue('--largeur-equipe'));
    };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', finir);
    el.addEventListener('pointercancel', finir);
  } });
}

/**
 * Met `ancien` à jour d'après `nouveau` en gardant les éléments qui n'ont pas changé de nature : leurs animations
 * (personnages, images, vidéos) continuent au lieu de repartir de zéro à chaque mise à jour (une par seconde). Un
 * élément qui change de membre (data-cle) ou de balise est remplacé, avec ses actions au clic.
 */
function morpher(ancien, nouveau) {
  if (ancien.nodeType !== nouveau.nodeType || ancien.nodeName !== nouveau.nodeName || ancien.dataset?.cle !== nouveau.dataset?.cle) {
    ancien.replaceWith(nouveau);
    return;
  }
  if (ancien.nodeType === 3) {
    if (ancien.data !== nouveau.data) ancien.data = nouveau.data;
    return;
  }
  if (ancien.nodeType !== 1) return;
  if (ancien.nodeName === 'IMG' && ancien.classList.contains('scene-img') && ancien.getAttribute('src') !== nouveau.getAttribute('src')) {
    nouveau.classList.add('fondu');
    ancien.after(nouveau);
    ancien.dataset.depart = '1';
    setTimeout(() => { ancien.remove(); nouveau.classList.remove('fondu'); }, 450);
    return;
  }
  for (const a of [...ancien.attributes]) if (!nouveau.hasAttribute(a.name)) ancien.removeAttribute(a.name);
  for (const a of [...nouveau.attributes]) if (ancien.getAttribute(a.name) !== a.value) ancien.setAttribute(a.name, a.value);
  morpherEnfants(ancien, [...nouveau.childNodes]);
}

function morpherEnfants(parent, nouveaux) {
  const anciens = [...parent.childNodes].filter((n) => !(n.nodeType === 1 && n.dataset?.depart));
  nouveaux.forEach((n, i) => (i < anciens.length ? morpher(anciens[i], n) : parent.append(n)));
  for (let i = nouveaux.length; i < anciens.length; i += 1) anciens[i].remove();
}

function redessiner(force = false) {
  if (!ouvert || (fige && !force) || prevu) return;
  prevu = true;
  requestAnimationFrame(() => {
    prevu = false;
    const z = zone();
    if (!z || !ouvert || fige) return;
    morpherEnfants(z, [poignee(), entete(), h('div.corps-appel', {}, listeAgents(), h('main.centre-appel', {}, vueCourante === 'arbre' ? arbre() : salleAppel()))]);
  });
}

/** Quelqu'un attend ta réponse : la conversation (où est sa demande) passe devant. */
function allerRepondre() {
  if (enFenetre) return poster({ t: 'repondre' }); // la fenêtre principale se met au premier plan
  if (affichage === 'grand') afficher('panneau');
  document.getElementById('permissions')?.scrollIntoView?.({ block: 'nearest' });
  return null;
}

/** Change l'affichage de cette page : 'ferme', 'panneau', 'grand' (ou 'fenetre', fixé dans la page détachée). */
function afficher(mode) {
  if (enFenetre) mode = 'fenetre';
  affichage = mode;
  ouvert = mode !== 'ferme';
  const z = zone();
  z.hidden = !ouvert;
  z.classList.toggle('panneau', mode === 'panneau');
  z.classList.toggle('grand', mode === 'grand' || mode === 'fenetre');
  document.body.classList.toggle('avec-equipe', ouvert);
  document.body.classList.toggle('equipe-grande', mode === 'grand');
  // À droite du fil, l'équipe prend la place de l'aperçu (apercu.js se ferme), et inversement.
  if (mode === 'panneau') document.dispatchEvent(new CustomEvent('colonne-droite', { detail: 'equipe' }));
  if (!ouvert) taire();
  if (!enFenetre) ecrire('devworkshop.equipe', detachee ? 'detache' : mode === 'ferme' ? 'non' : mode);
  redessiner(true);
}

/** Compatibilité : vrai ouvre l'équipe (à droite du fil, ou là où elle était), faux la ferme. */
export function montrerEquipe(oui) {
  if (!oui) return afficher('ferme');
  if (detachee) return poster({ t: 'montrer' });
  return afficher(affichage === 'ferme' ? 'panneau' : affichage);
}

export const basculerEquipe = () => (detachee ? poster({ t: 'montrer' }) : afficher(ouvert ? 'ferme' : 'panneau'));
/** L'équipe se voit quelque part (ici ou dans la fenêtre détachée) : annonces.js n'y répète pas ce qu'elle dit. */
export const equipeAffichee = () => ouvert || detachee;
/** Le prénom donné au membre (celui d'une IA d'un salon, ou l'IA principale), pour les annonces. */
export const prenomMembre = (auteur) => equipe.membres.get(auteur ? `auteur:${auteur}` : 'principal')?.prenom || null;

function marquerDetachee(oui) {
  detachee = oui;
  document.body.classList.toggle('equipe-detachee', oui);
  if (oui && ouvert) afficher('ferme'); // la fenêtre détachée montre l'équipe et parle : pas les deux
  else if (!enFenetre) ecrire('devworkshop.equipe', oui ? 'detache' : affichage === 'ferme' ? 'non' : affichage);
}

/** Ouvre l'équipe dans sa propre fenêtre ; sans elle (logiciel de bureau ancien, fenêtres bloquées), on le dit. */
function detacher() {
  let fenetre = null;
  try { fenetre = window.open('/equipe.html', 'devworkshop-equipe', 'popup=yes,width=1180,height=780'); } catch { fenetre = null; }
  if (!fenetre) return notifier(t('detacher_impossible'), { echec: true, duree: 12000 });
  marquerDetachee(true);
  return null;
}

/** Messages de l'autre fenêtre. Page principale : la détachée s'annonce, demande quoi suivre, se ferme. */
function surLiaison(m) {
  if (enFenetre) {
    if (m.t === 'appel') poster({ t: 'presente' });
    else if (m.t === 'montrer') window.focus();
    else if (m.t === 'session') surSessionSuivie?.(m.session, m.signature);
    return;
  }
  if (m.t === 'qui') poster({ t: 'session', session: sessionId, signature: signatureCourante });
  else if (m.t === 'presente') marquerDetachee(true);
  else if (m.t === 'fermee') marquerDetachee(false);
  else if (m.t === 'rattacher') {
    marquerDetachee(false);
    afficher('panneau');
  } else if (m.t === 'repondre') {
    window.focus();
    document.getElementById('permissions')?.scrollIntoView?.({ block: 'nearest' });
  }
}

let surSessionSuivie = null;

/**
 * `fenetre` : cette page est la fenêtre détachée ; `suivre(session, signature)` est appelé quand la page principale
 * change de discussion.
 */
export function initEquipe({ fenetre = false, suivre = null } = {}) {
  enFenetre = fenetre;
  surSessionSuivie = suivre;
  liaison?.addEventListener('message', (e) => surLiaison(e.data || {}));
  surModeVoix(() => redessiner(true));
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => redessiner());
  // Ce qui dépend du temps (durée, silence, commande longue, départ d'un sous-agent, partage récent) se recalcule.
  setInterval(() => redessiner(), 1000);
  const largeur = lire('devworkshop.equipe.largeur');
  if (/^\d{3,4}px$/.test(largeur || '')) document.body.style.setProperty('--largeur-equipe', largeur);
  if (enFenetre) {
    afficher('fenetre');
    poster({ t: 'presente' });
    poster({ t: 'qui' });
    window.addEventListener('pagehide', () => poster({ t: 'fermee' }));
    return;
  }
  document.getElementById('ouvrir-direct')?.addEventListener('click', basculerEquipe);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && affichage === 'grand' && !fige) afficher('panneau');
  });
  document.addEventListener('colonne-droite', (e) => {
    if (e.detail !== 'equipe' && affichage === 'panneau') afficher('ferme');
  });
  const avant = lire('devworkshop.equipe');
  if (avant === 'detache') {
    // Rechargée pendant que la fenêtre détachée est ouverte : elle répond ; sinon, l'équipe revient à droite du fil.
    poster({ t: 'appel' });
    setTimeout(() => { if (!detachee) afficher('panneau'); }, 800);
  } else if (avant === 'grand') afficher('grand');
  else if (avant === 'oui' || avant === 'panneau') afficher('panneau');
}
