// Essai du bureau en direct (bureau.js) dans un navigateur simulé (jsdom) : une carte par IA, fichier modifié,
// terminal (commande puis sortie), navigateur (capture en direct, trace seulement au rejeu), onglet qui suit l'IA ou
// reste sur celui choisi, colonne de droite partagée avec l'aperçu.
//   node tests/bureau.mjs
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><button id="ouvrir-bureau"></button><aside id="bureau" hidden></aside>', { url: 'http://127.0.0.1/', pretendToBeVisual: true });
const { window } = dom;
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'CustomEvent', 'Event', 'requestAnimationFrame']) {
  Object.defineProperty(globalThis, nom, { value: window[nom].bind ? window[nom].bind(window) : window[nom], configurable: true });
}
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'CustomEvent', 'Event']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
register('./crochets.mjs', import.meta.url);
const { initBureau, nouveauBureau, surEvenementBureau, montrerBureau } = await import('../public/js/bureau.js');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const image = () => new Promise((r) => window.requestAnimationFrame(() => r()));
const $$ = (s) => [...document.querySelectorAll(s)];
const carte = (nom) => $$('.poste').find((c) => c.querySelector('header strong').textContent === nom);
const ongletActif = (c) => c.querySelector('.onglet-bureau.actif')?.textContent;

initBureau();
montrerBureau(true);
nouveauBureau({ nom: 'Claude', compte: { id: 'defaut', type: 'claude' } });
await image();
noter('bureau ouvert, vide au départ', !document.getElementById('bureau').hidden && document.body.classList.contains('avec-bureau') && $$('.bureau .vide, #bureau .vide').length === 1);

// Une IA seule : fichier, terminal, navigateur.
surEvenementBureau({ t: 'assistant', blocs: [{ type: 'outil', id: 'e1', nom: 'Edit', entree: { file_path: '/p/src/a.ts', old_string: 'const x = 1', new_string: 'const x = 2' } }] });
await image();
let c = carte('Claude');
noter('fichier : chemin et lignes changées', c && ongletActif(c) === 'Fichier' && c.textContent.includes('/p/src/a.ts') && c.querySelector('.diff .plus')?.textContent.includes('const x = 2'));
noter('l’IA est montrée au travail', c.classList.contains('actif'));
surEvenementBureau({ t: 'assistant', blocs: [{ type: 'outil', id: 'b1', nom: 'Bash', entree: { command: 'npm test' } }] });
await image();
c = carte('Claude');
noter('terminal : la commande, en cours', ongletActif(c) === 'Terminal' && c.querySelector('.terminal-bureau').textContent.includes('$ npm test') && c.querySelector('.en-cours'));
surEvenementBureau({ t: 'resultat_outil', id: 'b1', contenu: '12 passed', erreur: false });
await image();
noter('terminal : la sortie arrive', carte('Claude').querySelector('.terminal-bureau').textContent.includes('12 passed'));
surEvenementBureau({ t: 'assistant', blocs: [{ type: 'outil', id: 'n1', nom: 'mcp__navigateur__browser_take_screenshot', entree: { url: 'http://localhost:3000' } }] });
surEvenementBureau({ t: 'resultat_outil', id: 'n1', contenu: '[image]', image: { type: 'image/png', donnees: 'iVBORw0KGgo=' } });
await image();
c = carte('Claude');
noter('navigateur : la capture s’affiche', ongletActif(c) === 'Navigateur' && c.querySelector('img.capture-bureau')?.src.startsWith('data:image/png;base64,'));

// Onglet choisi : il reste, même si l'IA fait autre chose ; second clic, il suit de nouveau.
[...c.querySelectorAll('.onglet-bureau')].find((b) => b.textContent === 'Terminal').click();
await image();
surEvenementBureau({ t: 'assistant', blocs: [{ type: 'outil', id: 'e2', nom: 'Write', entree: { file_path: '/p/b.md', content: '# Titre' } }] });
await image();
c = carte('Claude');
noter('onglet choisi : il reste', ongletActif(c) === 'Terminal');
[...c.querySelectorAll('.onglet-bureau')].find((b) => b.textContent === 'Terminal').click();
await image();
noter('second clic : il suit de nouveau l’IA', ongletActif(carte('Claude')) === 'Fichier' && carte('Claude').textContent.includes('/p/b.md'));
surEvenementBureau({ t: 'permission', id: 'p1', outil: 'Bash' });
await image();
noter('accord attendu : la carte le dit', carte('Claude').querySelector('.etat-poste').textContent.includes('✋'));
surEvenementBureau({ t: 'etat', occupe: false });
await image();
noter('fin du tour : à l’écoute', !carte('Claude').classList.contains('actif'));

// Discussion à plusieurs : une carte par IA ; au rejeu, une capture non gardée laisse une trace.
nouveauBureau(null);
const gpt = { nom: 'GPT', rang: 1, compte: { id: 'g', type: 'codex' } };
surEvenementBureau({ t: 'assistant', auteur: { nom: 'Claude', rang: 0, compte: { id: 'defaut', type: 'claude' } }, blocs: [{ type: 'outil', id: 'x1', nom: 'Edit', entree: { file_path: 'a', old_string: '', new_string: 'b' } }] });
surEvenementBureau({ t: 'assistant', auteur: gpt, blocs: [{ type: 'outil', id: 'x2', nom: 'mcp__navigateur__browser_navigate', entree: { url: 'http://x' } }] });
surEvenementBureau({ t: 'resultat_outil', id: 'x2', contenu: '[image]', imageVue: true });
await image();
noter('une carte par IA', $$('.poste').length === 2 && carte('GPT'));
noter('rejeu : capture non gardée, sa trace reste', carte('GPT').textContent.includes('non gardée'));

// Colonne de droite partagée : l'aperçu qui s'ouvre ferme le bureau.
document.dispatchEvent(new window.CustomEvent('colonne-droite', { detail: 'apercu' }));
noter('l’aperçu s’ouvre : le bureau se ferme', document.getElementById('bureau').hidden && !document.body.classList.contains('avec-bureau'));
document.getElementById('ouvrir-bureau').click();
noter('le bouton le rouvre', !document.getElementById('bureau').hidden);

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
