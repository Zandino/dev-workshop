// Point d'entrée : état de l'écran et aiguillage des événements du serveur.
import { h, notifier } from './dom.js';
import { t, traduirePage, langue, changerLangue, LANGUES, aTexte } from './i18n.js';
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
import { ouvrirProjet, majCorbeille } from './projet.js';
import { nouvelAppel, surEvenementDirect } from './direct.js';
import { pastilleLogo } from './logos.js';
import { brancherAjouts } from './ajouts.js';

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
  // À plusieurs, compte et modèle sont fixés par participant.
  for (const id of ['compte', 'modele']) $(id).disabled = ecran.salon; // en session, changer de compte passe la main
  etatSaisie({ active: Boolean(ecran.projet) && !ecran.etat.ferme, occupe: Boolean(ecran.etat.occupe) });
  $('joindre').disabled = !ecran.projet || Boolean(ecran.etat.ferme);
  if (ecran.etat.mode) $('mode').value = ecran.etat.mode;
  $('logo-compte').replaceChildren(...(compteChoisi() && !ecran.salon ? [pastilleLogo(compteChoisi())] : []));
}

function quitterSession() {
  if (ecran.session) dire({ t: 'detacher', session: ecran.session });
  Object.assign(ecran, { session: null, salon: false, etat: {}, journal: [], titre: '' });
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
  ecran.session = m.session;
  ecran.projet = m.resume.projet;
  ecran.salon = Boolean(m.resume.participants);
  if (m.resume.compte) $('compte').value = m.resume.compte;
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
    if ('occupe' in m && !ecran.rejeu) dire({ t: 'general' });
  } else if (m.t === 'capacites') {
    definirCommandes(m.commandes);
    const modeles = m.modeles.length ? m.modeles : [{ id: 'default', nom: '' }];
    options($('modele'), modeles.map((x) => [x.id, x.id === 'default' ? t('modele_defaut') : x.nom]), ecran.etat.modele || 'default');
  } else if (m.t === 'pret') {
    ecran.etat.mode = m.mode;
    majEntete();
  } else if (m.t === 'permission' || m.t === 'permission_fin') {
    if (m.t === 'permission') afficherPermission(m);
    else retirerPermission(m.id);
    if (!ecran.rejeu) dire({ t: 'general' }); // la pastille de la barre suit l'attente d'accord
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
  const choisi = m.comptes.some((c) => c.id === $('compte').value) || $('compte').value === 'orchestre' ? $('compte').value : 'defaut';
  options($('compte'), [...m.comptes.map((c) => [c.id, libelleCompte(c)]), ['orchestre', t('compte_orchestre')]], choisi);
  majComptes(m.comptes);
  majComptesSalon(m.comptes);
  majCorbeille(m.corbeille);
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
  else if (m.t === 'historique') m.projet === ecran.projet && majBarre({ historique: m.sessions });
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
  $('jauge').addEventListener('click', () => $('conso').toggleAttribute('hidden')); $('ouvrir-comptes').addEventListener('click', ouvrirComptes);
  $('ouvrir-salon').addEventListener('click', () => ecran.projet && ouvrirSalon());
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
  initSalon((reglages) => {
    quitterSession();
    dire({ t: 'ouvrir', projet: ecran.projet, mode: $('mode').value, ...reglages });
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
    reprendre: (s) => {
      quitterSession();
      // Les sessions passées appartiennent au compte du serveur : la reprise se fait toujours sur lui.
      ouvrir({ reprise: s.id, titre: s.titre, compte: 'defaut' });
    },
  });
  razJauge();
  majEntete();
  if (jetonInitial()) connecter();
  else demanderJeton();
}

demarrer();
