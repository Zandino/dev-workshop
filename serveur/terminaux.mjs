// Terminaux du serveur, ouverts depuis l'écran (panneau sous la saisie), comme dans un éditeur de code.
// Un terminal est un vrai shell du serveur, ouvert dans le dossier d'un projet : quiconque a le jeton d'accès y a la
// main, sans les règles d'accord du projet (regles-accord.mjs). Ses ordres ne passent donc que par le canal de l'écran
// (canal.mjs, après le jeton), jamais par les outils des IA (mcp-http.mjs).
// Les terminaux vivent sur le serveur, pas dans la page : un rechargement ou une coupure réseau les retrouve, avec la
// fin de ce qu'ils ont affiché. Un redémarrage du serveur les ferme. Leurs commandes comptent dans la mémoire du
// service et la veille de memoire.mjs peut les arrêter comme celles des IA.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resoudreProjet } from './securite.mjs';
import { NOM_PROJET } from './projets.mjs';

/**
 * Le pseudo-terminal vient de @lydell/node-pty, précompilé pour Linux, macOS et Windows (rien à compiler à
 * l'installation). Absent ou illisible : pas de terminal, l'écran le dit, le reste marche. DEVWORKSHOP_SANS_PTY=1
 * joue ce cas dans les essais.
 */
function chargerPty() {
  if (process.env.DEVWORKSHOP_SANS_PTY === '1') return null;
  try {
    return createRequire(import.meta.url)('@lydell/node-pty');
  } catch {
    return null;
  }
}
const pty = chargerPty();

const MAX = 8; // tous projets confondus
const TAMPON = 256 * 1024; // ce qu'un terminal garde de son affichage, rejoué à qui s'y rattache
const MAX_ECRITURE = 64 * 1024; // une frappe, ou un collage
const REGROUPEMENT = 15; // ms : la sortie part par paquets, pas caractère par caractère

/** id -> { id, projet, numero, proc, tampon, lot, minuterie, abonnes: Set<envoyer> } */
const terminaux = new Map();
/** Les écrans qui suivent la liste des terminaux (ceux qui l'ont demandée, donc authentifiés). */
const suiveurs = new Set();

const liste = () => [...terminaux.values()].map(({ id, projet, numero }) => ({ id, projet, numero }));
const etat = () => ({ t: 'terminaux', disponible: Boolean(pty), liste: liste() });
const diffuserListe = () => suiveurs.forEach((f) => f(etat()));
const taille = (v, min, max, defaut) => (Number.isInteger(v) && v >= min && v <= max ? v : defaut);

function terminal(id) {
  const x = terminaux.get(String(id));
  if (!x) throw new Error('terminal_inconnu');
  return x;
}

/** « Terminal 1 », « Terminal 2 »… par projet, en reprenant le plus petit numéro libre. */
function numeroLibre(projet) {
  const pris = new Set([...terminaux.values()].filter((x) => x.projet === projet).map((x) => x.numero));
  let n = 1;
  while (pris.has(n)) n += 1;
  return n;
}

function vider(x) {
  clearTimeout(x.minuterie);
  x.minuterie = null;
  if (!x.lot) return;
  const m = { t: 'terminal_sortie', id: x.id, donnees: x.lot };
  x.lot = '';
  x.abonnes.forEach((f) => f(m));
}

function ouvrir({ projet, cols, rows }) {
  if (!pty) throw new Error('terminal_indisponible');
  if (!NOM_PROJET.test(String(projet || ''))) throw new Error('nom_invalide');
  if (terminaux.size >= MAX) throw new Error('terminaux_trop_nombreux');
  const dossier = resoudreProjet(projet);
  const windows = process.platform === 'win32';
  const shell = process.env.SHELL || (windows ? 'powershell.exe' : '/bin/bash');
  const proc = pty.spawn(shell, windows ? [] : ['-l'], {
    name: 'xterm-256color',
    cols: taille(cols, 2, 500, 80),
    rows: taille(rows, 1, 200, 24),
    cwd: dossier,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });
  const x = { id: randomUUID(), projet, numero: numeroLibre(projet), proc, tampon: '', lot: '', minuterie: null, abonnes: new Set() };
  proc.onData((d) => {
    x.tampon += d;
    if (x.tampon.length > TAMPON) x.tampon = x.tampon.slice(-TAMPON);
    x.lot += d;
    x.minuterie ??= setTimeout(() => vider(x), REGROUPEMENT);
  });
  proc.onExit(({ exitCode }) => {
    vider(x);
    terminaux.delete(x.id);
    x.abonnes.forEach((f) => f({ t: 'terminal_fin', id: x.id, code: exitCode }));
    x.abonnes.clear();
    diffuserListe();
  });
  terminaux.set(x.id, x);
  diffuserListe();
  return x;
}

/** Ordres d'une connexion de l'écran (voir canal.mjs) ; `fermer()` quand elle se coupe (les terminaux restent). */
export function ordresTerminaux(envoyer) {
  const ordres = {
    // Demander la liste abonne aussi à ses changements.
    terminal_liste() {
      suiveurs.add(envoyer);
      envoyer(etat());
    },

    terminal_ouvrir(m) {
      suiveurs.add(envoyer);
      const x = ouvrir(m);
      x.abonnes.add(envoyer);
      envoyer({ t: 'terminal_ouvert', id: x.id, projet: x.projet, numero: x.numero });
    },

    // Se rattacher à un terminal : ce qu'il a affiché jusque-là, puis la suite.
    terminal_attacher(m) {
      const x = terminal(m.id);
      vider(x);
      x.abonnes.add(envoyer);
      envoyer({ t: 'terminal_rejouer', id: x.id, donnees: x.tampon });
    },

    terminal_detacher(m) {
      terminaux.get(String(m.id))?.abonnes.delete(envoyer);
    },

    terminal_ecrire(m) {
      const donnees = m.donnees;
      if (typeof donnees !== 'string' || !donnees || donnees.length > MAX_ECRITURE) throw new Error('texte_invalide');
      terminal(m.id).proc.write(donnees);
    },

    terminal_taille(m) {
      const x = terminal(m.id);
      const cols = taille(m.cols, 2, 500, null);
      const rows = taille(m.rows, 1, 200, null);
      if (cols && rows) x.proc.resize(cols, rows);
    },

    terminal_fermer(m) {
      terminal(m.id).proc.kill();
    },
  };
  return {
    ordres,
    fermer() {
      suiveurs.delete(envoyer);
      for (const x of terminaux.values()) x.abonnes.delete(envoyer);
    },
  };
}

/** Arrêt du serveur : chaque shell reçoit la fin de son terminal, comme à la fermeture d'une fenêtre. */
export function fermerTerminaux() {
  for (const x of terminaux.values()) {
    try { x.proc.kill(); } catch { /* déjà fini */ }
  }
}
