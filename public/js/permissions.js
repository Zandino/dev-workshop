// Demandes d'accord : autoriser, toujours autoriser, refuser ; questions de Claude ; plans à approuver.
import { h, markdown } from './dom.js';
import { t } from './i18n.js';
import { dire } from './canal.js';
import { detailOutil, resumeOutil } from './outils.js';

const quai = () => document.getElementById('permissions');
const ouvertes = new Map();

export function viderPermissions() {
  ouvertes.clear();
  quai().replaceChildren();
}

export function retirerPermission(id) {
  ouvertes.get(id)?.remove();
  ouvertes.delete(id);
}

function repondre(e, reponse) {
  dire({ t: 'permission', session: e.session, id: e.id, ...reponse });
  retirerPermission(e.id);
}

/** Question posée par Claude : une réponse par question (plusieurs si choix multiple, ou texte libre). */
function carteQuestions(e) {
  const choix = new Map();
  const corps = e.entree.questions.map((q) => {
    const libre = h('input.libre', { type: 'text', placeholder: t('autre'), oninput: () => maj() });
    const options = (q.options || []).map((o) =>
      h('label.option', {}, h('input', { type: q.multiSelect ? 'checkbox' : 'radio', name: q.question, value: o.label, onchange: () => maj() }), h('span', {}, h('strong', {}, o.label), o.description ? h('small', {}, o.description) : null)),
    );
    const bloc = h('fieldset.question', {}, h('legend', {}, q.question), options, libre);
    const maj = () => {
      const coches = [...bloc.querySelectorAll('input:checked')].map((i) => i.value);
      const valeur = libre.value.trim() ? [...(q.multiSelect ? coches : []), libre.value.trim()] : coches;
      choix.set(q.question, valeur.join(', '));
      valider.disabled = e.entree.questions.some((x) => !choix.get(x.question));
    };
    return bloc;
  });
  const valider = h('button.principal', { type: 'button', disabled: true, onclick: () => repondre(e, { decision: 'autoriser', reponses: Object.fromEntries(choix) }) }, t('repondre'));
  const refuser = h('button', { type: 'button', onclick: () => repondre(e, { decision: 'refuser' }) }, t('refuser'));
  const qui = e.auteur ? h('header', {}, h('span.auteur.rang-' + (e.auteur.rang % 4), {}, e.auteur.nom)) : null;
  return h('section.permission', {}, qui, corps, h('div.actions', {}, refuser, valider));
}

function carteAccord(e) {
  const plan = e.outil === 'ExitPlanMode';
  const motif = h('input.libre', { type: 'text', placeholder: t('motif') });
  const titre = plan ? t('plan_titre') : e.titre || t('perm_titre', { outil: e.outil });
  const detail = plan && e.entree.plan ? markdown(e.entree.plan) : detailOutil(e.outil, e.entree);
  // Le bouton « Refuser » vient en premier : une touche Entrée perdue n'autorise jamais rien.
  const refuser = h('button', { type: 'button', onclick: () => repondre(e, { decision: 'refuser', motif: motif.value }) }, t('refuser'));
  const toujours = e.toujours && !plan ? h('button', { type: 'button', onclick: () => repondre(e, { decision: 'toujours' }) }, t('toujours')) : null;
  const autoriser = h('button.principal', { type: 'button', onclick: () => repondre(e, { decision: 'autoriser' }) }, plan ? t('approuver') : t('autoriser'));
  return h(
    'section.permission',
    {},
    h('header', {}, e.auteur ? h('span.auteur.rang-' + (e.auteur.rang % 4), {}, e.auteur.nom) : null, h('strong', {}, titre), plan ? null : h('span.resume', {}, resumeOutil(e.outil, e.entree))),
    e.description ? h('p.description', {}, e.description) : null,
    detail ? h('div.apercu', {}, detail) : null,
    h('div.actions', {}, motif, refuser, toujours, autoriser),
  );
}

export function afficherPermission(e) {
  if (ouvertes.has(e.id)) return;
  const questions = e.outil === 'AskUserQuestion' && Array.isArray(e.entree?.questions);
  const carte = questions ? carteQuestions(e) : carteAccord(e);
  ouvertes.set(e.id, carte);
  quai().append(carte);
}
