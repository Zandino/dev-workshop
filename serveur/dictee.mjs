// Dictée : ta voix devient du texte dans la zone de saisie, que tu relis avant d'envoyer. Deux moteurs :
// - Whisper (open source, licence MIT) sur ce serveur, par Transformers.js et ONNX Runtime. La voix ne quitte pas le
//   serveur ; seul le modèle est téléchargé (Hugging Face) au premier usage. La bibliothèque pèse ~750 Mo : elle ne
//   fait pas partie de l'installation de base et s'installe à la demande dans le dossier des réglages.
// - un compte API déjà déclaré (OpenAI, Groq, Mistral…), par sa route /audio/transcriptions et sa clé. La voix part
//   chez ce fournisseur.
// L'audio arrive par morceaux pendant que tu parles, déjà en PCM 16 bits, 16 kHz, mono : l'écran le prépare, ce qui
// évite d'installer ffmpeg ici.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOSSIER_CONFIG } from './securite.mjs';
import { compte as compteDe, cleDe } from './comptes.mjs';

const BIBLIOTHEQUE = '@huggingface/transformers';
const VERSION = '4.3.2';
const DOSSIER = path.join(DOSSIER_CONFIG, 'dictee');
// Mesuré le 21/11/2026 sur 4 cœurs de Ryzen 7700X, 10 s de voix (mémoire : pic du processus Node entier) :
// small (q8) 2,3 s et ~1,2 Go ; large-v3-turbo (q8) 4,5 s et ~2,8 Go, d'où « rapide » par défaut. Le modèle vit
// dans le processus du serveur : un seul à la fois, libéré après 10 minutes sans dictée.
const MODELES = { rapide: 'onnx-community/whisper-small', precis: 'onnx-community/whisper-large-v3-turbo' };
const TAUX = 16000;
const MAX_OCTETS = 180 * TAUX * 2; // 3 minutes
const OUBLI_MS = 10 * 60 * 1000; // modèle libéré après 10 minutes sans dictée

let installation = null;
const charges = new Map(); // qualité -> { promesse, minuterie }
let file = Promise.resolve(); // une transcription locale à la fois : la mémoire du serveur est comptée

const installee = () => existsSync(path.join(DOSSIER, 'node_modules', BIBLIOTHEQUE, 'package.json'));
const etatLocal = () => (installation ? 'installation' : installee() ? 'pret' : 'absent');
/** Modèles déjà téléchargés : sinon, le premier usage attend le téléchargement (~250 Mo ou ~1,1 Go). */
const modelesPresents = () => Object.fromEntries(Object.entries(MODELES).map(([q, id]) => [q, existsSync(path.join(DOSSIER, 'modeles', id))]));

/** npm install de la bibliothèque, version figée, dans le dossier des réglages (sans sudo). */
function installer() {
  installation ??= new Promise((ok, ko) => {
    mkdirSync(DOSSIER, { recursive: true, mode: 0o700 });
    const paquet = path.join(DOSSIER, 'package.json');
    if (!existsSync(paquet)) writeFileSync(paquet, JSON.stringify({ private: true, description: 'Dictée de Dev Workshop' }) + '\n');
    // npm est rangé à côté de node ; son script cherche node dans le PATH.
    const bin = path.dirname(process.execPath);
    const npm = existsSync(path.join(bin, 'npm')) ? path.join(bin, 'npm') : 'npm';
    const p = spawn(npm, ['install', '--no-audit', '--no-fund', '--save-exact', `${BIBLIOTHEQUE}@${VERSION}`], {
      cwd: DOSSIER,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH || ''}` },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let erreur = '';
    p.stderr.on('data', (d) => (erreur = (erreur + d).slice(-2000)));
    p.on('error', ko);
    p.on('close', (code) => (code === 0 && installee() ? ok() : ko(new Error(erreur.trim().split('\n').pop() || `npm ${code}`))));
  }).finally(() => (installation = null));
  return installation;
}

/** Le modèle demandé, chargé au besoin ; l'autre est libéré (les deux ensemble ne tiennent pas en mémoire). */
function moteur(qualite) {
  for (const [q, c] of charges) if (q !== qualite) liberer(q, c);
  let c = charges.get(qualite);
  if (!c) {
    const { pipeline, env } = createRequire(path.join(DOSSIER, 'package.json'))(BIBLIOTHEQUE);
    env.cacheDir = path.join(DOSSIER, 'modeles');
    const fils = Math.max(1, Math.min(4, os.availableParallelism()));
    c = { promesse: pipeline('automatic-speech-recognition', MODELES[qualite], { dtype: 'q8', session_options: { intraOpNumThreads: fils, interOpNumThreads: 1 } }) };
    c.promesse.catch(() => charges.delete(qualite));
    charges.set(qualite, c);
  }
  clearTimeout(c.minuterie);
  c.minuterie = setTimeout(() => liberer(qualite, c), OUBLI_MS);
  c.minuterie.unref();
  return c.promesse;
}

function liberer(qualite, c) {
  clearTimeout(c.minuterie);
  if (charges.get(qualite) === c) charges.delete(qualite);
  c.promesse.then((asr) => asr.dispose?.()).catch(() => {});
}

function transcrireIci(pcm, langue, qualite) {
  const audio = Float32Array.from(pcm, (v) => v / 32768);
  const tache = file.then(async () => {
    const asr = await moteur(qualite);
    const r = await asr(audio, { language: langue === 'en' ? 'english' : 'french', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
    return String(r?.text || '').trim();
  });
  file = tache.catch(() => {});
  return tache;
}

/** Le modèle de transcription de chaque fournisseur connu ; « whisper-1 » (OpenAI) sinon. */
function modeleEnLigne(c) {
  const hote = new URL(c.url).hostname;
  if (hote.endsWith('groq.com')) return 'whisper-large-v3-turbo';
  if (hote.endsWith('mistral.ai')) return 'voxtral-mini-latest';
  return 'whisper-1';
}

function wav(pcm) {
  const tete = Buffer.alloc(44);
  const octets = pcm.length * 2;
  tete.write('RIFF', 0);
  tete.writeUInt32LE(36 + octets, 4);
  tete.write('WAVEfmt ', 8);
  tete.writeUInt32LE(16, 16);
  tete.writeUInt16LE(1, 20); // PCM
  tete.writeUInt16LE(1, 22); // mono
  tete.writeUInt32LE(TAUX, 24);
  tete.writeUInt32LE(TAUX * 2, 28);
  tete.writeUInt16LE(2, 32);
  tete.writeUInt16LE(16, 34);
  tete.write('data', 36);
  tete.writeUInt32LE(octets, 40);
  return Buffer.concat([tete, Buffer.from(pcm.buffer, pcm.byteOffset, octets)]);
}

async function transcrireEnLigne(c, pcm, langue) {
  const corps = new FormData();
  corps.append('file', new Blob([wav(pcm)], { type: 'audio/wav' }), 'dictee.wav');
  corps.append('model', modeleEnLigne(c));
  corps.append('language', langue === 'en' ? 'en' : 'fr');
  const cle = cleDe(c.id);
  const r = await fetch(`${c.url}/audio/transcriptions`, { method: 'POST', headers: cle ? { Authorization: `Bearer ${cle}` } : {}, body: corps, signal: AbortSignal.timeout(90_000) });
  if (!r.ok) {
    console.error(`[dev-workshop] dictée en ligne (${c.nom}) : HTTP ${r.status}`);
    throw new Error(r.status === 404 ? 'dictee_compte_incapable' : 'dictee_en_ligne');
  }
  return String((await r.json())?.text || '').trim();
}

/** `moteur` : 'rapide' | 'precis' (Whisper ici) ou l'identifiant d'un compte API. */
async function transcrire(moteurChoisi, pcm, langue) {
  if (moteurChoisi === 'rapide' || moteurChoisi === 'precis') {
    if (!installee()) throw new Error(installation ? 'dictee_installation_en_cours' : 'dictee_absente');
    return transcrireIci(pcm, langue, moteurChoisi);
  }
  const c = compteDe(String(moteurChoisi));
  if (c.type !== 'api') throw new Error('dictee_moteur_inconnu');
  return transcrireEnLigne(c, pcm, langue);
}

/** Ordres du canal, propres à une connexion : une dictée à la fois. */
export function ordresDictee(envoyer) {
  let enCours = null; // { id, moteur, langue, morceaux, octets }
  const etat = () => envoyer({ t: 'dictee_etat', local: etatLocal(), modeles: modelesPresents() });
  return {
    ordres: {
      dictee_etat: etat,
      async dictee_installer() {
        if (etatLocal() === 'pret') return etat();
        const attente = installer();
        etat();
        try {
          await attente;
        } catch (e) {
          console.error('[dev-workshop] installation de la dictée impossible :', e.message);
          throw new Error('dictee_installation_echec');
        } finally {
          etat();
        }
      },
      dictee_debut(m) {
        enCours = { id: String(m.id || '').slice(0, 40), moteur: String(m.moteur || 'rapide'), langue: m.langue === 'en' ? 'en' : 'fr', morceaux: [], octets: 0 };
      },
      dictee_morceau(m) {
        if (!enCours || m.id !== enCours.id) return;
        const b = Buffer.from(String(m.donnees || ''), 'base64');
        enCours.octets += b.length;
        if (enCours.octets > MAX_OCTETS) {
          enCours = null;
          throw new Error('dictee_trop_longue');
        }
        enCours.morceaux.push(b);
      },
      async dictee_fin(m) {
        const d = enCours;
        if (!d || m.id !== d.id) return;
        enCours = null;
        // Copie dans un tampon neuf : un Int16Array demande un départ aligné sur 2 octets.
        const brut = new Uint8Array(Buffer.concat(d.morceaux));
        const pcm = new Int16Array(brut.buffer, 0, brut.length >> 1);
        if (pcm.length < TAUX * 0.4) throw new Error('dictee_vide');
        const texte = await transcrire(d.moteur, pcm, d.langue);
        envoyer({ t: 'dictee_texte', id: d.id, texte });
        etat(); // le modèle est peut-être arrivé à l'instant
      },
      dictee_annuler() {
        enCours = null;
      },
    },
    fermer: () => (enCours = null),
  };
}
