// Mémoire du serveur : de quoi ne pas lancer plus d'IA qu'il ne peut en porter, et arrêter le travail en cours
// avant que la machine ne se fige. Vécu le 21/11/2026 : quatre IA dans une discussion, plus les essais lancés par
// l'une d'elles, ont rempli les 6 Go du conteneur ; plus rien ne répondait, pas même SSH, et il a fallu forcer
// son arrêt depuis Proxmox.
// La mémoire est lue dans /proc/meminfo (vue du conteneur). Illisible (autre système) : rien n'est bloqué.
import { readFileSync, readdirSync } from 'node:fs';

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

/** Donnée aux IA qui travaillent à plusieurs (salon, sous-agents de l'orchestre) : la mémoire se partage. */
export const REGLE_MEMOIRE = "La mémoire du serveur est partagée et limitée : une seule commande lourde à la fois (installation de dépendances, vérification de types ou compilation de tout le projet, suite complète de tests). Ne donne jamais plus de 1,5 Go à Node (--max-old-space-size=1536 au plus) et préfère vérifier seulement les fichiers que tu touches.";

/** Les processus Linux : pid → { ppid, nom, octets } (mémoire résidente). Vide ailleurs que sous Linux. */
function processus() {
  const liste = new Map();
  let dossiers = [];
  try { dossiers = readdirSync('/proc').filter((d) => /^\d+$/.test(d)); } catch { return liste; }
  for (const pid of dossiers) {
    try {
      const statut = readFileSync(`/proc/${pid}/status`, 'utf8');
      const champ = (cle) => new RegExp(`^${cle}:\\s+(.+)$`, 'm').exec(statut)?.[1] || '';
      liste.set(Number(pid), { ppid: Number(champ('PPid')), nom: champ('Name'), octets: (parseInt(champ('VmRSS'), 10) || 0) * 1024 });
    } catch { /* processus disparu entre-temps */ }
  }
  return liste;
}

/**
 * Tue les plus gros programmes lancés par les IA (compilations, essais, installations…), du plus gros au plus
 * petit, jusqu'à libérer `aLiberer` octets. Ne touche ni au serveur ni aux IA elles-mêmes (ses enfants directs) :
 * seulement à ce qu'elles ont lancé. Vécu le 21/11/2026 : arrêter le tour des IA ne suffisait pas, deux
 * vérifications TypeScript lancées par elles ont continué jusqu'à figer le serveur. Rend ce qui a été tué.
 */
export function tuerLesPlusGros(aLiberer, racine = process.pid) {
  const tous = processus();
  const enfants = new Map();
  for (const [pid, p] of tous) {
    if (!enfants.has(p.ppid)) enfants.set(p.ppid, []);
    enfants.get(p.ppid).push(pid);
  }
  const lances = []; // descendants à partir des petits-enfants du serveur
  const parcourir = (pid, profondeur) => {
    for (const e of enfants.get(pid) || []) {
      if (profondeur >= 1) lances.push(e);
      parcourir(e, profondeur + 1);
    }
  };
  parcourir(racine, 0);
  const tues = [];
  let libere = 0;
  for (const pid of lances.sort((a, b) => tous.get(b).octets - tous.get(a).octets)) {
    if (libere >= aLiberer) break;
    const p = tous.get(pid);
    if (p.octets < 20 * MO) break; // le reste est négligeable
    try {
      process.kill(pid, 'SIGKILL');
      tues.push({ pid, nom: p.nom, mo: enMo(p.octets) });
      libere += p.octets;
    } catch { /* déjà parti */ }
  }
  return tues;
}

/** Ce qu'il faut libérer pour revenir au-dessus du seuil de réarmement. */
export const aLibererPour = (m) => Math.max(0, m.total * REARMEMENT - m.disponible);

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
