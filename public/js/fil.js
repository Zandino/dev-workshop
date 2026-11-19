// Fil de la conversation : messages, réflexion, outils, fins de tour.
import { h, markdown, duree } from './dom.js';
import { t } from './i18n.js';
import { carteOutil, poserResultat, oublierCartes } from './outils.js';

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

/** Étiquette de l'auteur dans une discussion à plusieurs (couleur pleine par participant). */
function etiquetteAuteur(a) {
  if (!a) return null;
  return h('div.auteur.rang-' + (a.rang % 4), {}, a.nom, a.externe ? h('span.hors', {}, ' ↗ ' + t('externe')) : null);
}

function finirDirect() {
  direct?.boite.remove();
  direct = null;
}

function surDelta(e) {
  if (!direct) {
    const reflexion = h('pre.reflexion-directe');
    const texte = h('div.texte-direct');
    direct = { boite: ajouter(h('article.message.assistant.en-direct', {}, etiquetteAuteur(e.auteur), reflexion, texte)), texte, reflexion, brut: '', dernier: 0 };
  }
  if (e.genre === 'reflexion') {
    direct.reflexion.textContent += e.texte;
  } else {
    direct.brut += e.texte;
    // Le Markdown se recalcule au plus dix fois par seconde pendant l'écriture.
    const maintenant = performance.now();
    if (maintenant - direct.dernier > 100) {
      direct.dernier = maintenant;
      direct.texte.replaceChildren(markdown(direct.brut));
    }
  }
  suivre();
}

function surAssistant(e) {
  if (!e.sousAgent) finirDirect();
  const message = h('article.message.assistant' + (e.sousAgent ? '.sous-agent' : ''));
  const signature = etiquetteAuteur(e.auteur);
  if (signature) message.append(signature);
  if (e.sousAgent) message.append(h('div.etiquette', {}, t('sous_agent')));
  for (const b of e.blocs) {
    if (b.type === 'texte') message.append(markdown(b.texte), boutonCopier(b.texte));
    else if (b.type === 'reflexion') message.append(h('details.reflexion', {}, h('summary', {}, t('reflexion')), h('pre', {}, b.texte)));
    else if (b.type === 'outil') message.append(carteOutil(b));
  }
  if (message.childElementCount > (signature ? 1 : 0)) ajouter(message);
}

function surTour(e) {
  finirDirect();
  const texte = e.ok
    ? t('tour_fini', { duree: duree(e.dureeMs), appels: e.appels ?? '–' })
    : t('tour_echec', { motif: e.message || e.motif });
  ajouter(h('div.fin-tour' + (e.ok ? '' : '.echec'), {}, e.auteur ? `${e.auteur.nom} · ${texte}` : texte));
}

const TRAITEMENTS = {
  utilisateur: (e) => {
    document.querySelector('#fil .accueil')?.remove();
    auBas = true;
    ajouter(h('article.message.utilisateur', {}, e.texte));
  },
  delta: surDelta,
  assistant: surAssistant,
  resultat_outil: (e) => {
    poserResultat(e);
    suivre();
  },
  tour: surTour,
  info: (e) => ajouter(h('div.fin-tour', {}, (e.auteur ? e.auteur.nom + ' · ' : '') + t('info_' + e.code))),
  salon_pause: (e) => ajouter(h('div.fin-tour', {}, t(e.restant ? 'salon_pause_reste' : 'salon_pause', { n: e.prises }))),
  erreur: (e) => ajouter(h('div.fin-tour.echec', {}, `${t('erreur')} : ${e.message}`)),
};

/** Affiche un événement de session dans le fil (les autres types sont traités ailleurs). */
export function afficher(e) {
  TRAITEMENTS[e.t]?.(e);
}

export function noteFil(texte, echec = false) {
  ajouter(h('div.fin-tour' + (echec ? '.echec' : ''), {}, texte));
}
