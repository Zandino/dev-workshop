// Essai de la fenêtre de questions (permissions.js) dans un navigateur simulé (jsdom) : un onglet par question,
// une question à la fois, passage automatique à la suivante, réponse libre, « Répondre » seulement quand tout est
// répondu, Échap pour refuser. Le canal est factice : on lit ce qui serait parti au serveur.
//   node tests/questions.mjs
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="permissions"></div>', { url: 'http://127.0.0.1/' });
const { window } = dom;
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
const envois = [];
globalThis.WebSocket = class {
  static OPEN = 1;
  readyState = 1;
  addEventListener() {}
  send(x) { envois.push(JSON.parse(x)); }
};
register('./crochets.mjs', import.meta.url);
const { connecter } = await import('../public/js/canal.js');
const { afficherPermission } = await import('../public/js/permissions.js');
connecter();

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const $$ = (s) => [...document.querySelectorAll(s)];
const visibles = () => $$('fieldset.question').filter((f) => !f.hidden);
const cocher = (texte) => {
  const i = visibles()[0].querySelector(`input[value="${texte}"]`);
  i.checked = true;
  i.dispatchEvent(new window.Event('change'));
};

afficherPermission({
  session: 's1', id: 'q1', outil: 'AskUserQuestion', questions: true, auteur: { nom: 'Gemini', rang: 1 },
  entree: { questions: [
    { question: 'Que peut faire une IA ?', header: 'Message', options: [{ label: 'Main levée', description: 'Tu relances' }, { label: 'Réveil automatique' }] },
    { question: 'Quelles discussions ?', header: 'Portée', options: [{ label: 'Même projet' }, { label: 'Tous les projets' }] },
    { question: 'Quelles IA ?', header: 'IA', multiSelect: true, options: [{ label: 'Claude' }, { label: 'GPT' }, { label: 'Gemini' }] },
  ] },
});
const onglets = $$('.onglet-question');
const valider = $$('.permission .actions button.principal')[0];
noter('un onglet par question, avec son étiquette', onglets.map((o) => o.textContent).join() === 'Message,Portée,IA');
noter('une seule question visible', visibles().length === 1 && visibles()[0].querySelector('legend').textContent === 'Que peut faire une IA ?');
noter('« Répondre » grisé tant que tout n’est pas répondu', valider.disabled);
cocher('Main levée');
noter('un choix simple passe à la question suivante', visibles()[0].querySelector('legend').textContent === 'Quelles discussions ?' && onglets[0].classList.contains('repondu'));
const libre = visibles()[0].querySelector('input.libre');
libre.value = 'Seulement deltinfo';
libre.dispatchEvent(new window.Event('input'));
noter('une réponse libre compte', onglets[1].classList.contains('repondu'));
onglets[2].click();
cocher('Claude');
cocher('GPT');
noter('choix multiple : reste sur la question', visibles()[0].querySelector('legend').textContent === 'Quelles IA ?');
noter('« Répondre » actif une fois tout répondu', !valider.disabled);
onglets[0].click();
noter('on peut revenir à un onglet', visibles()[0].querySelector('legend').textContent === 'Que peut faire une IA ?');
valider.click();
const parti = envois.at(-1);
noter('réponses envoyées', parti?.t === 'permission' && parti.decision === 'autoriser'
  && parti.reponses['Que peut faire une IA ?'] === 'Main levée'
  && parti.reponses['Quelles discussions ?'] === 'Seulement deltinfo'
  && parti.reponses['Quelles IA ?'] === 'Claude, GPT', JSON.stringify(parti?.reponses));
noter('la carte part', !$$('.permission').length);

afficherPermission({ session: 's1', id: 'q2', outil: 'AskUserQuestion', questions: true, entree: { questions: [{ question: 'Seule ?', header: 'X', options: [{ label: 'Oui' }, { label: 'Non' }] }] } });
noter('une seule question : pas d’onglets', !$$('.onglet-question').length);
$$('.permission')[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
noter('Échap refuse', envois.at(-1)?.id === 'q2' && envois.at(-1).decision === 'refuser' && !$$('.permission').length);

// Un outil d'une IA nommé comme la question, sans la marque du serveur : reste une demande d'accord (audit S6).
afficherPermission({ session: 's1', id: 'q3', outil: 'AskUserQuestion', entree: { questions: [{ question: 'Piège ?', header: 'P', options: [{ label: 'Oui' }, { label: 'Non' }] }] } });
noter('sans la marque du serveur : carte d’accord, pas de questions', !document.querySelectorAll('.onglet-question').length && !document.querySelectorAll('fieldset.question').length && document.querySelectorAll('.permission').length === 1);

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
