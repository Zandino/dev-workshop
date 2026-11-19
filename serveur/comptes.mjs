// Comptes d'IA connectés au serveur : plusieurs comptes Claude, et des API compatibles OpenAI
// (GPT, Gemini, Mistral, modèle local…). Les clés ne quittent jamais le serveur.
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG } from './securite.mjs';

const FICHIER = path.join(DOSSIER_CONFIG, 'comptes.json');
const DOSSIER_CLAUDE = path.join(DOSSIER_CONFIG, 'comptes');
const DOSSIER_CLES = path.join(DOSSIER_CONFIG, 'cles');
const ID = /^[a-z0-9-]{3,40}$/;
const MAX_COMPTES = 20;

/** Le compte déjà connecté sur le serveur (~/.claude) : toujours présent, jamais modifiable ici. */
const DEFAUT = { id: 'defaut', type: 'claude', nom: 'Claude', defaut: true };

function lire() {
  try {
    const liste = JSON.parse(readFileSync(FICHIER, 'utf8'));
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function ecrire(liste) {
  mkdirSync(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  writeFileSync(FICHIER, JSON.stringify(liste, null, 2) + '\n', { mode: 0o600 });
  chmodSync(FICHIER, 0o600);
}

function nouvelId(nom) {
  const base = String(nom).normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 24) || 'compte';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

function nomValide(nom) {
  const n = String(nom || '').trim();
  if (n.length < 1 || n.length > 40) throw new Error('nom_invalide');
  return n;
}

const fichierCle = (id) => path.join(DOSSIER_CLES, id);

/** Types de comptes qui se connectent par compte (lien à ouvrir), chacun dans son propre dossier. */
const PAR_CONNEXION = ['claude', 'codex', 'gemini'];

/**
 * Une adresse est « locale » quand le texte ne quitte pas le serveur ou le réseau privé de l'entreprise
 * (LM Studio ou Ollama sur un poste du réseau, par exemple).
 */
function estLocale(url) {
  const hote = new URL(url).hostname;
  if (hote === 'localhost' || hote === '[::1]' || /^127\./.test(hote)) return true;
  return /^10\./.test(hote) || /^192\.168\./.test(hote) || /^172\.(1[6-9]|2\d|3[01])\./.test(hote);
}

export function tousLesComptes() {
  return [DEFAUT, ...lire()];
}

export function compte(id) {
  const c = tousLesComptes().find((x) => x.id === id);
  if (!c) throw new Error('compte_inconnu');
  return c;
}

/** Vue pour l'écran : aucune clé, seulement sa présence et sa longueur. */
export function listerComptes() {
  return tousLesComptes().map((c) => {
    const vue = { id: c.id, type: c.type, nom: c.nom, defaut: Boolean(c.defaut) };
    if (PAR_CONNEXION.includes(c.type) && !c.defaut) vue.connectable = true;
    // Dans une discussion à plusieurs, ces comptes reçoivent ce que disent les autres IA, hors du serveur.
    if (c.type === 'codex' || c.type === 'gemini') vue.externe = true;
    if (c.type === 'api') {
      const cle = cleDe(c.id);
      Object.assign(vue, { url: c.url, modele: c.modele, externe: !estLocale(c.url), cle: cle ? cle.length : 0 });
    }
    return vue;
  });
}

export function creerCompte({ type, nom, url, modele }) {
  const liste = lire();
  if (liste.length >= MAX_COMPTES) throw new Error('trop_de_comptes');
  const c = { id: nouvelId(nom), type, nom: nomValide(nom) };
  if (PAR_CONNEXION.includes(type)) {
    // Un dossier par compte : l'outil officiel y range sa connexion, faite par la personne depuis l'écran.
    c.dossier = path.join(DOSSIER_CLAUDE, c.id);
    mkdirSync(c.dossier, { recursive: true, mode: 0o700 });
  } else if (type === 'api') {
    let adresse;
    try {
      adresse = new URL(String(url));
    } catch {
      throw new Error('adresse_invalide');
    }
    if (!['http:', 'https:'].includes(adresse.protocol) || adresse.username || adresse.password) throw new Error('adresse_invalide');
    c.url = adresse.href.replace(/\/+$/, '');
    // Sans chiffrement, la clé et les échanges circuleraient en clair : permis seulement en local.
    if (adresse.protocol === 'http:' && !estLocale(c.url)) throw new Error('adresse_non_chiffree');
    c.modele = String(modele || '').trim().slice(0, 120);
    if (!c.modele) throw new Error('modele_invalide');
  } else {
    throw new Error('type_invalide');
  }
  ecrire([...liste, c]);
  return c.id;
}

/** Range la clé saisie par la personne. Elle ne ressort plus : ni vers l'écran, ni dans un journal. */
export function definirCle(id, cle) {
  const c = compte(id);
  if (c.type !== 'api' || !ID.test(id)) throw new Error('compte_inconnu');
  const valeur = String(cle || '').trim();
  if (valeur.length < 1 || valeur.length > 500 || /\s/.test(valeur)) throw new Error('cle_invalide');
  mkdirSync(DOSSIER_CLES, { recursive: true, mode: 0o700 });
  writeFileSync(fichierCle(id), valeur, { mode: 0o600 });
  chmodSync(fichierCle(id), 0o600);
}

/** Usage interne (appel de l'API) uniquement. */
export function cleDe(id) {
  if (!ID.test(id) || !existsSync(fichierCle(id))) return null;
  return readFileSync(fichierCle(id), 'utf8').trim() || null;
}

/**
 * Retire le compte de la liste et efface sa clé d'API. Le dossier d'un compte Claude est laissé en
 * place : il contient une connexion, que seule la personne décide de supprimer.
 */
export function supprimerCompte(id) {
  const liste = lire();
  if (!liste.some((c) => c.id === id)) throw new Error('compte_inconnu');
  ecrire(liste.filter((c) => c.id !== id));
  if (ID.test(id)) rmSync(fichierCle(id), { force: true });
}
