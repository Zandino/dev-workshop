// Essai de la barre latérale (barre.js, ordre-barre.js) dans un navigateur simulé (jsdom) : état le plus pressant
// sur un projet replié, ordre des projets et des discussions (flèches, Alt+↑/↓, glisser-déposer), barre figée
// pendant un glisser. Le canal est factice : on lit ce qui serait parti au serveur.
//   node tests/barre-ordre.mjs
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<!doctype html><form id="form-projet"><input id="nom-projet"></form><div id="liste-projets"></div>
  <div id="bloc-vivantes"><div id="liste-vivantes"></div></div><div id="bloc-interrompues"><div id="liste-interrompues"></div></div>`, { url: 'http://127.0.0.1/' });
const { window } = dom;
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'KeyboardEvent', 'Event', 'MouseEvent']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
globalThis.confirm = () => false;
const envois = [];
globalThis.WebSocket = class {
  static OPEN = 1;
  readyState = 1;
  addEventListener() {}
  send(x) { envois.push(JSON.parse(x)); }
};
register('./crochets.mjs', import.meta.url);
const { connecter } = await import('../public/js/canal.js');
const { initBarre, majBarre } = await import('../public/js/barre.js');
connecter();
initBarre({ rejoindre() {}, choisirProjet() {}, ouvrirProjet() {}, sessionCorbeille() {}, nouvelle() {}, reprendre() {}, ranger() {}, voirToutes() {} });

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const $$ = (s) => [...document.querySelectorAll(s)];
const vivante = (id, projet, etat = {}) => ({ id, projet, titre: id, occupe: false, attente: false, nonLu: null, sessionId: null, origine: null, ...etat });
const glisser = (de, vers, genre) => {
  const donnees = new Map();
  const transfert = { types: [], setData(t, v) { donnees.set(t, v); this.types.push(t); }, getData: (t) => donnees.get(t), effectAllowed: '', dropEffect: '' };
  const ev = (type, cible) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', { value: transfert });
    Object.defineProperty(e, 'clientY', { value: 0 });
    cible.dispatchEvent(e);
  };
  ev('dragstart', de);
  if (genre === 'pendant') return () => ev('dragend', de);
  ev('dragover', vers);
  ev('drop', vers);
  ev('dragend', de);
  return null;
};

const general = {
  projets: ['alpha', 'beta', 'gamma', 'delta'],
  ordreDiscussions: {},
  interrompues: [],
  vivantes: [
    vivante('o1', 'alpha'),
    vivante('b1', 'beta', { occupe: true }), vivante('b2', 'beta', { nonLu: 'fini' }),
    vivante('g1', 'gamma', { occupe: true }), vivante('g2', 'gamma', { attente: true }),
    vivante('d1', 'delta', { occupe: true }), vivante('d2', 'delta', { nonLu: 'echec' }),
  ],
};
majBarre({ general, projet: 'alpha', active: null, historique: [{ id: 'h1', titre: 'Ancienne 1', modifieLe: 2 }, { id: 'h2', titre: 'Ancienne 2', modifieLe: 1 }] });

// 1. Projet replié : l'état le plus pressant.
const dossier = (p) => $$('.ligne.dossier').find((b) => b.title === p);
noter('au travail l’emporte sur « fini, pas lu »', dossier('beta').querySelector('.pastille.occupe') && !dossier('beta').querySelector('.non-lu'));
noter('✋ l’emporte sur tout', dossier('gamma').querySelector('.main-levee'));
noter('un échec l’emporte sur « au travail »', dossier('delta').querySelector('.pastille.echec'));

// 2. Ordre des projets.
const ordreProjets = () => $$('.ligne.dossier').map((b) => b.title).join();
dossier('alpha').parentElement.querySelectorAll('.fleches button')[1].click();
noter('▼ descend le projet', ordreProjets() === 'beta,alpha,gamma,delta' && envois.at(-1)?.t === 'ordre_projets' && envois.at(-1).liste.join() === 'beta,alpha,gamma,delta', ordreProjets());
dossier('delta').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
noter('Alt+↑ monte le projet', ordreProjets() === 'beta,alpha,delta,gamma', ordreProjets());
glisser(dossier('gamma'), dossier('beta'));
noter('glisser un projet avant un autre', ordreProjets() === 'gamma,beta,alpha,delta', ordreProjets());

// 3. Ordre des discussions du projet ouvert (ouvertes et enregistrées mêlées).
const lignesDiscussions = () => $$('.sous-liste .avec-poubelle');
const ordreDiscussions = () => lignesDiscussions().map((l) => l.querySelector('.titre').textContent).join();
noter('par défaut : les ouvertes, puis les plus récentes', ordreDiscussions() === 'o1,Ancienne 1,Ancienne 2', ordreDiscussions());
lignesDiscussions()[2].querySelector('.fleches button').click();
noter('▲ monte une discussion enregistrée', ordreDiscussions() === 'o1,Ancienne 2,Ancienne 1' && envois.at(-1)?.t === 'ordre_discussions' && envois.at(-1).projet === 'alpha' && envois.at(-1).liste.join() === 'o1,h2,h1', JSON.stringify(envois.at(-1)));
glisser(lignesDiscussions()[2], lignesDiscussions()[0]);
noter('glisser une enregistrée au-dessus d’une ouverte', ordreDiscussions() === 'Ancienne 1,o1,Ancienne 2', ordreDiscussions());
glisser(dossier('beta'), lignesDiscussions()[0]);
noter('un projet ne se lâche pas parmi les discussions', ordreDiscussions() === 'Ancienne 1,o1,Ancienne 2');

// 3 bis. Renommer : ✎ (ou F2), Entrée enregistre, Échap annule ; la barre ne bouge pas pendant la saisie.
const ligneDe = (titre) => lignesDiscussions().find((l) => l.querySelector('.titre').textContent === titre);
ligneDe('o1').querySelector('.renommer-bouton').click();
const champ = ligneDe('o1').querySelector('input.renommer');
noter('✎ ouvre la saisie du titre', champ && champ.value === 'o1');
majBarre({ general });
noter('la barre ne se redessine pas pendant la saisie', document.contains(champ));
champ.value = 'Titre neuf';
champ.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
noter('Entrée : discussion ouverte renommée', envois.at(-1)?.t === 'renommer_discussion' && envois.at(-1).session === 'o1' && envois.at(-1).titre === 'Titre neuf', JSON.stringify(envois.at(-1)));
const n = envois.length;
ligneDe('Ancienne 2').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
const champ2 = ligneDe('Ancienne 2').querySelector('input.renommer');
champ2.value = 'Ne pas garder';
champ2.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
noter('F2 puis Échap : rien n’est envoyé', champ2 && envois.length === n && !ligneDe('Ancienne 2').querySelector('input.renommer'));
ligneDe('Ancienne 2').querySelector('.renommer-bouton').click();
const champ3 = ligneDe('Ancienne 2').querySelector('input.renommer');
champ3.value = 'Archive';
champ3.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
noter('discussion enregistrée renommée (projet + id)', envois.at(-1)?.t === 'renommer_discussion' && envois.at(-1).projet === 'alpha' && envois.at(-1).id === 'h2' && envois.at(-1).titre === 'Archive');

// 4. Pendant un glisser, la barre ne se redessine pas (la ligne tenue resterait sinon orpheline).
const tenue = dossier('alpha');
const lacher = glisser(tenue, null, 'pendant');
majBarre({ general: { ...general, projets: ['gamma', 'beta', 'alpha', 'delta'], vivantes: [...general.vivantes, vivante('a2', 'alpha', { occupe: true })] } });
noter('barre figée pendant le glisser', dossier('alpha') === tenue);
lacher();
noter('… et redessinée au lâcher', dossier('alpha') !== tenue && $$('.sous-liste .titre').some((x) => x.textContent === 'a2'));

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
