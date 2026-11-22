// Projets : un dossier de la racine, ses sessions, et un contexte propre (consigne donnée à toutes les IA).
// Supprimer un projet le met à la corbeille, dans le dossier des réglages : il se récupère pendant 30 jours,
// puis il est effacé pour de bon.
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, existsSync, cpSync, statSync } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG, RACINE_PROJETS } from './securite.mjs';

export const NOM_PROJET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const REGLAGES = path.join(DOSSIER_CONFIG, 'projets');
const CORBEILLE = path.join(DOSSIER_CONFIG, 'corbeille');
export const DUREE_CORBEILLE = 30 * 24 * 3600 * 1000;
const MAX_CONTEXTE = 20_000;
const ID_CORBEILLE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}--\d{13}$/;

function nomValide(nom) {
  const n = String(nom || '');
  if (!NOM_PROJET.test(n)) throw new Error('nom_invalide');
  return n;
}

const fichierContexte = (nom) => path.join(REGLAGES, nomValide(nom), 'contexte.md');
const estDossier = (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() === true;

export function lireContexte(nom) {
  try {
    return readFileSync(fichierContexte(nom), 'utf8');
  } catch {
    return '';
  }
}

export function ecrireContexte(nom, texte) {
  const valeur = String(texte ?? '');
  if (valeur.length > MAX_CONTEXTE) throw new Error('contexte_trop_long');
  if (!estDossier(path.join(RACINE_PROJETS, nomValide(nom)))) throw new Error('projet_inconnu');
  mkdirSync(path.dirname(fichierContexte(nom)), { recursive: true, mode: 0o700 });
  writeFileSync(fichierContexte(nom), valeur, { mode: 0o600 });
}

/** « Retenir pour le projet » : un bloc (déjà titré par l'écran) ajouté à la fin de la fiche du projet. */
export function ajouterAuContexte(nom, bloc) {
  const ajout = String(bloc ?? '').trim();
  if (!ajout) throw new Error('rien_a_retenir');
  const actuel = lireContexte(nom).trimEnd();
  ecrireContexte(nom, `${actuel ? `${actuel}\n\n` : ''}${ajout}\n`);
}

/** Le contexte du projet qui contient `dossier`, tourné en consigne pour les IA (vide s'il n'y en a pas). */
export function consigneDeProjet(dossier) {
  const nom = path.relative(RACINE_PROJETS, dossier).split(path.sep)[0];
  if (!NOM_PROJET.test(nom)) return '';
  const contexte = lireContexte(nom).trim();
  return contexte ? `Contexte du projet « ${nom} », donné par l'utilisateur pour toutes les sessions de ce projet :\n\n${contexte}` : '';
}

/** Règles d'accord du projet (voir regles-accord.mjs) : rangées avec le contexte, hors du dossier de code. */
const fichierRegles = (nom) => path.join(REGLAGES, nomValide(nom), 'regles.json');

export function lireRegles(nom) {
  try {
    return JSON.parse(readFileSync(fichierRegles(nom), 'utf8'));
  } catch {
    return null;
  }
}

export function ecrireRegles(nom, regles) {
  if (!estDossier(path.join(RACINE_PROJETS, nomValide(nom)))) throw new Error('projet_inconnu');
  mkdirSync(path.dirname(fichierRegles(nom)), { recursive: true, mode: 0o700 });
  writeFileSync(fichierRegles(nom), JSON.stringify(regles, null, 2) + '\n', { mode: 0o600 });
}

/** Nom du projet qui contient `dossier` (ou null). */
export function projetDe(dossier) {
  const nom = path.relative(RACINE_PROJETS, dossier).split(path.sep)[0];
  return NOM_PROJET.test(nom) ? nom : null;
}

/** Déplace un dossier, y compris d'un disque à l'autre (le renommage seul échoue alors). */
function deplacer(de, vers) {
  try {
    renameSync(de, vers);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    cpSync(de, vers, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    rmSync(de, { recursive: true, force: true });
  }
}

/** Met le projet à la corbeille. `ouvertes` : nombre de sessions qui y tournent (refus s'il y en a). */
export function mettreALaCorbeille(nom, ouvertes) {
  const source = path.join(RACINE_PROJETS, nomValide(nom));
  if (!estDossier(source)) throw new Error('projet_inconnu');
  if (ouvertes > 0) throw new Error('sessions_en_cours');
  const cible = path.join(CORBEILLE, `${nom}--${Date.now()}`);
  mkdirSync(cible, { recursive: true, mode: 0o700 });
  deplacer(source, path.join(cible, 'projet'));
  const reglages = path.join(REGLAGES, nom);
  if (estDossier(reglages)) deplacer(reglages, path.join(cible, 'reglages'));
  writeFileSync(path.join(cible, 'corbeille.json'), JSON.stringify({ nom, supprimeLe: Date.now() }) + '\n', { mode: 0o600 });
}

function entree(id) {
  if (!ID_CORBEILLE.test(String(id || ''))) throw new Error('corbeille_inconnue');
  const dossier = path.join(CORBEILLE, id);
  try {
    const meta = JSON.parse(readFileSync(path.join(dossier, 'corbeille.json'), 'utf8'));
    return { id, dossier, nom: nomValide(meta.nom), supprimeLe: Number(meta.supprimeLe) };
  } catch {
    throw new Error('corbeille_inconnue');
  }
}

/** Projets à la corbeille, les plus récents d'abord, avec la date d'effacement définitif. */
export function listerCorbeille() {
  if (!estDossier(CORBEILLE)) return [];
  const liste = [];
  for (const id of readdirSync(CORBEILLE)) {
    try {
      const e = entree(id);
      liste.push({ id, nom: e.nom, supprimeLe: e.supprimeLe, effaceLe: e.supprimeLe + DUREE_CORBEILLE });
    } catch { /* dossier étranger ou abîmé : ignoré */ }
  }
  return liste.sort((a, b) => b.supprimeLe - a.supprimeLe);
}

export function restaurer(id) {
  const e = entree(id);
  const destination = path.join(RACINE_PROJETS, e.nom);
  if (existsSync(destination)) throw new Error('projet_existe');
  deplacer(path.join(e.dossier, 'projet'), destination);
  const reglages = path.join(e.dossier, 'reglages');
  if (estDossier(reglages) && !existsSync(path.join(REGLAGES, e.nom))) {
    mkdirSync(REGLAGES, { recursive: true, mode: 0o700 });
    deplacer(reglages, path.join(REGLAGES, e.nom));
  }
  rmSync(e.dossier, { recursive: true, force: true });
  return e.nom;
}

export function effacerDefinitivement(id) {
  rmSync(entree(id).dossier, { recursive: true, force: true });
}

/** Efface ce qui est à la corbeille depuis plus de 30 jours. Rend le nombre de projets effacés. */
export function purgerCorbeille(maintenant = Date.now()) {
  let n = 0;
  for (const e of listerCorbeille()) {
    if (e.effaceLe > maintenant) continue;
    try {
      effacerDefinitivement(e.id);
      n++;
    } catch (err) {
      console.error('[dev-workshop] corbeille : effacement impossible :', err.message);
    }
  }
  return n;
}
