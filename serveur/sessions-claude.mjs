// Où Claude Code range les discussions d'un dossier de travail, et les discussions que son SDK ne liste pas.
// listSessions ignore une discussion dont il ne trouve pas de premier message : c'est le cas d'une discussion
// reprise après un résumé automatique (« This session is being continued… »). On la retrouve ici, en lecture
// seule, avec le titre que Claude Code a enregistré dans le fichier.
import { createReadStream, readdirSync, statSync, existsSync } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { homedir } from 'node:os';

const ID_FICHIER = /^([0-9a-f-]{36})\.jsonl$/;
export const racineClaude = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), 'projects');
// Tout caractère autre qu'une lettre ou un chiffre devient « - ». Au-delà de 200 caractères, Claude Code raccourcit
// le nom : ces dossiers-là ne sont pas pris en charge.
export const encoder = (dossier) => dossier.replace(/[^a-zA-Z0-9]/g, '-');
export const dossierDeClaude = (dossier) => path.join(racineClaude(), encoder(dossier));

const TYPES_TITRE = ['"custom-title"', '"ai-title"', '"summary"'];
const memo = new Map(); // fichier -> { mtime, titre }

/** Titre enregistré : titre choisi, sinon titre automatique, sinon résumé ; à défaut, premier message écrit. */
async function titreDe(fichier) {
  const titres = {};
  let premier = '';
  const lignes = readline.createInterface({ input: createReadStream(fichier), crlfDelay: Infinity });
  for await (const ligne of lignes) {
    const utile = TYPES_TITRE.some((t) => ligne.includes(t)) || (!premier && ligne.includes('"type":"user"'));
    if (!utile) continue;
    try {
      const o = JSON.parse(ligne);
      if (o.type === 'custom-title' && o.customTitle) titres.choisi = o.customTitle;
      else if (o.type === 'ai-title' && o.aiTitle) titres.auto = o.aiTitle;
      else if (o.type === 'summary' && o.summary) titres.resume = o.summary;
      else if (o.type === 'user' && !premier && !o.isCompactSummary && !o.isMeta && typeof o.message?.content === 'string') premier = o.message.content;
    } catch { /* ligne illisible : ignorée */ }
  }
  return String(titres.choisi || titres.auto || titres.resume || premier || '').slice(0, 120);
}

/** Discussions du dossier `dossier` absentes de `vus` (ids déjà listés par le SDK), au format de historique(). */
export async function discussionsNonListees(dossier, vus) {
  const ici = dossierDeClaude(dossier);
  if (!existsSync(ici)) return [];
  const liste = [];
  for (const nom of readdirSync(ici)) {
    const id = ID_FICHIER.exec(nom)?.[1];
    if (!id || vus.has(id)) continue;
    const fichier = path.join(ici, nom);
    const { mtimeMs, size } = statSync(fichier);
    if (!size) continue;
    let m = memo.get(fichier);
    if (!m || m.mtime !== mtimeMs) {
      m = { mtime: mtimeMs, titre: await titreDe(fichier).catch(() => '') };
      memo.set(fichier, m);
    }
    liste.push({ id, titre: m.titre, modifieLe: Math.round(mtimeMs) });
  }
  return liste;
}
