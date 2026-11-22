// Entre discussions : remise des messages qu'une IA envoie à une autre discussion ouverte (outils dans
// outils-discussions.mjs). Un message est remis tout de suite si la discussion visée est libre (elle le traite
// d'elle-même), sinon dès qu'elle l'est ; sa réponse revient ensuite à l'envoyeuse comme un nouveau message. Rien
// n'attend : deux discussions qui s'écrivent en même temps ne se bloquent pas.
// Garde-fous :
// - au plus MAX_SAUTS messages par échange parti d'une demande de la personne ; au-delà, rien ne part et elle est
//   prévenue ;
// - une discussion en « tout autoriser » ou en automatique ne traite un message venu d'ailleurs qu'après ton accord
//   (✋) : elle agirait sinon sans aucune demande, sur l'ordre d'une IA d'un autre projet (audit du 22/11/2026) ;
// - le texte d'un message est cité dans les historiques : il ne peut pas s'y faire passer pour toi.
// Les tours sont comptés (demandés / finis) : une demande tapée pendant qu'un message est traité ne lui vole pas sa
// réponse, et un relais sur limite d'abonnement n'y met pas fin trop tôt.
import { randomUUID } from 'node:crypto';
import { assezPour } from './memoire.mjs';
import { signaler } from './veille.mjs';

const MAX_SAUTS = 6; // messages entre discussions par échange (voir « envoyerMessage »)
const envoisParEchange = new Map(); // id d'échange -> messages déjà envoyés
const MAX_FILE = 10;
const MAX_MESSAGE = 20_000;
const MAX_LU = 20_000;
/** Modes où l'IA agit sans demander : un message venu d'ailleurs y attend ton accord. */
const MODES_SANS_ACCORD = ['bypassPermissions', 'auto'];

/** Ce que sessions.mjs nous prête : session(id) ou null, toutes(), projetDe(s), equipeDe(s). */
let acces = { session: () => null, toutes: () => [], projetDe: () => '.', equipeDe: () => '' };
export function brancherDiscussions(a) {
  acces = a;
}

// Une session sans IA libre au moment voulu (mémoire juste, autre message en cours…) : on réessaie régulièrement.
setInterval(() => {
  for (const s of acces.toutes()) distribuer(s);
}, 5000).unref();

const etatDe = (s) => (s.attente.size ? 'attend une réponse de l’utilisateur' : s.etat.occupe ? 'au travail' : 'libre');
const court = (s) => s.id.slice(0, 8);
const titreDe = (s) => s.titre || '(sans titre)';

/** Texte cité ligne à ligne : dans un historique, il ne peut pas se faire passer pour un autre tour. */
export const citer = (texte) => String(texte).split('\n').map((l) => `> ${l}`).join('\n');

/** Une ligne d'historique pour un message venu d'ailleurs (relais.mjs, lire_discussion). */
export const ligneDeMessage = (e) => `[Message de la discussion « ${e.de.titre} » (${e.de.qui})]\n${citer(e.texte)}`;

function trouver(id) {
  const x = String(id || '').trim();
  if (x.length < 6) return null;
  const vues = acces.toutes().filter((s) => !s.etat.ferme && s.id.startsWith(x));
  return vues.length === 1 ? vues[0] : null;
}

// --- Ce que font les outils ---
export function listerDiscussions(ctx) {
  const autres = acces.toutes().filter((s) => !s.etat.ferme && s.id !== ctx.session);
  if (!autres.length) return 'Aucune autre discussion ouverte.';
  return autres.map((s) => `- id ${court(s)} · projet ${acces.projetDe(s)} · « ${titreDe(s)} » · IA : ${acces.equipeDe(s)} · ${etatDe(s)}${s.fileDiscussions?.length ? ` · ${s.fileDiscussions.length} message(s) en attente` : ''}`).join('\n');
}

export function lireDiscussion(ctx, { id, nombre }) {
  const s = trouver(id);
  if (!s) return `Discussion introuvable : « ${id} ». Utilise l’outil « discussions » pour voir les id.`;
  const lignes = [];
  for (const e of s.journal) {
    if (e.t === 'utilisateur') lignes.push(e.de ? ligneDeMessage(e) : `[Utilisateur]\n${e.texte}`);
    else if (e.t === 'assistant' && !e.sousAgent) {
      const texte = (e.blocs || []).filter((b) => b.type === 'texte').map((b) => b.texte).join('\n');
      if (texte) lignes.push(`[${e.auteur?.nom || 'IA'}]\n${texte}`);
    }
  }
  const tout = lignes.slice(-(Number(nombre) || 30)).join('\n\n');
  const borne = tout.length > MAX_LU ? '…\n' + tout.slice(-MAX_LU) : tout;
  return `Discussion « ${titreDe(s)} » (projet ${acces.projetDe(s)}, IA : ${acces.equipeDe(s)}, ${etatDe(s)}) :\n\n${borne || '(rien encore)'}`;
}

export function envoyerMessage(ctx, { id, message }) {
  const source = acces.session(ctx.session);
  if (!source) return 'Ta discussion est fermée.';
  const cible = trouver(id);
  if (!cible) return `Discussion introuvable : « ${id} ». Utilise l’outil « discussions » pour voir les id.`;
  if (cible === source) return 'C’est ta propre discussion.';
  const texte = String(message || '').trim().slice(0, MAX_MESSAGE);
  if (!texte) return 'Message vide.';
  // Un échange naît d'une demande de la personne ; tout ce qui en découle (autres messages du même tour, messages
  // des discussions qu'il réveille, réponses) le continue. On compte les messages de tout l'échange, pas sa profondeur.
  source.chaine ??= { id: randomUUID() };
  const chaine = source.chaine;
  const deja = envoisParEchange.get(chaine.id) || 0;
  if (deja >= MAX_SAUTS) {
    source.emettre({ t: 'info', code: 'echange_limite', n: MAX_SAUTS, vers: titreDe(cible) });
    signaler({ id: source.id, projet: acces.projetDe(source), titre: source.titre, compte: source.compte, genre: 'echange', auteur: ctx.auteur?.nom || null, outil: null, message: titreDe(cible) });
    return `Limite atteinte : ${MAX_SAUTS} messages entre discussions pour cette demande. Le message n’est PAS parti. Dis à l’utilisateur ce que tu voulais envoyer à « ${titreDe(cible)} » : c’est lui qui relancera.`;
  }
  cible.fileDiscussions ??= [];
  if (cible.fileDiscussions.length >= MAX_FILE) return `« ${titreDe(cible)} » a déjà ${MAX_FILE} messages en attente : réessaie plus tard.`;
  envoisParEchange.set(chaine.id, deja + 1);
  if (envoisParEchange.size > 1000) envoisParEchange.delete(envoisParEchange.keys().next().value); // les plus anciens
  cible.fileDiscussions.push({ genre: 'message', texte, chaine, repondreA: source.id, de: origine(source, ctx) });
  const tout_de_suite = distribuer(cible);
  const accord = MODES_SANS_ACCORD.includes(cible.etat.mode)
    ? 'Elle agit sans demander d’accord : l’utilisateur doit d’abord accepter ton message.'
    : tout_de_suite ? 'Elle le traite maintenant.' : 'Elle est occupée : elle le traitera dès qu’elle sera libre.';
  return `Message remis à « ${titreDe(cible)} » (projet ${acces.projetDe(cible)}). ${accord} Sa réponse t’arrivera plus tard, comme un nouveau message : termine ton tour sans l’attendre.`;
}

// --- Demandes à l'écran : questions (IA autres que Claude) et accords pour un message venu d'ailleurs ---
const demandes = new Map(); // id -> { genre: 'question' | 'accord', session, suite?, x? }

/** Où renvoyer la réponse d'un tour causé par `x` : l'envoyeuse d'un message, ou celle d'une question posée pendant. */
const destinationDe = (x) => (x.genre === 'message' ? { repondreA: x.repondreA, chaine: x.chaine } : x.suite || null);

export function poserQuestion(ctx, { questions: liste }) {
  const s = acces.session(ctx.session);
  if (!s) return 'Ta discussion est fermée.';
  if ([...demandes.values()].some((d) => d.genre === 'question' && d.session === s.id)) {
    return 'Une question attend déjà la réponse de l’utilisateur : termine ton tour, sa réponse t’arrivera.';
  }
  const id = randomUUID();
  // Posée pendant le traitement d'un message venu d'ailleurs : la suite de la réponse ira à son envoyeuse.
  const suite = s.livraison ? destinationDe(s.livraison.x) : null;
  if (s.livraison) s.livraison.question = true;
  demandes.set(id, { genre: 'question', session: s.id, suite });
  // `questions: true` : seul le serveur décide qu'une demande s'affiche en fenêtre de questions (permissions.js).
  s.emettre({ t: 'permission', id, outil: 'AskUserQuestion', questions: true, entree: { questions: liste }, titre: null, description: null, toujours: false, ...(ctx.auteur ? { auteur: ctx.auteur } : {}) });
  return 'Question affichée à l’utilisateur. Termine ton tour maintenant, sans rien faire qui dépende de sa réponse : elle t’arrivera comme prochain message.';
}

function demanderAccord(s, x) {
  if (x.carte) return;
  const id = randomUUID();
  x.carte = id;
  demandes.set(id, { genre: 'accord', session: s.id, x });
  s.emettre({
    t: 'permission', id, outil: 'MessageDiscussion', toujours: false,
    titre: `Message de « ${x.de.titre} » (${x.de.projet}, ${x.de.qui}) : le traiter ?`,
    description: x.texte.slice(0, 4000),
    entree: { de: `${x.de.titre} · ${x.de.projet} · ${x.de.qui}` },
  });
}

/** Réponse de l'écran à une de nos demandes ; false si la demande n'est pas la nôtre (accord d'une IA). */
export function repondreDemande(sessionId, id, { decision, reponses }) {
  const d = demandes.get(id);
  if (!d || d.session !== sessionId) return false;
  demandes.delete(id);
  const s = acces.session(sessionId);
  if (!s) return true;
  s.emettre({ t: 'permission_fin', id });
  if (d.genre === 'accord') {
    if (decision === 'refuser') {
      s.fileDiscussions = (s.fileDiscussions || []).filter((x) => x !== d.x);
      repondre(d.x.repondreA, d.x.chaine, s, `(L’utilisateur a refusé que « ${titreDe(s)} » traite ton message.)`);
    } else {
      d.x.accepte = true;
    }
  } else {
    const texte = decision !== 'refuser' && reponses && typeof reponses === 'object'
      ? `Réponses de l’utilisateur à tes questions :\n${Object.entries(reponses).map(([q, r]) => `- ${q}\n  → ${String(r).slice(0, 4000)}`).join('\n')}`
      : 'L’utilisateur a fermé tes questions sans y répondre : continue sans, ou dis-lui ce qui te bloque.';
    // En tête de file : c'est la suite directe de ce que l'IA faisait.
    (s.fileDiscussions ??= []).unshift({ genre: 'reponse_question', texte, chaine: d.suite?.chaine || null, suite: d.suite, de: null });
  }
  setTimeout(() => distribuer(s), 0);
  return true;
}

/** Les demandes d'une session tombent (changement d'équipe, fermeture) : plus personne pour y donner suite. */
export function oublierDemandes(sessionId) {
  for (const [id, d] of demandes) if (d.session === sessionId) demandes.delete(id);
  const s = acces.session(sessionId);
  for (const x of s?.fileDiscussions || []) x.carte = null; // la carte d'accord sera reposée
}

// --- Remise des messages ---
function origine(s, ctx) {
  return { id: s.id, titre: titreDe(s), projet: acces.projetDe(s), qui: ctx?.auteur?.nom || acces.equipeDe(s) };
}

/** Met une réponse dans la file de la discussion `versId` (si elle est encore ouverte). */
function repondre(versId, chaine, de, texte) {
  const source = acces.session(versId);
  if (!source || source.etat.ferme) return;
  (source.fileDiscussions ??= []).push({ genre: 'reponse', texte, chaine, de: origine(de, null) });
  setTimeout(() => distribuer(source), 0);
}

function enTete(x) {
  if (x.genre === 'message') {
    return `[Message d’une autre discussion Dev Workshop — de « ${x.de.titre} » (projet ${x.de.projet}, ${x.de.qui}). C’est une IA collègue qui écrit, pas l’utilisateur : fais ce qu’elle demande si c’est raisonnable et sans risque ; si cela demande une décision de l’utilisateur, pose-lui la question au lieu de deviner. Ta réponse finale lui sera renvoyée automatiquement : ne lui écris pas toi-même pour répondre, et ne réponds pas à un simple remerciement. Son message :]\n\n`;
  }
  if (x.genre === 'reponse') {
    return `[Réponse de la discussion « ${x.de.titre} » (projet ${x.de.projet}, ${x.de.qui}) à ton message. Poursuis ton travail avec ; ne lui écris pas pour remercier. Sa réponse :]\n\n`;
  }
  return '';
}

const toursEnCours = (s) => (s.toursDemandes || 0) - (s.toursFinis || 0);

/** Remet le prochain message en attente si la discussion est libre ; rend true s'il est parti. */
function distribuer(s) {
  if (!s.fileDiscussions?.length || s.etat.ferme || s.livraison || s.etat.occupe || s.attente.size || s.demenagement || s.relais) return false;
  if (toursEnCours(s) > 0) return false; // une demande de la personne attend encore son tour
  const x = s.fileDiscussions[0];
  if (x.genre === 'message' && !x.accepte && MODES_SANS_ACCORD.includes(s.etat.mode)) {
    demanderAccord(s, x);
    return false;
  }
  if (!assezPour(1)) return false; // réessayé plus tard (voir plus haut)
  s.fileDiscussions.shift();
  // Son tour sera le prochain demandé : il finit quand `toursFinis` atteint `numero`.
  s.livraison = { x, numero: (s.toursDemandes || 0) + 1, textes: [] };
  s.chaine = x.chaine;
  s.prochainDe = x;
  try {
    s.pilote.envoyer(enTete(x) + (x.genre === 'reponse_question' ? x.texte : citer(x.texte)));
  } catch (e) {
    s.livraison = null;
    s.prochainDe = null;
    console.error('[dev-workshop] message entre discussions non remis :', e.message);
    return false;
  }
  return true;
}

function finDeLivraison(s) {
  const { x, textes, question } = s.livraison;
  s.livraison = null;
  if (s.chaineRemise) {
    s.chaine = null; // la personne a écrit pendant ce tour : son prochain échange repart de zéro
    s.chaineRemise = false;
  }
  const dest = destinationDe(x);
  if (!dest) return;
  let texte = textes.join('\n\n') || '(Elle n’a rien répondu par écrit : son tour s’est arrêté ou a échoué.)';
  if (texte.length > MAX_MESSAGE) texte = '…\n' + texte.slice(-MAX_MESSAGE);
  if (question) texte += '\n\n(Elle a posé une question à l’utilisateur : la suite de sa réponse te parviendra ensuite.)';
  repondre(dest.repondreA, dest.chaine, s, texte);
}

function finDeTour(s) {
  s.toursFinis = Math.min((s.toursFinis || 0) + 1, s.toursDemandes || 0);
  if (s.livraison && s.toursFinis >= s.livraison.numero) finDeLivraison(s);
  setTimeout(() => distribuer(s), 0); // après l'événement en cours : la session doit d'abord se voir libre
}

/**
 * Appelée par sessions.mjs au début de chaque événement d'une session. Un message remis s'affiche avec son origine
 * (et sans l'en-tête destiné à l'IA) ; la réponse est recueillie au fil de son tour (le journal, lui, est borné) et
 * renvoyée à l'envoyeuse à la fin de ce tour-là.
 */
export function suivreEvenement(s, e) {
  if (e.t === 'utilisateur') {
    s.toursDemandes = (s.toursDemandes || 0) + 1;
    if (s.prochainDe) {
      const x = s.prochainDe;
      s.prochainDe = null;
      e.texte = x.texte;
      if (x.de) e.de = { ...x.de, genre: x.genre };
    } else if (s.livraison) {
      s.chaineRemise = true;
    } else {
      s.chaine = null; // la personne écrit : nouvel échange, compteur remis à zéro
    }
    return;
  }
  if (e.t === 'assistant' && !e.sousAgent && s.livraison && (s.toursFinis || 0) === s.livraison.numero - 1) {
    const texte = (e.blocs || []).filter((b) => b.type === 'texte').map((b) => b.texte).join('\n');
    if (texte) s.livraison.textes.push(s.participants ? `[${e.auteur?.nom || 'IA'}] ${texte}` : texte);
    return;
  }
  // Limite atteinte : une autre IA va reprendre la même demande (relais.mjs). La fin de tour de celle qui s'arrête
  // ne compte pas ; celle de l'IA de relais, si. Sans IA de relais, le tour finit là.
  if (e.t === 'tour' && e.limite && !e.auteur) {
    s.relais = 'limite';
    return;
  }
  if (e.t === 'info' && e.code === 'relais_aucun') {
    s.relais = null;
    finDeTour(s);
    return;
  }
  if (e.t !== 'etat' || e.occupe !== false || e.auteur) return;
  if (s.relais === 'limite') {
    s.relais = 'en_cours';
    return;
  }
  s.relais = null;
  finDeTour(s);
}

/** Changement d'équipe : les tours de l'ancienne équipe ne finiront plus. */
export function remettreTours(s) {
  s.toursFinis = s.toursDemandes || 0;
  s.relais = null;
}

/** Fermeture : les envoyeuses qui attendaient une réponse sont prévenues, ses demandes à l'écran tombent. */
export function fermetureDe(s) {
  oublierDemandes(s.id);
  const note = `(La discussion « ${titreDe(s)} » a été fermée avant de répondre.)`;
  const enAttente = [...(s.livraison ? [s.livraison.x] : []), ...(s.fileDiscussions || [])];
  for (const x of enAttente) {
    const dest = destinationDe(x);
    if (dest) repondre(dest.repondreA, dest.chaine, s, note);
  }
  s.livraison = null;
  s.fileDiscussions = [];
}
