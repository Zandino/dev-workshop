// « Toutes les discussions » : celles de tous les projets, avec recherche et filtre par projet.
// « Ranger » : déplacer une discussion dans un autre projet (créé au passage si besoin) ; elle reprend ensuite
// dans ce projet, avec sa fiche. Seules les discussions de Claude (compte du serveur) sont enregistrées.
import { h, dateCourte, normaliser, notifier } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';

ajouterTextes({
  fr: {
    toutes_discussions: 'Toutes les discussions', tout_voir: 'Tout voir', chercher_discussion: 'Chercher dans les titres…',
    tous_les_projets: 'Tous les projets', chargement: 'Chargement…', aucune_discussion_trouvee: 'Aucune discussion ne correspond.',
    n_discussions: '{n} discussion(s)', ranger: 'Ranger…', ranger_titre: 'Ranger la discussion dans un projet',
    actuellement_dans: 'actuellement dans « {projet} »', creer_et_ranger: 'Créer et ranger', retour_liste: '← Retour à la liste',
    ranger_aide: 'Choisis le projet où la ranger, ou crée-en un. Elle y reprendra avec la fiche de ce projet. Une discussion ouverte doit d’abord être fermée.',
    discussion_rangee: 'Discussion rangée dans « {projet} ».', discussions_limite: 'Seules les discussions de Claude (compte du serveur) sont enregistrées ici.',
    refus_discussion_occupee: 'Cette discussion est ouverte (ou interrompue, ou à la corbeille) : ferme-la avant de la ranger.',
    refus_deplacement_impossible: 'La discussion n’a pas pu être rangée : elle est restée où elle était.',
    refus_meme_projet: 'Elle est déjà dans ce projet.',
  },
  en: {
    toutes_discussions: 'All conversations', tout_voir: 'See all', chercher_discussion: 'Search titles…',
    tous_les_projets: 'All projects', chargement: 'Loading…', aucune_discussion_trouvee: 'No conversation matches.',
    n_discussions: '{n} conversation(s)', ranger: 'Move…', ranger_titre: 'Move the conversation to a project',
    actuellement_dans: 'currently in “{projet}”', creer_et_ranger: 'Create and move', retour_liste: '← Back to the list',
    ranger_aide: 'Pick the project to move it to, or create one. It will resume there, with that project’s notes. An open conversation must be closed first.',
    discussion_rangee: 'Conversation moved to “{projet}”.', discussions_limite: 'Only Claude conversations (server account) are saved here.',
    refus_discussion_occupee: 'This conversation is open (or interrupted, or in the trash): close it before moving it.',
    refus_deplacement_impossible: 'The conversation could not be moved: it stayed where it was.',
    refus_meme_projet: 'It is already in this project.',
  },
});

const panneau = () => document.getElementById('panneau-discussions');
let actions = {};
let projets = [];
let liste = null;
let filtre = { texte: '', projet: '' };
let vue = null; // 'toutes' ou { deplacer: discussion, retour: vrai si on vient de la liste }

function fermer() {
  panneau().hidden = true;
  vue = null;
}
const entete = (titre) => h('header', {}, h('h2', {}, titre), h('button', { type: 'button', onclick: fermer }, t('fermer')));

/** `projet` : filtre de départ (lien « Tout voir » d'un projet). */
export function ouvrirDiscussions(projet = '') {
  vue = 'toutes';
  filtre = { texte: '', projet: projets.includes(projet) ? projet : '' };
  panneau().hidden = false;
  const recherche = h('input', { type: 'search', autocomplete: 'off', placeholder: t('chercher_discussion'), oninput: (e) => { filtre.texte = e.target.value; dessinerListe(); } });
  const choix = h('select', { onchange: (e) => { filtre.projet = e.target.value; dessinerListe(); } },
    h('option', { value: '' }, t('tous_les_projets')),
    ...projets.map((p) => h('option', { value: p, selected: p === filtre.projet }, p)));
  panneau().replaceChildren(h('div.boite', {},
    entete(t('toutes_discussions')),
    h('div.filtres', {}, recherche, choix),
    h('p.aide', { id: 'compte-discussions' }),
    h('div.liste-discussions', { id: 'liste-discussions' }),
    h('p.aide', {}, t('discussions_limite'))));
  dessinerListe();
  recherche.focus();
  dire({ t: 'toutes_discussions' });
}

function dessinerListe() {
  const zone = document.getElementById('liste-discussions');
  if (!zone || vue !== 'toutes') return;
  const compte = document.getElementById('compte-discussions');
  if (!liste) {
    compte.textContent = t('chargement');
    return zone.replaceChildren();
  }
  const mots = normaliser(filtre.texte).split(/\s+/).filter(Boolean);
  const retenues = liste.filter((d) => (!filtre.projet || d.projet === filtre.projet)
    && mots.every((m) => normaliser(`${d.titre} ${d.projet}`).includes(m)));
  compte.textContent = retenues.length ? t('n_discussions', { n: retenues.length }) : t('aucune_discussion_trouvee');
  zone.hidden = !retenues.length;
  zone.replaceChildren(...retenues.slice(0, 400).map((d) => h('div.discussion', {},
    h('button.ouvrir-discussion', { type: 'button', title: d.titre, onclick: () => { fermer(); actions.reprendre(d); } },
      h('span.titre', {}, d.titre || t('sans_titre')),
      h('span.sous', {}, `${d.projet} · ${dateCourte(d.modifieLe)}`)),
    h('button', { type: 'button', onclick: () => ouvrirRanger(d) }, t('ranger')))));
}

/** Choix du projet où ranger la discussion `d` ({ projet, id, titre }). */
export function ouvrirRanger(d) {
  vue = { deplacer: d, retour: vue === 'toutes' };
  panneau().hidden = false;
  const nouveau = h('input', { type: 'text', maxLength: 60, autocomplete: 'off', placeholder: t('nouveau_projet') });
  const ranger = (vers, creer = false) => dire({ t: 'deplacer_discussion', projet: d.projet, id: d.id, vers, creer });
  panneau().replaceChildren(h('div.boite', {},
    entete(t('ranger_titre')),
    h('p', {}, h('strong', {}, d.titre || t('sans_titre')), ' ', h('span.aide', {}, t('actuellement_dans', { projet: d.projet }))),
    h('p.aide', {}, t('ranger_aide')),
    h('div.choix-projets', {}, ...projets.filter((p) => p !== d.projet).map((p) => h('button', { type: 'button', onclick: () => ranger(p) }, p))),
    h('form.rangee', { onsubmit: (e) => {
      e.preventDefault();
      const nom = nouveau.value.trim();
      if (nom) ranger(nom, true);
    } }, nouveau, h('button.principal', { type: 'submit' }, t('creer_et_ranger'))),
    vue.retour ? h('button.discret.retour-liste', { type: 'button', onclick: () => ouvrirDiscussions(filtre.projet) }, t('retour_liste')) : null));
}

export function majProjetsDiscussions(liste_) {
  projets = liste_ || [];
}

/** `actions` : { reprendre(d) : rouvre la discussion d (projet, id, titre) }. */
export function initDiscussions(a) {
  actions = a;
  document.getElementById('ouvrir-discussions').addEventListener('click', () => ouvrirDiscussions());
  ecouter((m) => {
    if (m.t === 'discussions') {
      liste = m.liste;
      dessinerListe();
    } else if (m.t === 'discussion_deplacee') {
      notifier(t('discussion_rangee', { projet: m.vers }));
      if (vue?.retour) ouvrirDiscussions(filtre.projet);
      else if (vue?.deplacer) fermer();
    }
  });
}
