// Déplacer une discussion (session Claude du compte du serveur) d'un projet à un autre.
// Le SDK de Claude Code ne sait pas le faire : c'est le seul endroit où Dev Workshop écrit lui-même dans les
// fichiers de Claude Code. Il copie la discussion (et son dossier voisin : sous-agents, résultats d'outils) dans
// le dossier de Claude du projet d'arrivée, en y remplaçant le dossier de travail (« cwd »). L'original n'est
// retiré, par le SDK, qu'une fois la copie reconnue par Claude Code dans le nouveau projet.
import { createReadStream, createWriteStream, existsSync, cpSync, renameSync, rmSync, statSync, utimesSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import readline from 'node:readline';
import path from 'node:path';
import { homedir } from 'node:os';
import { getSessionInfo, deleteSession } from '@anthropic-ai/claude-agent-sdk';

const ID = /^[0-9a-f-]{36}$/;
const racineClaude = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), 'projects');
// Nom du dossier où Claude Code range les sessions d'un dossier de travail : tout caractère autre qu'une lettre
// ou un chiffre devient « - ». Au-delà de 200 caractères, Claude Code raccourcit le nom : on refuse alors.
const encoder = (dossier) => dossier.replace(/[^a-zA-Z0-9]/g, '-');

/** Recopie le fichier ligne à ligne (il peut peser des centaines de Mo) en changeant le dossier de travail. */
async function recopier(de, vers, ancien, nouveau) {
  const sortie = createWriteStream(vers, { mode: 0o600 });
  const lignes = readline.createInterface({ input: createReadStream(de), crlfDelay: Infinity });
  for await (const ligne of lignes) {
    let texte = ligne;
    if (ligne.includes('"cwd"')) {
      try {
        const o = JSON.parse(ligne);
        if (typeof o.cwd === 'string' && (o.cwd === ancien || o.cwd.startsWith(ancien + '/'))) {
          o.cwd = nouveau + o.cwd.slice(ancien.length);
          texte = JSON.stringify(o);
        }
      } catch { /* ligne illisible : recopiée telle quelle */ }
    }
    if (!sortie.write(texte + '\n')) await once(sortie, 'drain');
  }
  sortie.end();
  await once(sortie, 'finish');
}

// Discussions en cours de rangement : un second ordre pour la même (double clic sur une grosse discussion) est
// refusé, et elle ne peut pas être rouverte tant que la copie n'est pas terminée.
const enCours = new Set();
export const enDeplacement = (id) => enCours.has(id);

/**
 * Déplace la discussion `id` du dossier de projet `de` vers `vers` (chemins réels, déjà vérifiés).
 * `bloquee(id)` : vrai si la discussion est ouverte, interrompue ou à la corbeille (refus).
 */
export async function deplacerSession({ id, de, vers, bloquee }) {
  if (!ID.test(String(id || ''))) throw new Error('session_inconnue');
  if (de === vers) throw new Error('meme_projet');
  if (enCours.has(id) || bloquee(id)) throw new Error('discussion_occupee');
  enCours.add(id);
  try {
    await deplacer(id, de, vers);
  } finally {
    enCours.delete(id);
  }
}

async function deplacer(id, de, vers) {
  if (encoder(de).length > 200 || encoder(vers).length > 200) throw new Error('deplacement_impossible');
  const source = path.join(racineClaude(), encoder(de));
  const cible = path.join(racineClaude(), encoder(vers));
  const fichier = path.join(source, `${id}.jsonl`);
  if (!existsSync(fichier)) {
    // Connue de Claude Code mais pas à l'endroit attendu : on ne devine pas, on refuse.
    if (await getSessionInfo(id, { dir: de }).catch(() => null)) throw new Error('deplacement_impossible');
    throw new Error('session_inconnue');
  }
  const arrivee = path.join(cible, `${id}.jsonl`);
  const voisin = path.join(source, id);
  const voisinArrivee = path.join(cible, id);
  // Rien ne doit déjà occuper la place : en cas d'échec, on ne retire ainsi que ce que cet appel a créé.
  if (existsSync(arrivee) || existsSync(voisinArrivee)) throw new Error('deplacement_impossible');

  mkdirSync(cible, { recursive: true, mode: 0o700 });
  const temporaire = `${arrivee}.deplacement-${process.pid}`;
  const cree = { arrivee: false, voisin: false };
  const annuler = () => {
    rmSync(temporaire, { force: true });
    if (cree.arrivee) rmSync(arrivee, { force: true });
    if (cree.voisin) rmSync(voisinArrivee, { recursive: true, force: true });
  };
  try {
    await recopier(fichier, temporaire, de, vers);
    const { atime, mtime } = statSync(fichier);
    utimesSync(temporaire, atime, mtime); // la discussion garde sa date dans les listes
    renameSync(temporaire, arrivee);
    cree.arrivee = true;
    if (existsSync(voisin)) {
      cree.voisin = true;
      cpSync(voisin, voisinArrivee, { recursive: true, preserveTimestamps: true });
    }
  } catch {
    annuler();
    throw new Error('deplacement_impossible');
  }
  // Claude Code doit la retrouver dans le nouveau projet avant qu'on retire l'original.
  const trouvee = await getSessionInfo(id, { dir: vers }).catch(() => null);
  if (!trouvee) {
    annuler();
    throw new Error('deplacement_impossible');
  }
  await deleteSession(id, { dir: de }).catch(() => {});
  rmSync(voisin, { recursive: true, force: true }); // si le SDK n'a pas pu retirer le dossier voisin
  rmSync(fichier, { force: true });
}
