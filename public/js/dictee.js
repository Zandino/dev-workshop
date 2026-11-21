// Dictée : 🎤 à côté de « Envoyer ». Un clic écoute, un second clic arrête : le texte reconnu s'ajoute dans la zone
// de saisie, à relire avant d'envoyer. Échap annule. L'audio part au serveur par morceaux pendant que tu parles
// (PCM 16 bits, 16 kHz, mono). Le moteur se choisit en bas de la barre latérale : Whisper sur le serveur (ta voix
// n'en sort pas), ou un compte API (voir serveur/dictee.mjs).
import { h, notifier } from './dom.js';
import { t, ajouterTextes, langue } from './i18n.js';
import { dire, ecouter } from './canal.js';

ajouterTextes({
  fr: {
    dictee: 'Dictée', dicter: 'Dicter (clic pour parler, clic pour arrêter, Échap pour annuler)', dictee_ecoute: 'J’écoute… clique pour arrêter',
    dictee_transcription: 'Transcription…', dictee_rapide: 'Whisper rapide (serveur)', dictee_precis: 'Whisper précis (serveur)',
    dictee_en_ligne_compte: '{nom} (en ligne)', dictee_rien: 'Aucune parole reconnue.', dictee_annulee: 'Dictée annulée.',
    dictee_micro_refuse: 'Micro inaccessible : autorise-le pour Dev Workshop (et, sous Windows, « Accès au microphone » pour les applications de bureau).',
    dictee_non_securise: 'La dictée demande une adresse sûre (localhost ou https).',
    dictee_installer_question: 'La dictée Whisper (open source, gratuite) n’est pas encore installée sur ce serveur. L’installer maintenant ? Environ 750 Mo, quelques minutes, sans rien à faire de ton côté. Ta voix restera sur ton serveur.',
    dictee_installation: 'Installation de la dictée sur le serveur… (quelques minutes)', dictee_prete: 'Dictée installée : clique sur 🎤 pour parler.',
    dictee_premier_usage: 'Premier usage : le serveur télécharge le modèle Whisper ({taille}), la transcription arrivera ensuite.',
    refus_dictee_absente: 'La dictée Whisper n’est pas installée sur le serveur.', refus_dictee_installation_en_cours: 'La dictée s’installe encore sur le serveur : réessaie dans un moment.',
    refus_dictee_installation_echec: 'Installation de la dictée impossible (voir le journal du serveur).', refus_dictee_trop_longue: 'Dictée trop longue (3 minutes au plus).',
    refus_dictee_vide: 'Dictée trop courte.', refus_dictee_en_ligne: 'Le service de transcription en ligne a refusé (clé, crédit ou modèle).',
    refus_dictee_compte_incapable: 'Ce compte API ne sait pas transcrire la voix.', refus_dictee_moteur_inconnu: 'Moteur de dictée inconnu.',
  },
  en: {
    dictee: 'Dictation', dicter: 'Dictate (click to talk, click to stop, Esc to cancel)', dictee_ecoute: 'Listening… click to stop',
    dictee_transcription: 'Transcribing…', dictee_rapide: 'Whisper fast (server)', dictee_precis: 'Whisper accurate (server)',
    dictee_en_ligne_compte: '{nom} (online)', dictee_rien: 'No speech recognised.', dictee_annulee: 'Dictation cancelled.',
    dictee_micro_refuse: 'Microphone unavailable: allow it for Dev Workshop (and, on Windows, “Microphone access” for desktop apps).',
    dictee_non_securise: 'Dictation needs a secure address (localhost or https).',
    dictee_installer_question: 'Whisper dictation (open source, free) is not installed on this server yet. Install it now? About 750 MB, a few minutes, nothing to do on your side. Your voice stays on your server.',
    dictee_installation: 'Installing dictation on the server… (a few minutes)', dictee_prete: 'Dictation installed: click 🎤 to talk.',
    dictee_premier_usage: 'First use: the server is downloading the Whisper model ({taille}); the text will follow.',
    refus_dictee_absente: 'Whisper dictation is not installed on the server.', refus_dictee_installation_en_cours: 'Dictation is still being installed on the server: try again in a moment.',
    refus_dictee_installation_echec: 'Dictation could not be installed (see the server log).', refus_dictee_trop_longue: 'Dictation too long (3 minutes at most).',
    refus_dictee_vide: 'Dictation too short.', refus_dictee_en_ligne: 'The online transcription service refused (key, credit or model).',
    refus_dictee_compte_incapable: 'This API account cannot transcribe speech.', refus_dictee_moteur_inconnu: 'Unknown dictation engine.',
  },
});

const TAUX = 16000;
const ENVOI_MS = 1000;
const MAX_S = 180;
const CLE = 'devworkshop.dictee';
const TAILLES = { rapide: '~250 Mo', precis: '~1,1 Go' };
const $ = (id) => document.getElementById(id);

let etat = 'repos'; // repos | demarrage (micro en cours d'ouverture) | ecoute | transcription
let capture = null;
let serveur = { local: 'absent', modeles: {} };
let attendu = null; // identifiant de la dictée dont on attend le texte

function lire(cle) { try { return localStorage.getItem(cle); } catch { return null; } }
function ecrire(cle, v) { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } }
const moteur = () => $('dictee-moteur').value || 'rapide';
const estLocal = (m) => m === 'rapide' || m === 'precis';

function dessiner() {
  const bouton = $('dicter');
  bouton.classList.toggle('ecoute', etat === 'ecoute');
  bouton.classList.toggle('transcription', etat === 'transcription');
  const libelle = etat === 'ecoute' ? t('dictee_ecoute') : etat === 'transcription' ? t('dictee_transcription') : t('dicter');
  bouton.title = libelle;
  bouton.setAttribute('aria-label', libelle);
  bouton.setAttribute('aria-pressed', String(etat === 'ecoute'));
  $('dicter-temps').textContent = etat === 'ecoute' ? `${Math.floor((Date.now() - capture.debut) / 1000)} s` : '';
}

/** Les octets du PCM en base64, par tranches (String.fromCharCode n'accepte pas un tableau trop long). */
function enBase64(pcm) {
  const octets = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

function envoyerEnAttente() {
  if (!capture?.attente.length) return;
  const n = capture.attente.reduce((s, x) => s + x.length, 0);
  const pcm = new Int16Array(n);
  let o = 0;
  for (const x of capture.attente) { pcm.set(x, o); o += x.length; }
  capture.attente = [];
  dire({ t: 'dictee_morceau', id: capture.id, donnees: enBase64(pcm) });
}

async function commencer() {
  const m = moteur();
  if (estLocal(m) && serveur.local === 'installation') return notifier(t('dictee_installation'));
  if (estLocal(m) && serveur.local !== 'pret') {
    if (confirm(t('dictee_installer_question'))) dire({ t: 'dictee_installer' });
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) return notifier(t('dictee_non_securise'), { echec: true });
  etat = 'demarrage'; // un second clic pendant l'ouverture du micro ne doit pas en ouvrir un deuxième
  let flux;
  try {
    flux = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    etat = 'repos';
    return notifier(t('dictee_micro_refuse'), { echec: true, duree: 10000 });
  }
  if (etat !== 'demarrage') return flux.getTracks().forEach((p) => p.stop()); // annulée entre-temps (Échap)
  // Le navigateur rééchantillonne lui-même à 16 kHz, le taux qu'attend Whisper.
  const contexte = new AudioContext({ sampleRate: TAUX });
  const source = contexte.createMediaStreamSource(flux);
  const noeud = contexte.createScriptProcessor(4096, 1, 1);
  capture = { id: crypto.randomUUID(), flux, contexte, source, noeud, attente: [], debut: Date.now() };
  noeud.onaudioprocess = (e) => {
    const entree = e.inputBuffer.getChannelData(0);
    capture?.attente.push(Int16Array.from(entree, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)))));
  };
  source.connect(noeud);
  noeud.connect(contexte.destination); // sans sortie, Chromium n'appelle pas onaudioprocess
  dire({ t: 'dictee_debut', id: capture.id, moteur: m, langue: langue() });
  capture.minuterie = setInterval(() => {
    envoyerEnAttente();
    if (Date.now() - capture.debut > MAX_S * 1000) arreter();
    else dessiner();
  }, ENVOI_MS);
  etat = 'ecoute';
  if (estLocal(m) && !serveur.modeles[m]) notifier(t('dictee_premier_usage', { taille: TAILLES[m] }), { duree: 12000 });
  dessiner();
}

function couper() {
  clearInterval(capture.minuterie);
  capture.noeud.disconnect();
  capture.source.disconnect();
  for (const piste of capture.flux.getTracks()) piste.stop();
  capture.contexte.close().catch(() => {});
}

function arreter() {
  if (etat !== 'ecoute') return;
  couper();
  envoyerEnAttente();
  attendu = capture.id;
  dire({ t: 'dictee_fin', id: capture.id });
  capture = null;
  etat = 'transcription';
  dessiner();
}

function annuler() {
  if (etat === 'ecoute') {
    couper();
    dire({ t: 'dictee_annuler', id: capture.id });
    capture = null;
  }
  attendu = null;
  etat = 'repos';
  notifier(t('dictee_annulee'));
  dessiner();
}

/** Le texte reconnu va là où est le curseur, séparé par une espace ; rien ne part sans toi. */
function inserer(texte) {
  const champ = $('champ');
  if (!texte) return notifier(t('dictee_rien'));
  const debut = champ.selectionStart ?? champ.value.length;
  const fin = champ.selectionEnd ?? champ.value.length;
  const avant = champ.value.slice(0, debut);
  const apres = champ.value.slice(fin);
  const insere = (avant && !/\s$/.test(avant) ? ' ' : '') + texte + (apres && !/^\s/.test(apres) ? ' ' : '');
  champ.value = avant + insere + apres;
  const pos = (avant + insere).length;
  champ.focus();
  champ.setSelectionRange(pos, pos);
  champ.dispatchEvent(new Event('input'));
}

function majMoteurs(comptes) {
  const choix = $('dictee-moteur');
  const garde = choix.value || lire(CLE) || 'rapide';
  const enLigne = comptes.filter((c) => c.type === 'api').map((c) => [c.id, t('dictee_en_ligne_compte', { nom: c.nom })]);
  choix.replaceChildren(...[['rapide', t('dictee_rapide')], ['precis', t('dictee_precis')], ...enLigne].map(([v, l]) => h('option', { value: v }, l)));
  choix.value = [...choix.options].some((o) => o.value === garde) ? garde : 'rapide';
}

export function initDictee() {
  const bouton = $('dicter');
  bouton.addEventListener('click', () => (etat === 'repos' ? commencer() : etat === 'ecoute' ? arreter() : null));
  $('dictee-moteur').addEventListener('change', (e) => ecrire(CLE, e.target.value));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && etat !== 'repos') {
      e.preventDefault();
      e.stopPropagation(); // Échap ne doit pas aussi arrêter l'IA
      annuler();
    }
  }, true);
  ecouter((m) => {
    if (m.t === 'general') {
      majMoteurs(m.comptes);
      dire({ t: 'dictee_etat' });
    } else if (m.t === 'dictee_etat') {
      if (serveur.local === 'installation' && m.local === 'pret') notifier(t('dictee_prete'));
      else if (m.local === 'installation' && serveur.local !== 'installation') notifier(t('dictee_installation'), { duree: 10000 });
      serveur = m;
    } else if (m.t === 'dictee_texte' && m.id === attendu) {
      attendu = null;
      etat = 'repos';
      inserer(m.texte);
      dessiner();
    } else if ((m.t === 'refus' && /^dictee_/.test(m.ordre || '') && m.ordre !== 'dictee_installer') || (m.t === 'canal' && m.etat === 'perdu' && etat !== 'repos')) {
      // Refus : son message est affiché par app.js. Connexion perdue : le texte attendu n'arrivera plus.
      // Dans les deux cas, on libère le bouton.
      if (etat === 'ecoute') couper();
      capture = null;
      attendu = null;
      etat = 'repos';
      dessiner();
    }
  });
  dessiner();
}
