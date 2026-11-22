// Bureau en direct, à droite de la conversation : une carte par IA, qui montre ce qu'elle fait à l'instant. Trois
// onglets : le fichier qu'elle modifie (lignes changées), son terminal (commande et sortie), son navigateur (dernière
// capture d'écran). L'onglet suit sa dernière action, sauf si tu en as choisi un.
// Tout vient des événements de la discussion : rien de plus ne tourne sur le serveur. Les captures ne sont pas gardées
// dans le journal (trop lourdes) : à la reprise d'une discussion, seule leur trace reste.
import { h } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { pastilleLogo } from './logos.js';
import { detailOutil } from './outils.js';

ajouterTextes({
  fr: {
    bureau: 'Bureau en direct', bureau_fermer: 'Fermer le bureau', bureau_vide: 'Le bureau montrera ici ce que fait chaque IA : le fichier qu’elle modifie, son terminal, son navigateur.',
    onglet_fichier: 'Fichier', onglet_terminal: 'Terminal', onglet_navigateur: 'Navigateur',
    poste_attente: 'à l’écoute', poste_reflechit: 'réfléchit…', poste_ecrit: 'écrit…', poste_outil: 'travaille', poste_accord: 'attend ton accord ✋',
    rien_fichier: 'Aucun fichier modifié pour l’instant.', rien_terminal: 'Aucune commande pour l’instant.', rien_navigateur: 'Pas de navigateur pour l’instant.',
    capture_non_gardee: 'Capture non gardée (elle ne s’affiche qu’en direct).', en_cours: 'en cours…',
  },
  en: {
    bureau: 'Live desk', bureau_fermer: 'Close the desk', bureau_vide: 'The desk will show here what each AI is doing: the file it edits, its terminal, its browser.',
    onglet_fichier: 'File', onglet_terminal: 'Terminal', onglet_navigateur: 'Browser',
    poste_attente: 'listening', poste_reflechit: 'thinking…', poste_ecrit: 'writing…', poste_outil: 'working', poste_accord: 'waiting for your approval ✋',
    rien_fichier: 'No file edited yet.', rien_terminal: 'No command yet.', rien_navigateur: 'No browser yet.',
    capture_non_gardee: 'Screenshot not kept (it only shows live).', en_cours: 'running…',
  },
});

const ECRITURE = /^(Edit|MultiEdit|Write|NotebookEdit|Patch|write_file|replace|edit|create)$/i;
const TERMINAL = /^(Bash|shell|execute|run_shell_command|local_shell)$/i;
const NAVIGATEUR = /^mcp__navigateur|browser|playwright|puppeteer/i;
const MAX_SORTIE = 6000;

const zone = () => document.getElementById('bureau');
const postes = new Map(); // nom -> poste
const appels = new Map(); // id d'appel d'outil -> { poste, genre }
let principal = { nom: 'IA', compte: null };
let ouvert = false;
let prevu = false;

function poste(auteur) {
  const nom = auteur?.nom || principal.nom;
  if (!postes.has(nom)) {
    postes.set(nom, { nom, compte: auteur?.compte || principal.compte, rang: auteur?.rang ?? postes.size, etat: 'attente', onglet: null, choisi: null, fichier: null, terminal: null, navigateur: null });
  }
  return postes.get(nom);
}

/** Une nouvelle discussion s'affiche : le bureau repart de zéro. `sig` : { compte, nom } de l'IA seule, ou null. */
export function nouveauBureau(sig) {
  postes.clear();
  appels.clear();
  principal = sig ? { nom: sig.nom, compte: sig.compte } : { nom: 'IA', compte: null };
  redessiner();
}

function actionOutil(p, b) {
  const e = b.entree || {};
  if (ECRITURE.test(b.nom)) {
    p.fichier = { chemin: e.file_path || e.path || e.notebook_path || '', nom: b.nom, entree: e };
    p.onglet = 'fichier';
  } else if (TERMINAL.test(b.nom)) {
    p.terminal = { commande: e.command || e.cmd || '', sortie: null, erreur: false };
    appels.set(b.id, { p, genre: 'terminal' });
    p.onglet = 'terminal';
  } else if (NAVIGATEUR.test(b.nom)) {
    p.navigateur = { ...(p.navigateur || {}), action: b.nom.replace(/^mcp__[^_]+__/, ''), adresse: e.url || p.navigateur?.adresse || '' };
    appels.set(b.id, { p, genre: 'navigateur' });
    p.onglet = 'navigateur';
  }
}

/** Chaque événement de la discussion (rejeu compris) met le bureau à jour. */
export function surEvenementBureau(e) {
  if (e.t === 'delta') poste(e.auteur).etat = e.genre === 'reflexion' ? 'reflechit' : 'ecrit';
  else if (e.t === 'assistant') {
    const p = poste(e.auteur);
    for (const b of e.blocs || []) if (b.type === 'outil') actionOutil(p, b);
    p.etat = (e.blocs || []).some((b) => b.type === 'outil') ? 'outil' : p.etat;
  } else if (e.t === 'resultat_outil') {
    const a = appels.get(e.id);
    if (!a) return;
    appels.delete(e.id);
    if (a.genre === 'terminal' && a.p.terminal) {
      a.p.terminal.sortie = String(e.contenu || '').slice(-MAX_SORTIE);
      a.p.terminal.erreur = Boolean(e.erreur);
    } else if (a.genre === 'navigateur') {
      if (e.image?.donnees) a.p.navigateur.image = `data:${e.image.type};base64,${e.image.donnees}`;
      else if (e.imageVue) a.p.navigateur.perdue = true;
    }
  } else if (e.t === 'permission') {
    poste(e.auteur).etat = 'accord';
  } else if (e.t === 'permission_fin') {
    for (const p of postes.values()) {
      if (p.etat === 'accord') p.etat = 'outil';
    }
  } else if (e.t === 'tour') {
    poste(e.auteur).etat = 'attente';
  } else if (e.t === 'etat' && e.occupe === false && !e.auteur) {
    for (const p of postes.values()) p.etat = 'attente';
  } else {
    return;
  }
  redessiner();
}

function contenuFichier(f) {
  if (!f) return h('p.vide', {}, t('rien_fichier'));
  return h('div', {}, h('div.chemin-bureau', {}, f.chemin), detailOutil(f.nom, f.entree) || h('p.vide', {}, f.nom));
}

function contenuTerminal(x) {
  if (!x) return h('p.vide', {}, t('rien_terminal'));
  return h('pre.terminal-bureau' + (x.erreur ? '.erreur' : ''), {}, `$ ${x.commande}\n`, x.sortie === null ? h('span.en-cours', {}, t('en_cours')) : x.sortie);
}

function contenuNavigateur(n) {
  if (!n) return h('p.vide', {}, t('rien_navigateur'));
  return h('div', {},
    h('div.chemin-bureau', {}, [n.action, n.adresse].filter(Boolean).join(' · ')),
    n.image ? h('img.capture-bureau', { src: n.image, alt: n.adresse || n.action || '' }) : h('p.vide', {}, n.perdue ? t('capture_non_gardee') : t('en_cours')));
}

function carte(p) {
  const onglet = p.choisi || p.onglet || 'fichier';
  const bouton = (nom) => h('button.onglet-bureau' + (onglet === nom ? '.actif' : '') + (p[nom] ? '.plein' : ''), { type: 'button', onclick: () => {
    p.choisi = p.choisi === nom ? null : nom; // second clic : l'onglet suit de nouveau l'IA
    redessiner();
  } }, t('onglet_' + nom));
  const contenu = onglet === 'terminal' ? contenuTerminal(p.terminal) : onglet === 'navigateur' ? contenuNavigateur(p.navigateur) : contenuFichier(p.fichier);
  return h('article.poste.rang-' + (p.rang % 4) + (p.etat !== 'attente' ? '.actif' : ''), {},
    h('header', {}, pastilleLogo(p.compte, p.nom), h('strong', {}, p.nom), h('span.etat-poste', {}, t('poste_' + p.etat))),
    h('nav.onglets-bureau', {}, bouton('fichier'), bouton('terminal'), bouton('navigateur')),
    h('div.contenu-bureau', {}, contenu));
}

/** Au plus un dessin par image affichée : une IA qui écrit envoie des dizaines d'événements par seconde. */
function redessiner() {
  if (!ouvert || prevu) return;
  prevu = true;
  requestAnimationFrame(() => {
    prevu = false;
    const z = zone();
    if (!z || !ouvert) return;
    const liste = [...postes.values()];
    z.replaceChildren(
      h('header.entete-bureau', {}, h('strong', {}, t('bureau')), h('button', { type: 'button', title: t('bureau_fermer'), onclick: () => montrerBureau(false) }, '✕')),
      liste.length ? h('div.postes', {}, liste.map(carte)) : h('p.vide', {}, t('bureau_vide')),
    );
  });
}

/** La colonne de droite est partagée avec l'aperçu : ouvrir l'un ferme l'autre. */
export function montrerBureau(oui) {
  ouvert = oui;
  zone().hidden = !oui;
  document.body.classList.toggle('avec-bureau', oui);
  if (oui) document.dispatchEvent(new CustomEvent('colonne-droite', { detail: 'bureau' }));
  try { localStorage.setItem('devworkshop.bureau', oui ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
  redessiner();
}

export function initBureau() {
  document.getElementById('ouvrir-bureau')?.addEventListener('click', () => montrerBureau(!ouvert));
  document.addEventListener('colonne-droite', (e) => {
    if (e.detail !== 'bureau' && ouvert) montrerBureau(false);
  });
  let garde = null;
  try { garde = localStorage.getItem('devworkshop.bureau'); } catch { /* stockage indisponible */ }
  if (garde === 'oui') montrerBureau(true);
}
