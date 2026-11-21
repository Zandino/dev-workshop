// Point d'entrée : état de l'écran et aiguillage des événements du serveur.
import { h, notifier } from './dom.js';
import { t, traduirePage, langue, changerLangue, LANGUES, aTexte, ajouterTextes } from './i18n.js';
import { jetonInitial, definirJeton, oublierJeton, connecter, ecouter, dire } from './canal.js';
import { initFil, viderFil, afficher, noteFil, definirSignature } from './fil.js';
import { afficherPermission, retirerPermission, viderPermissions } from './permissions.js';
import { majJauge, razJauge } from './jauge.js';
import { initSaisie, etatSaisie } from './saisie.js';
import { initBarre, majBarre } from './barre.js';
import { definirCommandes } from './commandes.js';
import { majComptes, surEtatCompte, surConnexion, ouvrirComptes, libelleCompte } from './comptes.js';
import { initSalon, majComptesSalon, ouvrirSalon } from './salon.js';
import { prendrePieces } from './pieces.js';
import { ouvrirProjet, majCorbeille, ouvrirRetenir } from './projet.js';
import { initDiscussions, ouvrirDiscussions, ouvrirRanger, majProjetsDiscussions } from './discussions.js';
import { nouvelAppel, surEvenementDirect } from './direct.js';
import { pastilleLogo } from './logos.js';
import { brancherAjouts } from './ajouts.js';
import { initAlertes } from './alertes.js';

ajouterTextes({
  fr: {
    retenir_bouton: 'Retenir pour le projet',
    retenir_consigne: 'Pour la fiche du projet : résume en quelques puces courtes ce qu’il faut retenir de cette discussion pour les prochaines (décisions prises, informations durables, pièges à éviter). Ne répète pas ce que la fiche du projet contient déjà. Réponds uniquement par ces puces, sans introduction ni conclusion, et sans utiliser d’outil.',
    retenir_occupe: 'L’IA travaille encore : attends la fin de sa réponse pour « Retenir pour le projet ».',
    retenir_echec: 'L’IA n’a pas pu proposer de texte à retenir : réessaie, ou écris-le toi-même dans la fiche (réglages du projet).',
  },
  en: {
    retenir_bouton: 'Remember for the project',
    retenir_consigne: 'For the project notes: summarise in a few short bullet points what is worth keeping from this conversation for the next ones (decisions made, lasting facts, pitfalls to avoid). Do not repeat what the project notes already say. Reply with the bullet points only, no introduction or conclusion, and without using any tool.',
    retenir_occupe: 'The AI is still working: wait for its answer to finish before “Remember for the project”.',
    retenir_echec: 'The AI could not suggest anything to remember: try again, or write it yourself in the notes (project settings).',
  },
});

const $ = (id) => document.getElementById(id);
// `journal` : les événements de la session affichée, gardés pour l'export.
const ecran = { general: null, projet: null, session: null, etat: {}, enAttente: null, salon: false, journal: [], titre: '' };
const compteChoisi = () => ecran.general?.comptes.find((c) => c.id === $('compte').value) || null;

function memoire(cle, valeur) {
  try {
    if (valeur === undefined) return localStorage.getItem(cle);
    localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible */ }
  return null;
}

function options(select, liste, choisi) {
  select.replaceChildren(...liste.map(([valeur, libelle, coupe]) => h('option', { value: valeur, selected: valeur === choisi, disabled: coupe }, libelle)));
}

function majEntete() {
  $('titre-session').textContent = ecran.projet || t('titre');
  $('fermer-session').hidden = !ecran.session;
  $('retenir').hidden = !ecran.session || ecran.salon || Boolean(ecran.etat.ferme);
  // À plusieurs, le modèle est fixé par participant. Choisir une IA dans la liste, en discussion, change son équipe
  // en gardant l'historique (travail.js).
  $('modele').disabled = ecran.salon;
  etatSaisie({ active: Boolean(ecran.projet) && !ecran.etat.ferme, occupe: Boolean(ecran.etat.occupe) });
  $('joindre').disabled = !ecran.projet || Boolean(ecran.etat.ferme);
  if (ecran.etat.mode) $('mode').value = ecran.etat.mode;
  $('logo-compte').replaceChildren(...(compteChoisi() && !ecran.salon ? [pastilleLogo(compteChoisi())] : []));
}

function quitterSession() {
  if (ecran.session) dire({ t: 'detacher', session: ecran.session });
  Object.assign(ecran, { session: null, salon: false, etat: {}, journal: [], titre: '', retenir: null });
  if ($('compte').value === 'salon') $('compte').value = 'defaut'; // « Plusieurs IA » ne s'ouvre que par 👥
  definirSignature(null);
  nouvelAppel(null);
  viderPermissions();
  razJauge();
  viderFil(ecran.projet ? t('accueil', { projet: ecran.projet }) : t('choisir_projet'));
  majBarre({ active: null });
  majEntete();
}

function choisirProjet(projet) {
  quitterSession();
  ecran.projet = projet;
  memoire('devworkshop.projet', projet);
  viderFil(t('accueil', { projet }));
  majBarre({ projet, historique: [] });
  dire({ t: 'historique', projet });
  majEntete();
}

/** Rouvre une discussion enregistrée (compte Claude du serveur) ; si elle est déjà ouverte, on la rejoint. */
function reprendreDiscussion(d, projet = ecran.projet) {
  const ouverte = ecran.general?.vivantes.find((v) => v.sessionId && v.sessionId === d.id);
  if (ouverte) return ouverte.id !== ecran.session && dire({ t: 'attacher', session: ouverte.id });
  if (projet !== ecran.projet) choisirProjet(projet);
  else quitterSession();
  ouvrir({ reprise: d.id, titre: d.titre, compte: 'defaut' });
}

/** « Retenir pour le projet » : la réponse de l'IA à la consigne, proposée à la relecture avant la fiche. */
function finirRetenir(tour) {
  const depuis = ecran.retenir;
  ecran.retenir = null;
  if (!tour.ok) return notifier(t('retenir_echec'), { echec: true });
  const texte = ecran.journal.slice(depuis)
    .filter((e) => e.t === 'assistant' && !e.sousAgent)
    .flatMap((e) => (e.blocs || []).filter((b) => b.type === 'texte').map((b) => b.texte))
    .join('\n\n').trim();
  if (!texte) return notifier(t('retenir_echec'), { echec: true });
  ouvrirRetenir({ projet: ecran.projet, titre: ecran.titre, texte });
}

function ouvrir(extra = {}) {
  const orchestre = $('compte').value === 'orchestre'; // Claude (compte du serveur) en cheffe d'orchestre
  dire({ t: 'ouvrir', compte: orchestre ? 'defaut' : $('compte').value, orchestre, projet: ecran.projet, modele: $('modele').value, mode: $('mode').value, effort: $('effort').value, ...extra });
}

/** Rend faux si le message ne part pas encore (fichiers joints en cours d'envoi) : la saisie le garde. */
function envoyer(texte) {
  const fichiers = prendrePieces();
  if (fichiers === null) return false;
  if (ecran.session && !ecran.etat.ferme) return dire({ t: 'envoyer', session: ecran.session, texte, fichiers });
  ecran.enAttente = { texte, fichiers }; // la session s'ouvre, le message part dès qu'elle répond
  ouvrir();
}

function surRejouer(m) {
  if (ecran.session && ecran.session !== m.session) dire({ t: 'detacher', session: ecran.session });
  // Rejoindre une discussion d'un autre projet : la liste de la barre suit ce projet.
  if (m.resume.projet !== ecran.projet) {
    memoire('devworkshop.projet', m.resume.projet);
    majBarre({ historique: [] });
    dire({ t: 'historique', projet: m.resume.projet });
  }
  ecran.session = m.session;
  ecran.projet = m.resume.projet;
  ecran.salon = Boolean(m.resume.participants);
  $('compte').value = m.resume.participants ? 'salon' : m.resume.orchestre ? 'orchestre' : m.resume.compte || 'defaut';
  ecran.etat = { ...m.etat };
  ecran.titre = m.resume.titre || '';
  ecran.journal = [...m.evenements];
  // Session à une seule IA : son logo et son nom signent ses réponses, dans le fil comme en direct.
  const c = ecran.general?.comptes.find((x) => x.id === m.resume.compte);
  const signature = !ecran.salon && c ? { compte: c, nom: libelleCompte(c) } : null;
  definirSignature(signature);
  nouvelAppel(signature);
  viderPermissions();
  razJauge();
  viderFil();
  ecran.rejeu = true;
  for (const e of m.evenements) surEvenement({ ...e, session: m.session });
  ecran.rejeu = false;
  majBarre({ projet: ecran.projet, active: m.session });
  majEntete();
  if (ecran.enAttente) {
    dire({ t: 'envoyer', session: m.session, ...ecran.enAttente });
    ecran.enAttente = null;
  }
  dire({ t: 'general' });
}

function surEvenement(m) {
  surEvenementDirect(m, ecran.rejeu);
  if (m.t === 'utilisateur' && !ecran.titre) ecran.titre = m.texte.slice(0, 80);
  if (m.t === 'etat') {
    Object.assign(ecran.etat, m);
    if (m.modele) $('modele').value = m.modele;
    if (m.ferme) noteFil(t('session_fermee'));
    majEntete();
  } else if (m.t === 'capacites') {
    definirCommandes(m.commandes);
    const modeles = m.modeles.length ? m.modeles : [{ id: 'default', nom: '' }];
    options($('modele'), modeles.map((x) => [x.id, x.id === 'default' ? t('modele_defaut') : x.nom]), ecran.etat.modele || 'default');
  } else if (m.t === 'pret') {
    ecran.etat.mode = m.mode;
    majEntete();
  } else if (m.t === 'permission' || m.t === 'permission_fin') {
    if (m.t === 'permission') afficherPermission(m);
    else retirerPermission(m.id); // la pastille de la barre suit l'attente d'accord par la veille (« vivantes »)
  } else if (m.t === 'contexte' || m.t === 'tour' || m.t === 'limite') {
    majJauge(m);
    if (m.t === 'tour') afficher(m);
  } else {
    afficher(m);
  }
}

function surGeneral(m) {
  ecran.general = m;
  $('version').textContent = m.version || '';
  const choisi = m.comptes.some((c) => c.id === $('compte').value) || ['orchestre', 'salon'].includes($('compte').value) ? $('compte').value : 'defaut';
  // « Plusieurs IA » se choisit par 👥 (participants) : dans la liste, il dit seulement ce qu'est la discussion.
  options($('compte'), [...m.comptes.map((c) => [c.id, libelleCompte(c)]), ['orchestre', t('compte_orchestre')], ['salon', t('compte_salon'), true]], choisi);
  majComptes(m.comptes);
  majComptesSalon(m.comptes);
  majCorbeille(m.corbeille);
  majProjetsDiscussions(m.projets);
  majBarre({ general: m });
  majEntete();
  if (!ecran.projet) {
    const memo = memoire('devworkshop.projet');
    if (m.projets.includes(memo)) choisirProjet(memo);
    else viderFil(t('choisir_projet'));
  }
  // Après une coupure, on se rattache à la session affichée si elle vit encore.
  if (ecran.session && ecran.rattacher) {
    ecran.rattacher = false;
    if (m.vivantes.some((s) => s.id === ecran.session)) dire({ t: 'attacher', session: ecran.session });
    else quitterSession();
  }
}

ecouter((m) => {
  if (m.t === 'canal') {
    $('bandeau').hidden = m.etat !== 'perdu';
    if (m.etat === 'perdu') ecran.rattacher = true;
    if (m.etat === 'jeton_refuse') {
      oublierJeton();
      demanderJeton(true);
    }
  } else if (m.t === 'general') surGeneral(m);
  else if (m.t === 'vivantes' && ecran.general) {
    ecran.general.vivantes = m.vivantes; // veille du serveur : toutes les discussions ouvertes, en direct
    majBarre({ general: ecran.general });
  } else if (m.t === 'historique') m.projet === ecran.projet && majBarre({ historique: m.sessions });
  else if (m.t === 'rejouer') surRejouer(m);
  else if (m.t === 'etat_compte') surEtatCompte(m);
  else if (m.t === 'connexion') surConnexion(m);
  else if (m.t === 'refus') {
    ecran.enAttente = null;
    const texte = aTexte('refus_' + m.code) ? t('refus_' + m.code) : t('refus', { code: m.code });
    // Un panneau ouvert cache le fil : la notification, elle, se voit toujours.
    if (m.session) noteFil(texte, true);
    notifier(texte, { echec: true });
  } else if (m.session && m.session === ecran.session) {
    ecran.journal.push(m);
    surEvenement(m);
    if (m.t === 'tour' && ecran.retenir != null) finirRetenir(m);
  }
});

function demanderJeton(refuse = false) {
  $('porte').hidden = false;
  $('porte-erreur').hidden = !refuse;
}

function demarrer() {
  traduirePage();
  document.title = t('titre');
  options($('langue'), Object.entries(LANGUES), langue());
  options($('mode'), ['default', 'auto', 'acceptEdits', 'plan', 'bypassPermissions'].map((m) => [m, t('mode_' + m)]), 'default');
  options($('modele'), [['default', t('modele_defaut')]], 'default');
  $('langue').addEventListener('change', (e) => changerLangue(e.target.value));
  $('mode').addEventListener('change', (e) => ecran.session && dire({ t: 'mode', session: ecran.session, mode: e.target.value }));
  $('modele').addEventListener('change', (e) => ecran.session && dire({ t: 'modele', session: ecran.session, modele: e.target.value }));
  $('nouvelle').addEventListener('click', () => ecran.projet && choisirProjet(ecran.projet));
  $('fermer-session').addEventListener('click', () => {
    dire({ t: 'fermer', session: ecran.session });
    choisirProjet(ecran.projet);
  });
  $('retenir').addEventListener('click', () => {
    if (!ecran.session || ecran.salon || ecran.retenir != null) return;
    if (ecran.etat.occupe) return notifier(t('retenir_occupe'));
    ecran.retenir = ecran.journal.length;
    dire({ t: 'envoyer', session: ecran.session, texte: t('retenir_consigne') });
  });
  $('jauge').addEventListener('click', () => $('conso').toggleAttribute('hidden')); $('ouvrir-comptes').addEventListener('click', ouvrirComptes);
  // Depuis une discussion ouverte, le panneau part de son équipe et peut l'appliquer à cette discussion.
  $('ouvrir-salon').addEventListener('click', () => ecran.projet && ouvrirSalon(ecran.session && !ecran.etat.ferme ? ecran.general?.vivantes.find((v) => v.id === ecran.session) || null : null));
  // Changer de compte hors session remet le choix du modèle à zéro (chaque compte a les siens).
  $('compte').addEventListener('change', () => {
    options($('modele'), [['default', t('modele_defaut')]], 'default');
    majEntete();
  });
  brancherAjouts({ ecran, compte: compteChoisi, libelle: libelleCompte, projetSupprime: () => {
    ecran.projet = null;
    memoire('devworkshop.projet', '');
    majBarre({ projet: null, historique: [] });
    quitterSession();
  } });
  initSalon({
    demarrer: (reglages) => {
      quitterSession();
      dire({ t: 'ouvrir', projet: ecran.projet, mode: $('mode').value, ...reglages });
    },
    appliquer: (reglages) => dire({ t: 'changer_equipe', session: ecran.session, ...reglages }),
  });
  $('form-porte').addEventListener('submit', (e) => {
    e.preventDefault();
    definirJeton($('porte-jeton').value);
    $('porte-jeton').value = '';
    $('porte').hidden = true;
    connecter();
  });
  initFil();
  initSaisie({ envoyer, arreter: () => ecran.session && dire({ t: 'interrompre', session: ecran.session }) });
  initBarre({
    choisirProjet,
    ouvrirProjet,
    sessionCorbeille: (quoi) => dire({ t: 'session_corbeille', ...quoi }),
    rejoindre: (s) => s.id !== ecran.session && dire({ t: 'attacher', session: s.id }),
    // Les discussions enregistrées appartiennent au compte du serveur : la reprise se fait toujours sur lui.
    reprendre: (s) => reprendreDiscussion(s),
    ranger: ouvrirRanger,
    voirToutes: ouvrirDiscussions,
    nouvelle: () => ecran.projet && choisirProjet(ecran.projet),
  });
  initDiscussions({ reprendre: (d) => reprendreDiscussion(d, d.projet) });
  initAlertes({ ecran, libelle: libelleCompte, rejoindre: (id) => id !== ecran.session && dire({ t: 'attacher', session: id }) });
  razJauge();
  majEntete();
  if (jetonInitial()) connecter();
  else demanderJeton();
}

demarrer();
