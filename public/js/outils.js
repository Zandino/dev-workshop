// Cartes d'outils : une ligne de résumé, le détail (commande, diff, contenu) et le résultat.
import { h, markdown } from './dom.js';
import { t } from './i18n.js';

const ICONES = { Bash: '›_', Read: '◱', Write: '✎', Edit: '✎', Patch: '✎', MultiEdit: '✎', Grep: '⌕', Glob: '⌕', WebFetch: '⇣', WebSearch: '⌕', Agent: '◈', Task: '◈', TodoWrite: '☑' };

const court = (texte, max = 140) => {
  const ligne = String(texte ?? '').split('\n')[0];
  return ligne.length > max ? ligne.slice(0, max) + '…' : ligne;
};

/** Résumé d'un appel d'outil en une ligne. */
export function resumeOutil(nom, e = {}) {
  if (nom === 'Bash') return court(e.description || e.command);
  if (e.file_path) return e.file_path;
  if (e.pattern) return court(e.pattern + (e.path ? `  —  ${e.path}` : ''));
  if (e.url) return court(e.url);
  if (e.query) return court(e.query);
  if (e.description) return court(e.description);
  if (e.prompt) return court(e.prompt);
  const premiere = Object.values(e).find((v) => typeof v === 'string');
  return premiere ? court(premiere) : '';
}

function bloc(texte, classe = '') {
  return h('pre.code' + (classe ? '.' + classe : ''), {}, String(texte ?? ''));
}

/** Diff simple : lignes retirées puis lignes ajoutées. */
function diff(avant, apres) {
  const boite = h('div.diff');
  for (const l of String(avant ?? '').split('\n')) boite.append(h('div.moins', {}, '- ' + l));
  for (const l of String(apres ?? '').split('\n')) boite.append(h('div.plus', {}, '+ ' + l));
  return boite;
}

/** Diff déjà calculé par l'outil (format unifié) : une couleur par ligne ajoutée ou retirée. */
function diffBrut(texte) {
  const boite = h('div.diff');
  for (const l of String(texte).split('\n')) {
    boite.append(h('div' + (l.startsWith('+') ? '.plus' : l.startsWith('-') ? '.moins' : ''), {}, l || ' '));
  }
  return boite;
}

/** Détail de l'entrée d'un outil, selon sa nature. */
export function detailOutil(nom, e = {}) {
  if (nom === 'Bash') return bloc(e.command, 'shell');
  if (nom === 'Edit') return diff(e.old_string, e.new_string);
  if (nom === 'MultiEdit' && Array.isArray(e.edits)) return h('div', {}, e.edits.map((x) => diff(x.old_string, x.new_string)));
  if (nom === 'Write') return bloc(e.content);
  if (nom === 'Patch') return e.diff ? diffBrut(e.diff) : null;
  if (nom === 'ExitPlanMode' && e.plan) return markdown(e.plan);
  if (nom === 'TodoWrite' && Array.isArray(e.todos)) {
    return h('ul.taches', {}, e.todos.map((x) => h('li.' + (x.status || 'pending'), {}, x.content)));
  }
  if ((nom === 'Agent' || nom === 'Task') && e.prompt) return bloc(e.prompt);
  const reste = Object.keys(e).length ? JSON.stringify(e, null, 2) : '';
  return reste ? bloc(reste) : null;
}

const cartes = new Map();

export function oublierCartes() {
  cartes.clear();
}

/** Crée la carte d'un appel d'outil ; le résultat viendra s'y ranger. */
export function carteOutil({ id, nom, entree }) {
  const etat = h('span.etat-outil', {}, t('en_attente'));
  const resultat = h('div.resultat');
  const detail = detailOutil(nom, entree);
  const carte = h(
    'details.outil',
    { open: ['Edit', 'Write', 'TodoWrite', 'Patch'].includes(nom) },
    h('summary', {}, h('span.icone', {}, ICONES[nom] || '•'), h('span.nom', {}, nom), h('span.resume', {}, resumeOutil(nom, entree)), etat),
    detail,
    resultat,
  );
  cartes.set(id, { carte, etat, resultat });
  return carte;
}

/** Range le résultat dans la carte correspondante. */
export function poserResultat({ id, contenu, erreur }) {
  const c = cartes.get(id);
  if (!c) return;
  c.carte.classList.toggle('en-erreur', Boolean(erreur));
  c.carte.classList.add('finie');
  const lignes = contenu ? contenu.split('\n').length : 0;
  c.etat.textContent = erreur ? t('erreur') : lignes ? t('lignes', { n: lignes }) : '✓';
  c.resultat.replaceChildren();
  if (contenu) c.resultat.append(h('div.etiquette', {}, erreur ? t('erreur') : t('resultat')), bloc(contenu, 'sortie'));
}
