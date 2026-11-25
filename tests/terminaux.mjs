// Terminaux du serveur (serveur/terminaux.mjs), sans le canal : ouverture dans le dossier du projet, frappe, taille,
// rejeu à qui se rattache, nombre maximal, refus hors des projets, fermeture, et le cas sans pseudo-terminal.
// Là où @lydell/node-pty manque, l'essai le dit (« SAUTÉ ») au lieu de réussir en silence.
//   node tests/terminaux.mjs   (DEVWORKSHOP_ROOT : un dossier de projets jetable, avec un projet « essai »)
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

process.env.DEVWORKSHOP_CONFIG ||= mkdtempSync(path.join(tmpdir(), 'dw-terminaux-'));
process.env.DEVWORKSHOP_ROOT ||= mkdtempSync(path.join(tmpdir(), 'dw-projets-'));
mkdirSync(path.join(process.env.DEVWORKSHOP_ROOT, 'essai'), { recursive: true });
const { ordresTerminaux, fermerTerminaux } = await import('../serveur/terminaux.mjs');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un faux écran : ce qu'il reçoit, et l'attente d'un message. */
function ecran() {
  const recus = [];
  const lot = ordresTerminaux((m) => recus.push(m));
  const ordre = (t, m = {}) => lot.ordres[t](m);
  const sortie = (id) => recus.filter((m) => (m.t === 'terminal_sortie' || m.t === 'terminal_rejouer') && m.id === id).map((m) => m.donnees).join('');
  const attendre = async (test, ms = 8000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (test()) return true;
      await pause(50);
    }
    return false;
  };
  return { recus, lot, ordre, sortie, attendre };
}
const refus = (f) => {
  try { f(); return null; } catch (e) { return e.message; }
};

// Sans pseudo-terminal : la liste le dit, l'ouverture est refusée proprement.
{
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { ordresTerminaux } = await import(${JSON.stringify(new URL('../serveur/terminaux.mjs', import.meta.url).href)});
    const recus = []; const l = ordresTerminaux((m) => recus.push(m));
    l.ordres.terminal_liste();
    let code = null; try { l.ordres.terminal_ouvrir({ projet: 'essai' }); } catch (e) { code = e.message; }
    console.log(JSON.stringify({ disponible: recus[0].disponible, code }));`], { env: { ...process.env, DEVWORKSHOP_SANS_PTY: '1' }, encoding: 'utf8' });
  const lu = JSON.parse(r.stdout.trim() || '{}');
  noter('sans pseudo-terminal : liste « indisponible », ouverture refusée', lu.disponible === false && lu.code === 'terminal_indisponible', r.stdout.trim() || r.stderr.slice(0, 200));
}

const a = ecran();
a.ordre('terminal_liste');
if (a.recus[0]?.disponible !== true) {
  console.log('SAUTÉ — @lydell/node-pty absent sur cette machine : terminaux non essayés.');
  console.log(`${bilan.filter(Boolean).length}/${bilan.length} vérifications réussies (terminaux sautés).`);
  process.exit(bilan.filter((x) => !x).length);
}
noter('liste demandée : disponible, vide', a.recus[0].liste.length === 0);

// Refus : nom de projet invalide, projet absent.
noter('projet hors de la racine refusé', refus(() => a.ordre('terminal_ouvrir', { projet: '../etc' })) === 'nom_invalide');
noter('projet absent refusé', refus(() => a.ordre('terminal_ouvrir', { projet: 'absent' })) === 'dossier_introuvable');

// Ouverture : dans le dossier du projet, la frappe arrive au shell.
a.ordre('terminal_ouvrir', { projet: 'essai', cols: 100, rows: 30 });
const ouvert = a.recus.find((m) => m.t === 'terminal_ouvert');
noter('ouverture : « Terminal 1 » du projet', ouvert?.projet === 'essai' && ouvert?.numero === 1);
noter('la liste suit l’ouverture', a.recus.some((m) => m.t === 'terminaux' && m.liste.some((x) => x.id === ouvert?.id)));
const id = ouvert.id;
a.ordre('terminal_ecrire', { id, donnees: 'echo "x=$((6*7))"; pwd; stty size\r' });
const dossier = realpathSync(path.join(process.env.DEVWORKSHOP_ROOT, 'essai'));
noter('la commande s’exécute', await a.attendre(() => a.sortie(id).includes('x=42')), JSON.stringify(a.sortie(id).slice(-200)));
noter('… dans le dossier du projet', await a.attendre(() => a.sortie(id).includes(dossier)));
noter('… à la taille demandée (30 lignes, 100 colonnes)', await a.attendre(() => a.sortie(id).includes('30 100')));

a.ordre('terminal_taille', { id, cols: 120, rows: 40 });
a.ordre('terminal_ecrire', { id, donnees: 'stty size\r' });
noter('changement de taille appliqué', await a.attendre(() => a.sortie(id).includes('40 120')));
noter('frappe vide ou trop longue refusée', refus(() => a.ordre('terminal_ecrire', { id, donnees: '' })) === 'texte_invalide' && refus(() => a.ordre('terminal_ecrire', { id, donnees: 'x'.repeat(70000) })) === 'texte_invalide');
noter('terminal inconnu refusé', refus(() => a.ordre('terminal_ecrire', { id: 'nimporte', donnees: 'ls\r' })) === 'terminal_inconnu');

// Un autre écran (rechargement de la page) se rattache : il reçoit ce qui a déjà été affiché, puis la suite.
const b = ecran();
b.ordre('terminal_attacher', { id });
noter('rattachement : rejeu de l’affichage', b.recus[0]?.t === 'terminal_rejouer' && b.recus[0].donnees.includes('x=42'));
a.ordre('terminal_ecrire', { id, donnees: 'echo "y=$((5*5))"\r' });
noter('… puis la suite, chez les deux écrans', await b.attendre(() => b.sortie(id).includes('y=25')) && await a.attendre(() => a.sortie(id).includes('y=25')));

// Un écran qui se coupe ne reçoit plus rien ; le terminal continue.
b.lot.fermer();
const avant = b.recus.length;
a.ordre('terminal_ecrire', { id, donnees: 'echo "z=$((3*3))"\r' });
await a.attendre(() => a.sortie(id).includes('z=9'));
noter('écran coupé : plus rien reçu, le terminal continue', b.recus.length === avant && a.sortie(id).includes('z=9'));

// Au plus 8 terminaux (tous projets) ; les numéros se suivent par projet.
for (let i = 0; i < 7; i += 1) a.ordre('terminal_ouvrir', { projet: 'essai' });
const numeros = a.recus.filter((m) => m.t === 'terminal_ouvert').map((m) => m.numero);
noter('numéros 1 à 8', numeros.join(',') === '1,2,3,4,5,6,7,8', numeros.join(','));
noter('un 9e est refusé', refus(() => a.ordre('terminal_ouvrir', { projet: 'essai' })) === 'terminaux_trop_nombreux');

// Fermeture : fin annoncée, liste à jour, numéro libéré.
a.ordre('terminal_fermer', { id });
noter('fermeture : fin annoncée', await a.attendre(() => a.recus.some((m) => m.t === 'terminal_fin' && m.id === id)));
const derniere = a.recus.filter((m) => m.t === 'terminaux').at(-1);
noter('… et retirée de la liste', derniere.liste.length === 7 && !derniere.liste.some((x) => x.id === id));
a.ordre('terminal_ouvrir', { projet: 'essai' });
noter('le numéro 1 libéré est repris', a.recus.filter((m) => m.t === 'terminal_ouvert').at(-1).numero === 1);

// « exit » dans le shell : le terminal se ferme de lui-même.
const dernier = a.recus.filter((m) => m.t === 'terminal_ouvert').at(-1).id;
a.ordre('terminal_ecrire', { id: dernier, donnees: 'exit 3\r' });
noter('« exit 3 » : fin annoncée avec son code', await a.attendre(() => a.recus.some((m) => m.t === 'terminal_fin' && m.id === dernier && m.code === 3)));

fermerTerminaux();
noter('arrêt du serveur : tous fermés', await a.attendre(() => a.recus.filter((m) => m.t === 'terminaux').at(-1).liste.length === 0));

const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
