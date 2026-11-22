// Outils « entre discussions » donnés aux IA (la remise des messages est dans entre-discussions.mjs) :
// discussions, lire_discussion, envoyer_message, et poser_question pour les IA autres que Claude (qui a la sienne).
// Claude les reçoit dans le serveur même (createSdkMcpServer) ; les autres par l'adresse locale /mcp (mcp-http.mjs),
// avec un jeton propre à chaque IA lancée, oublié quand elle s'arrête.
import { randomBytes } from 'node:crypto';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { listerDiscussions, lireDiscussion, envoyerMessage, poserQuestion } from './entre-discussions.mjs';
import { outilLire, outilRetenir, outilProposerInstructions, MAX_INSTRUCTIONS } from './memoire-discussion.mjs';

/**
 * Nom du serveur d'outils, tiré au hasard à chaque démarrage : un dépôt piégé qui déclarerait son propre serveur
 * « devworkshop » ne peut pas se faire passer pour le nôtre (nos outils passent sans demande d'accord).
 */
export const NOM_SERVEUR = `devworkshop${randomBytes(3).toString('hex')}`;

// --- Identité des IA qui appellent l'adresse locale : un jeton par IA lancée, connu du seul serveur et d'elle. ---
const jetons = new Map(); // jeton -> { session, auteur, questions }

export function contexteDe(jeton) {
  return (typeof jeton === 'string' && jetons.get(jeton)) || null;
}

export function oublierJetons(sessionId) {
  for (const [j, c] of jetons) if (c.session === sessionId) jetons.delete(j);
}

/**
 * Les outils d'une IA qu'on lance (null pour une API sans outils). `session` : id de sa discussion ; `auteur` : son
 * nom dans une discussion à plusieurs. Pour les IA hors serveur : `jeton`, `url`, et `oublier()` à leur arrêt.
 */
export function outilsPour(compte, { session, auteur = null }) {
  if (!compte || compte.type === 'api') return null;
  const ctx = { session, auteur, questions: compte.type !== 'claude' };
  if (compte.type === 'claude') {
    return {
      claude: () => createSdkMcpServer({
        name: NOM_SERVEUR,
        version: '1.0.0',
        tools: outilsDe(ctx).map((o) => tool(o.nom, o.description, o.schema, async (args) => ({ content: [{ type: 'text', text: await o.faire(ctx, args) }] }))),
      }),
    };
  }
  const jeton = randomBytes(32).toString('base64url');
  jetons.set(jeton, ctx);
  return {
    jeton,
    url: `http://127.0.0.1:${Number(process.env.DEVWORKSHOP_PORT) || 5330}/mcp`,
    oublier: () => jetons.delete(jeton),
  };
}

const OPTION = z.object({ label: z.string().max(200), description: z.string().max(1000).optional() });
const OUTILS = [
  {
    nom: 'discussions',
    description: 'Liste les autres discussions ouvertes dans Dev Workshop, tous projets confondus : id, projet, titre, IA, état (libre, au travail, attend l’utilisateur).',
    schema: {},
    faire: listerDiscussions,
  },
  {
    nom: 'lire_discussion',
    description: 'Lit les derniers échanges d’une autre discussion ouverte (id donné par « discussions »).',
    schema: { id: z.string().describe('id de la discussion (8 premiers caractères suffisent)'), nombre: z.number().int().min(1).max(200).optional().describe('nombre de messages, 30 par défaut') },
    faire: lireDiscussion,
  },
  {
    nom: 'envoyer_message',
    description: 'Envoie un message (une demande, une information) à une autre discussion ouverte. Si elle est libre, son IA le traite tout de suite d’elle-même ; sinon dès qu’elle a fini (ou dès que l’utilisateur l’accepte, si elle agit sans demander d’accord). Ne bloque pas : sa réponse te parviendra plus tard comme un nouveau message. Donne une demande complète : l’autre IA ne connaît pas ta conversation.',
    schema: { id: z.string().describe('id de la discussion (8 premiers caractères suffisent)'), message: z.string().describe('le message, complet et autonome') },
    faire: envoyerMessage,
  },
  {
    nom: 'poser_question',
    description: 'Pose une ou plusieurs questions à choix à l’utilisateur (fenêtre à onglets à l’écran ; il peut aussi répondre librement). Utilise-la quand une décision lui revient, au lieu de deviner. Ensuite termine ton tour : ses réponses arriveront comme prochain message.',
    schema: {
      questions: z.array(z.object({
        question: z.string().max(1000).describe('la question complète'),
        header: z.string().max(12).describe('étiquette très courte de l’onglet (12 caractères au plus)'),
        options: z.array(OPTION).min(2).max(4).describe('2 à 4 choix ; mets le choix recommandé en premier, avec « (Recommandé) »'),
        multiSelect: z.boolean().optional().describe('plusieurs choix possibles'),
      })).min(1).max(4),
    },
    seulementSi: (ctx) => ctx.questions,
    faire: poserQuestion,
  },
  // Mémoire de la discussion (memoire-discussion.mjs).
  {
    nom: 'memoire_lire',
    description: 'Relit la mémoire de cette discussion : les instructions de l’utilisateur et ce que tu as retenu.',
    schema: {},
    faire: outilLire,
  },
  {
    nom: 'memoire_retenir',
    description: 'Note dans la mémoire de cette discussion ce qu’il faut retenir : décisions, faits utiles qui ne se devinent pas, préférences de l’utilisateur, ce qui reste à faire. Mode « ajouter » (par défaut) : ajoute tes lignes ; « remplacer » : réécrit toute la partie retenue (pour retirer ce qui n’est plus vrai ou raccourcir). Jamais de secret.',
    schema: {
      texte: z.string().max(12_000).describe('lignes courtes à noter (ou toute la partie, en mode « remplacer »)'),
      mode: z.enum(['ajouter', 'remplacer']).optional().describe('« ajouter » par défaut'),
    },
    faire: outilRetenir,
  },
  {
    nom: 'memoire_proposer_instructions',
    description: 'Propose à l’utilisateur de changer les instructions de la mémoire de cette discussion (elles ne changent que s’il accepte, à l’écran). Donne le texte complet des nouvelles instructions et la raison.',
    schema: {
      instructions: z.string().max(MAX_INSTRUCTIONS).describe('le texte complet des nouvelles instructions'),
      raison: z.string().max(1000).describe('pourquoi les changer, en une ou deux phrases'),
    },
    faire: outilProposerInstructions,
  },
];

/** Les noms de nos outils : seuls ceux-là passent sans demande d'accord (fournisseurs). */
export const NOMS_OUTILS = OUTILS.map((o) => o.nom);

export const outilsDe = (ctx) => OUTILS.filter((o) => !o.seulementSi || o.seulementSi(ctx));

/** Description pour le protocole MCP (tools/list). */
export function descriptionMcp(o) {
  const { $schema, ...schema } = z.toJSONSchema(z.object(o.schema));
  return { name: o.nom, description: o.description, inputSchema: schema };
}

/** Appel d'un outil par l'adresse locale ; les paramètres sont vérifiés. */
export async function appelerOutil(ctx, nom, args) {
  const o = outilsDe(ctx).find((x) => x.nom === nom);
  if (!o) return { erreur: `Outil inconnu : ${nom}` };
  const lu = z.object(o.schema).safeParse(args || {});
  if (!lu.success) return { erreur: `Paramètres invalides : ${lu.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(' ; ')}` };
  return { texte: await o.faire(ctx, lu.data) };
}
