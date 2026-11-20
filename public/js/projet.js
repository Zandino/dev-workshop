// Panneau d'un projet : son contexte (donné à toutes les IA à chaque session), l'export de la session
// affichée, la mise à la corbeille. Et la corbeille : un projet s'y récupère pendant 30 jours.
import { h, notifier, dateCourte } from './dom.js';
import { t, ajouterTextes, langue } from './i18n.js';
import { dire, ecouter } from './canal.js';

ajouterTextes({
  fr: {
    reglages_projet: 'Réglages du projet', contexte_projet: 'Fiche du projet (mémoire)',
    contexte_aide: 'Donnée à toutes les IA (Claude, ChatGPT, Gemini, API…) au début de chaque discussion de ce projet : but, règles, stack, conventions, personnes à connaître… Dans une discussion, « Retenir pour le projet » y ajoute ce qu’il faut garder.',
    contexte_exemple: 'Ex. : Application de facturation en React + Supabase. Toujours écrire les textes en français. Ne jamais toucher à la base de production.',
    enregistrer: 'Enregistrer', contexte_enregistre: 'Fiche enregistrée.', sessions_ouvertes: '{n} discussion(s) ouverte(s) dans ce projet.',
    exporter_session: 'Exporter la discussion affichée (Markdown)', aucune_session_affichee: 'Ouvre d’abord une discussion à exporter.',
    zone_danger: 'Mettre à la corbeille', corbeille_aide: 'Le dossier part dans la corbeille du serveur. Il se récupère pendant {n} jours, puis il est effacé pour de bon.',
    confirmer_nom: 'Retape « {nom} » pour confirmer', mettre_corbeille: 'Mettre le projet à la corbeille',
    corbeille: 'Corbeille', corbeille_vide: 'La corbeille est vide.', restaurer: 'Restaurer', effacer_def: 'Effacer définitivement',
    efface_le: 'mis à la corbeille le {date} · effacé le {fin}', confirmer_effacement: 'Effacer « {nom} » pour de bon ? Rien ne pourra le récupérer.',
    projet_restaure: 'Projet « {nom} » restauré.', projet_a_corbeille: 'Projet mis à la corbeille.',
    refus_confirmation_invalide: 'Le nom retapé ne correspond pas.', refus_sessions_en_cours: 'Ferme d’abord les discussions ouvertes dans ce projet.',
    refus_projet_existe: 'Un projet porte déjà ce nom : renomme-le avant de restaurer.', refus_contexte_trop_long: 'Fiche trop longue (20 000 caractères au plus) : fais du tri dans les réglages du projet.',
    refus_projet_inconnu: 'Ce projet n’existe plus.', refus_corbeille_inconnue: 'Ce projet n’est plus dans la corbeille.',
    projet_corbeille_titre: 'Mettre le projet à la corbeille', session_corbeille_titre: 'Mettre la discussion à la corbeille',
    confirmer_session_corbeille: 'Mettre la discussion « {titre} » à la corbeille ? Une discussion en cours est d’abord fermée. Elle se récupère pendant 30 jours.',
    corbeille_projets: 'Projets', corbeille_sessions: 'Discussions', session_du_projet: 'discussion · {projet}',
    session_restauree: 'Discussion restaurée : elle est de retour dans la liste de son projet.',
    refus_session_inconnue: 'Cette discussion n’existe plus (ou n’a pas encore été enregistrée).',
    regles_titre: 'Travail sans toi : règles d’accord', regles_enregistrees: 'Règles d’accord enregistrées : elles valent pour les prochaines demandes.',
    regles_aide: 'L’IA fait sans te demander ce qui est coché ✓, et ce qui est coché ✕ est toujours refusé (même en « tout autoriser » pour Claude). Le reste revient à l’écran selon le mode choisi.',
    regle_lectures: 'Lire et chercher dans les fichiers', regle_modifications: 'Modifier les fichiers du projet (pas en dehors)',
    regle_tests: 'Lancer les tests et la compilation (npm test, pytest, cargo test…)', regle_navigateur: 'Utiliser le navigateur web (tests de pages)',
    retenir_titre: 'Retenir pour le projet', retenir_aide: 'Proposé par l’IA à partir de la discussion. Corrige ou raccourcis : ce texte sera ajouté à la fin de la fiche du projet, que toutes les prochaines discussions de « {projet} » recevront.',
    retenir_ajouter: 'Ajouter à la fiche', annuler_retenir: 'Annuler', retenu_le: 'Retenu le {date} — « {titre} »', projet_retenu: 'Ajouté à la fiche de « {projet} ».',
    refus_rien_a_retenir: 'Rien à ajouter : le texte est vide.',
    regle_refuserSuppressions: 'Refuser les suppressions (rm, git push --force, git reset --hard…)', regle_refuserReseau: 'Refuser les commandes réseau (curl, wget, ssh, scp…)',
  },
  en: {
    reglages_projet: 'Project settings', contexte_projet: 'Project notes (memory)',
    contexte_aide: 'Given to every AI (Claude, ChatGPT, Gemini, APIs…) at the start of each conversation in this project: goal, rules, stack, conventions, people to know… In a conversation, “Remember for the project” adds what is worth keeping.',
    contexte_exemple: 'E.g.: Invoicing app in React + Supabase. Always write UI text in English. Never touch the production database.',
    enregistrer: 'Save', contexte_enregistre: 'Notes saved.', sessions_ouvertes: '{n} open conversation(s) in this project.',
    exporter_session: 'Export the displayed conversation (Markdown)', aucune_session_affichee: 'Open a conversation to export first.',
    zone_danger: 'Move to trash', corbeille_aide: 'The folder goes to the server’s trash. It can be restored for {n} days, then it is deleted for good.',
    confirmer_nom: 'Type “{nom}” to confirm', mettre_corbeille: 'Move the project to trash',
    corbeille: 'Trash', corbeille_vide: 'The trash is empty.', restaurer: 'Restore', effacer_def: 'Delete for good',
    efface_le: 'trashed on {date} · deleted on {fin}', confirmer_effacement: 'Delete “{nom}” for good? Nothing can bring it back.',
    projet_restaure: 'Project “{nom}” restored.', projet_a_corbeille: 'Project moved to trash.',
    refus_confirmation_invalide: 'The typed name does not match.', refus_sessions_en_cours: 'Close the conversations open in this project first.',
    refus_projet_existe: 'A project already has this name: rename it before restoring.', refus_contexte_trop_long: 'Notes too long (20,000 characters at most): tidy them up in the project settings.',
    refus_projet_inconnu: 'This project no longer exists.', refus_corbeille_inconnue: 'This project is no longer in the trash.',
    projet_corbeille_titre: 'Move the project to trash', session_corbeille_titre: 'Move the conversation to trash',
    confirmer_session_corbeille: 'Move the conversation “{titre}” to trash? A running conversation is closed first. It can be restored for 30 days.',
    corbeille_projets: 'Projects', corbeille_sessions: 'Conversations', session_du_projet: 'conversation · {projet}',
    session_restauree: 'Conversation restored: it is back in its project’s list.',
    refus_session_inconnue: 'This conversation no longer exists (or has not been saved yet).',
    regles_titre: 'Working without you: approval rules', regles_enregistrees: 'Approval rules saved: they apply to the next requests.',
    regles_aide: 'The AI does what is ticked ✓ without asking, and what is ticked ✕ is always refused (even in “allow everything” for Claude). The rest comes back to the screen according to the chosen mode.',
    regle_lectures: 'Read and search files', regle_modifications: 'Change the project’s files (not outside)',
    regle_tests: 'Run tests and builds (npm test, pytest, cargo test…)', regle_navigateur: 'Use the web browser (page tests)',
    retenir_titre: 'Remember for the project', retenir_aide: 'Suggested by the AI from the conversation. Edit or shorten it: this text is added at the end of the project notes, which every next conversation in “{projet}” receives.',
    retenir_ajouter: 'Add to the notes', annuler_retenir: 'Cancel', retenu_le: 'Remembered on {date} — “{titre}”', projet_retenu: 'Added to the notes of “{projet}”.',
    refus_rien_a_retenir: 'Nothing to add: the text is empty.',
    regle_refuserSuppressions: 'Refuse deletions (rm, git push --force, git reset --hard…)', regle_refuserReseau: 'Refuse network commands (curl, wget, ssh, scp…)',
  },
});

const panneau = () => document.getElementById('panneau-projet');
let actions = {};
let mode = null;
let dureeJours = 30;
let versCorbeille = false;

const fermer = () => {
  panneau().hidden = true;
  mode = null;
};
const entete = (titre) => h('header', {}, h('h2', {}, titre), h('button', { type: 'button', onclick: fermer }, t('fermer')));

/** « Travail sans toi » : ce que l'IA fait sans demander dans ce projet, et ce qui est toujours refusé. */
const REGLES = [['lectures', 'oui'], ['modifications', 'oui'], ['tests', 'oui'], ['navigateur', 'oui'], ['refuserSuppressions', 'non'], ['refuserReseau', 'non']];
function blocRegles(m) {
  const cases = REGLES.map(([cle, sens]) => h('label.option', {},
    h('input', { type: 'checkbox', checked: Boolean(m.regles?.[cle]), dataset: { cle } }),
    h('span', {}, (sens === 'oui' ? '✓ ' : '✕ ') + t('regle_' + cle))));
  return h('section.bloc-projet', {},
    h('h3', {}, t('regles_titre')), h('p.aide', {}, t('regles_aide')), ...cases,
    h('div.rangee', {}, h('button.principal', { type: 'button', onclick: () => dire({
      t: 'projet_regles', nom: m.nom, regles: Object.fromEntries(cases.map((c) => { const i = c.querySelector('input'); return [i.dataset.cle, i.checked]; })),
    }) }, t('enregistrer'))));
}

function dessinerProjet(m) {
  const contexte = h('textarea.contexte', { rows: 9, maxLength: 20000, placeholder: t('contexte_exemple') });
  contexte.value = m.contexte || '';
  const confirmation = h('input', { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: t('confirmer_nom', { nom: m.nom }) });
  panneau().replaceChildren(h('div.boite', {},
    entete(`${t('reglages_projet')} · ${m.nom}`),
    h('section.bloc-projet', {},
      h('h3', {}, t('contexte_projet')), h('p.aide', {}, t('contexte_aide')), contexte,
      h('div.rangee', {}, h('button.principal', { type: 'button', onclick: () => dire({ t: 'projet_contexte', nom: m.nom, contexte: contexte.value }) }, t('enregistrer')))),
    blocRegles(m),
    h('section.bloc-projet', {},
      m.sessions ? h('p.aide', {}, t('sessions_ouvertes', { n: m.sessions })) : null,
      h('button', { type: 'button', onclick: () => actions.exporter() || notifier(t('aucune_session_affichee')) }, t('exporter_session'))),
    h('section.bloc-projet.danger', {},
      h('h3', {}, t('zone_danger')), h('p.aide', {}, t('corbeille_aide', { n: dureeJours })),
      h('form.rangee', { onsubmit: (e) => {
        e.preventDefault();
        dire({ t: 'projet_supprimer', nom: m.nom, confirmation: confirmation.value.trim() });
      } }, confirmation, h('button.danger', { type: 'submit' }, t('mettre_corbeille')))),
  ));
  if (versCorbeille) {
    versCorbeille = false;
    confirmation.scrollIntoView({ block: 'center' });
    confirmation.focus();
  }
}

function dessinerCorbeille(m) {
  dureeJours = m.dureeJours || dureeJours;
  const lignes = m.projets.map((p) => h('article.compte', {},
    h('header', {}, h('strong', {}, p.nom), h('span.type', {}, t('efface_le', { date: dateCourte(p.supprimeLe), fin: dateCourte(p.effaceLe) }))),
    h('div.rangee', {},
      h('button.principal', { type: 'button', onclick: () => dire({ t: 'corbeille_restaurer', id: p.id }) }, t('restaurer')),
      h('button.discret', { type: 'button', onclick: () => confirm(t('confirmer_effacement', { nom: p.nom })) && dire({ t: 'corbeille_effacer', id: p.id }) }, t('effacer_def')))));
  const sessions = (m.sessions || []).map((s) => h('article.compte', {},
    h('header', {}, h('strong', {}, s.titre || t('sans_titre')), h('span.type', {}, `${t('session_du_projet', { projet: s.projet })} · ${t('efface_le', { date: dateCourte(s.supprimeLe), fin: dateCourte(s.effaceLe) })}`)),
    h('div.rangee', {},
      h('button.principal', { type: 'button', onclick: () => { dire({ t: 'corbeille_session_restaurer', id: s.id }); notifier(t('session_restauree')); } }, t('restaurer')),
      h('button.discret', { type: 'button', onclick: () => confirm(t('confirmer_effacement', { nom: s.titre || t('sans_titre') })) && dire({ t: 'corbeille_session_effacer', id: s.id }) }, t('effacer_def')))));
  panneau().replaceChildren(h('div.boite', {},
    entete(t('corbeille')),
    h('p.aide', {}, t('corbeille_aide', { n: dureeJours })),
    !lignes.length && !sessions.length ? h('p.vide', {}, t('corbeille_vide')) : null,
    lignes.length ? [h('h3', {}, t('corbeille_projets')), h('div.liste-comptes', {}, lignes)] : null,
    sessions.length ? [h('h3', {}, t('corbeille_sessions')), h('div.liste-comptes', {}, sessions)] : null));
}

/**
 * « Retenir pour le projet » : le texte proposé par l'IA, à relire et corriger, puis ajouté à la fin de la fiche.
 * Rien n'est écrit sans ce clic.
 */
export function ouvrirRetenir({ projet, titre, texte }) {
  mode = 'retenir';
  panneau().hidden = false;
  const zone = h('textarea.retenu', { rows: 10, maxLength: 20000 });
  zone.value = texte || '';
  panneau().replaceChildren(h('div.boite', {},
    entete(`${t('retenir_titre')} · ${projet}`),
    h('p.aide', {}, t('retenir_aide', { projet })),
    zone,
    h('div.rangee', {},
      h('button.principal', { type: 'button', onclick: () => {
        const date = new Intl.DateTimeFormat(langue(), { dateStyle: 'long' }).format(new Date());
        const bloc = `## ${t('retenu_le', { date, titre: titre || t('sans_titre') })}\n\n${zone.value.trim()}`;
        if (zone.value.trim()) dire({ t: 'projet_retenir', nom: projet, texte: bloc });
        else notifier(t('refus_rien_a_retenir'), { echec: true });
      } }, t('retenir_ajouter')),
      h('button.discret', { type: 'button', onclick: fermer }, t('annuler_retenir')))));
  zone.focus();
}

/** `corbeille` : ouvre directement sur la mise à la corbeille (bouton 🗑 du projet dans la barre). */
export function ouvrirProjet(nom, { corbeille = false } = {}) {
  if (!nom) return;
  mode = 'projet';
  versCorbeille = corbeille;
  panneau().hidden = false;
  panneau().replaceChildren(h('div.boite', {}, entete(`${t('reglages_projet')} · ${nom}`)));
  dire({ t: 'projet_lire', nom });
}

export function ouvrirCorbeille() {
  mode = 'corbeille';
  panneau().hidden = false;
  panneau().replaceChildren(h('div.boite', {}, entete(t('corbeille'))));
  dire({ t: 'corbeille_lire' });
}

export function majCorbeille(n) {
  const el = document.getElementById('compte-corbeille');
  if (el) el.textContent = n ? String(n) : '';
}

/** `actions` : { exporter() -> vrai si une session a été exportée, projetSupprime(nom) }. */
export function initProjet(a) {
  actions = a;
  document.getElementById('ouvrir-corbeille').addEventListener('click', ouvrirCorbeille);
  ecouter((m) => {
    if (m.t === 'projet' && mode === 'projet') dessinerProjet(m);
    else if (m.t === 'projet_enregistre') notifier(t('contexte_enregistre'));
    else if (m.t === 'projet_regles') notifier(t('regles_enregistrees'));
    else if (m.t === 'projet_retenu') {
      if (mode === 'retenir') fermer();
      notifier(t('projet_retenu', { projet: m.nom }));
    }
    else if (m.t === 'corbeille') {
      dureeJours = m.dureeJours || dureeJours;
      if (mode === 'projet') {
        fermer();
        notifier(t('projet_a_corbeille'));
        actions.projetSupprime?.();
      } else if (mode === 'corbeille') dessinerCorbeille(m);
    } else if (m.t === 'projet_restaure') notifier(t('projet_restaure', { nom: m.nom }));
  });
}
