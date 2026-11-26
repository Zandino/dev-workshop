// Aperçu à droite : le fichier sur lequel l'IA travaille (page web rendue, image, Markdown, code), qui se
// rafraîchit à chaque modification. On peut aussi y ouvrir un fichier du projet à la main.
// Les fichiers arrivent par /apercu/<ticket>/… (ticket demandé sur le canal authentifié, voir serveur/apercu.mjs).
import { h, markdown } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';

ajouterTextes({
  fr: {
    apercu: 'Aperçu', apercu_suivre: 'Suivre l’IA', apercu_actualiser: 'Actualiser', apercu_fermer: 'Fermer l’aperçu',
    apercu_vide: 'L’aperçu montre ici le fichier sur lequel l’IA travaille. Tu peux aussi saisir un chemin du projet (ex. index.html).',
    apercu_sans_projet: 'Choisis un projet pour voir ses fichiers.', apercu_chemin: 'Chemin dans le projet (ex. index.html)',
    apercu_introuvable: 'Fichier introuvable (ou hors du projet).', apercu_tronque: '… (fichier raccourci pour l’aperçu)',
    apercu_telecharger: 'Télécharger sur cet appareil', apercu_dossier_vide: 'Dossier vide (les fichiers cachés ne sont pas montrés).',
    apercu_sans_rendu: 'Pas d’aperçu pour ce type de fichier : utilise « Télécharger ».', chemin_ouvrir: 'Ouvrir dans l’aperçu',
    refus_fichier_introuvable: 'Fichier introuvable sur le serveur.', refus_fichier_interdit: 'Ce fichier ne s’ouvre pas depuis l’écran : il est caché (clés, réglages…) ou hors du dossier personnel du serveur.',
    refus_fichier_invalide: 'Chemin de fichier invalide.',
  },
  en: {
    apercu: 'Preview', apercu_suivre: 'Follow the AI', apercu_actualiser: 'Refresh', apercu_fermer: 'Close the preview',
    apercu_vide: 'The preview shows here the file the AI is working on. You can also type a path in the project (e.g. index.html).',
    apercu_sans_projet: 'Pick a project to see its files.', apercu_chemin: 'Path in the project (e.g. index.html)',
    apercu_introuvable: 'File not found (or outside the project).', apercu_tronque: '… (file shortened for the preview)',
    apercu_telecharger: 'Download to this device', apercu_dossier_vide: 'Empty folder (hidden files are not shown).',
    apercu_sans_rendu: 'No preview for this kind of file: use “Download”.', chemin_ouvrir: 'Open in the preview',
    refus_fichier_introuvable: 'File not found on the server.', refus_fichier_interdit: 'This file cannot be opened from the screen: it is hidden (keys, settings…) or outside the server’s home folder.',
    refus_fichier_invalide: 'Invalid file path.',
  },
});

const PAGE = /\.html?$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;
const MARKDOWN = /\.(md|markdown)$/i;
const PDF = /\.pdf$/i;
const BINAIRE = /\.(zip|gz|tgz|bz2|xz|7z|rar|tar|docx?|xlsx?|pptx?|odt|ods|apk|aab|ipa|exe|dll|so|bin|mp4|webm|mov|mp3|wav|ogg|woff2?|ttf|otf|sqlite|db)$/i;
const MAX_TEXTE = 2 * 1024 * 1024;
const ECRITURE = /^(Edit|Write|MultiEdit|NotebookEdit|Patch|write_file|replace|edit)/i;
const MAX_LIGNES = 3000;

let lire = { projet: () => null, session: () => null };
// `fichier` : un fichier ou un dossier cité par une IA et ouvert par son lien (serveur/ouvrir-fichier.mjs), à la place
// d'un chemin du projet : { chemin, dossier, ticket, nom, taille, entrees }.
let etat = { ouvert: false, chemin: '', suivre: true, version: 0, fichier: null };
let ticket = null; // { projet, ticket, dossier, expire }
let attenteTicket = null;
const outils = new Map(); // id d'appel d'outil -> chemin relatif du fichier touché

const zone = () => document.getElementById('apercu');

function relatif(brut) {
  if (!brut || !ticket) return null;
  let p = String(brut).replace(/\\/g, '/');
  const d = ticket.dossier.replace(/\\/g, '/');
  if (p.startsWith(d + '/')) p = p.slice(d.length + 1);
  else if (p.startsWith('/') || /^[A-Za-z]:\//.test(p)) return null; // hors du projet
  return p.replace(/^\.\//, '');
}

function obtenirTicket() {
  const projet = lire.projet();
  if (ticket && ticket.projet === projet && ticket.expire > Date.now() + 60_000) return Promise.resolve(ticket);
  return new Promise((ok) => {
    attenteTicket = ok;
    dire({ t: 'apercu_ticket', projet });
  });
}

const adresse = (chemin) => `/apercu/${ticket.ticket}/${chemin.split('/').map(encodeURIComponent).join('/')}`;

/** L'adresse du fichier affiché (sans paramètre), ou null (rien, ou un dossier). */
function source() {
  if (etat.fichier) return etat.fichier.dossier ? null : `/apercu/${etat.fichier.ticket}/${encodeURIComponent(etat.fichier.nom)}`;
  return etat.chemin && ticket ? adresse(etat.chemin) : null;
}

/** Un dossier cité : ses fichiers et sous-dossiers, chacun s'ouvre à son tour. */
function listeDossier(f) {
  if (!f.entrees.length) return h('p.vide', {}, t('apercu_dossier_vide'));
  return h('ul.dossier-apercu', {}, f.entrees.map((e) => h('li', {},
    h('a.chemin-fichier', { href: '#', dataset: { chemin: `${f.chemin.replace(/\/$/, '')}/${e.nom}` } }, (e.dossier ? '📁 ' : '') + e.nom),
    e.taille != null ? h('span.taille', {}, ` ${Math.max(1, Math.round(e.taille / 1024))} Ko`) : null)));
}

async function corps() {
  const f = etat.fichier;
  if (f?.dossier) return listeDossier(f);
  if (!f && !lire.projet()) return h('p.vide', {}, t('apercu_sans_projet'));
  if (!f && !etat.chemin) return h('p.vide', {}, t('apercu_vide'));
  if (!f) await obtenirTicket();
  const nom = f ? f.nom : etat.chemin;
  const src = `${source()}?v=${etat.version}`;
  if (PAGE.test(nom)) return h('iframe.page-apercu', { src, sandbox: 'allow-scripts allow-forms allow-modals allow-popups', title: nom });
  if (IMAGE.test(nom)) return h('div.image-apercu', {}, h('img', { src, alt: nom }));
  if (PDF.test(nom)) return h('iframe.page-apercu', { src, title: nom });
  if (f && (BINAIRE.test(nom) || f.taille > MAX_TEXTE)) return h('p.vide', {}, t('apercu_sans_rendu'));
  const r = await fetch(src).catch(() => null);
  if (!r?.ok) return h('p.vide', {}, t('apercu_introuvable'));
  const texte = await r.text();
  if (MARKDOWN.test(nom)) return h('div.markdown-apercu', {}, markdown(texte));
  const lignes = texte.split('\n');
  return h('pre.code-apercu', {}, lignes.slice(0, MAX_LIGNES).map((l, i) => h('span.ligne', {}, h('i', {}, String(i + 1)), l + '\n')),
    lignes.length > MAX_LIGNES ? h('span.ligne', {}, t('apercu_tronque')) : null);
}

async function dessiner() {
  if (!etat.ouvert) return;
  const chemin = h('input', { type: 'text', value: etat.fichier ? etat.fichier.chemin : etat.chemin, placeholder: t('apercu_chemin'), spellcheck: false });
  const telecharger = h('a.bouton-apercu', { title: t('apercu_telecharger'), 'aria-label': t('apercu_telecharger'), download: '', hidden: true }, '⤓');
  const entete = h('form.entete-apercu', { onsubmit: (e) => {
    e.preventDefault();
    const v = chemin.value.trim();
    // « ~/… » ou un chemin absolu : un fichier du serveur, hors du projet si besoin (mêmes bornes que les liens).
    if (/^(~|\/)/.test(v) && !(ticket && v.startsWith(ticket.dossier + '/'))) return ouvrirFichier(v, false);
    etat.fichier = null;
    etat.chemin = (relatif(v) ?? v).replace(/^\/+/, '');
    etat.version++;
    dessiner();
  } },
  chemin,
  h('label.suivre', {}, h('input', { type: 'checkbox', checked: etat.suivre, onchange: (e) => { etat.suivre = e.target.checked; } }), t('apercu_suivre')),
  telecharger,
  h('button', { type: 'button', title: t('apercu_actualiser'), onclick: () => (etat.fichier ? ouvrirFichier(etat.fichier.chemin, false) : (etat.version++, dessiner())) }, '↻'),
  h('button', { type: 'button', title: t('apercu_fermer'), onclick: () => montrer(false) }, '✕'));
  const contenu = h('div.contenu-apercu', {}, h('p.vide', {}, '…'));
  zone().replaceChildren(entete, contenu);
  contenu.replaceChildren(await corps());
  const src = source(); // connue une fois le ticket du projet obtenu
  if (src) {
    telecharger.href = `${src}?telecharger=1`;
    telecharger.hidden = false;
  }
}

/** Ouvre un fichier ou un dossier du serveur (lien d'un chemin cité par une IA, ou saisi en « ~/… »). */
function ouvrirFichier(chemin, arreterDeSuivre = true) {
  if (arreterDeSuivre) etat.suivre = false; // on regarde ce fichier-là : l'IA ne l'en chasse pas
  if (!etat.ouvert) montrer(true);
  dire({ t: 'fichier_ouvrir', chemin, projet: lire.projet() || undefined });
}

function montrer(oui) {
  etat.ouvert = oui;
  if (oui) document.dispatchEvent(new CustomEvent('colonne-droite', { detail: 'apercu' }));
  zone().hidden = !oui;
  document.body.classList.toggle('avec-apercu', oui);
  try { localStorage.setItem('devworkshop.apercu', oui ? 'oui' : 'non'); } catch { /* stockage indisponible */ }
  dessiner();
}

/** Un fichier vient d'être touché par l'IA : l'aperçu le suit (s'il suit), et se recharge s'il l'affiche. */
function surFichier(chemin, ecrit) {
  if (!chemin) return;
  if (etat.suivre && (ecrit || chemin !== etat.chemin)) {
    etat.chemin = chemin;
    etat.fichier = null;
  }
  if (chemin === etat.chemin && !etat.fichier) {
    etat.version++;
    dessiner();
  }
}

export function initApercu(lecteurs) {
  lire = lecteurs;
  document.getElementById('ouvrir-apercu').addEventListener('click', () => montrer(!etat.ouvert));
  document.addEventListener('colonne-droite', (e) => {
    if (e.detail !== 'apercu' && etat.ouvert) montrer(false);
  });
  try { if (localStorage.getItem('devworkshop.apercu') === 'oui') montrer(true); } catch { /* stockage indisponible */ }
  // Liens des chemins cités (chemins.js), dans le fil comme dans la liste d'un dossier.
  document.addEventListener('click', (e) => {
    const lien = e.target.closest?.('a.chemin-fichier');
    if (!lien) return;
    e.preventDefault();
    ouvrirFichier(lien.dataset.chemin);
  });
  ecouter((m) => {
    if (m.t === 'fichier_ouvert') {
      etat.fichier = m;
      etat.version++;
      return dessiner();
    }
    if (m.t === 'apercu_ticket') {
      ticket = { projet: m.projet, ticket: m.ticket, dossier: m.dossier, expire: Date.now() + m.dureeMs };
      attenteTicket?.(ticket);
      attenteTicket = null;
      return;
    }
    if (m.t === 'historique') {
      // Nouveau projet choisi : l'aperçu repart de zéro.
      etat.chemin = '';
      etat.fichier = null;
      outils.clear();
      return dessiner();
    }
    if (!m.session || m.session !== lire.session()) return;
    if (m.t === 'assistant') {
      for (const b of m.blocs || []) {
        if (b.type !== 'outil') continue;
        const brut = b.entree?.file_path || b.entree?.path || b.entree?.notebook_path || b.entree?.absolute_path;
        if (!brut) continue;
        obtenirTicket().then(() => {
          const chemin = relatif(brut);
          if (!chemin) return;
          outils.set(b.id, { chemin, ecrit: ECRITURE.test(b.nom) });
          if (!ECRITURE.test(b.nom)) surFichier(chemin, false); // lecture : on montre ce que l'IA regarde
        });
      }
    } else if (m.t === 'resultat_outil' && !m.erreur) {
      const o = outils.get(m.id);
      if (o?.ecrit) surFichier(o.chemin, true); // écriture terminée : le fichier a changé
    }
  });
}
