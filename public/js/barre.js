// Barre latérale : projets, sessions en cours, sessions passées du projet choisi.
import { h, dateCourte } from './dom.js';
import { t } from './i18n.js';
import { dire } from './canal.js';
import './projet.js'; // ses textes (corbeille) servent aussi ici
import { ajouterTextes } from './i18n.js';

ajouterTextes({
  fr: { interrompues: 'Sessions interrompues', oublier_interrompue: 'Oublier cette session', confirmer_oublier: 'Oublier la session interrompue « {titre} » ? Elle ne pourra plus être reprise d’ici.' },
  en: { interrompues: 'Interrupted sessions', oublier_interrompue: 'Forget this session', confirmer_oublier: 'Forget the interrupted session “{titre}”? It can no longer be resumed from here.' },
});

let actions = {};
let vue = { general: null, projet: null, active: null, historique: [] };

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
  document.getElementById('liste-projets').replaceChildren(
    ...g.projets.map((p) => {
      const ligne = element('ligne', { actif: p === vue.projet, titre: p, onclick: () => actions.choisirProjet(p) });
      if (p !== vue.projet) return ligne;
      // Le projet actif garde ses réglages à portée : contexte, export, et sa corbeille.
      return h('div.projet-actif', {}, ligne,
        h('button.reglages-projet', { type: 'button', title: t('reglages_projet'), 'aria-label': t('reglages_projet'), onclick: () => actions.ouvrirProjet(p) }, '⚙'),
        poubelle(t('projet_corbeille_titre'), () => actions.ouvrirProjet(p, { corbeille: true })));
    }),
  );

  const vivantes = g.vivantes;
  document.getElementById('bloc-vivantes').hidden = !vivantes.length;
  document.getElementById('liste-vivantes').replaceChildren(
    ...vivantes.map((s) =>
      avecPoubelle(element('ligne', {
        actif: s.id === vue.active,
        titre: s.titre || t('sans_titre'),
        sous: s.projet,
        pastille: s.attente ? 'attente' : s.occupe ? 'occupe' : 'libre',
        onclick: () => actions.rejoindre(s),
      }), { session: s.id, titre: s.titre }),
    ),
  );

  // Sessions interrompues par un redémarrage du serveur : un clic les reprend avec leur historique.
  const coupees = g.interrompues || [];
  document.getElementById('bloc-interrompues').hidden = !coupees.length;
  document.getElementById('liste-interrompues').replaceChildren(
    ...coupees.map((s) => h('div.avec-poubelle', {},
      element('ligne', { titre: s.titre || t('sans_titre'), sous: `${s.projet} · ${dateCourte(s.le)}`, pastille: 'attente', onclick: () => dire({ t: 'reprendre_interrompue', id: s.id }) }),
      poubelle(t('oublier_interrompue'), () => confirm(t('confirmer_oublier', { titre: s.titre || t('sans_titre') })) && dire({ t: 'oublier_interrompue', id: s.id })))),
  );

  const bloc = document.getElementById('bloc-historique');
  bloc.hidden = !vue.projet;
  const liste = document.getElementById('liste-historique');
  if (!vue.historique.length) return liste.replaceChildren(h('p.vide', {}, t('aucune_session')));
  liste.replaceChildren(
    ...vue.historique.map((s) =>
      avecPoubelle(element('ligne', { titre: s.titre || t('sans_titre'), sous: dateCourte(s.modifieLe), onclick: () => actions.reprendre(s) }),
        { projet: vue.projet, id: s.id, titre: s.titre }),
    ),
  );
}
