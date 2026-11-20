// Barre latérale en arborescence : les projets, et sous le projet ouvert, ses discussions (ouvertes puis
// enregistrées). Les discussions ouvertes dans d'autres projets restent visibles plus bas.
import { h, dateCourte } from './dom.js';
import { t } from './i18n.js';
import { dire } from './canal.js';
import './projet.js'; // ses textes (corbeille) servent aussi ici
import { ajouterTextes } from './i18n.js';

ajouterTextes({
  fr: { ranger_titre_court: 'Ranger dans un autre projet', voir_toutes: 'Voir les {n} discussions du projet', interrompues: 'Discussions interrompues', oublier_interrompue: 'Oublier cette discussion', confirmer_oublier: 'Oublier la discussion interrompue « {titre} » ? Elle ne pourra plus être reprise d’ici.' },
  en: { ranger_titre_court: 'Move to another project', voir_toutes: 'See all {n} conversations of this project', interrompues: 'Interrupted conversations', oublier_interrompue: 'Forget this conversation', confirmer_oublier: 'Forget the interrupted conversation “{titre}”? It can no longer be resumed from here.' },
});

let actions = {};
let vue = { general: null, projet: null, active: null, historique: [] };
let replie = false; // un second clic sur le projet ouvert replie ses discussions

// Au-delà, la liste du projet renvoie vers « Toutes les discussions » (recherche, filtre).
const MAX_LISTE = 30;

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

function element(classe, { actif, titre, sous, pastille, onclick }) {
  return h(
    'button.' + classe + (actif ? '.actif' : ''),
    { type: 'button', onclick, title: titre },
    pastille ? h('span.pastille.' + pastille) : null,
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

function dessiner() {
  const g = vue.general;
  if (!g) return;

  // Discussions ouvertes : celles du projet choisi vont sous lui, les autres restent visibles plus bas.
  const ouverte = (s, sous) => avecPoubelle(element('ligne', {
    actif: s.id === vue.active,
    titre: s.titre || t('sans_titre'),
    sous,
    pastille: s.attente ? 'attente' : s.occupe ? 'occupe' : 'libre',
    onclick: () => actions.rejoindre(s),
  }), { session: s.id, titre: s.titre });
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
      }, h('span.chevron', { 'aria-hidden': 'true' }, deplie ? '▾' : '▸'), h('span.titre', {}, p));
      if (!actif) return [ligne];
      // Le projet ouvert garde ses réglages à portée : fiche, règles, export, et sa corbeille.
      const tete = h('div.projet-actif', {}, ligne,
        h('button.reglages-projet', { type: 'button', title: t('reglages_projet'), 'aria-label': t('reglages_projet'), onclick: () => actions.ouvrirProjet(p) }, '⚙'),
        poubelle(t('projet_corbeille_titre'), () => actions.ouvrirProjet(p, { corbeille: true })));
      return deplie ? [tete, sousListe(p, ici, ouverte)] : [tete];
    }),
  );

  document.getElementById('bloc-vivantes').hidden = !ailleurs.length;
  document.getElementById('liste-vivantes').replaceChildren(...ailleurs.map((s) => ouverte(s, s.projet)));

  // Sessions interrompues par un redémarrage du serveur : un clic les reprend avec leur historique.
  const coupees = g.interrompues || [];
  document.getElementById('bloc-interrompues').hidden = !coupees.length;
  document.getElementById('liste-interrompues').replaceChildren(
    ...coupees.map((s) => h('div.avec-poubelle', {},
      element('ligne', { titre: s.titre || t('sans_titre'), sous: `${s.projet} · ${dateCourte(s.le)}`, pastille: 'attente', onclick: () => dire({ t: 'reprendre_interrompue', id: s.id }) }),
      poubelle(t('oublier_interrompue'), () => confirm(t('confirmer_oublier', { titre: s.titre || t('sans_titre') })) && dire({ t: 'oublier_interrompue', id: s.id })))),
  );
}

/** Discussions du projet ouvert, en retrait sous lui : nouvelle discussion, les ouvertes (pastille), puis les autres. */
function sousListe(projet, ici, ouverte) {
  const dejaOuvertes = new Set(ici.map((s) => s.sessionId).filter(Boolean));
  const enregistrees = vue.historique.filter((s) => !dejaOuvertes.has(s.id));
  const ranger = (d) => h('button.ranger', { type: 'button', title: t('ranger_titre_court'), 'aria-label': t('ranger_titre_court'), onclick: (e) => { e.stopPropagation(); actions.ranger(d); } }, '⇄');
  const lignes = [
    h('button.ligne.nouvelle-discussion', { type: 'button', onclick: () => actions.nouvelle() }, h('span.titre', {}, `＋ ${t('nouvelle_session')}`)),
    ...ici.map((s) => ouverte(s, null)),
    ...enregistrees.slice(0, MAX_LISTE).map((s) => {
      const d = { projet, id: s.id, titre: s.titre, modifieLe: s.modifieLe };
      const ligne = avecPoubelle(element('ligne', { titre: s.titre || t('sans_titre'), sous: dateCourte(s.modifieLe), onclick: () => actions.reprendre(s) }), d);
      ligne.classList.add('avec-ranger');
      ligne.append(ranger(d));
      return ligne;
    }),
  ];
  if (!ici.length && !enregistrees.length) lignes.push(h('p.vide', {}, t('aucune_session')));
  if (enregistrees.length > MAX_LISTE) {
    lignes.push(h('button.discret.voir-plus', { type: 'button', onclick: () => actions.voirToutes(projet) }, t('voir_toutes', { n: enregistrees.length })));
  }
  return h('div.sous-liste', { role: 'group', 'aria-label': projet }, lignes);
}
