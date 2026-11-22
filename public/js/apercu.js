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
  },
  en: {
    apercu: 'Preview', apercu_suivre: 'Follow the AI', apercu_actualiser: 'Refresh', apercu_fermer: 'Close the preview',
    apercu_vide: 'The preview shows here the file the AI is working on. You can also type a path in the project (e.g. index.html).',
    apercu_sans_projet: 'Pick a project to see its files.', apercu_chemin: 'Path in the project (e.g. index.html)',
    apercu_introuvable: 'File not found (or outside the project).', apercu_tronque: '… (file shortened for the preview)',
  },
});

const PAGE = /\.html?$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;
const MARKDOWN = /\.(md|markdown)$/i;
const ECRITURE = /^(Edit|Write|MultiEdit|NotebookEdit|Patch|write_file|replace|edit)/i;
const MAX_LIGNES = 3000;

let lire = { projet: () => null, session: () => null };
let etat = { ouvert: false, chemin: '', suivre: true, version: 0 };
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

async function corps() {
  if (!lire.projet()) return h('p.vide', {}, t('apercu_sans_projet'));
  if (!etat.chemin) return h('p.vide', {}, t('apercu_vide'));
  await obtenirTicket();
  const src = `${adresse(etat.chemin)}?v=${etat.version}`;
  if (PAGE.test(etat.chemin)) return h('iframe.page-apercu', { src, sandbox: 'allow-scripts allow-forms allow-modals allow-popups', title: etat.chemin });
  if (IMAGE.test(etat.chemin)) return h('div.image-apercu', {}, h('img', { src, alt: etat.chemin }));
  const r = await fetch(src).catch(() => null);
  if (!r?.ok) return h('p.vide', {}, t('apercu_introuvable'));
  const texte = await r.text();
  if (MARKDOWN.test(etat.chemin)) return h('div.markdown-apercu', {}, markdown(texte));
  const lignes = texte.split('\n');
  return h('pre.code-apercu', {}, lignes.slice(0, MAX_LIGNES).map((l, i) => h('span.ligne', {}, h('i', {}, String(i + 1)), l + '\n')),
    lignes.length > MAX_LIGNES ? h('span.ligne', {}, t('apercu_tronque')) : null);
}

async function dessiner() {
  if (!etat.ouvert) return;
  const chemin = h('input', { type: 'text', value: etat.chemin, placeholder: t('apercu_chemin'), spellcheck: false });
  const entete = h('form.entete-apercu', { onsubmit: (e) => {
    e.preventDefault();
    etat.chemin = chemin.value.trim().replace(/^\/+/, '');
    etat.version++;
    dessiner();
  } },
  chemin,
  h('label.suivre', {}, h('input', { type: 'checkbox', checked: etat.suivre, onchange: (e) => { etat.suivre = e.target.checked; } }), t('apercu_suivre')),
  h('button', { type: 'button', title: t('apercu_actualiser'), onclick: () => { etat.version++; dessiner(); } }, '↻'),
  h('button', { type: 'button', title: t('apercu_fermer'), onclick: () => montrer(false) }, '✕'));
  const contenu = h('div.contenu-apercu', {}, h('p.vide', {}, '…'));
  zone().replaceChildren(entete, contenu);
  contenu.replaceChildren(await corps());
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
  if (etat.suivre && (ecrit || chemin !== etat.chemin)) etat.chemin = chemin;
  if (chemin === etat.chemin) {
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
  ecouter((m) => {
    if (m.t === 'apercu_ticket') {
      ticket = { projet: m.projet, ticket: m.ticket, dossier: m.dossier, expire: Date.now() + m.dureeMs };
      attenteTicket?.(ticket);
      attenteTicket = null;
      return;
    }
    if (m.t === 'historique') {
      // Nouveau projet choisi : l'aperçu repart de zéro.
      etat.chemin = '';
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
