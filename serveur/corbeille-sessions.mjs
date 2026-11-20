// Corbeille des sessions (compte Claude du serveur, celui des « Sessions passées ») : une session mise à la
// corbeille est archivée par l'outil lui-même (elle reste sur le disque, masquée de la liste), récupérable
// pendant 30 jours, puis supprimée pour de bon. On ne touche pas soi-même aux fichiers de Claude Code (seule
// exception : « Ranger », que le SDK ne sait pas faire, voir deplacer-session.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { archiveSession, unarchiveSession, deleteSession } from '@anthropic-ai/claude-agent-sdk';
import { DOSSIER_CONFIG } from './securite.mjs';
import { DUREE_CORBEILLE } from './projets.mjs';

const FICHIER = path.join(DOSSIER_CONFIG, 'corbeille-sessions.json');
const ID = /^[0-9a-f-]{36}$/;

function lire() {
  try {
    const l = JSON.parse(readFileSync(FICHIER, 'utf8'));
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

function ecrire(liste) {
  mkdirSync(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  writeFileSync(FICHIER, JSON.stringify(liste, null, 2) + '\n', { mode: 0o600 });
}

function entree(id) {
  const e = lire().find((x) => x.id === id);
  if (!e) throw new Error('corbeille_inconnue');
  return e;
}

/** Met à la corbeille la session `id` (enregistrée par Claude Code) du projet `dossier`. */
export async function mettreSessionCorbeille({ id, dossier, projet, titre }) {
  if (!ID.test(String(id || ''))) throw new Error('session_inconnue');
  try {
    await archiveSession(id, { dir: dossier });
  } catch {
    throw new Error('session_inconnue');
  }
  ecrire([...lire().filter((x) => x.id !== id), { id, dossier, projet, titre: String(titre || '').slice(0, 120), supprimeLe: Date.now() }]);
}

export function listerSessionsCorbeille() {
  return lire()
    .map((e) => ({ id: e.id, projet: e.projet, titre: e.titre, supprimeLe: e.supprimeLe, effaceLe: e.supprimeLe + DUREE_CORBEILLE }))
    .sort((a, b) => b.supprimeLe - a.supprimeLe);
}

export async function restaurerSession(id) {
  const e = entree(id);
  await unarchiveSession(id, { dir: e.dossier }).catch(() => {});
  ecrire(lire().filter((x) => x.id !== id));
  return e.projet;
}

export async function effacerSession(id) {
  const e = entree(id);
  await deleteSession(id, { dir: e.dossier }).catch(() => {}); // déjà effacée : rien à faire
  ecrire(lire().filter((x) => x.id !== id));
}

/** Supprime pour de bon les sessions à la corbeille depuis plus de 30 jours. Rend leur nombre. */
export async function purgerSessions(maintenant = Date.now()) {
  let n = 0;
  for (const e of listerSessionsCorbeille()) {
    if (e.effaceLe > maintenant) continue;
    await effacerSession(e.id).then(() => n++, () => {});
  }
  return n;
}
