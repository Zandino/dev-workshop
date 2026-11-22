// Essai de l'écran : la vraie page et ses vrais scripts, chargés dans un navigateur simulé (jsdom),
// branchés sur le vrai serveur. Couvre : connexion, projet, saisie, demande d'accord, jauge, commandes traduites.
// Usage : DEVWORKSHOP_PORT=5331 node tests/ecran.mjs <projet> [fr|en]
// Ne remplace pas un coup d'œil dans un vrai navigateur pour la mise en page.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { register } from 'node:module';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import WS from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const langue = process.argv[3] || 'fr';
const origine = `http://127.0.0.1:${PORT}`;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const racine = path.dirname(path.dirname(new URL(import.meta.url).pathname));

const dom = new JSDOM(readFileSync(path.join(racine, 'public/index.html'), 'utf8'), { url: `${origine}/#jeton=${jeton}`, pretendToBeVisual: true });
const { window } = dom;
window.localStorage.setItem('devworkshop.langue', langue);
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

const $ = (s) => document.querySelector(s);
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
async function attendre(condition, ms = 20000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = condition();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
const cliquer = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
function taper(texte) {
  $('#champ').value = texte;
  $('#champ').dispatchEvent(new window.Event('input', { bubbles: true }));
}

noter('jeton retiré de la barre d’adresse', !location.hash.includes('jeton'));
const ligne = await attendre(() => [...document.querySelectorAll('#liste-projets .ligne')].find((b) => b.textContent === projet));
noter('projets listés', ligne);
cliquer(ligne);
noter('saisie active une fois le projet choisi', await attendre(() => !$('#champ').disabled));
noter('compte du serveur proposé', $('#compte').options.length >= 1, [...$('#compte').options].map((o) => o.textContent).join(' | '));

// Petit modèle pour ménager les crédits.
$('#modele').append(new window.Option('haiku', 'haiku'));
$('#modele').value = 'haiku';
taper('Crée le fichier ecran.txt contenant le mot bonjour, puis réponds « fait ».');
cliquer($('#envoyer'));
noter('message affiché', await attendre(() => $('.message.utilisateur')));
const accord = await attendre(() => $('.permission'), 90000);
noter('demande d’accord affichée', accord, accord?.querySelector('header')?.textContent.slice(0, 90));
noter('aperçu du fichier à écrire', accord?.querySelector('.apercu pre')?.textContent.includes('bonjour'));
noter('main levée ✋ dans la barre', $('.liste .main-levee'));
cliquer([...accord.querySelectorAll('button')].find((b) => b.classList.contains('principal')));
noter('fin de tour affichée', await attendre(() => $('.fin-tour'), 90000), $('.fin-tour')?.textContent);
noter('réponse en Markdown', $('.message.assistant .markdown'));
noter('carte d’outil avec résultat', $('details.outil.finie'), $('details.outil summary')?.textContent.slice(0, 80));
noter('jauge de contexte', await attendre(() => /\d.*%.*\//.test($('#jauge').textContent)), $('#jauge').textContent);
cliquer($('#jauge'));
noter('tableau de consommation', $('table.conso tbody tr'), [...document.querySelectorAll('table.conso tr')].map((r) => r.textContent).join(' ║ ').slice(0, 260));
noter('modèles proposés', $('#modele').options.length > 3, `${$('#modele').options.length} choix`);

taper(langue === 'fr' ? '/résum' : '/summar');
const trouvees = [...document.querySelectorAll('.commande')].map((c) => c.textContent);
noter('recherche de commande dans la langue', trouvees.some((c) => c.startsWith('/compact')), trouvees.slice(0, 3).join(' ║ ').slice(0, 200));
taper('/');
noter('palette complète', document.querySelectorAll('.commande').length > 10, `${document.querySelectorAll('.commande').length} commandes`);
taper('');

cliquer($('#fermer-session'));
noter('session fermée, retour à l’accueil', await attendre(() => $('.accueil')));

// Comptes : le compte du serveur est listé et sa connexion se vérifie.
cliquer($('#ouvrir-comptes'));
noter('panneau des comptes', $('#panneau-comptes .compte'), `${document.querySelectorAll('#panneau-comptes .compte').length} compte(s), ${document.querySelectorAll('#panneau-comptes form').length} formulaires`);
cliquer($('#panneau-comptes .compte button'));
noter('connexion du compte vérifiée', await attendre(() => $('#panneau-comptes .badge.oui'), 40000));

// Connexion par compte depuis l'écran : un compte ChatGPT est ajouté, le lien et le code s'affichent, puis on annule.
const formulaire = $('#panneau-comptes form');
formulaire.querySelector('select').value = 'codex';
formulaire.querySelector('input').value = 'Essai GPT';
formulaire.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const carteGpt = () => [...document.querySelectorAll('#panneau-comptes .compte')].find((c) => c.textContent.includes('Essai GPT'));
noter('compte ChatGPT ajouté', await attendre(carteGpt));
cliquer([...carteGpt().querySelectorAll('button')].find((b) => b.classList.contains('principal')));
const lien = await attendre(() => carteGpt()?.querySelector('.connexion a'), 45000);
noter('lien de connexion affiché', lien && new URL(lien.href).hostname.endsWith('openai.com') && lien.target === '_blank', lien ? new URL(lien.href).hostname : '');
noter('code à saisir affiché', /^[A-Z0-9]{4}-[A-Z0-9]{4,5}$/.test(carteGpt()?.querySelector('.code-court')?.textContent || ''));
cliquer([...carteGpt().querySelectorAll('.connexion button')].at(-1));
noter('connexion annulée', await attendre(() => !carteGpt()?.querySelector('.connexion'), 15000));
window.confirm = () => true;
globalThis.confirm = window.confirm;
cliquer(carteGpt().querySelector('header button'));
noter('compte retiré', await attendre(() => !carteGpt(), 10000));
cliquer($('#panneau-comptes header button'));

// Discussion à plusieurs : deux Claude sur le petit modèle, un tour de parole chacun.
cliquer($('#ouvrir-salon'));
const lignes = [...document.querySelectorAll('#panneau-salon .participant')];
noter('formulaire de discussion à deux', lignes.length === 2);
for (const l of lignes) {
  const modele = l.querySelectorAll('input')[1];
  modele.value = 'haiku';
  modele.dispatchEvent(new window.Event('input', { bubbles: true }));
}
const tours = $('#panneau-salon .echanges input');
tours.value = '1';
tours.dispatchEvent(new window.Event('input', { bubbles: true }));
$('#panneau-salon form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
noter('discussion ouverte, saisie active', await attendre(() => $('#panneau-salon').hidden && !$('#champ').disabled && $('#modele').disabled));
taper('Chacun donne en une phrase son fruit préféré.');
cliquer($('#envoyer'));
const pause = await attendre(() => [...document.querySelectorAll('.fin-tour')].find((x) => /pause|paused|Limite|Limit/.test(x.textContent)), 120000);
const signatures = [...new Set([...document.querySelectorAll('.message.assistant .auteur')].map((x) => x.textContent))];
noter('les deux IA ont répondu, chacune signée', signatures.length === 2, signatures.join(' | '));
noter('fin de discussion annoncée', pause, pause?.textContent);
cliquer($('#jauge'));
noter('consommation par participant', document.querySelectorAll('table.conso tbody tr').length >= 4, [...document.querySelectorAll('table.conso tbody th')].map((x) => x.textContent).join(' | '));
cliquer($('#fermer-session'));
await attendre(() => $('.accueil'));
noter('aucune erreur de script', erreurs.length === 0, erreurs.map(String).join(' ; ').slice(0, 400));
process.exit(bilan.every(Boolean) ? 0 : 1);
