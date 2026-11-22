// Mémoire de chaque discussion (à ne pas confondre avec memoire.mjs, la mémoire vive du serveur) : deux parties, rangées sur le serveur (memoires/<clé>.json, hors du dossier de code).
//   - instructions : écrites par la personne ; l'IA les suit, et peut seulement proposer de les changer (carte
//     d'accord à l'écran) ;
//   - retenu : ce que l'IA retient au fil du travail (décisions, faits utiles, ce qui reste à faire), qu'elle tient à
//     jour elle-même avec ses outils ; la personne peut le corriger.
// Toutes les IA de la discussion la reçoivent à leur démarrage (consigneMemoire) ; une modification faite par la
// personne pendant la discussion leur est redonnée avec son message suivant (prefixePourEnvoi).
// La clé suit la discussion à travers redémarrages, changements d'équipe et rangements (sessions.mjs : cleMemoire).
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DOSSIER_CONFIG } from './securite.mjs';

const DOSSIER = path.join(DOSSIER_CONFIG, 'memoires');
const CLE = /^[0-9a-f-]{36}$/;
export const MAX_INSTRUCTIONS = 8000;
export const MAX_RETENU = 12_000;

const fichier = (cle) => {
  if (!CLE.test(String(cle))) throw new Error('memoire_cle');
  return path.join(DOSSIER, `${cle}.json`);
};

const vide = () => ({ instructions: '', retenu: '', version: 0, majLe: null, majPar: null });

export function lireMemoire(cle) {
  try {
    const d = JSON.parse(readFileSync(fichier(cle), 'utf8'));
    return { ...vide(), ...d, instructions: String(d.instructions || ''), retenu: String(d.retenu || '') };
  } catch {
    return vide();
  }
}

/** Écrit les parties données ; `par` : 'utilisateur' ou le nom de l'IA. Rend la mémoire à jour. */
export function ecrireMemoire(cle, { instructions, retenu }, par) {
  const m = lireMemoire(cle);
  if (instructions !== undefined) m.instructions = String(instructions).slice(0, MAX_INSTRUCTIONS).trim();
  if (retenu !== undefined) m.retenu = String(retenu).slice(0, MAX_RETENU).trim();
  m.version += 1;
  m.majLe = Date.now();
  m.majPar = par;
  mkdirSync(DOSSIER, { recursive: true, mode: 0o700 });
  const tmp = `${fichier(cle)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, fichier(cle));
  return m;
}

/** La clé change (le Claude du serveur donne sa propre session en démarrant) : la mémoire suit, si elle existe. */
export function deplacerMemoire(ancienne, nouvelle) {
  try {
    if (existsSync(fichier(ancienne)) && !existsSync(fichier(nouvelle))) renameSync(fichier(ancienne), fichier(nouvelle));
  } catch { /* clé invalide : rien à déplacer */ }
}

/** Ce que l'IA lit de la mémoire (consigne au démarrage, outil memoire_lire, mise à jour). */
function texteMemoire(m) {
  return [
    '## Instructions de l’utilisateur pour cette discussion (à suivre)',
    m.instructions || '(aucune)',
    '## Ce que tu as retenu (tu le tiens à jour)',
    m.retenu || '(rien encore)',
  ].join('\n\n');
}

const MODE_EMPLOI = 'Cette discussion a une mémoire, qui te suivra (redémarrage, autre IA, autre projet). Tiens à jour la partie « ce que tu as retenu » avec l’outil « memoire_retenir » : décisions prises, faits utiles qui ne se devinent pas, préférences de l’utilisateur, ce qui reste à faire. Note-y au fil du travail, en lignes courtes ; retire ce qui n’est plus vrai (mode « remplacer »). N’y mets jamais de secret (mot de passe, clé, jeton). Les instructions de l’utilisateur ne se changent que s’il accepte : propose-le avec « memoire_proposer_instructions ».';

/** Ce que sessions.mjs nous prête : session(id) ou null. */
let acces = { session: () => null };
export function brancherMemoire(a) {
  acces = a;
}

/** Le bloc de consigne d'une IA qui démarre dans la discussion `sessionId` (vide si inconnue). */
export function consigneMemoire(sessionId) {
  const s = acces.session(sessionId);
  if (!s?.cleMemoire) return '';
  // \`memoireVue\` n'avance pas ici : dans un salon, une IA qui démarre tard ne dit rien de ce que savent les autres.
  const m = lireMemoire(s.cleMemoire);
  return `${MODE_EMPLOI}\n\nMémoire de cette discussion :\n\n${texteMemoire(m)}`;
}

/** Mémoire changée par la personne depuis ce que l'IA en sait : la version à jour, en tête de son message. */
export function prefixePourEnvoi(s) {
  if (!s?.cleMemoire) return '';
  const m = lireMemoire(s.cleMemoire);
  if (m.version <= (s.memoireVue || 0)) return '';
  s.memoireVue = m.version;
  return `[Mémoire de la discussion mise à jour par l’utilisateur — la voici à jour :]\n\n${texteMemoire(m)}\n\n[Message de l’utilisateur :]\n\n`;
}

/** Envoie le message de la personne à l'IA, avec la mémoire à jour en tête si elle l'a changée depuis (canal.mjs). */
export function envoyerAvecMemoire(s, message) {
  const prefixe = prefixePourEnvoi(s);
  if (prefixe) s.prefixeMemoire = prefixe; // sessions.mjs le retire du message affiché
  s.pilote.envoyer(prefixe + message);
}

/** L'écran et la discussion apprennent un changement (fil : note ; panneau Mémoire : rechargé). */
function annoncer(s, m, quoi) {
  s.emettre({ t: 'memoire', ...quoi, version: m.version });
}

// --- Outils des IA (outils-discussions.mjs) ---
export function outilLire(ctx) {
  const s = acces.session(ctx.session);
  if (!s?.cleMemoire) return 'Pas de mémoire pour cette discussion.';
  return texteMemoire(lireMemoire(s.cleMemoire));
}

export function outilRetenir(ctx, { texte, mode = 'ajouter' }) {
  const s = acces.session(ctx.session);
  if (!s?.cleMemoire) return 'Pas de mémoire pour cette discussion.';
  const propre = String(texte || '').trim();
  if (!propre && mode !== 'remplacer') return 'Rien à noter.';
  const avant = lireMemoire(s.cleMemoire);
  const retenu = mode === 'remplacer' ? propre : [avant.retenu, propre].filter(Boolean).join('\n');
  if (retenu.length > MAX_RETENU) {
    return `Trop long : la partie « retenu » ne dépasse pas ${MAX_RETENU} caractères (elle en ferait ${retenu.length}). Réécris-la en plus court avec le mode « remplacer » : garde l’essentiel, retire ce qui n’est plus utile.`;
  }
  const qui = ctx.auteur?.nom || 'IA';
  const m = ecrireMemoire(s.cleMemoire, { retenu }, qui);
  s.memoireVue = m.version; // elle sait ce qu'elle vient d'écrire
  annoncer(s, m, { par: qui, mode: mode === 'remplacer' ? 'remplacer' : 'ajouter', texte: propre.slice(0, 600) });
  return mode === 'remplacer' ? 'Mémoire réécrite.' : 'Noté dans la mémoire.';
}

const demandes = new Map(); // id -> { session, instructions, par }

export function outilProposerInstructions(ctx, { instructions, raison }) {
  const s = acces.session(ctx.session);
  if (!s?.cleMemoire) return 'Pas de mémoire pour cette discussion.';
  const nouvelles = String(instructions || '').trim();
  if (nouvelles.length > MAX_INSTRUCTIONS) return `Trop long : ${MAX_INSTRUCTIONS} caractères au plus.`;
  if ([...demandes.values()].some((d) => d.session === s.id)) return 'Une proposition attend déjà la décision de l’utilisateur.';
  const id = randomUUID();
  const qui = ctx.auteur?.nom || 'IA';
  demandes.set(id, { session: s.id, instructions: nouvelles, par: qui });
  s.emettre({
    t: 'permission', id, outil: 'MemoireInstructions', toujours: false,
    titre: `${qui} propose de changer les instructions de la mémoire : accepter ?`,
    description: null,
    entree: { raison: String(raison || '').slice(0, 1000), avant: lireMemoire(s.cleMemoire).instructions, instructions: nouvelles },
    ...(ctx.auteur ? { auteur: ctx.auteur } : {}),
  });
  return 'Proposition affichée à l’utilisateur. Continue sans l’attendre : s’il l’accepte, la mémoire à jour te sera redonnée avec son prochain message.';
}

/** Réponse de l'écran à une proposition ; false si la demande n'est pas une des nôtres. */
export function repondreDemandeMemoire(sessionId, id, { decision }) {
  const d = demandes.get(id);
  if (!d || d.session !== sessionId) return false;
  demandes.delete(id);
  const s = acces.session(sessionId);
  if (!s?.cleMemoire) return true;
  s.emettre({ t: 'permission_fin', id });
  if (decision === 'refuser') {
    s.emettre({ t: 'memoire', par: 'utilisateur', mode: 'instructions_refusees', version: lireMemoire(s.cleMemoire).version });
    return true;
  }
  const m = ecrireMemoire(s.cleMemoire, { instructions: d.instructions }, 'utilisateur');
  annoncer(s, m, { par: 'utilisateur', mode: 'instructions', proposePar: d.par });
  return true;
}

export function oublierDemandesMemoire(sessionId) {
  for (const [id, d] of demandes) if (d.session === sessionId) demandes.delete(id);
}

/** Écriture depuis l'écran (panneau Mémoire) ; `version` : celle que l'écran a lue (pas d'écrasement silencieux). */
export function ecrireDepuisEcran(s, { instructions, retenu, version }) {
  const avant = lireMemoire(s.cleMemoire);
  if (Number(version) !== avant.version) throw new Error('memoire_changee');
  if (String(instructions ?? '').length > MAX_INSTRUCTIONS || String(retenu ?? '').length > MAX_RETENU) throw new Error('memoire_trop_longue');
  const m = ecrireMemoire(s.cleMemoire, { instructions: String(instructions ?? ''), retenu: String(retenu ?? '') }, 'utilisateur');
  annoncer(s, m, { par: 'utilisateur', mode: 'ecran' });
  return m;
}
