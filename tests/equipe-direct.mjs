// Essai de l'équipe en direct : le modèle (equipe-etat.js : prénoms, styles, fonctions, états, sous-agents de Claude,
// sous-agents de l'orchestre, discussion à plusieurs, qui attend qui, bloqué, commande longue, boucle) puis la vue
// (equipe.js, dans un navigateur simulé : tuiles, premier plan, écran partagé, prénom modifié, colonne partagée).
//   node tests/equipe-direct.mjs
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><button id="ouvrir-direct"></button><aside id="equipe" hidden></aside>', { url: 'http://127.0.0.1/', pretendToBeVisual: true });
const { window } = dom;
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'NodeFilter', 'DOMParser', 'CustomEvent', 'Event', 'KeyboardEvent']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
globalThis.requestAnimationFrame = (f) => window.requestAnimationFrame(f);
register('./crochets.mjs', import.meta.url);
const { creerEquipe, PRENOMS } = await import('../public/js/equipe-etat.js');
const { initEquipe, nouvelleEquipe, surEvenementEquipe, montrerEquipe } = await import('../public/js/equipe.js');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const outil = (id, nom, entree, extra = {}) => ({ t: 'assistant', blocs: [{ type: 'outil', id, nom, entree }], ...extra });

// --- Modèle ---
let maintenant = 1_000_000;
const neuve = (opts = {}) => {
  const eq = creerEquipe({ session: 's1', principal: { nom: 'Claude', compte: { id: 'defaut', type: 'claude' } }, ...opts });
  eq.maintenant = () => maintenant;
  return eq;
};

let eq = neuve();
eq.recevoir(outil('e1', 'Edit', { file_path: '/p/src/a.ts', old_string: 'a', new_string: 'b' }));
const chef = eq.membres.get('principal');
noter('l’IA seule reçoit un prénom de la liste', PRENOMS.some(([p]) => p === chef.prenom), chef.prenom);
noter('même discussion : même prénom', neuve().recevoir(outil('x', 'Edit', {})) === null && (() => { const e2 = neuve(); e2.recevoir(outil('x', 'Edit', {})); return e2.membres.get('principal').prenom === chef.prenom; })());
noter('style : couleur, cheveux, peau, accessoire', ['couleur', 'cheveux', 'peau', 'accessoire'].every((k) => Number.isInteger(chef.style[k])));
noter('au travail, avec ce qu’il fait', eq.vue(chef).etat === 'travaille' && chef.action === 'Modifie a.ts', chef.action);
noter('fonction d’après ce qu’il fait : développement', /^Développeu(r|se)$/.test(eq.fonctionDe(chef)), eq.fonctionDe(chef));

// Sous-agent de Claude (outil Task) : il arrive avec sa mission, son chef l'attend.
eq.recevoir(outil('t1', 'Task', { subagent_type: 'Explore', description: 'Trouver les appels à la base', prompt: '…' }));
const sous = eq.membres.get('sous:t1');
noter('sous-agent visible, rattaché à son chef', sous && sous.parent === 'principal' && sous.prenom !== chef.prenom, sous?.prenom);
noter('sa fonction vient de son type (Explore)', /^Explorat(eur|rice)$/.test(eq.fonctionDe(sous)), eq.fonctionDe(sous));
noter('son chef l’attend, nommément', eq.vue(chef).etat === 'attend' && eq.vue(chef).attend.includes(sous.prenom));
eq.recevoir(outil('b1', 'Bash', { command: 'grep -rn supabase src' }, { sousAgent: true, parent: 't1' }));
noter('ce que fait le sous-agent va sur sa propre tuile', sous.ecran.terminal?.commande.includes('grep') && !chef.ecran.terminal);
eq.recevoir({ t: 'resultat_outil', id: 'b1', contenu: '12 résultats', parent: 't1' });
noter('… et le résultat sur son terminal', sous.ecran.terminal.sortie === '12 résultats');
const liste = eq.liste();
noter('liste : le chef, puis son sous-agent en retrait', liste[0].m === chef && liste[1].m === sous && liste[1].niveau === 1);
eq.recevoir({ t: 'resultat_outil', id: 't1', contenu: 'Rapport : 3 appels trouvés' });
noter('compte rendu : le sous-agent a fini, son chef ne l’attend plus', eq.vue(sous).etat === 'fini' && eq.vue(chef).etat !== 'attend');
maintenant += 2 * 60 * 1000 + 1;
noter('2 min après, le sous-agent repart', !eq.liste().some((x) => x.m === sous));

// Bloqué, commande longue, boucle.
eq = neuve();
eq.recevoir(outil('b2', 'Bash', { command: 'npm run build' }));
const m = eq.membres.get('principal');
maintenant += 61 * 1000;
noter('commande de plus d’une minute : signalée', eq.vue(m).commandeLongue);
maintenant += 3 * 60 * 1000;
noter('silence de plus de 3 min : sans nouvelles', eq.vue(m).etat === 'bloque');
for (let i = 0; i < 3; i += 1) eq.recevoir(outil(`r${i}`, 'Read', { file_path: '/p/x.ts' }));
noter('trois fois la même action : tourne en rond ?', m.boucle);
eq.recevoir({ t: 'permission', id: 'p1', outil: 'Bash', entree: { command: 'rm -rf build' } });
noter('accord attendu : a besoin de toi, au premier plan', eq.vue(m).etat === 'besoin' && eq.vedette() === m);
eq.recevoir({ t: 'permission_fin', id: 'p1' });
noter('accord donné : il reprend', eq.vue(m).etat === 'travaille');

// Orchestre : la cheffe confie une tâche ; le sous-agent porte son rôle comme fonction.
eq = neuve();
eq.recevoir({ t: 'delegation', auteur: { nom: 'Base de données', rang: 1, compte: { id: 'g', type: 'codex' } }, tache: 'Écrire la migration', modele: null });
const cheffe = eq.membres.get('principal');
const bd = eq.membres.get('auteur:Base de données');
noter('orchestre : chef(fe) d’orchestre', /^Chef(fe)? d’orchestre$/.test(eq.fonctionDe(cheffe)), eq.fonctionDe(cheffe));
noter('orchestre : le sous-agent, son rôle pour fonction et sa mission', bd.parent === 'principal' && eq.fonctionDe(bd) === 'Base de données' && bd.ordre === 'Écrire la migration');
eq.recevoir({ t: 'tour', ok: true, auteur: { nom: 'Base de données', rang: 1 } });
noter('orchestre : son tour fini, il a fini', eq.vue(bd).etat === 'fini' && !cheffe.attendQui.size);

// Discussion à plusieurs, prénoms et fonctions choisis à la main.
eq = neuve({ personnalises: { 'auteur:GPT': { prenom: 'Sacha', fonction: 'Testeuse en chef' } } });
eq.recevoir({ t: 'assistant', auteur: { nom: 'Claude', rang: 0 }, blocs: [{ type: 'texte', texte: 'Je prends le front.' }] });
eq.recevoir({ t: 'assistant', auteur: { nom: 'GPT', rang: 1 }, blocs: [{ type: 'texte', texte: 'Je fais les tests.' }] });
noter('à plusieurs : une tuile par IA, sans chef', eq.liste().length === 2 && eq.liste().every((x) => x.niveau === 0));
const gpt = eq.membres.get('auteur:GPT');
noter('prénom et fonction choisis à la main', gpt.prenom === 'Sacha' && eq.fonctionDe(gpt) === 'Testeuse en chef');
noter('prénoms tous différents', new Set([...eq.membres.values()].map((x) => x.prenom)).size === eq.membres.size);

// --- Vue ---
initEquipe();
montrerEquipe(true);
nouvelleEquipe({ nom: 'Claude', compte: { id: 'defaut', type: 'claude' } }, 'sess-vue');
surEvenementEquipe(outil('v1', 'Bash', { command: 'npm test' }));
surEvenementEquipe(outil('v2', 'Task', { subagent_type: 'Plan', description: 'Plan de la migration' }));
await new Promise((r) => window.requestAnimationFrame(() => r()));
const $$ = (s) => [...document.querySelectorAll(s)];
noter('vue : premier plan et grille, chacun avec son personnage', $$('.tuile.vedette').length === 1 && $$('.tuile').length === 2 && $$('.tuile svg.avatar').length === 2);
noter('vue : l’écran partagé du premier plan (onglets)', $$('.ecran-equipe .onglet-equipe').length === 3);
noter('vue : le sous-agent en retrait (↳)', $$('.grille-equipe .tuile .lien').length === 1 || $$('.tuile.vedette .lien').length === 1);
const prenom = $$('.tuile .nom-equipe .editable')[0];
const ancien = prenom.textContent;
prenom.click();
const champ = document.querySelector('.saisie-equipe');
champ.value = 'Margot';
champ.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await new Promise((r) => window.requestAnimationFrame(() => r()));
noter('vue : prénom changé à la main, gardé pour cette discussion', $$('.nom-equipe').some((n) => n.textContent.includes('Margot')) && (window.localStorage.getItem('devworkshop.equipe.sess-vue') || '').includes('Margot'), ancien);
document.dispatchEvent(new window.CustomEvent('colonne-droite', { detail: 'apercu' }));
noter('vue : l’aperçu s’ouvre, l’équipe se ferme', document.getElementById('equipe').hidden && !document.body.classList.contains('avec-equipe'));
document.getElementById('ouvrir-direct').click();
noter('vue : le bouton la rouvre', !document.getElementById('equipe').hidden);

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
