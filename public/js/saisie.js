// Zone de saisie : envoi, arrêt, et palette des commandes « / » dans la langue de l'interface.
import { h } from './dom.js';
import { t } from './i18n.js';
import { chercherCommandes } from './commandes.js';

let champ, palette, boutonEnvoyer, boutonArreter;
let choix = [];
let index = 0;
let actions = {};

export function initSaisie({ envoyer, arreter }) {
  actions = { envoyer, arreter };
  champ = document.getElementById('champ');
  palette = document.getElementById('palette');
  boutonEnvoyer = document.getElementById('envoyer');
  boutonArreter = document.getElementById('arreter');
  champ.addEventListener('input', () => {
    ajusterHauteur();
    majPalette();
  });
  champ.addEventListener('keydown', surTouche);
  champ.addEventListener('blur', () => setTimeout(fermerPalette, 150));
  boutonEnvoyer.addEventListener('click', valider);
  boutonArreter.addEventListener('click', () => actions.arreter());
}

export function etatSaisie({ active, occupe }) {
  champ.disabled = !active;
  boutonEnvoyer.disabled = !active;
  boutonArreter.hidden = !occupe;
  if (active && document.activeElement === document.body) champ.focus();
}

function ajusterHauteur() {
  champ.style.height = 'auto';
  champ.style.height = Math.min(champ.scrollHeight, 260) + 'px';
}

function valider() {
  const texte = champ.value.trim();
  if (!texte || champ.disabled) return;
  // Faux : le message ne peut pas encore partir (fichiers joints en cours d'envoi) ; la saisie reste.
  if (actions.envoyer(texte) === false) return;
  champ.value = '';
  ajusterHauteur();
  fermerPalette();
}

/** La palette s'ouvre tant que la saisie est « /mot » sans espace. */
function majPalette() {
  const m = champ.value.match(/^\/([^\s]*)$/);
  if (!m) return fermerPalette();
  choix = chercherCommandes(m[1]);
  index = 0;
  dessinerPalette();
}

function fermerPalette() {
  choix = [];
  palette.hidden = true;
  palette.replaceChildren();
}

function dessinerPalette() {
  palette.hidden = false;
  if (!choix.length) return palette.replaceChildren(h('div.vide', {}, t('cmd_aucune')));
  palette.replaceChildren(
    ...choix.map((c, i) =>
      h(
        'button.commande' + (i === index ? '.active' : ''),
        { type: 'button', onmousedown: (e) => { e.preventDefault(); completer(c); } },
        h('span.nom', {}, '/' + c.nom, c.argument ? h('span.argument', {}, ' ' + c.argument) : null),
        h('span.description', {}, c.description, c.traduite ? null : h('em', {}, ` (${t('cmd_non_traduite')})`)),
      ),
    ),
  );
  palette.children[index]?.scrollIntoView({ block: 'nearest' });
}

function completer(c) {
  champ.value = `/${c.nom} `;
  fermerPalette();
  ajusterHauteur();
  champ.focus();
}

function surTouche(e) {
  if (!palette.hidden && choix.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + choix.length) % choix.length;
      return dessinerPalette();
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      return completer(choix[index]);
    }
    if (e.key === 'Escape') return fermerPalette();
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    valider();
  } else if (e.key === 'Escape' && !boutonArreter.hidden) {
    actions.arreter();
  }
}
