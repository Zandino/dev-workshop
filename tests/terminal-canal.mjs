// Terminaux par le vrai canal de l'écran (serveur lancé) : rien sans le jeton, la liste seulement à qui la demande,
// ouverture et frappe de bout en bout, et les fichiers d'xterm.js servis par le serveur, sous sa politique de sécurité.
// Usage, sur un serveur jetable (HOME, DEVWORKSHOP_CONFIG et DEVWORKSHOP_ROOT d'essai, projet existant) :
//   DEVWORKSHOP_PORT=5351 DEVWORKSHOP_CONFIG=… node tests/terminal-canal.mjs <projet>
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const origine = `http://127.0.0.1:${PORT}`;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Une connexion : ce qu'elle reçoit, son code de fermeture, et l'attente d'un message. */
function connexion({ avecJeton = true } = {}) {
  const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: origine });
  const c = { ws, recus: [], ferme: null };
  ws.on('message', (d) => c.recus.push(JSON.parse(d)));
  ws.on('close', (code) => { c.ferme = code; });
  c.ouverte = new Promise((r) => ws.on('open', () => {
    if (avecJeton) ws.send(JSON.stringify({ t: 'bonjour', jeton }));
    r();
  }));
  c.dire = (o) => ws.send(JSON.stringify(o));
  c.attendre = async (test, ms = 8000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const m = c.recus.find(test);
      if (m) return m;
      await pause(50);
    }
    return null;
  };
  return c;
}

// 1. Les fichiers d'xterm.js : servis par le serveur lui-même, avec sa politique de sécurité.
for (const [chemin, type] of [['/tiers/xterm.mjs', 'javascript'], ['/tiers/xterm-fit.mjs', 'javascript'], ['/tiers/xterm.css', 'css'], ['/css/terminal.css', 'css'], ['/js/terminal.js', 'javascript']]) {
  const r = await fetch(origine + chemin);
  noter(`${chemin} servi`, r.status === 200 && (r.headers.get('content-type') || '').includes(type) && (r.headers.get('content-security-policy') || '').includes("style-src 'self'"), `${r.status} ${r.headers.get('content-type')}`);
}

// 2. Sans jeton : le premier ordre ferme la connexion, rien n'est dit des terminaux.
const intrus = connexion({ avecJeton: false });
await intrus.ouverte;
intrus.dire({ t: 'terminal_liste' });
await pause(500);
noter('sans jeton : connexion fermée, aucune liste', intrus.ferme === 4401 && !intrus.recus.some((m) => m.t === 'terminaux'), `code ${intrus.ferme}`);

// 3. Avec le jeton : liste, ouverture, frappe.
const a = connexion();
const b = connexion(); // authentifiée, mais n'a pas demandé la liste
await Promise.all([a.ouverte, b.ouverte]);
await a.attendre((m) => m.t === 'general');
await b.attendre((m) => m.t === 'general');
a.dire({ t: 'terminal_liste' });
const liste = await a.attendre((m) => m.t === 'terminaux');
if (liste && liste.disponible === false) {
  console.log('SAUTÉ — @lydell/node-pty absent sur cette machine : ouverture non essayée.');
} else {
  noter('liste reçue', Boolean(liste));
  a.dire({ t: 'terminal_ouvrir', projet, cols: 90, rows: 20 });
  const ouvert = await a.attendre((m) => m.t === 'terminal_ouvert');
  noter('ouverture par le canal', ouvert?.projet === projet, JSON.stringify(a.recus.filter((m) => m.t === 'refus')));
  a.dire({ t: 'terminal_ecrire', id: ouvert?.id, donnees: 'echo "canal=$((7*6))"\r' });
  const sortie = () => a.recus.filter((m) => m.t === 'terminal_sortie' && m.id === ouvert?.id).map((m) => m.donnees).join('');
  noter('frappe et sortie de bout en bout', Boolean(await a.attendre(() => sortie().includes('canal=42') && {}, 8000)), JSON.stringify(sortie().slice(-120)));
  noter('une connexion qui n’a rien demandé ne reçoit ni liste ni sortie', !b.recus.some((m) => m.t.startsWith('terminal')));
  b.dire({ t: 'terminal_ecrire', id: 'nimporte', donnees: 'ls\r' });
  noter('terminal inconnu : refus court', Boolean(await b.attendre((m) => m.t === 'refus' && m.code === 'terminal_inconnu')));
  a.dire({ t: 'terminal_fermer', id: ouvert?.id });
  noter('fermeture par le canal', Boolean(await a.attendre((m) => m.t === 'terminal_fin' && m.id === ouvert?.id)));
}
a.ws.close();
b.ws.close();

const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
