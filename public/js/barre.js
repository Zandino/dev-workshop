// Barre latérale en arborescence : les projets, et sous le projet ouvert, ses discussions (ouvertes puis
// enregistrées). Les discussions ouvertes dans d'autres projets restent visibles plus bas.
import { h, dateCourte, notifier } from './dom.js';
import { t } from './i18n.js';
import { dire } from './canal.js';
import './projet.js'; // ses textes (corbeille) servent aussi ici
import { ajouterTextes } from './i18n.js';
import { differer, fleches, rendreOrdonnable, figer, liberer } from './ordre-barre.js';
import { rendreRenommable } from './renommer.js';

ajouterTextes({
  fr: { etat_main: 'Elle a besoin de toi : un accord t’attend', etat_occupe: 'L’IA travaille', etat_libre: 'Prête, elle attend ton message', etat_non_lu: 'Terminée, pas encore lue', etat_echec: 'Tour interrompu, pas encore lu', etat_attente: 'Interrompue par un redémarrage', glisser_aide: 'Glisse-la sur un autre projet pour l’y ranger', rangement_vers: 'Rangement dans « {projet} »…', ranger_titre_court: 'Ranger dans un autre projet', voir_toutes: 'Voir les {n} discussions du projet', interrompues: 'Discussions interrompues', oublier_interrompue: 'Oublier cette discussion', confirmer_oublier: 'Oublier la discussion interrompue « {titre} » ? Elle ne pourra plus être reprise d’ici.' },
  en: { etat_main: 'It needs you: an approval is waiting', etat_occupe: 'The AI is working', etat_libre: 'Ready, waiting for your message', etat_non_lu: 'Finished, not read yet', etat_echec: 'Turn interrupted, not read yet', etat_attente: 'Interrupted by a restart', glisser_aide: 'Drag it onto another project to move it there', rangement_vers: 'Moving to “{projet}”…', ranger_titre_court: 'Move to another project', voir_toutes: 'See all {n} conversations of this project', interrompues: 'Interrupted conversations', oublier_interrompue: 'Forget this conversation', confirmer_oublier: 'Forget the interrupted conversation “{titre}”? It can no longer be resumed from here.' },
});

let actions = {};
let vue = { general: null, projet: null, active: null, historique: [] };
let replie = false; // un second clic sur le projet ouvert replie ses discussions

// Au-delà, la liste du projet renvoie vers « Toutes les discussions » (recherche, filtre).
const MAX_LISTE = 30;

// Glisser-déposer : une discussion (enregistrée ou ouverte) se lâche sur un autre projet de l'arborescence pour l'y
// ranger. La barre ne se redessine pas tant qu'on la tient (ordre-barre.js).
const TYPE_GLISSE = 'application/x-devworkshop-discussion';
let glissee = null; // la discussion en cours de glisser (dataTransfer n'est pas lisible pendant le survol)

function rendreGlissable(ligne, d) {
  ligne.draggable = true;
  ligne.title = t('glisser_aide');
  ligne.addEventListener('dragstart', (e) => {
    glissee = d;
    e.dataTransfer.setData(TYPE_GLISSE, d.id);
    e.dataTransfer.effectAllowed = 'move';
    ligne.classList.add('en-glisse');
    figer();
  });
  ligne.addEventListener('dragend', () => {
    glissee = null;
    ligne.classList.remove('en-glisse');
    for (const c of document.querySelectorAll('.ligne.dossier.cible')) c.classList.remove('cible');
    liberer();
  });
}

/** Un projet de l'arborescence accepte une discussion venue d'un autre projet. */
function rendreCible(ligne, projet) {
  const accepte = (e) => glissee && glissee.projet !== projet && [...(e.dataTransfer?.types || [])].includes(TYPE_GLISSE);
  ligne.addEventListener('dragover', (e) => {
    if (!accepte(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    ligne.classList.add('cible');
  });
  ligne.addEventListener('dragleave', () => ligne.classList.remove('cible'));
  ligne.addEventListener('drop', (e) => {
    ligne.classList.remove('cible');
    if (!accepte(e)) return;
    e.preventDefault();
    const d = glissee;
    glissee = null;
    notifier(t('rangement_vers', { projet }));
    dire({ t: 'deplacer_discussion', projet: d.projet, id: d.id, vers: projet, session: d.session });
  });
}

export function initBarre(a) {
  actions = a;
  document.getElementById('form-projet').addEventListener('submit', (e) => {
    e.preventDefault();
    const champ = document.getElementById('nom-projet');
    if (champ.value.trim()) dire({ t: 'creer_projet', nom: champ.value.trim() });
    champ.value = '';
  });
}

export function majBarre(partiel) {
  Object.assign(vue, partiel);
  dessiner();
}

/** La marque d'une discussion : ✋ quand elle a besoin de toi, sinon une pastille de couleur (avec son sens au survol). */
function marque(pastille) {
  if (pastille === 'main') return h('span.main-levee', { role: 'img', title: t('etat_main'), 'aria-label': t('etat_main') }, '✋');
  return h('span.pastille.' + pastille, aria(t('etat_' + pastille.replace('-', '_'))));
}
const aria = (texte) => ({ role: 'img', title: texte, 'aria-label': texte });

/** L'état d'une discussion ouverte, du plus pressant au plus calme. */
function etatDe(s) {
  if (s.attente) return 'main';
  if (s.occupe) return 'occupe';
  if (s.nonLu) return s.nonLu === 'echec' ? 'echec' : 'non-lu';
  return 'libre';
}

function element(classe, { actif, titre, sous, pastille, nonLu, onclick }) {
  return h(
    'button.' + classe + (actif ? '.actif' : '') + (nonLu ? '.non-lu' : ''),
    { type: 'button', onclick, title: titre },
    pastille ? marque(pastille) : null,
    h('span.titre', {}, titre),
    sous ? h('span.sous', {}, sous) : null,
  );
}

/** Petit bouton « 🗑 » au bout d'une ligne de la barre. */
function poubelle(titre, onclick) {
  return h('button.poubelle', { type: 'button', title: titre, 'aria-label': titre, onclick: (e) => { e.stopPropagation(); onclick(); } }, '🗑');
}

/** Ligne de session avec sa corbeille : une session en cours est fermée, puis mise à la corbeille. */
function avecPoubelle(ligne, quoi) {
  return h('div.avec-poubelle', {}, ligne, poubelle(t('session_corbeille_titre'), () => {
    if (confirm(t('confirmer_session_corbeille', { titre: quoi.titre || t('sans_titre') }))) actions.sessionCorbeille(quoi);
  }));
}

/**
 * Projet replié : l'état le plus pressant de ses discussions ouvertes se voit sur le dossier : ✋ un accord ou une
 * question t'attend, puis un échec pas encore lu, puis une IA au travail, puis une fin pas encore lue.
 */
const URGENCE = ['main', 'echec', 'occupe', 'non-lu'];
function resumeDossier(vivantes, projet) {
  const etats = new Set(vivantes.filter((s) => s.projet === projet).map(etatDe));
  const pire = URGENCE.find((e) => etats.has(e));
  return pire ? marque(pire) : null;
}

/** ⇄ : ranger la discussion `d` ({ projet, id, titre, session si elle est ouverte }) dans un autre projet. */
const boutonRanger = (d) => h('button.ranger', { type: 'button', title: t('ranger_titre_court'), 'aria-label': t('ranger_titre_court'), onclick: (e) => { e.stopPropagation(); actions.ranger(d); } }, '⇄');

/** Clé d'une discussion pour son ordre : la discussion Claude Code dont elle vient, sinon son id. */
const cleOuverte = (s) => s.origine || s.sessionId || s.id;

function changerOrdreProjets(liste) {
  vue.general.projets = liste; // tout de suite à l'écran ; le serveur confirme par l'état général
  dessiner();
  dire({ t: 'ordre_projets', liste });
}

function changerOrdreDiscussions(projet, liste) {
  vue.general.ordreDiscussions = { ...(vue.general.ordreDiscussions || {}), [projet]: liste };
  dessiner();
  dire({ t: 'ordre_discussions', projet, liste });
}

function dessiner() {
  const g = vue.general;
  if (!g || differer(dessiner)) return;

  // Discussions ouvertes : celles du projet choisi vont sous lui, les autres restent visibles plus bas.
  const ouverte = (s, sous) => {
    const ligne = avecPoubelle(element('ligne', {
      actif: s.id === vue.active,
      titre: s.titre || t('sans_titre'),
      sous,
      pastille: etatDe(s),
      nonLu: Boolean(s.nonLu) && !s.attente && !s.occupe,
      onclick: () => actions.rejoindre(s),
    }), { session: s.id, titre: s.titre });
    // Ouverte, elle se range aussi dans un autre projet (⇄ ou glisser) : son IA y reprend avec son historique.
    const d = { projet: s.projet, id: s.id, titre: s.titre, session: s.id };
    ligne.classList.add('avec-ranger');
    ligne.append(boutonRanger(d));
    rendreGlissable(ligne, d);
    rendreRenommable(ligne, s.titre, (titre) => dire({ t: 'renommer_discussion', session: s.id, titre }));
    return ligne;
  };
  const ici = vue.projet ? g.vivantes.filter((s) => s.projet === vue.projet) : [];
  const ailleurs = g.vivantes.filter((s) => !ici.includes(s));

  // Arborescence : chaque projet est un dossier ; celui qu'on a ouvert montre ses discussions juste en dessous.
  document.getElementById('liste-projets').replaceChildren(
    ...g.projets.flatMap((p) => {
      const actif = p === vue.projet;
      const deplie = actif && !replie;
      const ligne = h('button.ligne.dossier' + (actif ? '.actif' : ''), {
        type: 'button', title: p, 'aria-expanded': String(deplie),
        onclick: () => {
          if (!actif) {
            replie = false;
            actions.choisirProjet(p);
          } else {
            replie = !replie;
            dessiner();
          }
        },
      }, h('span.chevron', { 'aria-hidden': 'true' }, deplie ? '▾' : '▸'), h('span.titre', {}, p), deplie ? null : resumeDossier(g.vivantes, p));
      rendreCible(ligne, p);
      // Ordre des projets : glisser le dossier avant ou après un autre, ou ▲ ▼ au survol.
      rendreOrdonnable(ligne, { groupe: 'projets', cle: p, liste: g.projets, changer: changerOrdreProjets });
      const ordre = fleches(g.projets, p, changerOrdreProjets);
      if (!actif) return [h('div.projet-ligne', {}, ligne, ordre)];
      // Le projet ouvert garde ses réglages à portée : fiche, règles, export, et sa corbeille.
      const tete = h('div.projet-actif.projet-ligne', {}, ligne, ordre,
        h('button.reglages-projet', { type: 'button', title: t('reglages_projet'), 'aria-label': t('reglages_projet'), onclick: () => actions.ouvrirProjet(p) }, '⚙'),
        poubelle(t('projet_corbeille_titre'), () => actions.ouvrirProjet(p, { corbeille: true })));
      return deplie ? [tete, sousListe(p, ici, ouverte)] : [tete];
    }),
  );

  document.getElementById('bloc-vivantes').hidden = !ailleurs.length;
  document.getElementById('liste-vivantes').replaceChildren(...ailleurs.map((s) => ouverte(s, s.projet)));

  // Sessions interrompues par un redémarrage du serveur : un clic les reprend avec leur historique.
  // Une seule copie par conversation : la plus récente (la liste arrive triée), qui porte tout son historique.
  const vues = new Set();
  const coupees = (g.interrompues || []).filter((s) => {
    const cle = s.origine || s.sessionId || s.id;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
  document.getElementById('bloc-interrompues').hidden = !coupees.length;
  document.getElementById('liste-interrompues').replaceChildren(
    ...coupees.map((s) => h('div.avec-poubelle', {},
      element('ligne', { titre: s.titre || t('sans_titre'), sous: `${s.projet} · ${dateCourte(s.le)}`, pastille: 'attente', onclick: () => dire({ t: 'reprendre_interrompue', id: s.id }) }),
      poubelle(t('oublier_interrompue'), () => confirm(t('confirmer_oublier', { titre: s.titre || t('sans_titre') })) && dire({ t: 'oublier_interrompue', id: s.id })))),
  );
}

/**
 * Discussions du projet ouvert, en retrait sous lui : nouvelle discussion, puis ses discussions (ouvertes, avec leur
 * pastille, et enregistrées) dans l'ordre choisi ; sans ordre choisi, les ouvertes d'abord, puis les plus récentes.
 */
function sousListe(projet, ici, ouverte) {
  const dejaOuvertes = new Set(ici.flatMap((s) => [s.sessionId, s.origine]).filter(Boolean));
  const enregistrees = vue.historique.filter((s) => !dejaOuvertes.has(s.id));
  const ranger = boutonRanger;
  const elements = [
    ...ici.map((s) => ({ cle: cleOuverte(s), ouverte: s })),
    ...enregistrees.slice(0, MAX_LISTE).map((s) => ({ cle: s.id, enregistree: s })),
  ];
  const ordre = vue.general.ordreDiscussions?.[projet] || [];
  const rang = new Map(ordre.map((c, i) => [c, i]));
  elements.sort((a, b) => (rang.get(a.cle) ?? Infinity) - (rang.get(b.cle) ?? Infinity)); // tri stable
  const cles = elements.map((x) => x.cle);
  const changer = (liste) => changerOrdreDiscussions(projet, liste);
  const lignes = [
    h('button.ligne.nouvelle-discussion', { type: 'button', onclick: () => actions.nouvelle() }, h('span.titre', {}, `＋ ${t('nouvelle_session')}`)),
    ...elements.map(({ cle, ouverte: s, enregistree }) => {
      let ligne;
      if (s) {
        ligne = ouverte(s, null);
      } else {
        const d = { projet, id: enregistree.id, titre: enregistree.titre, modifieLe: enregistree.modifieLe };
        ligne = avecPoubelle(element('ligne', { titre: enregistree.titre || t('sans_titre'), sous: dateCourte(enregistree.modifieLe), onclick: () => actions.reprendre(enregistree) }), d);
        ligne.classList.add('avec-ranger');
        ligne.append(ranger(d));
        rendreGlissable(ligne, d);
        rendreRenommable(ligne, enregistree.titre, (titre) => dire({ t: 'renommer_discussion', projet, id: enregistree.id, titre }));
      }
      rendreOrdonnable(ligne, { groupe: 'discussions:' + projet, cle, liste: cles, changer });
      ligne.append(fleches(cles, cle, changer));
      return ligne;
    }),
  ];
  if (!ici.length && !enregistrees.length) lignes.push(h('p.vide', {}, t('aucune_session')));
  if (enregistrees.length > MAX_LISTE) {
    lignes.push(h('button.discret.voir-plus', { type: 'button', onclick: () => actions.voirToutes(projet) }, t('voir_toutes', { n: enregistrees.length })));
  }
  return h('div.sous-liste', { role: 'group', 'aria-label': projet }, lignes);
}
