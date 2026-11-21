// Barre d'activité au-dessus de la saisie : quelle IA travaille, avec quel modèle et quelle puissance, et ce
// qu'elle fait à l'instant (réfléchit, écrit, utilise un outil, attend ton accord), avec le temps écoulé.
// Elle reste là tant que la session est ouverte : on sait toujours si ça avance.
import { h, notifier } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';
import { pastilleLogo } from './logos.js';
import { definirSignature } from './fil.js';

ajouterTextes({
  fr: {
    puissance: 'Puissance', effort_default: 'Puissance par défaut', effort_low: 'Puissance faible', effort_medium: 'Puissance moyenne',
    effort_high: 'Puissance élevée', effort_xhigh: 'Puissance très élevée', effort_max: 'Puissance maximale',
    act_pret: 'prête', act_reflechit: 'réfléchit…', act_ecrit: 'écrit…', act_outil: 'utilise {outil}…', act_accord: 'attend ton accord',
    modele_auto: 'modèle par défaut', tout_autorise: '⚠ tout est autorisé',
    confirmer_bypass: 'Tout autoriser : l’IA lancera des commandes et modifiera des fichiers SANS te demander, jusqu’à ce que tu changes de mode. Continuer ?',
    info_relais: '{de} a atteint sa limite : {vers} prend le relais, avec l’historique de la conversation',
    info_relais_aucun: 'limite atteinte, et aucune autre IA connectée ne peut prendre le relais',
    refus_effort_sans_objet: 'La puissance ne se règle que pour Claude.', refus_effort_refuse: 'Puissance inconnue.',
    info_changement_ia: '{vers} reprend la conversation à la place de {de}, avec son historique',
    refus_changement_impossible: 'On ne change pas d’IA dans une discussion à plusieurs ni dans l’orchestre.',
    refus_changement_occupe: 'Attends que l’IA ait fini son tour (ou arrête-la) avant de changer d’IA.',
    orchestre_en_debut: 'L’orchestre se choisit au début d’une discussion : ouvre une « Nouvelle discussion ».',
  },
  en: {
    puissance: 'Power', effort_default: 'Default power', effort_low: 'Low power', effort_medium: 'Medium power',
    effort_high: 'High power', effort_xhigh: 'Very high power', effort_max: 'Maximum power',
    act_pret: 'ready', act_reflechit: 'thinking…', act_ecrit: 'writing…', act_outil: 'using {outil}…', act_accord: 'waiting for your approval',
    modele_auto: 'default model', tout_autorise: '⚠ everything allowed',
    confirmer_bypass: 'Allow everything: the AI will run commands and change files WITHOUT asking you, until you change the mode. Continue?',
    info_relais: '{de} hit its limit: {vers} takes over, with the conversation history',
    info_relais_aucun: 'limit reached, and no other connected AI can take over',
    refus_effort_sans_objet: 'Power can only be set for Claude.', refus_effort_refuse: 'Unknown power level.',
    info_changement_ia: '{vers} takes over the conversation from {de}, with its history',
    refus_changement_impossible: 'The AI cannot be switched in a group discussion or in the orchestra.',
    refus_changement_occupe: 'Wait until the AI has finished its turn (or stop it) before switching AI.',
    orchestre_en_debut: 'The orchestra is chosen when a conversation starts: open a “New conversation”.',
  },
});

const EFFORTS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'];
const $ = (id) => document.getElementById(id);
let lire = null; // { ecran, compte(), libelle(c), comptes() }
let compteSession = null; // le compte qui tient la session affichée
const etat = { occupe: false, debut: 0, activite: 'pret', outil: '', qui: null, modele: null, effort: 'default' };

function chrono() {
  const s = Math.max(0, Math.round((Date.now() - etat.debut) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

function dessiner() {
  const zone = $('travail');
  const libre = $('mode').value === 'bypassPermissions';
  document.body.classList.toggle('mode-libre', libre);
  if (!lire.ecran.session) return void (zone.hidden = true);
  zone.hidden = false;
  zone.classList.toggle('actif', etat.occupe);
  const c = etat.qui?.compte || lire.compte();
  const nom = etat.qui?.nom || (c ? lire.libelle(c) : '');
  const activite = !etat.occupe ? t('act_pret') : etat.activite === 'outil' ? t('act_outil', { outil: etat.outil }) : t('act_' + etat.activite);
  // replaceChildren écrirait « null » en toutes lettres : on retire les éléments absents.
  zone.replaceChildren(...[
    c ? pastilleLogo(c, nom) : null,
    h('strong', {}, nom),
    h('span.modele-actif', { title: t('modele') }, etat.modele && etat.modele !== 'default' ? etat.modele : t('modele_auto')),
    h('span.effort-actif', {}, t('effort_' + (EFFORTS.includes(etat.effort) ? etat.effort : 'default'))),
    libre ? h('span.alerte-libre', {}, t('tout_autorise')) : null,
    h('span.ressort'),
    h('span.activite', {}, etat.occupe ? h('span.points', {}, h('i'), h('i'), h('i')) : null, activite, etat.occupe ? ` · ${chrono()}` : ''),
  ].filter(Boolean));
}

// Les notifications (accord attendu, tour fini) sont dans alertes.js : elles suivent toutes les discussions.
function suivre(m) {
  const auteur = m.auteur ? { nom: m.auteur.nom, compte: m.auteur.compte } : null;
  if (m.t === 'pret' && m.modele) etat.modele = m.modele;
  else if (m.t === 'etat') {
    if ('occupe' in m) {
      if (m.occupe && !etat.occupe) Object.assign(etat, { debut: Date.now(), activite: 'reflechit' });
      etat.occupe = Boolean(m.occupe) && !m.ferme;
    }
    if (m.modele && m.modele !== 'default') etat.modele = m.modele;
    if (m.effort) etat.effort = m.effort;
  } else if (m.t === 'delta') Object.assign(etat, { activite: m.genre === 'reflexion' ? 'reflechit' : 'ecrit', qui: auteur || etat.qui });
  else if (m.t === 'assistant' && !m.sousAgent) {
    if (m.modele) etat.modele = m.modele;
    const outil = (m.blocs || []).filter((b) => b.type === 'outil').pop();
    Object.assign(etat, outil ? { activite: 'outil', outil: outil.nom } : { activite: 'reflechit' }, { qui: auteur || etat.qui });
  } else if (m.t === 'resultat_outil' || m.t === 'permission_fin') etat.activite = 'reflechit';
  else if (m.t === 'permission') etat.activite = 'accord';
  else if (m.t === 'relais') {
    // Une autre IA a pris la main : le compte affiché, la signature et le modèle suivent.
    const c = lire.comptes().find((x) => x.id === m.vers);
    Object.assign(etat, { qui: null, modele: null, effort: 'default' });
    compteSession = m.vers;
    if (c) {
      $('compte').value = c.id;
      $('compte').dispatchEvent(new Event('change'));
      definirSignature({ compte: c, nom: lire.libelle(c) });
      const ancien = lire.comptes().find((x) => x.id === m.de);
      if (!m.manuel) notifier(t('info_relais', { de: ancien ? lire.libelle(ancien) : '?', vers: lire.libelle(c) }));
    }
  }
}

export function initTravail(lecteurs) {
  lire = lecteurs;
  const effort = $('effort');
  effort.replaceChildren(...EFFORTS.map((e) => h('option', { value: e }, t('effort_' + e))));
  effort.addEventListener('change', () => {
    if (lire.ecran.session) dire({ t: 'effort', session: lire.ecran.session, effort: effort.value });
    etat.effort = effort.value;
    dessiner();
  });
  // « Tout autoriser » se confirme : écouteur en phase de capture, avant celui qui envoie le mode au serveur.
  const mode = $('mode');
  let precedent = mode.value;
  mode.addEventListener('change', (e) => {
    if (mode.value === 'bypassPermissions' && !confirm(t('confirmer_bypass'))) {
      e.stopImmediatePropagation();
      mode.value = precedent;
    }
    precedent = mode.value;
    dessiner();
  }, true);
  // En session, choisir un autre compte lui passe la main (avec l'historique) ; l'orchestre, lui, se choisit
  // au début d'une session.
  $('compte').addEventListener('change', () => {
    const choix = $('compte').value;
    if (!lire.ecran.session || lire.ecran.salon || choix === compteSession) return;
    if (choix === 'orchestre') {
      notifier(t('orchestre_en_debut'));
      $('compte').value = compteSession;
      return;
    }
    dire({ t: 'changer_ia', session: lire.ecran.session, compte: choix });
  });
  ecouter((m) => {
    if (m.t === 'refus' && /^changement_/.test(m.code) && compteSession) $('compte').value = compteSession;
    if (m.t === 'rejouer') {
      compteSession = m.resume.compte;
      Object.assign(etat, { occupe: Boolean(m.etat.occupe), debut: Date.now(), activite: 'reflechit', qui: null, modele: null, effort: m.etat.effort || 'default' });
      for (const e of m.evenements) if ((e.t === 'pret' || e.t === 'assistant') && e.modele) etat.modele = e.modele;
      effort.value = etat.effort;
      precedent = m.etat.mode || precedent;
    } else if (m.session && m.session === lire.ecran.session) suivre(m);
    else if (m.t !== 'general') return;
    dessiner();
  });
  setInterval(() => etat.occupe && dessiner(), 1000);
}
