// Sessions qui survivent à un redémarrage du serveur : chaque session ouverte est écrite sur le disque quand elle
// a bougé. Au démarrage suivant, celles qui n'avaient pas été fermées sont « interrompues » : on les reprend en un
// clic, avec leur historique. Fermer une session efface sa sauvegarde ; arrêter le serveur la garde.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG, RACINE_PROJETS } from './securite.mjs';

const DOSSIER = path.join(DOSSIER_CONFIG, 'sessions');
const ID = /^[0-9a-f-]{36}$/;
const MAX_EVENEMENTS = 1500;

const fichier = (id) => path.join(DOSSIER, `${id}.json`);

export function ecrireSession(s) {
  mkdirSync(DOSSIER, { recursive: true, mode: 0o700 });
  const { modele, mode, effort, sessionId } = s.etat;
  const donnees = {
    id: s.id, compte: s.compte, participants: s.participantsComplets || null, orchestre: Boolean(s.orchestre),
    dossier: s.dossier, titre: s.titre, creeLe: s.creeLe, etat: { modele, mode, effort, sessionId },
    journal: s.journal.filter((e) => e.t !== 'delta').slice(-MAX_EVENEMENTS),
  };
  writeFileSync(fichier(s.id), JSON.stringify(donnees), { mode: 0o600 });
}

export function oublierSession(id) {
  if (ID.test(String(id))) rmSync(fichier(id), { force: true });
}

export function chargerInterrompue(id) {
  if (!ID.test(String(id))) throw new Error('session_inconnue');
  try {
    return JSON.parse(readFileSync(fichier(id), 'utf8'));
  } catch {
    throw new Error('session_inconnue');
  }
}

/** Sessions sauvegardées qui ne tournent plus (`vivantes` : identifiants des sessions en cours). */
export function listerInterrompues(vivantes) {
  let noms = [];
  try {
    noms = readdirSync(DOSSIER).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const liste = [];
  for (const n of noms) {
    const id = n.slice(0, -5);
    if (vivantes.has(id) || !ID.test(id)) continue;
    try {
      const d = JSON.parse(readFileSync(path.join(DOSSIER, n), 'utf8'));
      liste.push({
        id, titre: d.titre || '', projet: path.relative(RACINE_PROJETS, d.dossier) || '.',
        compte: d.compte, salon: Boolean(d.participants), orchestre: d.orchestre, le: statSync(path.join(DOSSIER, n)).mtimeMs,
      });
    } catch { /* sauvegarde abîmée : ignorée */ }
  }
  return liste.sort((a, b) => b.le - a.le);
}
