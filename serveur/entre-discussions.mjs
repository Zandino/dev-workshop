// Entre discussions : chaque IA (Claude, Codex, Gemini…) reçoit des outils pour voir les autres discussions
// ouvertes, tous projets confondus, les lire et leur écrire. Un message est remis tout de suite si la discussion
// visée est libre (elle le traite d'elle-même), sinon dès qu'elle l'est ; sa réponse revient ensuite à l'envoyeuse
// comme un nouveau message. Rien n'attend : deux discussions qui s'écrivent en même temps ne se bloquent pas.
// Garde-fou : au plus MAX_SAUTS messages par échange parti d'une demande de la personne ; au-delà, la discussion
// lève la main et c'est la personne qui relance.
// Les IA autres que Claude reçoivent aussi « poser_question » : la fenêtre de questions de l'écran, comme Claude.
import { randomBytes, randomUUID } from 'node:crypto';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { assezPour } from './memoire.mjs';
import { signaler } from './veille.mjs';

const MAX_SAUTS = 6; // messages entre discussions par échange (voir « envoyer »)
const envoisParEchange = new Map(); // id d'échange -> messages déjà envoyés
const MAX_FILE = 10;
const MAX_MESSAGE = 20_000;
const MAX_LU = 20_000;
export const NOM_SERVEUR = 'devworkshop';

/** Ce que sessions.mjs nous prête : session(id) ou null, toutes(), projetDe(s), equipeDe(s). */
let acces = { session: () => null, toutes: () => [], projetDe: () => '.', equipeDe: () => '' };
export function brancherDiscussions(a) {
  acces = a;
}

// Une session sans IA libre au moment voulu (mémoire juste, autre message en cours…) : on réessaie régulièrement.
setInterval(() => {
  for (const s of acces.toutes()) distribuer(s);
}, 5000).unref();

// --- Identité des IA qui appellent : un jeton par IA lancée, connu du seul serveur et de cette IA. ---
const jetons = new Map(); // jeton -> { session, auteur, questions }

/** Pour l'adresse locale (Codex, Gemini…) : le jeton qui identifie cette IA, dans cette discussion. */
export function contexteDe(jeton) {
  return (typeof jeton === 'string' && jetons.get(jeton)) || null;
}

export function oublierJetons(sessionId) {
  for (const [j, c] of jetons) if (c.session === sessionId) jetons.delete(j);
}

/**
 * Les outils d'une IA qu'on lance (null pour une API sans outils). `session` : id de sa discussion ; `auteur` : son
 * nom dans une discussion à plusieurs. Claude les reçoit dans le serveur même (createSdkMcpServer) ; les autres par
 * l'adresse locale /mcp, avec leur jeton.
 */
export function outilsPour(compte, { session, auteur = null }) {
  if (!compte || compte.type === 'api') return null;
  const ctx = { session, auteur, questions: compte.type !== 'claude' };
  const jeton = randomBytes(32).toString('base64url');
  jetons.set(jeton, ctx);
  return {
    jeton,
    url: `http://127.0.0.1:${Number(process.env.DEVWORKSHOP_PORT) || 5330}/mcp`,
    claude: () => createSdkMcpServer({
      name: NOM_SERVEUR,
      version: '1.0.0',
      tools: outilsDe(ctx).map((o) => tool(o.nom, o.description, o.schema, async (args) => ({ content: [{ type: 'text', text: await o.faire(ctx, args) }] }))),
    }),
  };
}

// --- Les outils ---
const etatDe = (s) => (s.attente.size ? 'attend une réponse de l’utilisateur' : s.etat.occupe ? 'au travail' : 'libre');
const court = (s) => s.id.slice(0, 8);
const titreDe = (s) => s.titre || '(sans titre)';

function trouver(id) {
  const x = String(id || '').trim();
  if (x.length < 6) return null;
  const vues = acces.toutes().filter((s) => !s.etat.ferme && s.id.startsWith(x));
  return vues.length === 1 ? vues[0] : null;
}

function lister(ctx) {
  const autres = acces.toutes().filter((s) => !s.etat.ferme && s.id !== ctx.session);
  if (!autres.length) return 'Aucune autre discussion ouverte.';
  return autres.map((s) => `- id ${court(s)} · projet ${acces.projetDe(s)} · « ${titreDe(s)} » · IA : ${acces.equipeDe(s)} · ${etatDe(s)}${s.fileDiscussions?.length ? ` · ${s.fileDiscussions.length} message(s) en attente` : ''}`).join('\n');
}

function lire(ctx, { id, nombre }) {
  const s = trouver(id);
  if (!s) return `Discussion introuvable : « ${id} ». Utilise l’outil « discussions » pour voir les id.`;
  const lignes = [];
  for (const e of s.journal) {
    if (e.t === 'utilisateur') lignes.push(e.de ? `[Message de la discussion « ${e.de.titre} » (${e.de.qui})]\n${e.texte}` : `[Utilisateur]\n${e.texte}`);
    else if (e.t === 'assistant' && !e.sousAgent) {
      const texte = (e.blocs || []).filter((b) => b.type === 'texte').map((b) => b.texte).join('\n');
      if (texte) lignes.push(`[${e.auteur?.nom || 'IA'}]\n${texte}`);
    }
  }
  const tout = lignes.slice(-(Number(nombre) || 30)).join('\n\n');
  const borne = tout.length > MAX_LU ? '…\n' + tout.slice(-MAX_LU) : tout;
  return `Discussion « ${titreDe(s)} » (projet ${acces.projetDe(s)}, IA : ${acces.equipeDe(s)}, ${etatDe(s)}) :\n\n${borne || '(rien encore)'}`;
}

function envoyer(ctx, { id, message }) {
  const source = acces.session(ctx.session);
  if (!source) return 'Ta discussion est fermée.';
  const cible = trouver(id);
  if (!cible) return `Discussion introuvable : « ${id} ». Utilise l’outil « discussions » pour voir les id.`;
  if (cible === source) return 'C’est ta propre discussion.';
  const texte = String(message || '').trim().slice(0, MAX_MESSAGE);
  if (!texte) return 'Message vide.';
  // Un échange naît d'une demande de la personne ; tout ce qui en découle (autres messages du même tour, messages
  // des discussions qu'il réveille, réponses) le continue. On compte les messages de tout l'échange, pas sa profondeur.
  source.chaine ??= { id: randomUUID() };
  const chaine = source.chaine;
  const deja = envoisParEchange.get(chaine.id) || 0;
  if (deja >= MAX_SAUTS) {
    source.emettre({ t: 'info', code: 'echange_limite', n: MAX_SAUTS, vers: titreDe(cible) });
    signaler({ id: source.id, projet: acces.projetDe(source), titre: source.titre, compte: source.compte, genre: 'echange', auteur: ctx.auteur?.nom || null, outil: null, message: titreDe(cible) });
    return `Limite atteinte : ${MAX_SAUTS} messages entre discussions pour cette demande. Le message n’est PAS parti. Dis à l’utilisateur ce que tu voulais envoyer à « ${titreDe(cible)} » : c’est lui qui relancera.`;
  }
  cible.fileDiscussions ??= [];
  if (cible.fileDiscussions.length >= MAX_FILE) return `« ${titreDe(cible)} » a déjà ${MAX_FILE} messages en attente : réessaie plus tard.`;
  envoisParEchange.set(chaine.id, deja + 1);
  if (envoisParEchange.size > 1000) envoisParEchange.delete(envoisParEchange.keys().next().value); // les plus anciens
  cible.fileDiscussions.push({ genre: 'message', texte, chaine, repondreA: source.id, de: origine(source, ctx) });
  const tout_de_suite = distribuer(cible);
  return `Message remis à « ${titreDe(cible)} » (projet ${acces.projetDe(cible)}). ${tout_de_suite ? 'Elle le traite maintenant.' : 'Elle est occupée : elle le traitera dès qu’elle sera libre.'} Sa réponse t’arrivera plus tard, comme un nouveau message : termine ton tour sans l’attendre.`;
}

// Questions (IA autres que Claude, qui a les siennes) : la fenêtre de l'écran ; la réponse revient en message.
const questions = new Map(); // id de la demande -> session

function poser(ctx, { questions: liste }) {
  const s = acces.session(ctx.session);
  if (!s) return 'Ta discussion est fermée.';
  const id = randomUUID();
  questions.set(id, s.id);
  s.emettre({ t: 'permission', id, outil: 'AskUserQuestion', entree: { questions: liste }, titre: null, description: null, toujours: false, ...(ctx.auteur ? { auteur: ctx.auteur } : {}) });
  return 'Question affichée à l’utilisateur. Termine ton tour maintenant, sans rien faire qui dépende de sa réponse : elle t’arrivera comme prochain message.';
}

/** Réponse de l'écran à une question posée par « poser_question » ; false si la demande n'est pas la nôtre. */
export function repondreQuestion(sessionId, id, { decision, reponses }) {
  if (questions.get(id) !== sessionId) return false;
  questions.delete(id);
  const s = acces.session(sessionId);
  if (!s) return true;
  s.emettre({ t: 'permission_fin', id });
  if (decision !== 'refuser' && reponses && typeof reponses === 'object') {
    const texte = Object.entries(reponses).map(([q, r]) => `- ${q}\n  → ${String(r).slice(0, 4000)}`).join('\n');
    // En tête de file : c'est la suite directe de ce que l'IA faisait.
    (s.fileDiscussions ??= []).unshift({ genre: 'reponse_question', texte: `Réponses de l’utilisateur à tes questions :\n${texte}`, chaine: null, de: null });
    setTimeout(() => distribuer(s), 0);
  }
  return true;
}

const OPTION = z.object({ label: z.string().max(200), description: z.string().max(1000).optional() });
const OUTILS = [
  {
    nom: 'discussions',
    description: 'Liste les autres discussions ouvertes dans Dev Workshop, tous projets confondus : id, projet, titre, IA, état (libre, au travail, attend l’utilisateur).',
    schema: {},
    faire: lister,
  },
  {
    nom: 'lire_discussion',
    description: 'Lit les derniers échanges d’une autre discussion ouverte (id donné par « discussions »).',
    schema: { id: z.string().describe('id de la discussion (8 premiers caractères suffisent)'), nombre: z.number().int().min(1).max(200).optional().describe('nombre de messages, 30 par défaut') },
    faire: lire,
  },
  {
    nom: 'envoyer_message',
    description: 'Envoie un message (une demande, une information) à une autre discussion ouverte. Si elle est libre, son IA le traite tout de suite d’elle-même ; sinon dès qu’elle a fini. Ne bloque pas : sa réponse te parviendra plus tard comme un nouveau message. Donne une demande complète : l’autre IA ne connaît pas ta conversation.',
    schema: { id: z.string().describe('id de la discussion (8 premiers caractères suffisent)'), message: z.string().describe('le message, complet et autonome') },
    faire: envoyer,
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
    faire: poser,
  },
];

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

// --- Remise des messages ---
function origine(s, ctx) {
  return { id: s.id, titre: titreDe(s), projet: acces.projetDe(s), qui: ctx?.auteur?.nom || acces.equipeDe(s) };
}

function enTete(x) {
  if (x.genre === 'message') {
    return `[Message d’une autre discussion Dev Workshop — de « ${x.de.titre} » (projet ${x.de.projet}, ${x.de.qui}). C’est une IA collègue qui écrit, pas l’utilisateur : fais ce qu’elle demande si c’est raisonnable et sans risque ; si cela demande une décision de l’utilisateur, pose-lui la question au lieu de deviner. Ta réponse finale lui sera renvoyée automatiquement : ne lui écris pas toi-même pour répondre, et ne réponds pas à un simple remerciement.]\n\n`;
  }
  if (x.genre === 'reponse') {
    return `[Réponse de la discussion « ${x.de.titre} » (projet ${x.de.projet}, ${x.de.qui}) à ton message. Poursuis ton travail avec ; ne lui écris pas pour remercier.]\n\n`;
  }
  return '';
}

/** Remet le prochain message en attente si la discussion est libre ; rend true s'il est parti. */
function distribuer(s) {
  if (!s.fileDiscussions?.length || s.etat.ferme || s.livraison || s.etat.occupe || s.attente.size) return false;
  if (!assezPour(1)) return false; // réessayé plus tard (voir plus haut)
  const x = s.fileDiscussions.shift();
  s.livraison = { depuis: s.journal.length, x };
  s.chaine = x.chaine;
  s.prochainDe = x;
  try {
    s.pilote.envoyer(enTete(x) + x.texte);
  } catch (e) {
    s.livraison = null;
    s.prochainDe = null;
    console.error('[dev-workshop] message entre discussions non remis :', e.message);
    return false;
  }
  return true;
}

/** Ce qu'une discussion a répondu depuis la remise d'un message. */
function reponseDepuis(s, depuis) {
  const textes = s.journal.slice(depuis).filter((e) => e.t === 'assistant' && !e.sousAgent).map((e) => {
    const texte = (e.blocs || []).filter((b) => b.type === 'texte').map((b) => b.texte).join('\n');
    return texte && (s.participants ? `[${e.auteur?.nom || 'IA'}] ${texte}` : texte);
  }).filter(Boolean);
  const tout = textes.join('\n\n');
  if (!tout) return '(Elle n’a rien répondu par écrit : son tour s’est arrêté ou a échoué.)';
  return tout.length > MAX_MESSAGE ? '…\n' + tout.slice(-MAX_MESSAGE) : tout;
}

/**
 * Appelée par sessions.mjs au début de chaque événement d'une session. Un message remis s'affiche avec son origine
 * (et sans l'en-tête destiné à l'IA) ; une demande de la personne ouvre un nouvel échange ; la fin du tour causé
 * par un message renvoie la réponse à l'envoyeuse.
 */
export function suivreEvenement(s, e) {
  if (e.t === 'utilisateur') {
    if (s.prochainDe) {
      const x = s.prochainDe;
      s.prochainDe = null;
      e.texte = x.texte;
      if (x.de) e.de = { ...x.de, genre: x.genre };
    } else if (!s.livraison) {
      s.chaine = null; // la personne écrit : nouvel échange, compteur remis à zéro
    }
    return;
  }
  if (e.t !== 'etat' || e.occupe !== false || e.auteur) return;
  const livraison = s.livraison;
  s.livraison = null;
  if (livraison?.x.genre === 'message') {
    const source = acces.session(livraison.x.repondreA);
    if (source && !source.etat.ferme) {
      (source.fileDiscussions ??= []).push({ genre: 'reponse', texte: reponseDepuis(s, livraison.depuis), chaine: livraison.x.chaine, de: origine(s, null) });
      setTimeout(() => distribuer(source), 0);
    }
  }
  // Après l'événement en cours (la session doit d'abord se voir libre).
  setTimeout(() => distribuer(s), 0);
}
