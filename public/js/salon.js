// Discussion à plusieurs : choix des participants (compte, modèle, nom) et du nombre d'échanges. Depuis une
// discussion ouverte, le panneau part de son équipe et l'applique à cette discussion, historique compris ; il peut
// aussi en démarrer une nouvelle.
import { h } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { libelleCompte } from './comptes.js';

ajouterTextes({
  fr: {
    salon_appliquer: 'Appliquer à cette discussion', salon_nouvelle: 'Démarrer une nouvelle discussion',
    salon_aide_courante: 'Les IA choisies reprennent cette discussion avec tout son historique. Pour revenir à une seule IA ou passer à l’orchestre, choisis-la dans la liste des IA en haut.',
    info_equipe: 'Nouvelle équipe : {qui}. Elle reprend la discussion avec son historique.',
    info_equipe_orchestre: 'Orchestre : {qui} répond seul et confie des tâches aux autres IA. Pour que toutes les IA discutent ensemble, choisis « 👥 Plusieurs IA ».',
    compte_salon: '👥 Plusieurs IA : elles réfléchissent ensemble et se répartissent le travail', toutes_mes_ia: 'Toutes mes IA',
    info_salon_parallele: 'Chacune fait sa part en même temps.',
    info_comptes_supprimes: 'Compte supprimé depuis : {qui} ne fait plus partie de la discussion, qui reprend sans lui.',
    info_salon_chacun_son_tour: 'Mémoire du serveur trop juste pour travailler toutes en même temps : chacune son tour.',
    info_memoire_pleine: 'Mémoire du serveur presque pleine ({libre} Mo libres sur {total}) : le travail en cours est arrêté pour que le serveur ne se fige pas. Relance quand tu veux, avec moins d’IA si ça recommence.',
    refus_memoire_insuffisante: 'Pas assez de mémoire libre sur le serveur pour lancer ces IA : ferme une discussion, ou choisis moins d’IA.',
    info_memoire_pleine_programmes: 'Mémoire du serveur presque pleine ({libre} Mo libres sur {total}) : le travail en cours est arrêté, ainsi que les programmes les plus gourmands lancés par les IA : {programmes}. Relance quand tu veux ; demande-leur une seule commande lourde à la fois.',
    refus_orchestre_claude: 'La cheffe d’orchestre est toujours un compte Claude.',
  },
  en: {
    salon_appliquer: 'Apply to this conversation', salon_nouvelle: 'Start a new conversation',
    salon_aide_courante: 'The chosen AIs take over this conversation with its whole history. To go back to one AI or switch to the orchestra, pick it in the AI list at the top.',
    info_equipe: 'New team: {qui}. It takes over the conversation with its history.',
    info_equipe_orchestre: 'Orchestra: {qui} answers alone and hands tasks to the other AIs. For all the AIs to talk together, choose “👥 Several AIs”.',
    compte_salon: '👥 Several AIs: they think together and share out the work', toutes_mes_ia: 'All my AIs',
    info_salon_parallele: 'Each one does its part at the same time.',
    info_comptes_supprimes: 'Account deleted since: {qui} is no longer part of the conversation, which resumes without it.',
    info_salon_chacun_son_tour: 'Not enough server memory for all of them to work at once: one at a time.',
    info_memoire_pleine: 'Server memory almost full ({libre} MB free of {total}): the work in progress was stopped so the server does not freeze. Start again when you like, with fewer AIs if it happens again.',
    refus_memoire_insuffisante: 'Not enough free memory on the server to start these AIs: close a conversation, or choose fewer AIs.',
    info_memoire_pleine_programmes: 'Server memory almost full ({libre} MB free of {total}): the work in progress was stopped, along with the most memory-hungry programs the AIs had started: {programmes}. Start again when you like; ask them for one heavy command at a time.',
    refus_orchestre_claude: 'The orchestra lead is always a Claude account.',
  },
});

const MAX = 4;
let comptes = [];
let lignes = [];
let actions = { demarrer: () => {}, appliquer: () => {} };
let courante = null; // la discussion affichée, quand le panneau s'ouvre depuis elle
let nombreEchanges = 4;

/** `demarrer(reglages)` ouvre une nouvelle discussion ; `appliquer(reglages)` change l'équipe de la discussion affichée. */
export function initSalon(a) {
  actions = a;
}

export function majComptesSalon(liste) {
  comptes = liste;
}

/** `discussion` : la discussion ouverte (résumé du serveur), ou null. */
export function ouvrirSalon(discussion = null) {
  courante = discussion;
  if (discussion?.equipe?.length > 1) {
    lignes = discussion.equipe.map((p) => ({ compte: p.compte, modele: p.modele || '', nom: p.nom }));
    nombreEchanges = discussion.echanges || nombreEchanges;
  } else if (discussion) {
    // Une seule IA jusqu'ici : elle reste dans l'équipe, une seconde la rejoint.
    lignes = [{ compte: discussion.compte || 'defaut', modele: '', nom: 'Claude A' }, { compte: 'defaut', modele: '', nom: 'Claude B' }];
  } else if (lignes.length < 2) {
    lignes = [{ compte: 'defaut', modele: '', nom: 'Claude A' }, { compte: 'defaut', modele: '', nom: 'Claude B' }];
  }
  document.getElementById('panneau-salon').hidden = false;
  dessiner();
}

function fermer() {
  document.getElementById('panneau-salon').hidden = true;
}

function ligne(p, i) {
  const compte = h('select', { onchange: (e) => {
    p.compte = e.target.value;
    dessiner();
  } }, comptes.map((c) => h('option', { value: c.id, selected: c.id === p.compte }, libelleCompte(c))));
  const choisi = comptes.find((c) => c.id === p.compte);
  return h(
    'div.participant',
    {},
    h('input', { type: 'text', maxLength: 30, value: p.nom, placeholder: t('nom_participant'), oninput: (e) => (p.nom = e.target.value) }),
    compte,
    h('input', { type: 'text', maxLength: 120, value: p.modele, placeholder: choisi?.type === 'api' ? choisi.modele : t('modele_defaut'), oninput: (e) => (p.modele = e.target.value) }),
    choisi?.externe ? h('span.badge.externe', {}, t('externe')) : h('span'),
    lignes.length > 2 ? h('button.discret', { type: 'button', onclick: () => {
      lignes.splice(i, 1);
      dessiner();
    } }, '✕') : h('span'),
  );
}

/** Une ligne par IA déclarée (4 au plus), chacune sous son nom, rendu unique au besoin. */
function toutesMesIa() {
  const vus = new Set();
  lignes = comptes.slice(0, MAX).map((c) => {
    let nom = String(c.nom || c.id).slice(0, 30);
    for (let i = 2; vus.has(nom); i += 1) nom = `${String(c.nom || c.id).slice(0, 27)} ${i}`;
    vus.add(nom);
    return { compte: c.id, modele: '', nom };
  });
  dessiner();
}

function dessiner() {
  const echanges = h('input', { type: 'number', min: 1, max: 10, value: nombreEchanges, oninput: (e) => (nombreEchanges = Number(e.target.value) || 4) });
  const externe = lignes.some((p) => comptes.find((c) => c.id === p.compte)?.externe);
  const reglages = () => ({ participants: lignes.map((p) => ({ compte: p.compte, modele: p.modele.trim() || undefined, nom: p.nom.trim() })), echanges: Number(echanges.value) });
  const nouvelle = () => {
    actions.demarrer(reglages());
    fermer();
  };
  document.getElementById('panneau-salon').replaceChildren(
    h('form.boite', { onsubmit: (e) => {
      e.preventDefault();
      if (courante) actions.appliquer(reglages());
      else actions.demarrer(reglages());
      fermer();
    } },
      h('header', {}, h('h2', {}, t('salon_titre')), h('button', { type: 'button', onclick: fermer }, t('fermer'))),
      h('p.aide', {}, t(courante ? 'salon_aide_courante' : 'salon_aide')),
      lignes.map(ligne),
      h('div.ajouts', {},
        lignes.length < MAX ? h('button', { type: 'button', onclick: () => {
          lignes.push({ compte: 'defaut', modele: '', nom: `IA ${lignes.length + 1}` });
          dessiner();
        } }, t('ajouter_participant')) : null,
        comptes.length > 1 ? h('button', { type: 'button', onclick: toutesMesIa }, t('toutes_mes_ia')) : null),
      h('label.echanges', {}, t('salon_echanges'), echanges),
      externe ? h('p.alerte', {}, t('salon_externe')) : null,
      h('div.actions', {},
        courante ? h('button', { type: 'button', onclick: nouvelle }, t('salon_nouvelle')) : null,
        h('button.principal', { type: 'submit' }, t(courante ? 'salon_appliquer' : 'salon_demarrer'))),
    ),
  );
}
