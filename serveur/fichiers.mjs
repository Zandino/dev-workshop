// Fichiers joints à une conversation : reçus par morceaux sur le canal (un message y est limité à 1 Mo),
// rangés dans le projet (.devworkshop/fichiers/), puis signalés à l'IA, qui les lit avec ses propres outils.
// Une IA sans outils (API) reçoit le contenu des fichiers texte directement dans le message.
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const MAX_FICHIER = 25 * 1024 * 1024;
const MAX_MORCEAU = 700 * 1024; // en base64, sous la limite d'un message du canal
const MAX_PAR_MESSAGE = 10;
const MAX_TEXTE_INCLUS = 200 * 1024;
const SOUS_DOSSIER = path.join('.devworkshop', 'fichiers');
const ID = /^[a-z0-9]{8,32}$/;

const horodatage = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Nom sûr : sans chemin, sans caractère spécial, borné. */
function nomSur(nom) {
  const base = path.basename(String(nom || 'fichier')).normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '');
  return (base || 'fichier').slice(-80);
}

function dossierFichiers(projet) {
  const d = path.join(projet, SOUS_DOSSIER);
  mkdirSync(d, { recursive: true });
  // Les fichiers joints ne doivent pas finir dans le dépôt git du projet.
  const ignore = path.join(projet, '.devworkshop', '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  return d;
}

/** Réceptions en cours d'une connexion : on les efface si elle se ferme avant la fin. */
export function receptions() {
  const enCours = new Map();
  return {
    /** Range un morceau ; rend la description du fichier au dernier morceau, null sinon. */
    morceau(projet, m) {
      const id = String(m.id || '');
      if (!ID.test(id)) throw new Error('fichier_invalide');
      const donnees = String(m.donnees || '');
      if (donnees.length > MAX_MORCEAU) throw new Error('fichier_invalide');
      let r = enCours.get(id);
      if (!r) {
        if (m.index !== 0 || enCours.size >= 4) throw new Error('fichier_invalide');
        const dossier = dossierFichiers(projet);
        const nom = `${horodatage()}-${nomSur(m.nom)}`;
        r = { projet, dossier, nom, partiel: path.join(dossier, `.partiel-${id}`), recus: 0, taille: 0, total: Number(m.total) };
        if (!Number.isInteger(r.total) || r.total < 1 || r.total > Math.ceil(MAX_FICHIER / (MAX_MORCEAU * 0.74)) + 1) throw new Error('fichier_invalide');
        writeFileSync(r.partiel, '');
        enCours.set(id, r);
      }
      if (r.projet !== projet || m.index !== r.recus) throw new Error('fichier_invalide');
      const octets = Buffer.from(donnees, 'base64');
      r.taille += octets.length;
      if (r.taille > MAX_FICHIER) {
        this.abandonner(id);
        throw new Error('fichier_trop_gros');
      }
      appendFileSync(r.partiel, octets);
      r.recus++;
      if (r.recus < r.total) return null;
      enCours.delete(id);
      const final = path.join(r.dossier, r.nom);
      renameSync(r.partiel, final);
      return { id, nom: nomSur(m.nom), chemin: path.relative(projet, final).split(path.sep).join('/'), taille: r.taille };
    },
    abandonner(id) {
      const r = enCours.get(id);
      if (!r) return;
      enCours.delete(id);
      rmSync(r.partiel, { force: true });
    },
    toutAbandonner() {
      for (const id of [...enCours.keys()]) this.abandonner(id);
    },
  };
}

/** Vérifie les fichiers cités par un message : ils doivent être des fichiers joints de ce projet. */
function fichiersDuProjet(projet, liste) {
  if (!Array.isArray(liste) || !liste.length) return [];
  if (liste.length > MAX_PAR_MESSAGE) throw new Error('trop_de_fichiers');
  const racine = path.join(projet, SOUS_DOSSIER) + path.sep;
  return liste.map((chemin) => {
    const complet = path.resolve(projet, String(chemin));
    if (!complet.startsWith(racine) || !statSync(complet, { throwIfNoEntry: false })?.isFile()) throw new Error('fichier_introuvable');
    return { chemin: path.relative(projet, complet).split(path.sep).join('/'), complet };
  });
}

function texteLisible(complet) {
  if (statSync(complet).size > MAX_TEXTE_INCLUS) return null;
  const octets = readFileSync(complet);
  if (octets.includes(0)) return null;
  const texte = octets.toString('utf8');
  return texte.includes('�') ? null : texte;
}

/**
 * Le message tel que l'IA le reçoit : le texte de la personne, puis la liste des fichiers joints.
 * `avecOutils` : l'IA lit elle-même les fichiers ; sinon, le contenu des fichiers texte est inclus.
 */
export function messageAvecFichiers(texte, projet, liste, avecOutils) {
  const fichiers = fichiersDuProjet(projet, liste);
  if (!fichiers.length) return texte;
  if (avecOutils) {
    return `${texte}\n\n---\nFichiers joints (dans le dossier du projet, à lire avec tes outils) :\n${fichiers.map((f) => `- ${f.chemin}`).join('\n')}`;
  }
  const blocs = fichiers.map((f) => {
    const contenu = texteLisible(f.complet);
    return contenu === null ? `### ${f.chemin}\n(fichier non textuel : il ne peut pas être lu ici)` : `### ${f.chemin}\n\`\`\`\n${contenu}\n\`\`\``;
  });
  return `${texte}\n\n---\nFichiers joints :\n\n${blocs.join('\n\n')}`;
}
