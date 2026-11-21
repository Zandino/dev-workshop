// Mémoire du serveur : de quoi ne pas lancer plus d'IA qu'il ne peut en porter, et arrêter le travail en cours
// avant que la machine ne se fige. Vécu le 21/11/2026 : quatre IA dans une discussion, plus les essais lancés par
// l'une d'elles, ont rempli les 6 Go du conteneur ; plus rien ne répondait, pas même SSH, et il a fallu forcer
// son arrêt depuis Proxmox.
// La mémoire est lue dans /proc/meminfo (vue du conteneur). Illisible (autre système) : rien n'est bloqué.
import { readFileSync } from 'node:fs';

const MO = 1024 * 1024;
/** Ce qu'une IA occupe en plus, en moyenne (relevé : Claude Code ~400 Mo, Codex ~150 Mo, Gemini CLI ~300 Mo). */
export const PAR_IA = 450 * MO;
/** Ce qu'on laisse toujours libre pour le système, le serveur et les commandes que les IA lancent. */
const RESERVE = 600 * MO;
/** Sous cette part de mémoire disponible, le travail en cours est arrêté ; au-dessus de la seconde, la veille se réarme. */
const CRITIQUE = 0.07;
const REARMEMENT = 0.15;

/** { disponible, total } en octets, ou null si on ne sait pas lire. Fichier remplaçable pour les essais. */
export function lireMemoire() {
  try {
    const texte = readFileSync(process.env.DEVWORKSHOP_MEMINFO || '/proc/meminfo', 'utf8');
    const ko = (cle) => Number(new RegExp(`^${cle}:\\s+(\\d+) kB`, 'm').exec(texte)?.[1]);
    const total = ko('MemTotal');
    const disponible = ko('MemAvailable');
    return total > 0 && disponible >= 0 ? { total: total * 1024, disponible: disponible * 1024 } : null;
  } catch {
    return null;
  }
}

/** Assez de place pour `n` IA de plus (et la réserve) ? Vrai si la mémoire est illisible. */
export function assezPour(n, enPlus = 0) {
  const m = lireMemoire();
  return !m || m.disponible >= RESERVE + n * PAR_IA + enPlus;
}

/** Refuse d'ouvrir `n` IA de plus quand la mémoire ne suffit pas (code court, affiché par l'écran). */
export function verifierPlace(n) {
  if (n > 0 && !assezPour(n)) throw new Error('memoire_insuffisante');
}

export const enMo = (octets) => Math.round(octets / MO);

/**
 * Veille : toutes les 5 s, si la mémoire disponible passe sous le seuil critique, `agir(m)` arrête ce qui
 * travaille. Une seule fois par alerte : la veille se réarme quand la mémoire est revenue.
 */
export function surveillerMemoire(agir, periodeMs = Number(process.env.DEVWORKSHOP_VEILLE_MEMOIRE_MS) || 5000) {
  let arme = true;
  const minuterie = setInterval(() => {
    const m = lireMemoire();
    if (!m) return;
    const part = m.disponible / m.total;
    if (arme && part < CRITIQUE) {
      arme = false;
      console.error(`[dev-workshop] mémoire presque pleine (${enMo(m.disponible)} Mo libres sur ${enMo(m.total)}) : arrêt du travail en cours`);
      try { agir(m); } catch (e) { console.error('[dev-workshop] veille mémoire :', e.message); }
    } else if (part > REARMEMENT) {
      arme = true;
    }
  }, periodeMs);
  minuterie.unref();
  return () => clearInterval(minuterie);
}
