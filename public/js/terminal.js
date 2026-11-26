// Panneau des terminaux, sous la saisie, comme dans un éditeur de code : un onglet « IA » (les commandes que lancent
// les IA de la discussion affichée, en lecture seule, voir terminal-ia.js) et de vrais terminaux du serveur, ouverts
// dans le dossier du projet (serveur/terminaux.mjs). Les terminaux vivent sur le serveur : on les retrouve après un
// rechargement ou une coupure. xterm.js (le terminal de VS Code) n'est chargé qu'à la première ouverture du panneau.
import { h } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';
import { journalCommandes } from './terminal-ia.js';
import { refleterStyles } from './terminal-styles.js';

ajouterTextes({
  fr: {
    terminal_bouton: 'Terminal du serveur (Ctrl+ù)',
    terminal_ia: 'IA',
    terminal_ia_titre: 'Les commandes lancées par les IA de cette discussion (lecture seule ; la sortie s’affiche quand la commande se termine)',
    terminal_nom: 'Terminal {n}',
    terminal_nouveau: 'Nouveau terminal',
    terminal_fermer: 'Fermer ce terminal',
    terminal_masquer: 'Masquer le panneau (les terminaux continuent)',
    terminal_poignee: 'Glisser pour changer la hauteur',
    terminal_indisponible: 'Terminaux indisponibles sur ce serveur (module @lydell/node-pty absent)',
    terminal_ia_vide: 'Aucune commande lancée par l’IA dans cette discussion pour l’instant.',
    terminal_echec: 'échec',
    refus_terminal_indisponible: 'Terminaux indisponibles sur ce serveur (module @lydell/node-pty absent).',
    refus_terminaux_trop_nombreux: 'Huit terminaux sont déjà ouverts : ferme-en un d’abord.',
    refus_terminal_inconnu: 'Ce terminal n’existe plus (serveur redémarré ?).',
  },
  en: {
    terminal_bouton: 'Server terminal (Ctrl+`)',
    terminal_ia: 'AI',
    terminal_ia_titre: 'Commands run by the AIs of this conversation (read-only; output appears when the command ends)',
    terminal_nom: 'Terminal {n}',
    terminal_nouveau: 'New terminal',
    terminal_fermer: 'Close this terminal',
    terminal_masquer: 'Hide the panel (terminals keep running)',
    terminal_poignee: 'Drag to change the height',
    terminal_indisponible: 'Terminals unavailable on this server (@lydell/node-pty module missing)',
    terminal_ia_vide: 'No command run by the AI in this conversation yet.',
    terminal_echec: 'failed',
    refus_terminal_indisponible: 'Terminals unavailable on this server (@lydell/node-pty module missing).',
    refus_terminaux_trop_nombreux: 'Eight terminals are already open: close one first.',
    refus_terminal_inconnu: 'This terminal no longer exists (server restarted?).',
  },
});

const MAX_IA = 512 * 1024; // ce que l'onglet IA garde avant l'ouverture du panneau
const THEME = { background: '#17171c', foreground: '#e8e8ee', cursor: '#e8e8ee', selectionBackground: 'rgba(91, 124, 245, 0.35)' };

function memoire(cle, valeur) {
  try {
    if (valeur === undefined) return localStorage.getItem(cle);
    localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible */ }
  return null;
}

/** `projet()` et `session()` : ce que l'écran affiche (app.js). */
export function initTerminal({ projet, session }) {
  const bouton = document.getElementById('ouvrir-terminal');
  const panneau = document.getElementById('terminal');
  const onglets = h('div.onglets-terminal', { role: 'tablist' });
  const plus = h('button.icone-terminal', { type: 'button', title: t('terminal_nouveau'), 'aria-label': t('terminal_nouveau'), onclick: () => nouveau() }, '+');
  const masquer = h('button.icone-terminal', { type: 'button', title: t('terminal_masquer'), 'aria-label': t('terminal_masquer'), onclick: () => basculer(false) }, '⌄');
  const poignee = h('div.poignee-terminal', { title: t('terminal_poignee') });
  const ecrans = h('div.ecrans-terminal');
  panneau.append(poignee, h('div.barre-terminal', {}, onglets, plus, h('span.ressort'), masquer), ecrans);

  let xterm = null; // { Terminal, FitAddon } une fois chargés
  let chargement = null;
  let disponible = true;
  let derniereListe = [];
  let actif = 'ia';
  // Abonné à la liste par la connexion en cours ? Un ordre dit avant l'ouverture de la connexion (page qui se charge
  // panneau ouvert) est perdu : le message « general », qui suit chaque ouverture, refait l'abonnement.
  let abonne = false;
  const vues = new Map(); // id -> { id, projet, numero, term, fit, div, onglet } ; 'ia' pour l'onglet IA

  // Onglet IA : les commandes s'accumulent même panneau fermé, et s'écrivent à l'ouverture.
  let texteIa = '';
  let sessionIa = null;
  const ecrireIa = (s) => {
    texteIa = (texteIa + s).slice(-MAX_IA);
    vues.get('ia')?.term?.write(s);
  };
  const ia = journalCommandes(ecrireIa, { echec: t('terminal_echec') });
  const viderIa = () => {
    ia.vider();
    texteIa = '';
    vues.get('ia')?.term?.reset();
  };

  // ----- Affichage : l'onglet IA, puis les terminaux du projet affiché -----
  function majOnglets() {
    const ids = ['ia', ...[...vues.values()].filter((v) => v.id !== 'ia' && v.projet === projet()).sort((a, b) => a.numero - b.numero).map((v) => v.id)];
    if (!ids.includes(actif)) actif = 'ia';
    onglets.replaceChildren(...ids.map((id) => {
      const v = vues.get(id);
      const nom = id === 'ia' ? t('terminal_ia') : t('terminal_nom', { n: v.numero });
      const fermer = id === 'ia' ? null : h('span.fermer-onglet', { role: 'button', title: t('terminal_fermer'), 'aria-label': t('terminal_fermer'), onclick: (e) => { e.stopPropagation(); dire({ t: 'terminal_fermer', id }); } }, '×');
      return h('button.onglet-terminal' + (id === actif ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': String(id === actif), title: id === 'ia' ? t('terminal_ia_titre') : '', onclick: () => activer(id) }, nom, fermer);
    }));
    for (const v of vues.values()) v.div.hidden = v.id !== actif;
    plus.disabled = !disponible || !projet();
    plus.title = disponible ? t('terminal_nouveau') : t('terminal_indisponible');
    ajuster();
  }

  function activer(id) {
    actif = id;
    majOnglets();
    vues.get(id)?.term?.focus();
  }

  /** Recalcule la taille du terminal visible (un terminal caché n'a pas de taille). */
  function ajuster() {
    const v = vues.get(actif);
    if (!v?.fit || panneau.hidden) return;
    try { v.fit.fit(); } catch { /* pas encore dans la page */ }
  }

  function creerVue(id, infos = {}) {
    const div = h('div.ecran-terminal', { hidden: true });
    ecrans.append(div);
    const term = new xterm.Terminal({
      cursorBlink: id !== 'ia',
      disableStdin: id === 'ia',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: THEME,
      convertEol: false,
    });
    const fit = new xterm.FitAddon();
    term.loadAddon(fit);
    term.open(div);
    const v = { id, projet: infos.projet, numero: infos.numero, term, fit, div };
    vues.set(id, v);
    if (id === 'ia') {
      term.write(texteIa || `\x1b[90m${t('terminal_ia_vide')}\x1b[0m\r\n`);
    } else {
      term.onData((donnees) => dire({ t: 'terminal_ecrire', id, donnees }));
      term.onResize(({ cols, rows }) => dire({ t: 'terminal_taille', id, cols, rows }));
      dire({ t: 'terminal_attacher', id });
    }
    return v;
  }

  function retirerVue(id) {
    const v = vues.get(id);
    if (!v || id === 'ia') return;
    v.term.dispose();
    v.div.remove();
    vues.delete(id);
    majOnglets();
  }

  /** Aligne les onglets sur la liste du serveur : un terminal apparu (autre écran) s'ajoute, un fini part. */
  function reconcilier() {
    if (!xterm) return;
    const presents = new Set(derniereListe.map((x) => x.id));
    for (const id of [...vues.keys()]) if (id !== 'ia' && !presents.has(id)) retirerVue(id);
    for (const x of derniereListe) if (!vues.has(x.id)) creerVue(x.id, x);
    majOnglets();
  }

  async function charger() {
    chargement ??= (async () => {
      refleterStyles(panneau);
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('/tiers/xterm.mjs'), import('/tiers/xterm-fit.mjs')]);
      xterm = { Terminal, FitAddon };
      creerVue('ia');
      dire({ t: 'terminal_liste' });
      majOnglets();
    })();
    return chargement;
  }

  async function basculer(ouvrir = panneau.hidden) {
    panneau.hidden = !ouvrir;
    bouton.classList.toggle('actif', ouvrir);
    bouton.setAttribute('aria-pressed', String(ouvrir));
    memoire('devworkshop.terminal', ouvrir ? '1' : '0');
    if (!ouvrir) return;
    await charger();
    ajuster();
    vues.get(actif)?.term?.focus();
  }

  function nouveau() {
    if (!projet() || !disponible) return;
    const v = vues.get(actif);
    const taille = v?.term ? { cols: v.term.cols, rows: v.term.rows } : {};
    dire({ t: 'terminal_ouvrir', projet: projet(), ...taille });
  }

  // ----- Hauteur du panneau -----
  const hauteur = (px) => {
    const max = Math.round(window.innerHeight * 0.75);
    const val = Math.max(120, Math.min(max, Math.round(px)));
    panneau.style.height = val + 'px';
    return val;
  };
  hauteur(Number(memoire('devworkshop.terminal.hauteur')) || 280);
  poignee.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    poignee.setPointerCapture(e.pointerId);
    const depart = e.clientY;
    const initiale = panneau.getBoundingClientRect().height;
    const bouger = (ev) => hauteur(initiale + (depart - ev.clientY));
    const finir = () => {
      poignee.removeEventListener('pointermove', bouger);
      memoire('devworkshop.terminal.hauteur', String(Math.round(panneau.getBoundingClientRect().height)));
      ajuster();
    };
    poignee.addEventListener('pointermove', bouger);
    poignee.addEventListener('pointerup', finir, { once: true });
    poignee.addEventListener('pointercancel', finir, { once: true });
  });
  // Absent du navigateur simulé des essais (jsdom) : la page doit démarrer quand même.
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => ajuster()).observe(ecrans);
  else window.addEventListener('resize', ajuster);

  // ----- Événements du serveur -----
  ecouter((m) => {
    if (m.t === 'canal' && m.etat === 'perdu') abonne = false;
    else if (m.t === 'general' && !abonne && xterm) {
      // Connexion (re)venue : elle s'abonne à la liste et à chaque terminal déjà affiché (rejeu de leur affichage).
      abonne = true;
      dire({ t: 'terminal_liste' });
      for (const id of vues.keys()) if (id !== 'ia') dire({ t: 'terminal_attacher', id });
    } else if (m.t === 'rejouer') {
      viderIa();
      sessionIa = m.session;
      for (const e of m.evenements || []) ia.evenement(e);
    } else if (m.t === 'historique') {
      if (!session() && sessionIa) { viderIa(); sessionIa = null; } // nouvelle discussion ou autre projet
      if (xterm) majOnglets();
    } else if (m.t === 'terminaux') {
      disponible = m.disponible !== false;
      derniereListe = m.liste || [];
      reconcilier();
      if (!xterm) plus.disabled = !disponible;
    } else if (m.t === 'terminal_ouvert') {
      if (!xterm) return;
      if (!vues.has(m.id)) creerVue(m.id, m);
      activer(m.id);
    } else if (m.t === 'terminal_rejouer') {
      const v = vues.get(m.id);
      if (!v) return;
      v.term.reset();
      v.term.write(m.donnees || '');
    } else if (m.t === 'terminal_sortie') {
      vues.get(m.id)?.term.write(m.donnees);
    } else if (m.t === 'terminal_fin') {
      derniereListe = derniereListe.filter((x) => x.id !== m.id);
      retirerVue(m.id);
    } else if (m.session && m.session === session() && m.session === sessionIa) {
      ia.evenement(m);
    }
  });

  bouton.addEventListener('click', () => basculer());
  // Ctrl+` (Ctrl+ù sur un clavier français), comme dans VS Code.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.code === 'Backquote' || e.key === '`' || e.key === 'ù')) {
      e.preventDefault();
      basculer();
    }
  });
  if (memoire('devworkshop.terminal') === '1') basculer(true);
}
