// Essai de l'écran des discussions : la vraie page et ses scripts dans un navigateur simulé (jsdom), branchés sur
// le vrai serveur. Couvre la liste « Discussions » du projet, « Toutes les discussions » (recherche), « Ranger »
// et « Retenir pour le projet ». Aucun appel au modèle.
// Usage : sur un serveur jetable préparé par `node tests/discussions.mjs prepare` (mêmes variables), lancer
//   DEVWORKSHOP_PORT=5338 DEVWORKSHOP_CONFIG=… node tests/ecran-discussions.mjs
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { register } from 'node:module';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const origine = `http://127.0.0.1:${PORT}`;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));

const dom = new JSDOM(readFileSync(path.join(racine, 'public/index.html'), 'utf8'), { url: `${origine}/#jeton=${jeton}`, pretendToBeVisual: true });
const { window } = dom;
window.localStorage.setItem('devworkshop.langue', 'fr');
window.Element.prototype.scrollIntoView = () => {};
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
globalThis.WebSocket = class extends WS {
  constructor(url) { super(url, { origin: origine }); }
};

register('./crochets.mjs', import.meta.url);
const erreurs = [];
process.on('uncaughtException', (e) => erreurs.push(e));
window.addEventListener('error', (e) => erreurs.push(e.error || e.message));
await import(path.join(racine, 'public/js/app.js'));
const { ouvrirRetenir } = await import(path.join(racine, 'public/js/projet.js'));

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
async function attendre(condition, ms = 15000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = condition();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
const cliquer = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const titres = (sel) => $$(sel).map((e) => e.textContent);

// Arborescence : un clic sur un projet montre ses discussions juste en dessous, un second clic les replie.
const dossier = (nom) => $$('#liste-projets .ligne.dossier').find((b) => b.querySelector('.titre')?.textContent === nom);
const alpha = await attendre(() => dossier('alpha'));
noter('projets listés', alpha);
cliquer(alpha);
const sousTitres = () => $$('.sous-liste .avec-poubelle .ligne .titre').map((e) => e.textContent);
noter('discussions du projet, avec leur titre', await attendre(() => sousTitres().length === 2) && sousTitres().includes('proxmox essai'), sousTitres().join(' | '));
const blocAlpha = dossier('alpha').closest('.projet-actif');
noter('juste sous leur projet, avant le projet suivant', blocAlpha?.nextElementSibling?.classList.contains('sous-liste') && blocAlpha.nextElementSibling.nextElementSibling === dossier('beta'));
noter('« Nouvelle discussion » en tête', $('.sous-liste .nouvelle-discussion'));
noter('bouton « ranger » sur chaque discussion', $$('.sous-liste .ranger').length === 2);
cliquer(dossier('alpha'));
noter('second clic : repliées', await attendre(() => !$('.sous-liste')) && dossier('alpha').getAttribute('aria-expanded') === 'false');
cliquer(dossier('alpha'));
noter('troisième clic : dépliées', await attendre(() => sousTitres().length === 2));

// Glisser-déposer : « boutique essai » lâchée sur le projet « beta ».
const transfert = { donnees: {}, types: [], setData(type, v) { this.donnees[type] = v; this.types.push(type); }, getData(type) { return this.donnees[type]; } };
const evenement = (nom, cible) => {
  const e = new window.Event(nom, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: transfert });
  cible.dispatchEvent(e);
  return e;
};
const aGlisser = $$('.sous-liste .avec-poubelle').find((d) => d.querySelector('.titre')?.textContent === 'boutique essai');
noter('discussion glissable, ⇄ visible', aGlisser?.draggable === true && window.getComputedStyle(aGlisser.querySelector('.ranger')).opacity !== '0');
evenement('dragstart', aGlisser);
noter('son propre projet refuse le dépôt', !evenement('dragover', dossier('alpha')).defaultPrevented);
noter('un autre projet l’accepte', evenement('dragover', dossier('beta')).defaultPrevented && dossier('beta').classList.contains('cible'));
evenement('drop', dossier('beta'));
evenement('dragend', aGlisser);
noter('lâchée sur « beta » : rangée', await attendre(() => $$('.notification').find((n) => n.textContent.includes('rangée dans « beta »'))));
noter('elle quitte la liste d’alpha', await attendre(() => sousTitres().length === 1 && sousTitres()[0] === 'proxmox essai'), sousTitres().join(' | '));
noter('« Retenir » caché sans discussion ouverte', $('#retenir').hidden);
noter('aucun « null » affiché dans la barre', !/\bnull\b/.test($('.barre').textContent));

// « Toutes les discussions » : recherche.
cliquer($('#ouvrir-discussions'));
noter('panneau ouvert', await attendre(() => !$('#panneau-discussions').hidden));
noter('toutes les discussions chargées', await attendre(() => $$('.ouvrir-discussion').length === 4), $('#compte-discussions')?.textContent);
const recherche = $('#panneau-discussions input[type=search]');
recherche.value = 'PROXMOX';
recherche.dispatchEvent(new window.Event('input', { bubbles: true }));
noter('recherche sans casse', $$('.ouvrir-discussion').length === 1 && $('.ouvrir-discussion .sous').textContent.startsWith('alpha'));

// « Ranger » dans un nouveau projet.
cliquer($$('.discussion button').find((b) => b.textContent === 'Ranger…'));
noter('choix du projet : les autres projets proposés', await attendre(() => titres('.choix-projets button').join() === 'beta'));
const champ = $('#panneau-discussions form input');
champ.value = 'gamma';
cliquer($('#panneau-discussions form button[type=submit]'));
noter('notification « rangée »', await attendre(() => $$('.notification').find((n) => n.textContent.includes('« gamma »'))));
noter('retour à la liste, discussion dans « gamma »', await attendre(() => $$('.ouvrir-discussion .sous').some((s) => s.textContent.startsWith('gamma'))));
noter('liste du projet à jour', await attendre(() => sousTitres().length === 0));
noter('nouveau projet dans la barre', await attendre(() => dossier('gamma')));

// Rouvrir depuis « Toutes les discussions » : on passe dans son nouveau projet.
cliquer($$('.ouvrir-discussion').find((b) => b.textContent.includes('proxmox essai')));
noter('rouverte dans « gamma »', await attendre(() => $('#titre-session').textContent === 'gamma' && $('.message.utilisateur')), $('#titre-session').textContent);
noter('« gamma » déplié dans la barre, la discussion en dessous', await attendre(() => dossier('gamma')?.getAttribute('aria-expanded') === 'true' && sousTitres().includes('proxmox essai')), sousTitres().join(' | '));
noter('« Retenir » proposé dans la discussion', await attendre(() => !$('#retenir').hidden));
noter('panneau refermé', $('#panneau-discussions').hidden);

// « Retenir pour le projet » : relecture puis ajout.
ouvrirRetenir({ projet: 'gamma', titre: 'proxmox essai', texte: '- point à garder' });
noter('texte proposé, modifiable', $('textarea.retenu')?.value === '- point à garder');
cliquer($$('#panneau-projet button').find((b) => b.textContent === 'Ajouter à la fiche'));
noter('ajouté à la fiche', await attendre(() => $$('.notification').find((n) => n.textContent.includes('fiche de « gamma »'))));
noter('dialogue refermé', await attendre(() => $('#panneau-projet').hidden));

noter('aucune erreur de script', !erreurs.length, erreurs.map(String).join(' | ').slice(0, 300));
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
