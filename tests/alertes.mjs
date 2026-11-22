// Essai des alertes : une discussion qui travaille, finit, échoue ou attend un accord (✋) se voit et prévient,
// même quand on en regarde une autre. Trois parties : la règle (serveur/veille.mjs) sur une table de cas, le canal
// (deux connexions, une FAUSSE API locale : aucun modèle n'est appelé), puis la vraie page dans jsdom.
// Usage, sur un serveur jetable (HOME, DEVWORKSHOP_CONFIG et DEVWORKSHOP_ROOT d'essai, projet existant) :
//   DEVWORKSHOP_PORT=5339 DEVWORKSHOP_CONFIG=… node tests/alertes.mjs <projet>
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { register } from 'node:module';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import WS from 'ws';
import { alerteDe, changeLaBarre } from '../serveur/veille.mjs';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const origine = `http://127.0.0.1:${PORT}`;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. La règle : quelle alerte, et quand une discussion reste « pas encore lue ».
const session = (extra = {}) => ({ id: 'x', titre: 'T', compte: 'c', abonnes: new Set(), ...extra });
const regarde = () => session({ abonnes: new Set([() => {}]) });
const cas = [
  ['accord : alerte « accord », avec l’outil et l’auteur', session(), { t: 'permission', outil: 'Write', auteur: { nom: 'Alpha' } }, (a, s) => a?.genre === 'accord' && a.outil === 'Write' && a.auteur === 'Alpha' && !s.nonLu],
  ['tour fini sans personne : « fini », pas encore lue', session(), { t: 'tour', ok: true }, (a, s) => a?.genre === 'fini' && s.nonLu === 'fini'],
  ['tour fini sous les yeux : alerte, mais lue', regarde(), { t: 'tour', ok: true }, (a, s) => a?.genre === 'fini' && !s.nonLu],
  ['tour en échec : « echec » et son message', session(), { t: 'tour', ok: false, message: 'panne' }, (a, s) => a?.genre === 'echec' && a.message === 'panne' && s.nonLu === 'echec'],
  ['limite avec relais : pas d’alerte (le travail continue)', session(), { t: 'tour', ok: false, limite: true }, (a, s) => a === null && !s.nonLu],
  ['aucun relais possible : échec', session(), { t: 'info', code: 'relais_aucun' }, (a) => a?.genre === 'echec'],
  ['sous-agent de l’orchestre : pas d’alerte', session(), { t: 'tour', ok: true, auteur: { nom: 'Base' } }, (a) => a === null],
  ['salon, un participant finit : pas d’alerte', session({ participants: ['A', 'B'] }), { t: 'tour', ok: true, auteur: { nom: 'A' } }, (a) => a === null],
  ['salon, un participant se libère : pas d’alerte', session({ participants: ['A', 'B'] }), { t: 'etat', occupe: false, auteur: { nom: 'A' } }, (a) => a === null],
  ['salon rend la main : « fini »', session({ participants: ['A', 'B'] }), { t: 'etat', occupe: false }, (a, s) => a?.genre === 'fini' && s.nonLu === 'fini'],
  ['message en cours : rien', session(), { t: 'delta', texte: 'x' }, (a) => a === null],
];
for (const [nom, s, e, attendu] of cas) noter(nom, attendu(alerteDe(s, e, 'p'), s));
noter('la barre suit occupé, accord rendu, titre, fermeture', [{ t: 'etat', occupe: true }, { t: 'permission_fin' }, { t: 'utilisateur' }, { t: 'etat', ferme: true }].every(changeLaBarre) && !changeLaBarre({ t: 'delta' }) && !changeLaBarre({ t: 'etat', modele: 'x' }));

// 2. Le canal : une fenêtre est prévenue pour une discussion qu'elle ne regarde pas.
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', async () => {
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'faux-modele' }] }));
    const dernier = JSON.parse(corps).messages.at(-1).content;
    if (dernier.includes('panne')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'panne simulée' } }));
    }
    if (dernier.includes('lent')) await pause(1500);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Entendu.' } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));

function connexion() {
  const ws = new WS(`ws://127.0.0.1:${PORT}/ws`, { origin: origine });
  const recus = [];
  const attentes = new Set();
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    recus.push(m);
    for (const a of [...attentes]) if (a.test(m)) { attentes.delete(a); a.ok(m); }
  });
  return {
    ws,
    recus,
    dire: (o) => ws.send(JSON.stringify(o)),
    /** Le premier message reçu (depuis le début) qui passe le test, ou null après `ms`. */
    attendre(test, ms = 20000) {
      const deja = recus.find(test);
      if (deja) return Promise.resolve(deja);
      return new Promise((ok) => {
        const a = { test, ok };
        attentes.add(a);
        setTimeout(() => { attentes.delete(a); ok(null); }, ms);
      });
    },
    oublier: () => recus.splice(0),
    ouverte: () => new Promise((r) => ws.on('open', r)),
  };
}
const A = connexion();
const B = connexion();
await Promise.all([A.ouverte(), B.ouverte()]);
A.dire({ t: 'bonjour', jeton });
B.dire({ t: 'bonjour', jeton });
await A.attendre((m) => m.t === 'general');
A.dire({ t: 'creer_compte', type: 'api', nom: 'Fausse API', url: `http://127.0.0.1:${faux.address().port}/v1`, modele: 'faux-modele', cle: 'cle-d-essai-123456' });
const api = (await A.attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Fausse API')))?.comptes.find((c) => c.nom === 'Fausse API');
noter('compte de la fausse API créé', api);
A.dire({ t: 'ouvrir', projet, compte: api.id });
const s1 = (await A.attendre((m) => m.t === 'rejouer'))?.session;
A.oublier();
A.dire({ t: 'ouvrir', projet, compte: api.id });
const s2 = (await A.attendre((m) => m.t === 'rejouer'))?.session;
A.dire({ t: 'detacher', session: s1 }); // A regarde s2, plus personne ne regarde s1
await pause(500);
A.oublier();
B.oublier();
const vivante = (m, id) => m.t === 'vivantes' && m.vivantes.find((s) => s.id === id);

A.dire({ t: 'envoyer', session: s1, texte: 'lent : bonjour' });
noter('A voit s1 travailler sans la regarder', await A.attendre((m) => vivante(m, s1)?.occupe === true));
const fini = await A.attendre((m) => m.t === 'alerte' && m.id === s1);
noter('A est prévenue : s1 a fini', fini?.genre === 'fini' && fini.projet === projet && fini.titre === 'lent : bonjour', JSON.stringify(fini));
noter('B (une autre fenêtre) aussi', (await B.attendre((m) => m.t === 'alerte' && m.id === s1))?.genre === 'fini');
noter('s1 marquée « pas encore lue »', await A.attendre((m) => vivante(m, s1)?.nonLu === 'fini' && !vivante(m, s1).occupe));
noter('A ne reçoit pas le fil de s1 (seulement son état)', !A.recus.some((m) => m.session === s1));

A.oublier();
A.dire({ t: 'envoyer', session: s1, texte: 'panne' });
const echec = await A.attendre((m) => m.t === 'alerte' && m.id === s1);
noter('échec signalé, avec son message', echec?.genre === 'echec' && /panne|500/.test(echec.message || ''), echec?.message);
noter('s1 marquée « échec, pas encore lu »', await A.attendre((m) => vivante(m, s1)?.nonLu === 'echec'));

A.oublier();
A.dire({ t: 'attacher', session: s1 });
noter('rouverte : s1 n’est plus marquée', await A.attendre((m) => m.t === 'vivantes' && vivante(m, s1) && vivante(m, s1).nonLu === null));
A.oublier();
A.dire({ t: 'envoyer', session: s2, texte: 'bonjour' });
await A.attendre((m) => m.t === 'alerte' && m.id === s2);
noter('fin de tour sous les yeux : pas marquée', await A.attendre((m) => vivante(m, s2) && !vivante(m, s2).occupe && vivante(m, s2).nonLu === null));
A.dire({ t: 'fermer', session: s1 });
noter('fermée : elle quitte la barre', await A.attendre((m) => m.t === 'vivantes' && !vivante(m, s1)));
A.dire({ t: 'detacher', session: s2 });

// 3. La vraie page : barre, bulle cliquable, notification du système, main levée.
const dom = new JSDOM(readFileSync(path.join(racine, 'public/index.html'), 'utf8'), { url: `${origine}/#jeton=${jeton}`, pretendToBeVisual: true });
const { window } = dom;
window.localStorage.setItem('devworkshop.langue', 'fr');
window.localStorage.setItem('devworkshop.projet', projet);
window.Element.prototype.scrollIntoView = () => {};
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
const prises = []; // les connexions de la page, pour lui faire recevoir un message
globalThis.WebSocket = class extends WS {
  constructor(url) { super(url, { origin: origine }); prises.push(this); }
};
let auPremierPlan = true;
window.document.hasFocus = () => auPremierPlan;
window.focus = () => {};
const notifications = [];
globalThis.Notification = class {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
  constructor(titre, options) { this.titre = titre; this.corps = options?.body; notifications.push(this); }
  close() {}
};

register('./crochets.mjs', import.meta.url);
const erreurs = [];
process.on('uncaughtException', (e) => erreurs.push(e));
window.addEventListener('error', (e) => erreurs.push(e.error || e.message));
await import(path.join(racine, 'public/js/app.js'));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
async function voir(condition, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = condition();
    if (v) return v;
    await pause(100);
  }
  return null;
}
const cliquer = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const ligneDe = (titre) => $$('.sous-liste .ligne').find((l) => l.querySelector('.titre')?.textContent === titre);
const recevoir = (m) => prises.at(-1).emit('message', Buffer.from(JSON.stringify(m)), false);

noter('la page montre s2 sous le projet, prête', await voir(() => ligneDe('bonjour')?.querySelector('.pastille.libre')));
A.dire({ t: 'envoyer', session: s2, texte: 'lent : encore' });
noter('page : s2 « travaille » en direct', await voir(() => ligneDe('bonjour')?.querySelector('.pastille.occupe')));
const bulle = await voir(() => $$('.notification.cliquable').find((n) => n.textContent.includes('Discussion terminée')));
noter('page au premier plan : bulle cliquable', bulle, bulle?.textContent);
noter('page : s2 en gras, « pas encore lue »', await voir(() => ligneDe('bonjour')?.matches('.non-lu') && ligneDe('bonjour').querySelector('.pastille.non-lu')));
cliquer(bulle);
noter('clic sur la bulle : la discussion s’ouvre', await voir(() => $('.message.utilisateur') && $$('.sous-liste .ligne.actif').length));
noter('ouverte : plus marquée', await voir(() => ligneDe('bonjour') && !ligneDe('bonjour').matches('.non-lu')));

auPremierPlan = false;
A.dire({ t: 'envoyer', session: s2, texte: 'lent : en arrière-plan' });
const notif = await voir(() => notifications.find((n) => n.titre.startsWith('Discussion terminée')));
noter('fenêtre en arrière-plan : notification du système', notif, `${notif?.titre} / ${notif?.corps}`);

auPremierPlan = true;
const avant = [notifications.length, $$('.notification.cliquable').length];
A.dire({ t: 'envoyer', session: s2, texte: 'sous les yeux' });
await voir(() => $$('.message.utilisateur').length >= 4 && !$('.pastille.occupe'));
await pause(1500);
noter('discussion affichée, au premier plan : ni bulle ni notification', notifications.length === avant[0] && $$('.notification.cliquable').length === avant[1]);

// ✋ : un accord attendu (simulé : il faudrait un vrai modèle pour en obtenir un).
const etat = await voir(() => A.recus.findLast((m) => m.t === 'vivantes'));
const vivantes = etat.vivantes.map((s) => (s.id === s2 ? { ...s, attente: true } : s));
recevoir({ t: 'vivantes', vivantes });
noter('main levée ✋ sur la discussion', await voir(() => ligneDe('bonjour')?.querySelector('.main-levee')));
noter('le titre de la page compte les besoins (lu par le logiciel de bureau)', document.title === '✋ 1 · Dev Workshop', document.title);
cliquer($('#liste-projets .ligne.dossier.actif'));
noter('projet replié : la main levée reste visible sur le dossier', await voir(() => $('#liste-projets .ligne.dossier.actif .main-levee')));
cliquer($('#liste-projets .ligne.dossier.actif'));
recevoir({ t: 'alerte', id: 'autre', projet: 'ailleurs', titre: 'migration', compte: 'defaut', genre: 'accord', outil: 'Bash', auteur: null, message: null });
noter('accord dans une autre discussion : bulle ✋', await voir(() => $$('.notification.cliquable').find((n) => n.textContent.includes('✋') && n.textContent.includes('a besoin de ton accord') && n.textContent.includes('Bash'))));
recevoir({ t: 'vivantes', vivantes: etat.vivantes });
noter('accord donné : la main se baisse', await voir(() => !$('.main-levee') && document.title === 'Dev Workshop'), document.title);

noter('aucune erreur de script', !erreurs.length, erreurs.map(String).join(' | ').slice(0, 300));
A.dire({ t: 'fermer', session: s2 });
A.dire({ t: 'supprimer_compte', id: api.id });
await pause(500);
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
