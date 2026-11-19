// Sessions vivantes : une session continue de tourner si l'onglet se ferme, et se rejoue à la reconnexion.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fournisseurDe } from './fournisseurs/index.mjs';
import { ouvrirSalon } from './salon.mjs';
import { RACINE_PROJETS } from './securite.mjs';

const MAX_JOURNAL = 4000;
const MAX_SESSIONS = 8;
const MAX_PILOTES = 12; // chaque participant Claude est un processus : on borne le total
const sessions = new Map();

function resume(s) {
  return {
    id: s.id,
    compte: s.compte,
    participants: s.participants,
    projet: path.relative(RACINE_PROJETS, s.dossier) || '.',
    titre: s.titre,
    occupe: s.etat.occupe,
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
export async function ouvrirSession({ compte, participants, dossier, modele, mode, reprise, titre, echanges }) {
  if (listerVivantes().length >= MAX_SESSIONS) throw new Error('trop_de_sessions');
  const salon = Array.isArray(participants) && participants.length > 1;
  const pilotes = listerVivantes().reduce((n, x) => n + (x.participants?.length || 1), 0);
  if (pilotes + (salon ? participants.length : 1) > MAX_PILOTES) throw new Error('trop_de_sessions');
  const f = salon ? null : fournisseurDe(compte);
  const s = {
    id: randomUUID(),
    compte: salon ? null : compte.id,
    participants: salon ? participants.map((p) => p.nom) : null,
    dossier,
    titre: titre || '',
    creeLe: Date.now(),
    journal: [],
    abonnes: new Set(),
    attente: new Set(),
    etat: { occupe: false, ferme: false, modele: modele || 'default', mode: mode || 'default', sessionId: reprise || null },
  };

  const emettre = (e) => {
    if (e.t === 'etat') Object.assign(s.etat, { ...e, t: undefined });
    if (e.t === 'pret') Object.assign(s.etat, { sessionId: e.sessionId || s.etat.sessionId, mode: e.mode });
    if (e.t === 'permission') s.attente.add(e.id);
    if (e.t === 'permission_fin') s.attente.delete(e.id);
    if (e.t === 'utilisateur' && !s.titre) s.titre = e.texte.slice(0, 80);
    // Les fragments en direct ne servent plus une fois le message complet reçu.
    if (e.t === 'assistant' && !e.sousAgent) s.journal = s.journal.filter((x) => x.t !== 'delta');
    s.journal.push(e);
    if (s.journal.length > MAX_JOURNAL) s.journal.splice(0, s.journal.length - MAX_JOURNAL);
    for (const envoyer of s.abonnes) envoyer({ ...e, session: s.id });
  };

  if (salon) {
    s.pilote = ouvrirSalon({ participants, dossier, mode, echanges }, emettre);
  } else {
    if (reprise && f.lireHistorique) {
      try {
        for (const e of await f.lireHistorique(dossier, reprise)) s.journal.push(e);
      } catch { /* historique illisible : la reprise reste possible */ }
    }
    s.pilote = f.ouvrir({ compte, dossier, modele, mode, reprise }, emettre);
  }
  sessions.set(s.id, s);
  return s;
}

export function session(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('session_inconnue');
  return s;
}

/** Abonne une connexion : rejoue le journal puis suit le direct. */
export function attacher(id, envoyer) {
  const s = session(id);
  envoyer({ t: 'rejouer', session: s.id, resume: resume(s), etat: s.etat, evenements: s.journal });
  s.abonnes.add(envoyer);
  return () => s.abonnes.delete(envoyer);
}

export function fermerSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  s.pilote.fermer();
  s.etat.ferme = true;
  sessions.delete(id);
}

export function fermerTout() {
  for (const id of [...sessions.keys()]) fermerSession(id);
}
