// Sessions vivantes : une session continue de tourner si l'onglet se ferme, et se rejoue à la reconnexion.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fournisseurDe } from './fournisseurs/index.mjs';
import { ouvrirSalon } from './salon.mjs';
import { RACINE_PROJETS } from './securite.mjs';
import { ouvrirOrchestre } from './orchestre.mjs';
import { piloteAvecRelais, consigneRelais, nomCompte } from './relais.mjs';
import { compte } from './comptes.mjs';
import { ecrireSession, oublierSession, listerInterrompues } from './sauvegarde-sessions.mjs';
import { alerteDe, changeLaBarre, signaler } from './veille.mjs';
import { verifierPlace, surveillerMemoire, enMo, tuerLesPlusGros, aLibererPour } from './memoire.mjs';
import { libererDictee } from './dictee.mjs';
import { brancherDiscussions, suivreEvenement, oublierJetons } from './entre-discussions.mjs';

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

// Mémoire presque pleine : on arrête ce qui travaille (et la dictée libère son modèle) avant que le serveur ne se
// fige ; chaque discussion touchée le dit dans son fil et prévient l'écran (voir memoire.mjs).
surveillerMemoire((m) => {
  libererDictee();
  // Arrêter le tour des IA ne suffit pas : ce qu'elles ont lancé (compilations, essais) continuerait.
  const tues = tuerLesPlusGros(aLibererPour(m));
  if (tues.length) console.error('[dev-workshop] programmes arrêtés :', tues.map((x) => `${x.nom} (${x.mo} Mo)`).join(', '));
  const programmes = tues.map((x) => `${x.nom} (${x.mo} Mo)`).join(', ');
  for (const s of sessions.values()) {
    if (!s.etat.occupe || s.etat.ferme) continue;
    s.pilote.interrompre().catch(() => {});
    s.emettre({ t: 'info', code: programmes ? 'memoire_pleine_programmes' : 'memoire_pleine', libre: enMo(m.disponible), total: enMo(m.total), programmes });
    signaler({ id: s.id, projet: projetDe(s), titre: s.titre, compte: s.compte, genre: 'memoire', auteur: null, outil: null, message: `${enMo(m.disponible)} Mo libres sur ${enMo(m.total)}` });
  }
});

/** Sessions sauvegardées qui ne tournent plus (serveur redémarré entre-temps). */
export const interrompues = () => listerInterrompues(new Set(sessions.keys()));

const projetDe = (s) => path.relative(RACINE_PROJETS, s.dossier) || '.';

function resume(s) {
  return {
    id: s.id,
    compte: s.compte,
    participants: s.participants,
    projet: projetDe(s),
    titre: s.titre,
    orchestre: Boolean(s.orchestre),
    occupe: s.etat.occupe,
    sessionId: s.etat.sessionId || null, // discussion enregistrée par Claude Code (compte du serveur)
    attente: s.attente.size > 0,
    nonLu: s.nonLu || null, // 'fini' ou 'echec' : tour terminé pendant que personne ne regardait (veille.mjs)
    origine: s.origine || null,
    equipe: s.participantsComplets, // à plusieurs : comptes, modèles et noms, pour modifier l'équipe à l'écran
    echanges: s.echanges || null,
    creeLe: s.creeLe,
  };
}

const rejouer = (s, absentDepuis) => ({ t: 'rejouer', session: s.id, resume: resume(s), etat: s.etat, evenements: s.journal, absentDepuis });

/** Les écrans qui suivent `s` la reçoivent de nouveau en entier (équipe ou projet changé). */
export function rejouerAuxAbonnes(s) {
  for (const envoyer of s.abonnes) envoyer(rejouer(s, null));
}

/** L'émetteur de l'équipe en place : quand l'équipe change (changerEquipe), l'ancienne ne parle plus ici. */
export function emetteurDe(s) {
  const g = s.generation;
  return (e) => {
    if (s.generation === g) s.emettre(e);
  };
}

export function listerVivantes() {
  return [...sessions.values()].filter((s) => !s.etat.ferme).map(resume);
}

/**
 * Ouvre une session : un seul compte, ou un salon quand `participants` en nomme plusieurs
 * ([{ compte, modele, nom, externe }], comptes déjà résolus par l'appelant).
 */
export async function ouvrirSession({ compte, participants, dossier, modele, mode, reprise, titre, echanges, orchestre, effort, journalInitial, consigneReprise, equipeChangee, origine }) {
  if (listerVivantes().length >= MAX_SESSIONS) throw new Error('trop_de_sessions');
  const salon = Array.isArray(participants) && participants.length > 1;
  const pilotes = listerVivantes().reduce((n, x) => n + (x.participants?.length || 1), 0);
  if (pilotes + (salon ? participants.length : 1) > MAX_PILOTES) throw new Error('trop_de_sessions');
  verifierPlace(salon ? participants.length : 1);
  const f = salon ? null : fournisseurDe(compte);
  const s = {
    id: randomUUID(),
    compte: salon ? null : compte.id,
    // Une API sans outils ne lit pas les fichiers joints : on lui en donne le contenu (voir fichiers.mjs).
    avecOutils: salon || compte.type !== 'api',
    participants: salon ? participants.map((p) => p.nom) : null,
    participantsComplets: salon ? participants.map((p) => ({ compte: p.compte.id, modele: p.modele || null, nom: p.nom })) : null,
    echanges: salon ? echanges : null,
    generation: 0,
    dossier,
    titre: titre || '',
    creeLe: Date.now(),
    journal: [],
    abonnes: new Set(),
    attente: new Set(),
    etat: { occupe: false, ferme: false, modele: modele || 'default', mode: mode || 'default', effort: effort || 'default', sessionId: reprise || null },
    equipeChangee: Boolean(equipeChangee), // voir changerEquipe : la session Claude Code ne porte pas tout
    // La discussion Claude Code dont celle-ci est partie : elle la suit à travers les changements d'équipe et les
    // redémarrages, pour que la rouvrir depuis la liste du projet reprenne cette copie au lieu d'en créer une autre.
    origine: origine || reprise || null,
  };

  s.emettre = (e) => {
    suivreEvenement(s, e); // messages entre discussions (entre-discussions.mjs)
    if (e.t === 'etat') Object.assign(s.etat, { ...e, t: undefined });
    if (e.t === 'pret') Object.assign(s.etat, { sessionId: e.sessionId || s.etat.sessionId, mode: e.mode });
    if (e.t === 'permission') s.attente.add(e.id);
    if (e.t === 'permission_fin') s.attente.delete(e.id);
    if (e.t === 'utilisateur' && !s.titre && !e.de) s.titre = e.texte.slice(0, 80);
    // Les fragments en direct ne servent plus une fois le message complet reçu.
    if (e.t === 'assistant' && !e.sousAgent) s.journal = s.journal.filter((x) => x.t !== 'delta');
    // L'heure de chaque événement : à ton retour, l'écran résume ce qui s'est passé pendant ton absence.
    e.le = Date.now();
    s.journal.push(e);
    s.aSauver = true;
    if (s.journal.length > MAX_JOURNAL) s.journal.splice(0, s.journal.length - MAX_JOURNAL);
    for (const envoyer of s.abonnes) envoyer({ ...e, session: s.id });
    const alerte = alerteDe(s, e, projetDe(s));
    if (alerte || changeLaBarre(e)) signaler(alerte);
  };

  const emettre = emetteurDe(s);
  // Session reprise après un redémarrage : son historique s'affiche comme avant.
  if (Array.isArray(journalInitial)) s.journal.push(...journalInitial);
  if (salon) {
    s.pilote = ouvrirSalon({ session: s.id, participants, dossier, mode, echanges, histoire: consigneReprise }, emettre);
  } else if (orchestre) {
    // La cheffe est toujours un compte Claude : l'outil « deleguer » est propre à Claude Code.
    if (compte.type !== 'claude') throw new Error('orchestre_claude');
    s.orchestre = true;
    // Reprise : la cheffe reprend sa session Claude Code ; sinon l'historique éventuel lui est donné en consigne.
    s.pilote = ouvrirOrchestre({ session: s.id, compte, dossier, modele, mode, effort, reprise, histoire: reprise ? null : consigneReprise }, emettre);
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
  signaler();
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
  envoyer(rejouer(s, s.abonnes.size ? null : s.absentDepuis || null));
  s.abonnes.add(envoyer);
  if (s.nonLu) {
    s.nonLu = null; // quelqu'un la regarde : elle est lue
    signaler();
  }
  return () => {
    s.abonnes.delete(envoyer);
    if (!s.abonnes.size) s.absentDepuis = Date.now();
  };
}

const nomDe = (id) => {
  try {
    return nomCompte(compte(id));
  } catch {
    return String(id); // compte supprimé depuis
  }
};
// Pour l'historique donné à la nouvelle équipe ; l'écran, lui, compose sa note (« equipe » ou « equipe_orchestre »).
const equipeDe = (s) => (s.participants ? s.participants.join(', ') : nomDe(s.compte) + (s.orchestre ? ' (chef d’orchestre : il répond seul et confie des tâches aux autres IA)' : ''));

/**
 * Change l'équipe d'une discussion ouverte, sans en ouvrir une autre : une IA (`{ compte }`), plusieurs
 * (`{ participants, echanges }`, comptes déjà résolus comme pour ouvrirSession) ou l'orchestre (`{ orchestre:
 * compte }`). La nouvelle équipe reçoit l'historique en consigne ; l'ancienne est fermée et ne parle plus ici. Les
 * écrans qui suivent la discussion la reçoivent rejouée : compte, participants et réglages y changent.
 * `ailleurs` : la même équipe repart dans un autre dossier de projet (discussion rangée, demenager-session.mjs) ;
 * `note`, l'information mise dans le fil.
 */
export function changerEquipe(id, equipe, { ailleurs = null, note = null } = {}) {
  const s = session(id);
  if (s.etat.occupe) throw new Error('changement_occupe');
  const salon = Array.isArray(equipe.participants) && equipe.participants.length > 1;
  const autres = listerVivantes().filter((x) => x.id !== s.id).reduce((n, x) => n + (x.participants?.length || 1), 0);
  if (autres + (salon ? equipe.participants.length : 1) > MAX_PILOTES) throw new Error('trop_de_sessions');
  // L'ancienne équipe libère sa place : seules les IA en plus doivent tenir en mémoire.
  verifierPlace((salon ? equipe.participants.length : 1) - (s.participants?.length || 1));
  const c = salon ? null : equipe.orchestre || equipe.compte;
  // La cheffe est toujours un compte Claude : l'outil « deleguer » est propre à Claude Code.
  if (equipe.orchestre && c.type !== 'claude') throw new Error('orchestre_claude');

  const dossier = ailleurs || s.dossier;
  const { mode, effort, sessionId } = s.etat;
  // Le Claude du serveur, seul, qui devient cheffe d'orchestre reprend sa propre session Claude Code : il garde
  // tout le contexte, au lieu de l'historique borné que reçoit une nouvelle équipe.
  const memeClaude = !ailleurs && Boolean(equipe.orchestre) && !s.participants && !s.orchestre && s.compte === c.id && Boolean(sessionId);
  const histoire = memeClaude ? null : ailleurs
    ? consigneRelais(`${projetDe(s)} → ${path.relative(RACINE_PROJETS, ailleurs)}`, s.journal, 'dossier')
    : consigneRelais(equipeDe(s), s.journal, 'equipe');

  // La nouvelle équipe parle dès sa création (« pret »…) : ses événements attendent qu'elle soit en place, et
  // ceux de l'ancienne (sa fermeture comprise) ne passent plus une fois la génération changée.
  const g = s.generation + 1;
  const enAttente = [];
  let enPlace = false;
  const emettre = (e) => {
    if (!enPlace) enAttente.push(e);
    else if (s.generation === g) s.emettre(e);
  };
  const ancien = s.pilote;
  const ouvrir = () => {
    if (salon) return ouvrirSalon({ session: s.id, participants: equipe.participants, dossier, mode, echanges: equipe.echanges, histoire }, emettre);
    if (equipe.orchestre) return ouvrirOrchestre({ session: s.id, compte: c, dossier, mode, effort, histoire, reprise: memeClaude ? sessionId : undefined }, emettre);
    return piloteAvecRelais({ s, compte: c, dossier, mode, effort, consigneReprise: histoire }, emettre);
  };
  let pilote;
  if (memeClaude) {
    // Une session Claude Code ne se reprend pas à deux : l'ancien pilote part avant ; en cas d'échec, il revient.
    s.generation = g;
    ancien.fermer();
    try {
      pilote = ouvrir();
    } catch (e) {
      s.pilote = piloteAvecRelais({ s, compte: c, dossier, mode, effort, reprise: sessionId }, emetteurDe(s));
      throw e;
    }
  } else {
    pilote = ouvrir(); // en cas d'échec, l'équipe en place continue, intacte
    s.generation = g;
    ancien.fermer();
    // La session Claude Code d'avant ne contient pas la suite : au redémarrage, on repartira du journal.
    s.equipeChangee = true;
  }

  s.pilote = pilote;
  s.dossier = dossier;
  Object.assign(s.etat, { sessionId: memeClaude ? sessionId : null, modele: 'default' });
  if (salon) {
    Object.assign(s, {
      compte: null, orchestre: false, avecOutils: true, echanges: equipe.echanges,
      participants: equipe.participants.map((p) => p.nom),
      participantsComplets: equipe.participants.map((p) => ({ compte: p.compte.id, modele: p.modele || null, nom: p.nom })),
    });
  } else {
    Object.assign(s, { compte: c.id, orchestre: Boolean(equipe.orchestre), avecOutils: c.type !== 'api', participants: null, participantsComplets: null, echanges: null });
  }
  s.attente.clear(); // les demandes d'accord de l'ancienne équipe ne valent plus
  s.emettre(note || { t: 'info', code: s.orchestre ? 'equipe_orchestre' : 'equipe', qui: s.participants ? s.participants.join(', ') : nomDe(s.compte) });
  enPlace = true;
  for (const e of enAttente.splice(0)) emettre(e);
  for (const envoyer of s.abonnes) envoyer(rejouer(s, null));
  signaler();
  return s;
}

// Les outils des IA entre discussions voient les sessions ouvertes par ici.
brancherDiscussions({ session: (id) => sessions.get(id) || null, toutes: () => [...sessions.values()], projetDe, equipeDe });

/** Nouveau titre d'une discussion ouverte (déjà vérifié par l'appelant) : barre, alertes et sauvegarde suivent. */
export function renommerSession(id, titre) {
  const s = session(id);
  s.titre = titre;
  s.aSauver = true;
  signaler();
  return s;
}

/** `oublier` : la personne ferme la session (sa sauvegarde est effacée) ; sinon, arrêt du serveur (gardée). */
export function fermerSession(id, { oublier = true } = {}) {
  const s = sessions.get(id);
  if (!s) return;
  s.pilote.fermer();
  s.etat.ferme = true;
  sessions.delete(id);
  oublierJetons(id);
  if (oublier) oublierSession(id);
  signaler();
}

/** Arrêt du serveur : on écrit une dernière fois chaque session, pour la retrouver « interrompue » au démarrage. */
export function fermerTout() {
  for (const s of sessions.values()) s.aSauver = true;
  sauver();
  for (const id of [...sessions.keys()]) fermerSession(id, { oublier: false });
}
