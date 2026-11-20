// Sessions vivantes : une session continue de tourner si l'onglet se ferme, et se rejoue à la reconnexion.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fournisseurDe } from './fournisseurs/index.mjs';
import { ouvrirSalon } from './salon.mjs';
import { RACINE_PROJETS } from './securite.mjs';
import { ouvrirOrchestre } from './orchestre.mjs';
import { piloteAvecRelais } from './relais.mjs';
import { ecrireSession, oublierSession, listerInterrompues } from './sauvegarde-sessions.mjs';

const MAX_JOURNAL = 4000;
const MAX_SESSIONS = 8;
const MAX_PILOTES = 12; // chaque participant Claude est un processus : on borne le total
const sessions = new Map();

// Les sessions qui ont bougé sont écrites sur le disque toutes les 5 secondes (voir sauvegarde-sessions.mjs).
function sauver() {
  for (const s of sessions.values()) {
    if (!s.aSauver) continue;
    s.aSauver = false;
    try { ecrireSession(s); } catch (e) { console.error('[dev-workshop] sauvegarde de session impossible :', e.message); }
  }
}
setInterval(sauver, 5000).unref();

/** Sessions sauvegardées qui ne tournent plus (serveur redémarré entre-temps). */
export const interrompues = () => listerInterrompues(new Set(sessions.keys()));

function resume(s) {
  return {
    id: s.id,
    compte: s.compte,
    participants: s.participants,
    projet: path.relative(RACINE_PROJETS, s.dossier) || '.',
    titre: s.titre,
    orchestre: Boolean(s.orchestre),
    occupe: s.etat.occupe,
    sessionId: s.etat.sessionId || null, // discussion enregistrée par Claude Code (compte du serveur)
    attente: s.attente.size > 0,
    creeLe: s.creeLe,
  };
}

export function listerVivantes() {
  return [...sessions.values()].filter((s) => !s.etat.ferme).map(resume);
}

/**
 * Ouvre une session : un seul compte, ou un salon quand `participants` en nomme plusieurs
 * ([{ compte, modele, nom, externe }], comptes déjà résolus par l'appelant).
 */
export async function ouvrirSession({ compte, participants, dossier, modele, mode, reprise, titre, echanges, orchestre, effort, journalInitial, consigneReprise }) {
  if (listerVivantes().length >= MAX_SESSIONS) throw new Error('trop_de_sessions');
  const salon = Array.isArray(participants) && participants.length > 1;
  const pilotes = listerVivantes().reduce((n, x) => n + (x.participants?.length || 1), 0);
  if (pilotes + (salon ? participants.length : 1) > MAX_PILOTES) throw new Error('trop_de_sessions');
  const f = salon ? null : fournisseurDe(compte);
  const s = {
    id: randomUUID(),
    compte: salon ? null : compte.id,
    // Une API sans outils ne lit pas les fichiers joints : on lui en donne le contenu (voir fichiers.mjs).
    avecOutils: salon || compte.type !== 'api',
    participants: salon ? participants.map((p) => p.nom) : null,
    participantsComplets: salon ? participants.map((p) => ({ compte: p.compte.id, modele: p.modele || null, nom: p.nom })) : null,
    dossier,
    titre: titre || '',
    creeLe: Date.now(),
    journal: [],
    abonnes: new Set(),
    attente: new Set(),
    etat: { occupe: false, ferme: false, modele: modele || 'default', mode: mode || 'default', effort: effort || 'default', sessionId: reprise || null },
  };

  const emettre = (e) => {
    if (e.t === 'etat') Object.assign(s.etat, { ...e, t: undefined });
    if (e.t === 'pret') Object.assign(s.etat, { sessionId: e.sessionId || s.etat.sessionId, mode: e.mode });
    if (e.t === 'permission') s.attente.add(e.id);
    if (e.t === 'permission_fin') s.attente.delete(e.id);
    if (e.t === 'utilisateur' && !s.titre) s.titre = e.texte.slice(0, 80);
    // Les fragments en direct ne servent plus une fois le message complet reçu.
    if (e.t === 'assistant' && !e.sousAgent) s.journal = s.journal.filter((x) => x.t !== 'delta');
    // L'heure de chaque événement : à ton retour, l'écran résume ce qui s'est passé pendant ton absence.
    e.le = Date.now();
    s.journal.push(e);
    s.aSauver = true;
    if (s.journal.length > MAX_JOURNAL) s.journal.splice(0, s.journal.length - MAX_JOURNAL);
    for (const envoyer of s.abonnes) envoyer({ ...e, session: s.id });
  };

  // Session reprise après un redémarrage : son historique s'affiche comme avant.
  if (Array.isArray(journalInitial)) s.journal.push(...journalInitial);
  if (salon) {
    s.pilote = ouvrirSalon({ participants, dossier, mode, echanges }, emettre);
  } else if (orchestre) {
    // La cheffe est toujours un compte Claude : l'outil « deleguer » est propre à Claude Code.
    if (compte.type !== 'claude') throw new Error('orchestre_claude');
    s.orchestre = true;
    s.pilote = ouvrirOrchestre({ compte, dossier, modele, mode, effort }, emettre);
  } else {
    if (reprise && f.lireHistorique) {
      try {
        for (const e of await f.lireHistorique(dossier, reprise)) s.journal.push(e);
      } catch { /* historique illisible : la reprise reste possible */ }
    }
    // Si l'IA atteint sa limite en cours de route, une autre IA connectée prend le relais (voir relais.mjs).
    s.pilote = piloteAvecRelais({ s, compte, dossier, modele, mode, reprise, effort, consigneReprise }, emettre);
  }
  sessions.set(s.id, s);
  return s;
}

export function session(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('session_inconnue');
  return s;
}

/**
 * Abonne une connexion : rejoue le journal puis suit le direct. `absentDepuis` : depuis quand plus personne ne
 * regardait la session (null si quelqu'un la suivait), pour le résumé « pendant ton absence ».
 */
export function attacher(id, envoyer) {
  const s = session(id);
  envoyer({ t: 'rejouer', session: s.id, resume: resume(s), etat: s.etat, evenements: s.journal, absentDepuis: s.abonnes.size ? null : s.absentDepuis || null });
  s.abonnes.add(envoyer);
  return () => {
    s.abonnes.delete(envoyer);
    if (!s.abonnes.size) s.absentDepuis = Date.now();
  };
}

/** `oublier` : la personne ferme la session (sa sauvegarde est effacée) ; sinon, arrêt du serveur (gardée). */
export function fermerSession(id, { oublier = true } = {}) {
  const s = sessions.get(id);
  if (!s) return;
  s.pilote.fermer();
  s.etat.ferme = true;
  sessions.delete(id);
  if (oublier) oublierSession(id);
}

/** Arrêt du serveur : on écrit une dernière fois chaque session, pour la retrouver « interrompue » au démarrage. */
export function fermerTout() {
  for (const s of sessions.values()) s.aSauver = true;
  sauver();
  for (const id of [...sessions.keys()]) fermerSession(id, { oublier: false });
}
