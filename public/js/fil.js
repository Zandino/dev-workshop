// Fil de la conversation : messages, réflexion, outils, fins de tour.
import { h, markdown, duree } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { carteOutil, poserResultat, oublierCartes } from './outils.js';
import { pastilleLogo } from './logos.js';
import { texteFilMemoire } from './memoire-discussion.js';
import { lierChemins } from './chemins.js';

ajouterTextes({
  fr: {
    message_de_discussion: '↪ De « {titre} » · {projet} · {qui}', reponse_de_discussion: '↩ Réponse de « {titre} » · {projet} · {qui}',
    info_echange_limite: 'Échanges avec les autres discussions arrêtés ({n} messages pour cette demande) : le message pour « {vers} » n’est pas parti. Relance toi-même si tu veux continuer.',
    tache_finie: '🤖 Sous-agent « {description} » : terminé (il travaillait en arrière-plan)', tache_echec: '🤖 Sous-agent « {description} » : en échec', tache_arretee: '🤖 Sous-agent « {description} » : arrêté',
  },
  en: {
    tache_finie: '🤖 Sub-agent “{description}”: done (it was working in the background)', tache_echec: '🤖 Sub-agent “{description}”: failed', tache_arretee: '🤖 Sub-agent “{description}”: stopped',
    message_de_discussion: '↪ From “{titre}” · {projet} · {qui}', reponse_de_discussion: '↩ Reply from “{titre}” · {projet} · {qui}',
    info_echange_limite: 'Exchanges with other conversations stopped ({n} messages for this request): the message for “{vers}” was not sent. Start again yourself if you want to go on.',
  },
});

/** Le texte d'une IA en Markdown, ses chemins de fichiers devenus des liens vers l'aperçu (chemins.js, apercu.js). */
function texteAvecChemins(texte) {
  const boite = markdown(texte);
  lierChemins(boite, t('chemin_ouvrir'));
  return boite;
}

const fil = () => document.getElementById('fil');
let direct = null; // message en cours d'écriture : { boite, texte, reflexion }
let auBas = true;

export function initFil() {
  fil().addEventListener('scroll', () => {
    const f = fil();
    auBas = f.scrollHeight - f.scrollTop - f.clientHeight < 80;
  });
}

function suivre() {
  if (auBas) fil().scrollTop = fil().scrollHeight;
}

function ajouter(el) {
  fil().append(el);
  suivre();
  return el;
}

export function viderFil(messageAccueil) {
  direct = null;
  auBas = true;
  signe = false;
  oublierCartes();
  fil().replaceChildren();
  if (messageAccueil) fil().append(h('div.accueil', {}, messageAccueil));
}

function boutonCopier(texte) {
  const b = h('button.copier', { type: 'button', title: t('copier'), onclick: async () => {
    try {
      await navigator.clipboard.writeText(texte);
      b.textContent = t('copie');
      setTimeout(() => (b.textContent = t('copier')), 1500);
    } catch { /* presse-papiers indisponible */ }
  } }, t('copier'));
  return b;
}

/** Étiquette de l'auteur dans une discussion à plusieurs (couleur par participant, logo de son IA). */
function etiquetteAuteur(a) {
  if (!a) return null;
  return h('div.auteur.rang-' + (a.rang % 4), {}, pastilleLogo(a.compte, a.nom), a.nom, a.externe ? h('span.hors', {}, ' ↗ ' + t('externe')) : null);
}

/** Session à une seule IA : sa signature (logo + nom) ouvre chaque réponse. */
let signature = null;
let signe = false;
export function definirSignature(s) {
  // Une autre IA prend la main (relais) : son prochain message porte de nouveau une signature, la sienne.
  if (s?.compte?.id !== signature?.compte?.id) signe = false;
  signature = s;
}
function signer() {
  if (!signature || signe) return null;
  signe = true;
  return h('div.signature', {}, pastilleLogo(signature.compte, signature.nom), h('span', {}, signature.nom));
}

/** Le serveur ajoute la liste des fichiers joints au message : à l'écran, on la montre en puces. */
const MARQUE_FICHIERS = '\n\n---\nFichiers joints';
/** `e.de` : message venu d'une autre discussion (une IA l'a envoyé, ou c'est la réponse au sien), signé d'elle. */
function messageUtilisateur({ texte, de }) {
  if (de) {
    const qui = t(de.genre === 'reponse' ? 'reponse_de_discussion' : 'message_de_discussion', { titre: de.titre, projet: de.projet, qui: de.qui });
    return h('article.message.utilisateur.autre-discussion', { dataset: { auteur: qui } }, texte);
  }
  const coupe = texte.indexOf(MARQUE_FICHIERS);
  if (coupe < 0) return h('article.message.utilisateur', { dataset: { auteur: t('toi') } }, texte);
  const fichiers = [...texte.slice(coupe).matchAll(/(?:^- |^### )(\.devworkshop\/fichiers\/\S+)/gm)].map((x) => x[1]);
  return h('article.message.utilisateur', { dataset: { auteur: t('toi') } }, texte.slice(0, coupe),
    h('div.puces-fichiers', {}, fichiers.map((f) => h('span.puce-fichier', { title: f }, f.split('/').pop().replace(/^\d{8}-\d{6}-/, '')))));
}

function finirDirect() {
  direct?.boite.remove();
  direct = null;
}

function surDelta(e) {
  if (!direct) {
    // La réflexion se fait en arrière-plan : on montre seulement que l'IA réfléchit, pas son raisonnement.
    const reflexion = h('div.reflechit', { hidden: true }, h('span.points', {}, h('i'), h('i'), h('i')), t('reflechit'));
    const texte = h('div.texte-direct');
    // La signature n'est posée que sur le message définitif : le message en direct est remplacé à la fin.
    const sig = !e.auteur && signature && !signe ? h('div.signature', {}, pastilleLogo(signature.compte, signature.nom), h('span', {}, signature.nom)) : null;
    direct = { boite: ajouter(h('article.message.assistant.en-direct', {}, etiquetteAuteur(e.auteur) || sig, reflexion, texte)), texte, reflexion, brut: '', dernier: 0 };
  }
  if (e.genre === 'reflexion') {
    direct.reflexion.hidden = Boolean(direct.brut);
  } else {
    direct.reflexion.hidden = true;
    direct.brut += e.texte;
    // Le Markdown se recalcule au plus dix fois par seconde pendant l'écriture.
    const maintenant = performance.now();
    if (maintenant - direct.dernier > 100) {
      direct.dernier = maintenant;
      direct.texte.replaceChildren(texteAvecChemins(direct.brut));
    }
  }
  suivre();
}

function surAssistant(e) {
  if (!e.sousAgent) finirDirect();
  const message = h('article.message.assistant' + (e.sousAgent ? '.sous-agent' : ''));
  const etiquette = etiquetteAuteur(e.auteur) || (e.sousAgent ? null : signer());
  if (etiquette) message.append(etiquette);
  if (e.sousAgent) message.append(h('div.etiquette', {}, t('sous_agent')));
  for (const b of e.blocs) {
    if (b.type === 'texte') message.append(texteAvecChemins(b.texte), boutonCopier(b.texte));
    // Les blocs de réflexion restent en arrière-plan : ils ne s'affichent pas dans le fil.
    else if (b.type === 'outil') message.append(carteOutil(b));
  }
  if (message.childElementCount > (etiquette ? 1 : 0)) ajouter(message);
  else if (etiquette?.classList.contains('signature')) signe = false; // message vide : la signature attend le suivant
}

function surTour(e) {
  finirDirect();
  // Limite d'utilisation atteinte : pas un échec en soi, la ligne suivante dit qui reprend (relais, salon) ou que
  // personne ne le peut (en rouge, alors).
  const limite = !e.ok && e.limite;
  const texte = e.ok
    ? t('tour_fini', { duree: duree(e.dureeMs), appels: e.appels ?? '–' })
    : limite ? t('tour_limite') : t('tour_echec', { motif: e.message || e.motif });
  ajouter(h('div.fin-tour' + (e.ok || limite ? '' : '.echec'), {}, e.auteur ? `${e.auteur.nom} · ${texte}` : texte));
}

const TRAITEMENTS = {
  utilisateur: (e) => {
    document.querySelector('#fil .accueil')?.remove();
    auBas = true;
    signe = false;
    ajouter(messageUtilisateur(e));
    if (e.memoireRedonnee) ajouter(h('div.fin-tour', {}, t('fil_memoire_redonnee')));
  },
  // Un sous-agent lancé en arrière-plan a fini (son outil n'avait rendu que « lancé »).
  tache: (e) => {
    if (e.etape !== 'fin' || !e.enFond) return;
    const quoi = t(e.statut === 'failed' ? 'tache_echec' : e.statut === 'stopped' ? 'tache_arretee' : 'tache_finie', { description: e.description || '…' });
    ajouter(h('div.fin-tour' + (e.statut === 'failed' ? '.echec' : ''), {}, quoi + (e.resume ? ` — ${e.resume.slice(0, 300)}` : '')));
  },
  // La mémoire de la discussion a changé (memoire-discussion.js).
  memoire: (e) => ajouter(h('div.fin-tour', {}, texteFilMemoire(e))),
  delta: surDelta,
  assistant: surAssistant,
  resultat_outil: (e) => {
    poserResultat(e);
    suivre();
  },
  tour: surTour,
  // Les champs de l'événement (de, vers…) complètent le texte : « {de} a atteint sa limite : {vers} prend le relais ».
  info: (e) => ajouter(h('div.fin-tour' + (['relais_aucun', 'participant_quota_seul'].includes(e.code) ? '.echec' : ''), {}, (e.auteur ? e.auteur.nom + ' · ' : '') + t('info_' + e.code, e) + (e.detail ? ` (${e.detail})` : ''))),
  salon_pause: (e) => ajouter(h('div.fin-tour', {}, t(e.restant ? 'salon_pause_reste' : 'salon_pause', { n: e.prises }))),
  erreur: (e) => ajouter(h('div.fin-tour.echec', {}, `${t('erreur')} : ${e.message}`)),
  // Mode orchestre : la cheffe confie une tâche à un sous-agent (IA et modèle choisis par elle).
  delegation: (e) => ajouter(h('div.delegation', {}, h('div.rangee', {}, etiquetteAuteur(e.auteur), h('span.etiquette', {}, t('delegation', { modele: e.modele || t('modele_defaut') }))), h('p', {}, e.tache))),
};

/** Affiche un événement de session dans le fil (les autres types sont traités ailleurs). */
export function afficher(e) {
  TRAITEMENTS[e.t]?.(e);
}

export function noteFil(texte, echec = false) {
  ajouter(h('div.fin-tour' + (echec ? '.echec' : ''), {}, texte));
}
