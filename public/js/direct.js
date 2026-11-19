// Vue « En direct » : la session comme un appel. Une vignette par IA (logo, état, onde quand elle parle),
// un écran partagé qui montre ce qu'elle fait à l'instant, et une voix qui lit ses réponses.
// La voix est celle du système (synthèse vocale du navigateur) : rien ne part vers un service extérieur.
import { h } from './dom.js';
import { t, ajouterTextes, langue } from './i18n.js';
import { pastilleLogo } from './logos.js';

ajouterTextes({
  fr: {
    direct_bouton: 'En direct', direct_quitter: 'Retour à la conversation', voix_oui: 'Voix activée', voix_non: 'Voix coupée',
    voix_choix: 'Voix', etat_attente: 'à l’écoute', etat_reflechit: 'réfléchit…', etat_ecrit: 'écrit…', etat_outil: 'travaille : {outil}',
    etat_accord: 'attend ton accord', etat_toi: 'tu pilotes', ecran_vide: 'L’écran partagé montrera ici ce que fait l’IA.',
    dit_accord: '{nom} demande ton accord.', outils_n: '{n} outil(s)', erreurs_n: '{n} erreur(s)',
  },
  en: {
    direct_bouton: 'Live', direct_quitter: 'Back to the conversation', voix_oui: 'Voice on', voix_non: 'Voice off',
    voix_choix: 'Voice', etat_attente: 'listening', etat_reflechit: 'thinking…', etat_ecrit: 'writing…', etat_outil: 'working: {outil}',
    etat_accord: 'waiting for your approval', etat_toi: 'in charge', ecran_vide: 'The shared screen will show here what the AI is doing.',
    dit_accord: '{nom} asks for your approval.', outils_n: '{n} tool(s)', erreurs_n: '{n} error(s)',
  },
});

const section = () => document.getElementById('direct');
const participants = new Map();
let principal = { nom: 'IA', compte: null };
let ecran = { qui: null, titre: '', texte: '' };
let ouvert = false;
let voixActive = lire('devworkshop.voix') !== 'non';
let voixChoisie = lire('devworkshop.voix.nom') || '';

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, v) {
  try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ }
}

function participant(auteur) {
  const nom = auteur?.nom || principal.nom;
  if (!participants.has(nom)) participants.set(nom, { nom, compte: auteur?.compte || principal.compte, rang: auteur?.rang ?? participants.size, etat: 'attente', outil: '', outils: 0, erreurs: 0, parle: false });
  return participants.get(nom);
}

/** Texte lisible à voix haute : sans code, sans Markdown, borné à quelques phrases. */
function pourLaVoix(texte) {
  const propre = String(texte || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_>|~-]{1,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (propre.length <= 320) return propre;
  const coupe = propre.slice(0, 320);
  return coupe.slice(0, Math.max(coupe.lastIndexOf('. '), 160) + 1);
}

function voixDisponibles() {
  const code = langue();
  return (window.speechSynthesis?.getVoices() || []).filter((v) => v.lang?.toLowerCase().startsWith(code));
}

function parler(p, texte) {
  if (!ouvert || !voixActive || !window.speechSynthesis) return;
  const phrase = pourLaVoix(texte);
  if (!phrase) return;
  const voix = voixDisponibles();
  const enonce = new SpeechSynthesisUtterance(phrase);
  enonce.lang = langue() === 'fr' ? 'fr-FR' : 'en-US';
  // Une voix différente par participant, pour reconnaître qui parle.
  enonce.voice = voix.find((v) => v.name === voixChoisie && p.rang === 0) || voix[p.rang % Math.max(voix.length, 1)] || null;
  enonce.rate = 1.05;
  enonce.onstart = () => { p.parle = true; dessiner(); };
  enonce.onend = enonce.onerror = () => { p.parle = false; dessiner(); };
  if (speechSynthesis.pending) speechSynthesis.cancel(); // on ne laisse pas la voix prendre du retard sur le travail
  speechSynthesis.speak(enonce);
}

function vignette(p) {
  const etat = p.etat === 'outil' ? t('etat_outil', { outil: p.outil }) : t('etat_' + p.etat);
  return h('article.vignette.rang-' + (p.rang % 4) + (p.parle || p.etat === 'ecrit' ? '.parle' : '') + (p.etat === 'accord' ? '.accord' : ''), {},
    h('div.visage', {}, h('span.initiale', {}, p.nom.charAt(0).toUpperCase()), h('span.onde', {}, h('i'), h('i'), h('i')), pastilleLogo(p.compte, p.nom)),
    h('div.nom', {}, p.nom),
    h('div.etat', {}, etat),
    h('div.compteurs', {}, p.outils ? h('span', {}, t('outils_n', { n: p.outils })) : null, p.erreurs ? h('span.erreurs', {}, t('erreurs_n', { n: p.erreurs })) : null));
}

function dessiner() {
  if (!ouvert) return;
  const choixVoix = h('select', { title: t('voix_choix'), onchange: (e) => { voixChoisie = e.target.value; ecrire('devworkshop.voix.nom', voixChoisie); } },
    voixDisponibles().map((v) => h('option', { value: v.name, selected: v.name === voixChoisie }, v.name)));
  section().replaceChildren(
    h('div.barre-direct', {},
      h('span.en-direct', {}, '● ' + t('direct_bouton')),
      h('span.ressort'),
      h('button', { type: 'button', onclick: basculerVoix }, voixActive ? '🔊 ' + t('voix_oui') : '🔇 ' + t('voix_non')),
      voixActive && choixVoix.options.length ? choixVoix : null,
      h('button', { type: 'button', onclick: () => montrer(false) }, t('direct_quitter'))),
    h('section.ecran-partage' + (ecran.qui ? '' : '.vide'), {},
      ecran.qui ? h('header', {}, pastilleLogo(ecran.qui.compte, ecran.qui.nom), h('strong', {}, ecran.qui.nom), h('span', {}, ecran.titre)) : null,
      h('pre', {}, ecran.texte || t('ecran_vide'))),
    h('div.vignettes', {}, h('article.vignette.toi', {}, h('div.visage', {}, h('span.initiale', {}, '🙂')), h('div.nom', {}, t('toi')), h('div.etat', {}, t('etat_toi'))), [...participants.values()].map(vignette)));
}

function basculerVoix() {
  voixActive = !voixActive;
  ecrire('devworkshop.voix', voixActive ? 'oui' : 'non');
  if (!voixActive) window.speechSynthesis?.cancel();
  dessiner();
}

export function montrer(oui) {
  ouvert = oui;
  section().hidden = !oui;
  document.getElementById('fil').hidden = oui;
  document.body.classList.toggle('vue-direct', oui);
  if (!oui) window.speechSynthesis?.cancel();
  dessiner();
}

export const basculerDirect = () => montrer(!ouvert);

/** Nouvelle session affichée : on repart d'une salle vide, avec l'IA principale (session à une seule IA). */
export function nouvelAppel(sig) {
  participants.clear();
  principal = sig || { nom: 'IA', compte: null };
  ecran = { qui: null, titre: '', texte: '' };
  window.speechSynthesis?.cancel();
  dessiner();
}

/** Un événement de la session. `rejeu` : histoire déjà passée, rien n'est lu à voix haute. */
export function surEvenementDirect(e, rejeu) {
  if (!['delta', 'assistant', 'resultat_outil', 'permission', 'tour', 'delegation'].includes(e.t)) return;
  const p = participant(e.auteur);
  if (e.t === 'delegation') {
    p.etat = 'reflechit';
    ecran = { qui: p, titre: t('delegation', { modele: e.modele || '–' }), texte: String(e.tache || '').slice(0, 1500) };
  } else if (e.t === 'delta' && e.genre === 'reflexion') {
    // La réflexion reste en arrière-plan : l'écran dit seulement que l'IA réfléchit.
    p.etat = 'reflechit';
    ecran = { qui: p, titre: t('etat_reflechit'), texte: ecran.qui === p ? ecran.texte : '' };
  } else if (e.t === 'delta') {
    p.etat = 'ecrit';
    ecran = { qui: p, titre: t('etat_ecrit'), texte: ((ecran.qui === p && ecran.titre === t('etat_ecrit') ? ecran.texte : '') + e.texte).slice(-1500) };
  } else if (e.t === 'assistant' && !e.sousAgent) {
    for (const b of e.blocs || []) {
      if (b.type === 'outil') {
        p.etat = 'outil';
        p.outil = b.nom;
        p.outils++;
        const detail = b.entree?.command || b.entree?.file_path || b.entree?.path || b.entree?.pattern || b.entree?.description || '';
        ecran = { qui: p, titre: b.nom, texte: String(detail).slice(0, 1500) };
      } else if (b.type === 'texte') {
        ecran = { qui: p, titre: '', texte: b.texte.slice(-1500) };
        if (!rejeu) parler(p, b.texte);
      }
    }
  } else if (e.t === 'resultat_outil') {
    if (e.erreur) p.erreurs++;
    if (ecran.qui === p && e.contenu) ecran = { ...ecran, texte: `${ecran.texte}\n\n${String(e.contenu).slice(0, 1200)}`.slice(-1800) };
  } else if (e.t === 'permission') {
    p.etat = 'accord';
    if (!rejeu) parler(p, t('dit_accord', { nom: p.nom }));
  } else if (e.t === 'tour') p.etat = 'attente';
  dessiner();
}

// Les voix du système arrivent après le chargement de la page.
window.speechSynthesis?.addEventListener?.('voiceschanged', () => dessiner());
