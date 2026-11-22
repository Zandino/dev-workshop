// Voix de l'équipe en direct : chaque membre a sa voix (accordée à son genre, avec son propre débit), et un seul parle à
// la fois. Deux moteurs : les voix naturelles du serveur (Piper, serveur/voix.mjs : l'audio revient en PCM et se joue
// ici), et à défaut celles du système (synthèse du navigateur), réparties de la même façon. Les annonces (annonces.js)
// passent par la même file : jamais deux voix à la fois.
import { dire, ecouter } from './canal.js';
import { langue } from './i18n.js';

const hachage = (texte) => {
  let h = 2166136261;
  for (const c of String(texte)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
};
// Prénoms de voix du système (Windows, Chrome, Edge) dont on connaît le genre ; les autres sont réparties sans genre.
const MASCULINS = /\b(paul|henri|claude|jean|antoine|thomas|remy|rémy|jerome|jérôme|alain|fabrice|gerard|gérard|maurice|yves|guy|david|mark|george|james|ryan|guy|christopher|eric|roger|steffan|brian|andrew)\b/i;
const FEMININS = /\b(hortense|julie|denise|eloise|vivienne|brigitte|celeste|coralie|josephine|yvette|amelie|audrey|marie|aria|jenny|zira|hazel|susan|sonia|libby|emma|michelle|ava|ana|sylvie|ariane)\b/i;

let etatServeur = { installee: false, voix: [], installation: null };
let moteur = lire('devworkshop.voix.moteur') || 'naturelle';
const file = []; // { m, texte, id, quiParle, audio?, pret }
let enCours = null;
let contexteAudio = null;
let numero = 0;

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrire(cle, v) {
  try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ }
}

/**
 * Ce que la voix dit : « tout » (l'équipe affichée parle, et les annonces des autres discussions), « essentiel »
 * (seulement les annonces : quelqu'un a besoin de toi, un travail est terminé ou arrêté), « non » (muet). Réglage
 * commun à la fenêtre principale et à la fenêtre détachée de l'équipe (même stockage).
 */
export const MODES_VOIX = ['tout', 'essentiel', 'non'];
const ecouteursMode = new Set();
export function modeVoix() {
  const v = lire('devworkshop.voix');
  if (v === 'oui' || !v) return 'tout'; // « oui » : l'ancien interrupteur
  return MODES_VOIX.includes(v) ? v : 'tout';
}
export function choisirModeVoix(mode) {
  if (!MODES_VOIX.includes(mode)) return;
  ecrire('devworkshop.voix', mode);
  if (mode === 'non') taire();
  ecouteursMode.forEach((f) => f(mode));
}
export const surModeVoix = (f) => ecouteursMode.add(f);

/** Volume des voix, de 0 à 1 (curseur de l'équipe et du bas de la barre), appliqué aussi à la phrase en cours. */
export function volumeVoix() {
  const v = Number.parseFloat(lire('devworkshop.voix.volume'));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}
export function choisirVolume(v) {
  const n = Math.min(1, Math.max(0, Number(v) || 0));
  ecrire('devworkshop.voix.volume', String(n));
  if (enCours?.gain) enCours.gain.gain.value = n;
  ecouteursMode.forEach((f) => f(modeVoix()));
}
// Changé dans l'autre fenêtre (principale ou détachée) : celle-ci suit.
if (typeof window !== 'undefined') {
  window.addEventListener?.('storage', (e) => {
    if (e.key !== 'devworkshop.voix' && e.key !== 'devworkshop.voix.volume') return;
    if (modeVoix() === 'non') taire();
    if (enCours?.gain) enCours.gain.gain.value = volumeVoix();
    ecouteursMode.forEach((f) => f(modeVoix()));
  });
}

export const etatVoix = () => etatServeur;
export const moteurVoix = () => (moteur === 'naturelle' && naturellesPretes() ? 'naturelle' : 'systeme');
export function choisirMoteur(m) {
  moteur = m;
  ecrire('devworkshop.voix.moteur', m);
}
const naturellesPretes = () => etatServeur.installee && etatServeur.voix.some((v) => v.langue === langue());

export function definirEtatVoix(etat) {
  if (etat) etatServeur = etat;
}
export const installerVoix = () => dire({ t: 'voix_installer', langue: langue() });

/** La voix d'un membre : parmi celles de sa langue et de son genre, toujours la même pour lui. */
function voixNaturelle(m) {
  const toutes = etatServeur.voix.filter((v) => v.langue === langue());
  const genre = toutes.filter((v) => v.genre === (m.feminin ? 'f' : 'm'));
  const liste = genre.length ? genre : toutes;
  return liste[hachage(m.cle) % liste.length]?.cle || null;
}
const vitesseDe = (m) => 0.92 + (hachage(`${m.cle}|vitesse`) % 17) / 100; // 0,92 à 1,08

function voixSysteme(m) {
  const toutes = (window.speechSynthesis?.getVoices?.() || []).filter((v) => v.lang?.toLowerCase().startsWith(langue()));
  const motif = m.feminin ? FEMININS : MASCULINS;
  const genre = toutes.filter((v) => motif.test(v.name));
  const liste = genre.length ? genre : toutes;
  return liste.length ? liste[hachage(m.cle) % liste.length] : null;
}

function suivant() {
  if (enCours) return;
  const x = file[0];
  if (!x || !x.pret) return;
  file.shift();
  enCours = x;
  if (x.audio) jouer(x);
  else if (x.systeme) parlerSysteme(x);
  else fini(); // la voix naturelle a échoué (mémoire juste…) : on passe
}

function fini() {
  const x = enCours;
  enCours = null;
  x?.quiParle(null);
  suivant();
}

function jouer(x) {
  try {
    contexteAudio ??= new AudioContext();
    // Fenêtre restée sans clic depuis son ouverture : le navigateur a pu mettre le son en pause.
    if (contexteAudio.state === 'suspended') contexteAudio.resume?.().catch?.(() => {});
    const brut = Uint8Array.from(atob(x.audio.pcm), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(brut.buffer, 0, brut.length >> 1);
    const tampon = contexteAudio.createBuffer(1, pcm.length, x.audio.taux);
    const canal = tampon.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) canal[i] = pcm[i] / 32768;
    const source = contexteAudio.createBufferSource();
    source.buffer = tampon;
    // Peu de voix d'homme en français : une hauteur à peine différente (±4 %) distingue deux membres sur la même voix.
    source.playbackRate.value = 0.96 + (hachage(`${x.m.cle}|hauteur`) % 9) / 100;
    const gain = contexteAudio.createGain();
    gain.gain.value = volumeVoix();
    source.connect(gain);
    gain.connect(contexteAudio.destination);
    x.gain = gain;
    source.onended = fini;
    x.quiParle(x.m.cle);
    source.start();
    x.source = source;
  } catch {
    fini();
  }
}

function parlerSysteme(x) {
  const s = window.speechSynthesis;
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return fini();
  const u = new SpeechSynthesisUtterance(x.texte);
  u.voice = voixSysteme(x.m);
  // Même voix pour deux membres : le timbre et le débit les distinguent.
  u.pitch = 0.85 + (hachage(`${x.m.cle}|timbre`) % 31) / 100;
  u.rate = vitesseDe(x.m);
  u.volume = volumeVoix();
  u.onstart = () => x.quiParle(x.m.cle);
  u.onend = fini;
  u.onerror = fini;
  s.speak(u);
}

/**
 * Met une phrase en file pour le membre `m`. `quiParle(cle|null)` : l'écran suit qui parle (propre à chaque phrase :
 * une annonce et l'équipe partagent la même file sans se voler ce rappel).
 */
export function parlerMembre(m, texte, quiParle = () => {}) {
  if (!texte || modeVoix() === 'non') return;
  const x = { m, texte, id: `v${++numero}`, quiParle, pret: false };
  file.push(x);
  if (moteurVoix() === 'naturelle') {
    dire({ t: 'voix_dire', id: x.id, texte, voix: voixNaturelle(m), vitesse: vitesseDe(m) });
  } else {
    x.systeme = true;
    x.pret = true;
    suivant();
  }
}

/** Tout se tait (équipe fermée, voix coupée, autre discussion). */
export function taire() {
  file.length = 0;
  try { enCours?.source?.stop(); } catch { /* déjà fini */ }
  window.speechSynthesis?.cancel();
  const x = enCours;
  enCours = null;
  x?.quiParle(null);
}

ecouter((msg) => {
  if (msg.t === 'voix_etat') definirEtatVoix(msg);
  if (msg.t !== 'voix_audio') return;
  const x = file.find((y) => y.id === msg.id);
  if (!x) return;
  if (!msg.erreur) x.audio = { taux: msg.taux, pcm: msg.pcm };
  else if (msg.erreur === 'voix_absente') x.systeme = true; // pas encore installée : la voix du système prend le relais
  x.pret = true;
  suivant();
});
