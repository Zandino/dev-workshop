// Mémoire de la discussion affichée (serveur/memoire-discussion.mjs) : bouton 🧠 de l'en-tête. Deux parties : tes
// instructions (l'IA les suit ; elle peut seulement proposer de les changer) et ce que l'IA retient (elle la tient à
// jour, tu peux la corriger). Le panneau se recharge quand l'IA y écrit, sauf si tu es en train de le modifier.
import { h, notifier } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';

ajouterTextes({
  fr: {
    memoire_court: 'Mémoire', memoire_bouton: 'Mémoire de la discussion : tes instructions et ce que l’IA retient', memoire_titre: 'Mémoire de cette discussion',
    memoire_aide: 'Donnée à toutes les IA de cette discussion, et elle la suit : redémarrage, autre IA, autre projet. Une modification leur est transmise avec ton message suivant.',
    memoire_instructions: 'Tes instructions — l’IA les suit (elle peut proposer de les changer : tu acceptes ou non)',
    memoire_instructions_exemple: 'Ex. : Réponds en français. Ne touche pas au dossier « legacy ». Fais valider chaque migration avant de la lancer.',
    memoire_retenu: 'Ce que l’IA retient — elle le tient à jour au fil du travail ; tu peux corriger',
    memoire_retenu_vide: 'Rien encore : l’IA y notera décisions, faits utiles et ce qui reste à faire.',
    memoire_enregistrer: 'Enregistrer', memoire_enregistree: 'Mémoire enregistrée : l’IA la recevra avec ton prochain message.',
    memoire_maj: 'Modifiée {quand} par {qui}', memoire_jamais: 'Pas encore modifiée.', memoire_toi: 'toi',
    refus_memoire_changee: 'L’IA vient de modifier la mémoire : elle a été rechargée, refais ta modification.',
    refus_memoire_trop_longue: 'Mémoire trop longue (8 000 caractères pour les instructions, 12 000 pour ce qui est retenu).',
    refus_memoire_cle: 'Cette discussion n’a pas de mémoire.',
    // Fil : ce qui change dans la mémoire.
    fil_memoire_ajouter: '🧠 {qui} a noté dans la mémoire : « {texte} »', fil_memoire_remplacer: '🧠 {qui} a réécrit ce qu’il retient dans la mémoire',
    fil_memoire_ecran: '🧠 Tu as modifié la mémoire de la discussion', fil_memoire_instructions: '🧠 Instructions de la mémoire changées (proposées par {qui}, acceptées par toi)',
    fil_memoire_refusees: '🧠 Tu as refusé les nouvelles instructions proposées', fil_memoire_redonnee: '🧠 mémoire à jour transmise avec ce message',
  },
  en: {
    memoire_court: 'Memory', memoire_bouton: 'Conversation memory: your instructions and what the AI remembers', memoire_titre: 'This conversation’s memory',
    memoire_aide: 'Given to every AI of this conversation, and it follows it: restart, other AI, other project. A change reaches them with your next message.',
    memoire_instructions: 'Your instructions — the AI follows them (it may suggest a change: you accept or not)',
    memoire_instructions_exemple: 'E.g.: Answer in English. Do not touch the “legacy” folder. Have every migration approved before running it.',
    memoire_retenu: 'What the AI remembers — it keeps it up to date as it works; you can correct it',
    memoire_retenu_vide: 'Nothing yet: the AI will note decisions, useful facts and what is left to do.',
    memoire_enregistrer: 'Save', memoire_enregistree: 'Memory saved: the AI receives it with your next message.',
    memoire_maj: 'Changed {quand} by {qui}', memoire_jamais: 'Not changed yet.', memoire_toi: 'you',
    refus_memoire_changee: 'The AI just changed the memory: it was reloaded, make your change again.',
    refus_memoire_trop_longue: 'Memory too long (8,000 characters for instructions, 12,000 for what is remembered).',
    refus_memoire_cle: 'This conversation has no memory.',
    fil_memoire_ajouter: '🧠 {qui} noted in the memory: “{texte}”', fil_memoire_remplacer: '🧠 {qui} rewrote what it remembers in the memory',
    fil_memoire_ecran: '🧠 You changed the conversation memory', fil_memoire_instructions: '🧠 Memory instructions changed (suggested by {qui}, accepted by you)',
    fil_memoire_refusees: '🧠 You declined the suggested instructions', fil_memoire_redonnee: '🧠 up-to-date memory sent with this message',
  },
});

const panneau = () => document.getElementById('panneau-memoire');
let lire = { session: () => null };
let ouvertPour = null; // session dont le panneau est ouvert
let version = 0;
let modifie = false; // tu tapes : on ne recharge pas sous tes doigts

/** La ligne du fil pour un événement « memoire » (fil.js). */
export function texteFilMemoire(e) {
  const qui = e.par === 'utilisateur' ? t('memoire_toi') : e.par || 'IA';
  if (e.mode === 'ajouter') return t('fil_memoire_ajouter', { qui, texte: String(e.texte || '').slice(0, 300) });
  if (e.mode === 'remplacer') return t('fil_memoire_remplacer', { qui });
  if (e.mode === 'instructions') return t('fil_memoire_instructions', { qui: e.proposePar || 'IA' });
  if (e.mode === 'instructions_refusees') return t('fil_memoire_refusees');
  return t('fil_memoire_ecran');
}

function fermer() {
  panneau().hidden = true;
  ouvertPour = null;
  modifie = false;
}

function quand(ms) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return '';
  }
}

function dessiner(m) {
  version = m.version;
  modifie = false;
  const instructions = h('textarea.contexte', { rows: 6, maxLength: 8000, placeholder: t('memoire_instructions_exemple'), oninput: () => { modifie = true; } });
  instructions.value = m.instructions || '';
  const retenu = h('textarea.retenu.memoire-retenu', { rows: 10, maxLength: 12000, placeholder: t('memoire_retenu_vide'), oninput: () => { modifie = true; } });
  retenu.value = m.retenu || '';
  const qui = m.majPar === 'utilisateur' ? t('memoire_toi') : m.majPar;
  panneau().replaceChildren(h('div.boite.boite-memoire', {},
    h('header', {}, h('h2', {}, `🧠 ${t('memoire_titre')}`), h('button', { type: 'button', onclick: fermer }, t('fermer'))),
    h('p.aide', {}, t('memoire_aide')),
    h('label.champ-memoire', {}, h('h3', {}, t('memoire_instructions')), instructions),
    h('label.champ-memoire', {}, h('h3', {}, t('memoire_retenu')), retenu),
    h('p.aide', {}, m.majLe ? t('memoire_maj', { quand: quand(m.majLe), qui }) : t('memoire_jamais')),
    h('div.actions', {},
      h('button.principal', { type: 'button', onclick: () => dire({ t: 'memoire_ecrire', session: ouvertPour, version, instructions: instructions.value, retenu: retenu.value }) }, t('memoire_enregistrer')))));
}

export function ouvrirMemoire() {
  const s = lire.session();
  if (!s) return;
  ouvertPour = s;
  panneau().hidden = false;
  panneau().replaceChildren(h('div.boite', {}, h('header', {}, h('h2', {}, `🧠 ${t('memoire_titre')}`), h('button', { type: 'button', onclick: fermer }, t('fermer')))));
  dire({ t: 'memoire_lire', session: s });
}

/** `lecteurs.session()` : la discussion affichée. */
export function initMemoire(lecteurs) {
  lire = lecteurs;
  document.getElementById('memoire')?.addEventListener('click', ouvrirMemoire);
  panneau()?.addEventListener('click', (e) => { if (e.target === panneau()) fermer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvertPour) fermer(); });
  ecouter((m) => {
    if (m.t === 'memoire_etat' && m.discussion === ouvertPour) {
      dessiner(m);
      if (m.enregistree) notifier(t('memoire_enregistree'));
    } else if (m.t === 'memoire' && m.session === ouvertPour && !modifie) {
      dire({ t: 'memoire_lire', session: ouvertPour }); // l'IA vient d'y écrire : on recharge
    } else if (m.t === 'refus' && m.ordre === 'memoire_ecrire' && m.code === 'memoire_changee' && ouvertPour) {
      dire({ t: 'memoire_lire', session: ouvertPour });
    } else if (m.t === 'rejouer' && ouvertPour && m.session !== ouvertPour) {
      fermer(); // une autre discussion s'affiche
    }
  });
}
