// Ordre choisi à la main dans la barre latérale : celui des projets, et celui des discussions de chaque projet.
// Rangé sur le serveur (ordre.json du dossier des réglages) pour que tous les écrans le voient. Ce qui n'y figure
// pas (projet créé depuis, nouvelle discussion) vient après, dans l'ordre habituel.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG } from './securite.mjs';
import { NOM_PROJET } from './projets.mjs';

const FICHIER = path.join(DOSSIER_CONFIG, 'ordre.json');
const MAX = 500;
const CLE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/; // id de discussion (Claude Code, ou de Dev Workshop)

export function lireOrdre() {
  try {
    const d = JSON.parse(readFileSync(FICHIER, 'utf8'));
    return {
      projets: Array.isArray(d.projets) ? d.projets.filter((p) => typeof p === 'string') : [],
      discussions: d.discussions && typeof d.discussions === 'object' ? d.discussions : {},
    };
  } catch {
    return { projets: [], discussions: {} };
  }
}

function ecrire(d) {
  mkdirSync(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  writeFileSync(FICHIER, JSON.stringify(d, null, 2) + '\n', { mode: 0o600 });
}

/** Les noms dans l'ordre choisi, les autres ensuite (dans leur ordre d'arrivée). */
export function trier(noms, ordre) {
  const rang = new Map(ordre.map((n, i) => [n, i]));
  return [...noms].sort((a, b) => (rang.get(a) ?? Infinity) - (rang.get(b) ?? Infinity));
}

/** Liste complète des projets, dans l'ordre voulu. */
export function definirOrdreProjets(liste) {
  if (!Array.isArray(liste)) throw new Error('ordre_invalide');
  const propre = [...new Set(liste.map(String))].filter((p) => NOM_PROJET.test(p)).slice(0, MAX);
  ecrire({ ...lireOrdre(), projets: propre });
}

/** Discussions d'un projet, dans l'ordre voulu (clés : la discussion Claude Code d'origine, sinon l'id de Dev Workshop). */
export function definirOrdreDiscussions(projet, liste) {
  if (!NOM_PROJET.test(String(projet)) || !Array.isArray(liste)) throw new Error('ordre_invalide');
  const propre = [...new Set(liste.map(String))].filter((x) => CLE.test(x)).slice(0, MAX);
  const d = lireOrdre();
  ecrire({ ...d, discussions: { ...d.discussions, [projet]: propre } });
}
