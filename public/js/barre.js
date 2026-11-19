// Barre latérale : projets, sessions en cours, sessions passées du projet choisi.
import { h, dateCourte } from './dom.js';
import { t } from './i18n.js';
import { dire } from './canal.js';

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

function dessiner() {
  const g = vue.general;
  if (!g) return;
  document.getElementById('liste-projets').replaceChildren(
    ...g.projets.map((p) => element('ligne', { actif: p === vue.projet, titre: p, onclick: () => actions.choisirProjet(p) })),
  );

  const vivantes = g.vivantes;
  document.getElementById('bloc-vivantes').hidden = !vivantes.length;
  document.getElementById('liste-vivantes').replaceChildren(
    ...vivantes.map((s) =>
      element('ligne', {
        actif: s.id === vue.active,
        titre: s.titre || t('sans_titre'),
        sous: s.projet,
        pastille: s.attente ? 'attente' : s.occupe ? 'occupe' : 'libre',
        onclick: () => actions.rejoindre(s),
      }),
    ),
  );

  const bloc = document.getElementById('bloc-historique');
  bloc.hidden = !vue.projet;
  const liste = document.getElementById('liste-historique');
  if (!vue.historique.length) return liste.replaceChildren(h('p.vide', {}, t('aucune_session')));
  liste.replaceChildren(
    ...vue.historique.map((s) =>
      element('ligne', { titre: s.titre || t('sans_titre'), sous: dateCourte(s.modifieLe), onclick: () => actions.reprendre(s) }),
    ),
  );
}
