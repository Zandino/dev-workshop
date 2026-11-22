// Sessions Claude Code « internes » : celles qu'ouvre Dev Workshop pour le Claude d'une discussion à plusieurs ou
// pour un sous-agent de l'orchestre. Claude Code les enregistre dans le dossier du projet comme n'importe quelle
// discussion ; sans ce registre, elles s'afficheraient dans la liste du projet comme des discussions à part (vécu le
// 22/11/2026 : « à chaque échange cela crée une conversation »), et les rouvrir ferait une copie sans suite.
// Une étiquette de Claude Code (tagSession) ne suffit pas : son SDK ne lit que le début et la fin d'un fichier,
// l'étiquette d'une longue session lui échappe. D'où ce registre, dans le dossier des réglages.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG } from './securite.mjs';

const FICHIER = path.join(DOSSIER_CONFIG, 'sessions-internes.json');
const MAX = 5000;
const ID = /^[0-9a-f-]{36}$/;
let ids = null;

function charger() {
  if (ids) return ids;
  try {
    const lu = JSON.parse(readFileSync(FICHIER, 'utf8'));
    ids = new Set(Array.isArray(lu) ? lu.filter((x) => ID.test(x)) : []);
  } catch {
    ids = new Set();
  }
  return ids;
}

export const estInterne = (id) => charger().has(id);

/** Note `id` comme interne (sans effet s'il l'est déjà). */
export function marquerInterne(id) {
  if (!ID.test(String(id)) || charger().has(id)) return;
  ids.add(id);
  const liste = [...ids].slice(-MAX);
  ids = new Set(liste);
  mkdirSync(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  writeFileSync(FICHIER, JSON.stringify(liste) + '\n', { mode: 0o600 });
}
