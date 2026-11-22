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

/**
 * Questions posées par une IA (Claude, ou les autres par « poser_question ») : un onglet par question (son
 * étiquette courte), une question à la fois. Un choix simple passe à la question suivante ; « Autre » permet de
 * répondre librement. Échap refuse de répondre.
 */
function carteQuestions(e) {
  const liste = e.entree.questions;
  const choix = new Map();
  let active = 0;
  const onglets = liste.map((q, i) => h('button.onglet-question', { type: 'button', role: 'tab', onclick: () => montrer(i) }, q.header || `${i + 1}`));
  const blocs = liste.map((q, i) => {
    const libre = h('input.libre', { type: 'text', placeholder: t('autre'), oninput: () => maj(false) });
    const options = (q.options || []).map((o) =>
      h('label.option', {}, h('input', { type: q.multiSelect ? 'checkbox' : 'radio', name: `${e.id}-${i}`, value: o.label, onchange: () => maj(!q.multiSelect) }), h('span', {}, h('strong', {}, o.label), o.description ? h('small', {}, o.description) : null)),
    );
    const bloc = h('fieldset.question', { role: 'tabpanel' }, h('legend', {}, q.question), options, libre);
    const maj = (suivante) => {
      const coches = [...bloc.querySelectorAll('input:checked')].map((x) => x.value);
      const valeur = libre.value.trim() ? [...(q.multiSelect ? coches : []), libre.value.trim()] : coches;
      // Une réponse libre remplace le choix simple coché.
      if (libre.value.trim() && !q.multiSelect) bloc.querySelectorAll('input:checked').forEach((x) => (x.checked = false));
      choix.set(q.question, valeur.join(', '));
      majOnglets();
      if (suivante) {
        const reste = liste.findIndex((x, j) => j > i && !choix.get(x.question));
        if (reste >= 0) montrer(reste);
        else valider.focus();
      }
    };
    return bloc;
  });
  const complet = () => liste.every((x) => choix.get(x.question));
  function majOnglets() {
    onglets.forEach((o, i) => {
      o.classList.toggle('actif', i === active);
      o.classList.toggle('repondu', Boolean(choix.get(liste[i].question)));
      o.setAttribute('aria-selected', String(i === active));
    });
    valider.disabled = !complet();
  }
  function montrer(i) {
    active = i;
    blocs.forEach((b, j) => (b.hidden = j !== i));
    majOnglets();
  }
  const valider = h('button.principal', { type: 'button', disabled: true, onclick: () => repondre(e, { decision: 'autoriser', reponses: Object.fromEntries(choix) }) }, t('repondre'));
  const refuser = h('button', { type: 'button', onclick: () => repondre(e, { decision: 'refuser' }) }, t('refuser'));
  const tete = h('header', {},
    e.auteur ? h('span.auteur.rang-' + (e.auteur.rang % 4), {}, e.auteur.nom) : null,
    liste.length > 1 ? h('nav.onglets-questions', { role: 'tablist' }, onglets) : null);
  const carte = h('section.permission.questions', { onkeydown: (ev) => ev.key === 'Escape' && repondre(e, { decision: 'refuser' }) }, tete, blocs, h('div.actions', {}, refuser, valider));
  montrer(0);
  return carte;
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
  // Le serveur marque les vraies questions (Claude, ou « poser_question ») : un autre outil d'une IA qui porterait ce
  // nom resterait une demande d'accord, et « Répondre » n'autorise jamais rien par erreur (audit du 22/11/2026).
  const questions = e.questions === true && Array.isArray(e.entree?.questions);
  const carte = questions ? carteQuestions(e) : carteAccord(e);
  ouvertes.set(e.id, carte);
  quai().append(carte);
}
