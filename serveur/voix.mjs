// Voix naturelles de l'équipe en direct : ce que disent les IA, lu par des voix neuronales Piper (libre), sur ce
// serveur. Rien ne part ailleurs ; seuls le programme (PyPI) et les voix (Hugging Face, rhasspy/piper-voices) sont
// téléchargés à l'installation, sur ton clic, dans le dossier des réglages (sans sudo). Piper (piper-tts) est sous
// GPL-3 : il n'est pas fourni avec Dev Workshop, il s'installe à part, comme la dictée.
// Mesuré le 22/11/2026 sur 4 cœurs : 0,6 s pour 7 s de parole, ~240 Mo le temps d'une phrase. Une phrase à la fois,
// et seulement si la mémoire le permet (memoire.mjs).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, renameSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DOSSIER_CONFIG } from './securite.mjs';
import { assezPour } from './memoire.mjs';

const DOSSIER = path.join(DOSSIER_CONFIG, 'voix');
const VENV = path.join(DOSSIER, 'venv');
const PIPER = path.join(VENV, 'bin', 'piper');
const MODELES = path.join(DOSSIER, 'modeles');
const VERSION = '1.8.0';
const SOURCE = process.env.DEVWORKSHOP_VOIX_SOURCE || 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const MAX_TEXTE = 600;
const MO = 1024 * 1024;

/** Voix proposées : la clé, le modèle Piper, son locuteur (modèles à plusieurs voix), la langue et le genre. */
export const VOIX = [
  { cle: 'siwis', modele: 'fr_FR-siwis-medium', chemin: 'fr/fr_FR/siwis/medium', langue: 'fr', genre: 'f' },
  { cle: 'jessica', modele: 'fr_FR-upmc-medium', chemin: 'fr/fr_FR/upmc/medium', locuteur: 0, langue: 'fr', genre: 'f' },
  { cle: 'pierre', modele: 'fr_FR-upmc-medium', chemin: 'fr/fr_FR/upmc/medium', locuteur: 1, langue: 'fr', genre: 'm' },
  // Écartées le 22/11/2026 à l'écoute : « tom » (très grave, 82 Hz, et deux fois plus lent) et « gilles » (modèle
  // « low » en 16 kHz, nasillard). Les voix d'homme se distinguent par une légère variation de hauteur (voix-equipe.js).
  { cle: 'amy', modele: 'en_US-amy-medium', chemin: 'en/en_US/amy/medium', langue: 'en', genre: 'f' },
  { cle: 'kristin', modele: 'en_US-kristin-medium', chemin: 'en/en_US/kristin/medium', langue: 'en', genre: 'f' },
  { cle: 'ryan', modele: 'en_US-ryan-medium', chemin: 'en/en_US/ryan/medium', langue: 'en', genre: 'm' },
  { cle: 'joe', modele: 'en_US-joe-medium', chemin: 'en/en_US/joe/medium', langue: 'en', genre: 'm' },
];

const fichierModele = (v) => path.join(MODELES, `${v.modele}.onnx`);
const programmePret = () => existsSync(PIPER);
const voixPretes = () => VOIX.filter((v) => existsSync(fichierModele(v)) && existsSync(fichierModele(v) + '.json'));

let installation = null; // { langue, fait, total }
let file = Promise.resolve(); // une phrase à la fois

export function etatVoix() {
  return {
    installee: programmePret(),
    installation: installation ? { langue: installation.langue, fait: installation.fait, total: installation.total } : null,
    voix: programmePret() ? voixPretes().map(({ cle, langue, genre }) => ({ cle, langue, genre })) : [],
  };
}

function executer(commande, args) {
  return new Promise((ok, ko) => {
    const p = spawn(commande, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let erreur = '';
    p.stderr.on('data', (d) => (erreur = (erreur + d).slice(-2000)));
    p.on('error', ko);
    p.on('close', (code) => (code === 0 ? ok() : ko(new Error(erreur.trim().split('\n').pop() || `${commande} ${code}`))));
  });
}

async function telecharger(url, vers, suivre) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`téléchargement ${r.status}`);
  const partiel = vers + '.partiel';
  let n = 0;
  const flux = Readable.fromWeb(r.body);
  flux.on('data', (d) => suivre((n += d.length)));
  await pipeline(flux, createWriteStream(partiel, { mode: 0o600 }));
  renameSync(partiel, vers);
}

/** Installe Piper (environnement Python à part) et les voix d'une langue. `suivre()` à chaque progrès. */
export function installerVoix(langue, suivre = () => {}) {
  if (installation) return installation.promesse;
  const voulues = [...new Map(VOIX.filter((v) => v.langue === langue).map((v) => [v.modele, v])).values()];
  installation = { langue, fait: 0, total: voulues.length + 1 };
  installation.promesse = (async () => {
    mkdirSync(MODELES, { recursive: true, mode: 0o700 });
    if (!programmePret()) {
      await executer('python3', ['-m', 'venv', VENV]);
      await executer(path.join(VENV, 'bin', 'pip'), ['install', '--quiet', '--disable-pip-version-check', `piper-tts==${VERSION}`]);
    }
    installation.fait += 1;
    suivre();
    for (const v of voulues) {
      if (!existsSync(fichierModele(v) + '.json')) await telecharger(`${SOURCE}/${v.chemin}/${v.modele}.onnx.json`, fichierModele(v) + '.json', () => {});
      if (!existsSync(fichierModele(v))) {
        let dernier = 0;
        await telecharger(`${SOURCE}/${v.chemin}/${v.modele}.onnx`, fichierModele(v), (n) => {
          if (n - dernier > 8 * MO) { dernier = n; suivre(); }
        });
      }
      installation.fait += 1;
      suivre();
    }
  })().catch((e) => {
    // Un téléchargement interrompu ne doit pas passer pour une voix installée.
    for (const f of readdirSync(MODELES)) if (f.endsWith('.partiel')) rmSync(path.join(MODELES, f), { force: true });
    throw e;
  }).finally(() => { installation = null; });
  return installation.promesse;
}

/** Lit `texte` avec la voix `cle` ; rend { taux, pcm } (16 bits mono). `vitesse` : 0,8 (rapide) à 1,25 (lent). */
export function direVoix(texte, cle, vitesse = 1) {
  const v = voixPretes().find((x) => x.cle === cle);
  if (!programmePret() || !v) return Promise.reject(new Error('voix_absente'));
  const propre = String(texte || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTE);
  if (!propre) return Promise.reject(new Error('voix_vide'));
  const tache = file.then(() => new Promise((ok, ko) => {
    // ~240 Mo le temps d'une phrase : pas de voix quand la mémoire est juste (le travail des IA passe avant).
    if (!assezPour(0, 300 * MO)) return ko(new Error('voix_memoire'));
    const lenteur = (v.debit || 1) * Math.min(1.25, Math.max(0.8, Number(vitesse) || 1));
    const args = ['-m', fichierModele(v), '--output-raw', '--length-scale', lenteur.toFixed(3)];
    if (v.locuteur !== undefined) args.push('-s', String(v.locuteur));
    const p = spawn(PIPER, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    const morceaux = [];
    const delai = setTimeout(() => p.kill('SIGKILL'), 30_000);
    p.stdout.on('data', (d) => morceaux.push(d));
    p.on('error', (e) => { clearTimeout(delai); ko(e); });
    p.on('close', (code) => {
      clearTimeout(delai);
      if (code !== 0) return ko(new Error('voix_echec'));
      ok({ taux: v.modele.includes('-low') ? 16000 : 22050, pcm: Buffer.concat(morceaux) });
    });
    p.stdin.end(propre);
  }));
  file = tache.catch(() => {});
  return tache;
}

/** Ordres du canal : état, installation, lecture d'une phrase (réponse « voix_audio » avec l'id de la demande). */
export function ordresVoix(envoyer) {
  const etat = () => envoyer({ t: 'voix_etat', ...etatVoix() });
  return {
    voix_etat: etat,
    async voix_installer(m) {
      const attente = installerVoix(m.langue === 'en' ? 'en' : 'fr', etat);
      etat();
      try {
        await attente;
      } catch (e) {
        console.error('[dev-workshop] installation des voix impossible :', e.message);
        throw new Error('voix_installation_echec');
      } finally {
        etat();
      }
    },
    async voix_dire(m) {
      const id = String(m.id || '').slice(0, 40);
      try {
        const { taux, pcm } = await direVoix(m.texte, String(m.voix || ''), m.vitesse);
        envoyer({ t: 'voix_audio', id, taux, pcm: pcm.toString('base64') });
      } catch (e) {
        envoyer({ t: 'voix_audio', id, erreur: /^[a-z_]{3,40}$/.test(e.message) ? e.message : 'voix_echec' });
      }
    },
  };
}
