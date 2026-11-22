// Essai des copies d'une discussion : rouverte depuis la liste du projet après un redémarrage du serveur, une
// discussion reprend sa copie interrompue (avec tout ce qui s'y est fait) au lieu d'en créer une nouvelle, et une
// seule copie apparaît dans « Discussions interrompues ». Vécu le 21/11/2026 : cinq « Boutique ».
// Lance lui-même le serveur (deux fois). Usage, avec un HOME jetable préparé par `node tests/discussions.mjs prepare` :
//   HOME=/tmp/x/home DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=/tmp/x/projets DEVWORKSHOP_PORT=5346 node tests/copies.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT);
const origine = `http://127.0.0.1:${PORT}`;
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const demarrer = async () => {
  const p = spawn(process.execPath, [path.join(racine, 'serveur/index.mjs')], { stdio: 'ignore' });
  await pause(2500);
  return p;
};
async function connexion() {
  const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'jeton'), 'utf8').trim();
  const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: origine });
  const recus = [];
  ws.on('message', (d) => recus.push(JSON.parse(d.toString())));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'bonjour', jeton }));
  const attendre = async (test, ms = 20000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) { const i = recus.findIndex(test); if (i >= 0) return recus.splice(i, 1)[0]; await pause(50); }
    return null;
  };
  return { dire: (o) => ws.send(JSON.stringify(o)), attendre, fermer: () => ws.close() };
}

// 1. Rouvrir une discussion enregistrée (liste du projet), puis le serveur redémarre.
let serveur = await demarrer();
let c = await connexion();
await c.attendre((m) => m.t === 'general');
c.dire({ t: 'historique', projet: 'alpha' });
const petite = (await c.attendre((m) => m.t === 'historique'))?.sessions.find((s) => s.titre === 'boutique essai');
noter('discussion enregistrée trouvée', petite);
c.dire({ t: 'ouvrir', projet: 'alpha', compte: 'defaut', reprise: petite.id, titre: petite.titre });
const rejeu = await c.attendre((m) => m.t === 'rejouer');
noter('rouverte : la copie connaît son origine', rejeu?.resume.origine === petite.id);
await pause(6000); // sauvegarde
c.fermer();
serveur.kill('SIGTERM');
await pause(1500);

// 2. Après le redémarrage, on la rouvre depuis la liste du projet, dans la vraie page.
serveur = await demarrer();
const general = await (async () => { const x = await connexion(); const g = await x.attendre((m) => m.t === 'general'); x.fermer(); return g; })();
const copie = general?.interrompues.find((s) => s.origine === petite.id);
noter('la copie est parmi les interrompues, avec son origine', copie);

const dom = new JSDOM(readFileSync(path.join(racine, 'public/index.html'), 'utf8'), { url: `${origine}/#jeton=${readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'jeton'), 'utf8').trim()}`, pretendToBeVisual: true });
const { window } = dom;
window.localStorage.setItem('devworkshop.langue', 'fr');
window.localStorage.setItem('devworkshop.projet', 'alpha');
window.Element.prototype.scrollIntoView = () => {};
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'Event']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
const envoyes = [];
globalThis.WebSocket = class extends WS {
  constructor(u) {
    super(u, { origin: origine });
    const envoyer = this.send.bind(this);
    this.send = (d) => { envoyes.push(JSON.parse(d)); return envoyer(d); };
  }
};
register('./crochets.mjs', import.meta.url);
const erreurs = [];
window.addEventListener('error', (e) => erreurs.push(e.error || e.message));
await import(path.join(racine, 'public/js/app.js'));
const $$ = (q) => [...document.querySelectorAll(q)];
async function voir(condition, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { const v = condition(); if (v) return v; await pause(100); }
  return null;
}
const ligne = await voir(() => $$('.sous-liste .ligne').find((l) => l.querySelector('.titre')?.textContent === 'boutique essai'));
noter('la discussion est dans la liste du projet', ligne);
noter('une seule copie dans « Discussions interrompues »', $$('#liste-interrompues .ligne').length === 1);
ligne.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
noter('rouverte depuis la liste : c’est la copie qui est reprise, pas une nouvelle', await voir(() => envoyes.some((m) => m.t === 'reprendre_interrompue' && m.id === copie.id)) && !envoyes.some((m) => m.t === 'ouvrir'));
noter('plus rien dans les interrompues, une seule discussion ouverte', await voir(() => $('#bloc-interrompues').hidden && $$('.sous-liste .ligne .pastille').length === 1));
noter('aucune erreur de script', !erreurs.length, erreurs.map(String).join(' | ').slice(0, 200));
function $(q) { return document.querySelector(q); }

serveur.kill('SIGTERM');
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
