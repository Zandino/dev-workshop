// Serveurs enregistrés par la personne : un fichier dans son dossier d'application, jamais dans le projet.
// Aucun secret ici : l'accès passe par SSH (clés et réglages de la personne), le jeton n'est jamais écrit.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const fichier = () => path.join(app.getPath('userData'), 'serveurs.json');
const PORTS_LOCAUX = [49200, 49999];

/** Alias SSH, hôte ou utilisateur@hôte. Jamais d'option : une valeur qui commence par « - » serait lue par ssh. */
const HOTE = /^(?!-)[A-Za-z0-9._%+-]+(@[A-Za-z0-9._:\[\]-]+)?$/;
const DOSSIER = /^(~\/|\/)[^\0\n\r'"`$\\]*$/;

function lire() {
  try {
    const liste = JSON.parse(fs.readFileSync(fichier(), 'utf8'));
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function ecrire(liste) {
  fs.mkdirSync(path.dirname(fichier()), { recursive: true });
  fs.writeFileSync(fichier(), JSON.stringify(liste, null, 2) + '\n', { mode: 0o600 });
}

function portLibre(liste) {
  const pris = new Set(liste.map((s) => s.portLocal));
  for (let i = 0; i < 50; i++) {
    const p = PORTS_LOCAUX[0] + crypto.randomInt(PORTS_LOCAUX[1] - PORTS_LOCAUX[0]);
    if (!pris.has(p)) return p;
  }
  throw new Error('ports_epuises');
}

/** Vérifie et normalise ce que la personne a saisi. Lance une erreur dont le message est une clé de texte. */
function valider(saisie) {
  const nom = String(saisie.nom || '').trim();
  const hote = String(saisie.hote || '').trim();
  const dossier = String(saisie.dossier || '').trim() || '~/dev-workshop';
  const racine = String(saisie.racine || '').trim();
  const portSsh = saisie.portSsh ? Number(saisie.portSsh) : null;
  const port = saisie.port ? Number(saisie.port) : 5330;
  if (!nom || nom.length > 40) throw new Error('erreur_nom');
  if (!HOTE.test(hote) || hote.length > 120) throw new Error('erreur_hote');
  if (!DOSSIER.test(dossier)) throw new Error('erreur_dossier');
  if (racine && !DOSSIER.test(racine)) throw new Error('erreur_racine');
  if (portSsh !== null && !(Number.isInteger(portSsh) && portSsh > 0 && portSsh < 65536)) throw new Error('erreur_port');
  if (!(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('erreur_port');
  return { nom, hote, dossier, racine, portSsh, port };
}

function lister() {
  return lire();
}

function trouver(id) {
  const s = lire().find((x) => x.id === id);
  if (!s) throw new Error('erreur_inconnu');
  return s;
}

function enregistrer(saisie) {
  const liste = lire();
  const propre = valider(saisie);
  if (saisie.id) {
    const i = liste.findIndex((x) => x.id === saisie.id);
    if (i < 0) throw new Error('erreur_inconnu');
    liste[i] = { ...liste[i], ...propre };
  } else {
    liste.push({ id: crypto.randomUUID(), ...propre, portLocal: portLibre(liste) });
  }
  ecrire(liste);
  return lire();
}

function supprimer(id) {
  ecrire(lire().filter((x) => x.id !== id));
  return lire();
}

/** Le port local choisi était pris par un autre logiciel : on en donne un autre au serveur. */
function changerPortLocal(id) {
  const liste = lire();
  const s = liste.find((x) => x.id === id);
  if (!s) throw new Error('erreur_inconnu');
  s.portLocal = portLibre(liste);
  ecrire(liste);
  return s;
}

function noterConnexion(id) {
  const liste = lire();
  const s = liste.find((x) => x.id === id);
  if (s) {
    s.derniereConnexion = new Date().toISOString();
    ecrire(liste);
  }
}

module.exports = { lister, trouver, enregistrer, supprimer, changerPortLocal, noterConnexion };
