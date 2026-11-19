// Les règles de ~/.claude/CLAUDE.md valent pour TOUTES les IA pilotées d'ici, quel que soit le compte.
// Les autres comptes et les autres outils ne les chargent pas d'eux-mêmes : on les leur transmet.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function reglesCommunes() {
  try {
    return readFileSync(path.join(homedir(), '.claude', 'CLAUDE.md'), 'utf8').trim();
  } catch {
    return '';
  }
}

/** Règles + consigne éventuelle (rôle dans une discussion à plusieurs), en un seul texte. */
export function consigneComplete(consigne) {
  return [reglesCommunes(), consigne || ''].filter(Boolean).join('\n\n');
}
