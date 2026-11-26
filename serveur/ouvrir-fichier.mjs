// Ouvrir depuis l'écran un fichier qu'une IA cite dans la conversation (« ~/maquettes/page.html », « /home/…/rapport.pdf »,
// « .devworkshop/fichiers/… ») : dans l'aperçu, ou pour le télécharger sur le PC. Vécu le 26/11/2026 : une IA annonçait
// des captures rangées hors du dossier des projets, et rien dans l'écran ne permettait de les voir.
// Bornes : le dossier personnel du serveur et la racine des projets, liens symboliques résolus, et jamais rien de caché
// (« .ssh », « .config », « .env »…) sauf `.devworkshop`. Le terminal (terminaux.mjs) donne déjà plus à qui a le jeton ;
// ces bornes évitent surtout d'afficher par mégarde une clé dont une IA aurait cité le chemin.
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { RACINE_PROJETS, resoudreProjet } from './securite.mjs';
import { ticketApercu, cache } from './apercu.mjs';

const MAX_ENTREES = 500;

/** Les racines permises, chemins réels. */
function racines() {
  const liste = [RACINE_PROJETS];
  try { liste.push(realpathSync(homedir())); } catch { /* pas de dossier personnel lisible */ }
  return liste;
}

/** La racine permise qui contient `reel` sans rien de caché en chemin, ou null. */
function racineDe(reel) {
  return racines().find((r) => (reel === r || reel.startsWith(r + path.sep)) && !cache(path.relative(r, reel))) || null;
}

/**
 * Résout le chemin demandé : « ~/… » depuis le dossier personnel, absolu tel quel, relatif depuis le dossier du projet
 * affiché. Rend le chemin réel, ou lève un code court.
 */
export function resoudreFichier(demande, projet) {
  let brut = String(demande ?? '').trim();
  if (!brut || brut.length > 4096 || brut.includes('\0')) throw new Error('fichier_invalide');
  if (brut === '~' || brut.startsWith('~/')) brut = path.join(homedir(), brut.slice(1));
  else if (!path.isAbsolute(brut)) {
    if (!projet) throw new Error('fichier_introuvable');
    brut = path.join(resoudreProjet(String(projet)), brut);
  }
  let reel;
  try {
    reel = realpathSync(brut);
  } catch {
    throw new Error('fichier_introuvable');
  }
  if (!racineDe(reel)) throw new Error('fichier_interdit');
  return reel;
}

/**
 * Prépare l'ouverture : un ticket d'aperçu sur le dossier du fichier (ses images et styles suivent, rien de caché),
 * ou la liste d'un dossier.
 */
export function ouvrirFichier(demande, projet) {
  const reel = resoudreFichier(demande, projet);
  const infos = statSync(reel);
  if (infos.isDirectory()) {
    const entrees = readdirSync(reel, { withFileTypes: true })
      .filter((e) => !cache(e.name) && (e.isFile() || e.isDirectory()))
      .map((e) => {
        let taille = null;
        try { if (e.isFile()) taille = statSync(path.join(reel, e.name)).size; } catch { /* illisible */ }
        return { nom: e.name, dossier: e.isDirectory(), taille };
      })
      .sort((a, b) => Number(b.dossier) - Number(a.dossier) || a.nom.localeCompare(b.nom))
      .slice(0, MAX_ENTREES);
    return { chemin: reel, dossier: true, entrees };
  }
  if (!infos.isFile()) throw new Error('fichier_introuvable');
  const { ticket, dureeMs } = ticketApercu(path.dirname(reel), { masques: false });
  return { chemin: reel, dossier: false, ticket, nom: path.basename(reel), taille: infos.size, dureeMs };
}

const MOTIFS = {
  fichier_introuvable: 'fichier introuvable sur le serveur',
  fichier_interdit: 'refusé : fichier caché (.ssh, .config, .env…) ou hors du dossier personnel et des projets',
  fichier_invalide: 'chemin invalide',
};

/**
 * Outil « montrer_fichier » des IA (outils-discussions.mjs) : ouvre le fichier dans l'aperçu des écrans qui affichent
 * leur discussion, mêmes bornes que les liens. Rend le compte rendu lu par l'IA.
 */
export async function montrerFichier(ctx, { chemin }) {
  // Chargé à l'appel seulement : sessions.mjs passe par les outils des IA pour arriver ici (import circulaire), et les
  // essais de ce module se passent du serveur des discussions.
  const { session } = await import('./sessions.mjs');
  const s = session(ctx.session);
  let infos;
  try {
    infos = ouvrirFichier(chemin, s.dossier);
  } catch (e) {
    return `Pas ouvert : ${MOTIFS[e.message] || e.message}.`;
  }
  if (!s.abonnes.size) return `Personne n'affiche cette discussion en ce moment : rien ne s'est ouvert. Donne le chemin ${infos.chemin} dans ta réponse : il y deviendra un lien.`;
  for (const envoyer of s.abonnes) envoyer({ t: 'fichier_ouvert', demande: String(chemin).slice(0, 4096), parIa: true, session: s.id, ...infos });
  return `Ouvert dans l'aperçu de l'écran : ${infos.chemin}${infos.dossier ? ' (liste du dossier)' : ''}.`;
}

/** Ordre de l'écran (canal authentifié) : { t: 'fichier_ouvrir', chemin, projet }. */
export function ordresFichier(envoyer) {
  return {
    ordres: {
      fichier_ouvrir(m) {
        envoyer({ t: 'fichier_ouvert', demande: String(m.chemin ?? '').slice(0, 4096), ...ouvrirFichier(m.chemin, m.projet || null) });
      },
    },
  };
}
