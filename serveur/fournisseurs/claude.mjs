// Fournisseur « Claude Code » : pilote le SDK d'agent et relaie les demandes de permission à l'écran.
import { randomUUID } from 'node:crypto';
import { optionsDeCompte } from './claude-compte.mjs';
import { versClaude } from '../connecteurs.mjs';
import { NOM_SERVEUR, NOMS_OUTILS } from '../outils-discussions.mjs';
import { marquerInterne, estInterne } from '../sessions-internes.mjs';
import { decisionAuto, interditsClaude, MOTIF_REFUS } from '../regles-accord.mjs';
import { query, listSessions, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { discussionsNonListees } from '../sessions-claude.mjs';
import { listerSessionsCorbeille } from '../corbeille-sessions.mjs';
import {
  assistantVersEvenement,
  utilisateurVersEvenements,
  resultatVersEvenement,
  limiteVersEvenement,
  historiqueVersEvenements,
  tacheVersEvenement,
} from './claude-normaliser.mjs';

/**
 * Modes proposés, du plus prudent au plus libre : manuel (tout demander), automatique (un classifieur valide
 * et ne demande qu'en cas de doute), accepter les modifications, plan (rien n'est exécuté), et « tout
 * autoriser » (aucune demande), choisi explicitement par la personne, session par session.
 */
export const MODES = ['default', 'auto', 'acceptEdits', 'plan', 'bypassPermissions'];

/** Puissance de réflexion (« effort ») ; absente = celle par défaut du modèle. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** File d'entrée : les messages saisis sont livrés au SDK au fil de l'eau. */
function fileEntree() {
  const attente = [];
  let reveil = null;
  let fermee = false;
  return {
    pousser(v) {
      attente.push(v);
      reveil?.();
    },
    fermer() {
      fermee = true;
      reveil?.();
    },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (attente.length) yield attente.shift();
        if (fermee) return;
        await new Promise((r) => (reveil = r));
        reveil = null;
      }
    },
  };
}

/** `interne` : session ouverte pour une discussion à plusieurs ou un sous-agent, à ne pas lister (sessions-internes.mjs). */
export function ouvrir({ dossier, modele, mode, reprise, compte, consigne, connecteurs, serveursMcp, outilsPermis, effort, outilsDw, interne }, emettre) {
  const entree = fileEntree();
  const permissions = new Map();
  let fenetre = null;
  let ferme = false;
  let dejaUnResultat = false; // voir « anterieur » à la fin d'un tour
  const taches = new Map(); // sous-agents en cours (tacheVersEvenement)

  const canUseTool = (outil, saisie, o) =>
    new Promise((resoudre) => {
      if (outilsDw && NOMS_OUTILS.some((n) => outil === `mcp__${NOM_SERVEUR}__${n}`)) return resoudre({ behavior: 'allow', updatedInput: saisie });
      // Règles d'accord du projet : ce qui est permis passe sans demande, ce qui est interdit est refusé.
      const auto = decisionAuto(dossier, outil, saisie);
      if (auto === 'autoriser') return resoudre({ behavior: 'allow', updatedInput: saisie });
      if (auto === 'refuser') return resoudre({ behavior: 'deny', message: MOTIF_REFUS });
      const id = randomUUID();
      const clore = () => {
        if (permissions.delete(id)) emettre({ t: 'permission_fin', id });
      };
      permissions.set(id, { resoudre, saisie, suggestions: o.suggestions, clore });
      o.signal?.addEventListener('abort', () => {
        clore();
        resoudre({ behavior: 'deny', message: 'Demande annulée.' });
      });
      emettre({
        t: 'permission',
        id,
        outil,
        ...(outil === 'AskUserQuestion' ? { questions: true } : {}), // fenêtre de questions (permissions.js)
        entree: saisie,
        titre: o.title || null,
        description: o.description || o.decisionReason || null,
        chemin: o.blockedPath || null,
        toujours: Boolean(o.suggestions?.length) && !o.suppressAlwaysAllowRule,
      });
    });

  const options = {
    cwd: dossier,
    permissionMode: MODES.includes(mode) ? mode : 'default',
    includePartialMessages: true,
    settingSources: ['user', 'project', 'local'],
    canUseTool,
    // Nécessaire pour que « tout autoriser » puisse être choisi, au début ou en cours de session.
    allowDangerouslySkipPermissions: true,
    ...optionsDeCompte(compte, consigne),
  };
  if (modele && modele !== 'default') options.model = modele;
  if (EFFORTS.includes(effort)) options.effort = effort;
  if (reprise) options.resume = reprise;
  // Connecteurs partagés de Dev Workshop, en plus de ceux que le compte a déjà (claude.ai, réglages), et outils
  // propres à Dev Workshop (mode orchestre), qui tournent dans le serveur même.
  // Outils « entre discussions » (entre-discussions.mjs) : dans le serveur même, l'identité tient à la fermeture.
  const propres = { ...(serveursMcp || {}), ...(outilsDw ? { [NOM_SERVEUR]: outilsDw.claude() } : {}) };
  if (connecteurs?.length || Object.keys(propres).length) options.mcpServers = { ...versClaude(connecteurs || []), ...propres };
  // Seuls nos propres outils passent sans demande d'accord ; tout le reste revient à l'écran. (Ceux « entre
  // discussions » sont acceptés dans canUseTool : une règle sur tout le serveur ferait râler le SDK.)
  if (outilsPermis?.length) options.allowedTools = outilsPermis;
  // Les refus du projet valent dans tous les modes, « tout autoriser » compris.
  const interdits = interditsClaude(dossier);
  if (interdits.length) options.disallowedTools = interdits;

  const q = query({ prompt: entree, options });

  async function contexte() {
    try {
      const c = await q.getContextUsage();
      fenetre = c.maxTokens || fenetre;
      emettre({ t: 'contexte', utilises: c.totalTokens, max: c.maxTokens, pourcent: c.percentage });
    } catch { /* la session peut s'être fermée entre-temps */ }
  }

  q.initializationResult()
    .then((init) => {
      emettre({
        t: 'capacites',
        modeles: (init.models || []).map((m) => ({ id: m.value, nom: m.displayName || m.value })),
        commandes: (init.commands || []).map((c) => ({
          nom: c.name,
          description: c.description || '',
          argument: c.argumentHint || '',
        })),
      });
      contexte();
    })
    .catch(() => {});

  function traiter(m) {
    if (m.type === 'stream_event') {
      if (m.parent_tool_use_id) return;
      const d = m.event?.type === 'content_block_delta' ? m.event.delta : null;
      if (d?.type === 'text_delta') emettre({ t: 'delta', genre: 'texte', texte: d.text });
      else if (d?.type === 'thinking_delta') emettre({ t: 'delta', genre: 'reflexion', texte: d.thinking });
      return;
    }
    if (m.type === 'system' && m.subtype === 'init') {
      if (interne) marquerInterne(m.session_id);
      emettre({ t: 'pret', sessionId: m.session_id, modele: m.model, mode: m.permissionMode, dossier: m.cwd });
    } else if (m.type === 'system' && m.subtype === 'status') {
      if (m.permissionMode) emettre({ t: 'etat', mode: m.permissionMode });
      if (m.status === 'compacting') emettre({ t: 'info', code: 'compactage' });
    } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
      emettre({ t: 'info', code: 'compacte' });
    } else if (m.type === 'system' && m.subtype?.startsWith('task_')) {
      const e = tacheVersEvenement(m, taches);
      if (e) emettre(e);
    } else if (m.type === 'assistant') {
      const e = assistantVersEvenement(m);
      emettre(e);
      if (!e.sousAgent && e.usage && fenetre) {
        const utilises = e.usage.entree + e.usage.cacheLu + e.usage.cacheEcrit + e.usage.sortie;
        emettre({ t: 'contexte', utilises, max: fenetre, pourcent: (utilises / fenetre) * 100 });
      }
    } else if (m.type === 'user') {
      for (const e of utilisateurVersEvenements(m, { avecTexte: false })) emettre(e);
    } else if (m.type === 'result') {
      // Discussion reprise : Claude Code rend, au premier tour, le cumul (jetons et coût) de TOUTE la discussion,
      // depuis son tout début (relevé le 21/11/2026 : 323,90 $ et 349 millions de jetons lus pour un tour de 68 s).
      // L'écran s'en sert de point de départ au lieu de l'afficher comme le prix de ce tour (jauge.js).
      emettre({ ...resultatVersEvenement(m), ...(reprise && !dejaUnResultat ? { anterieur: true } : {}) });
      dejaUnResultat = true;
      emettre({ t: 'etat', occupe: false });
      contexte();
    } else if (m.type === 'rate_limit_event') {
      emettre(limiteVersEvenement(m));
    }
  }

  (async () => {
    try {
      for await (const m of q) traiter(m);
    } catch (e) {
      if (!ferme) emettre({ t: 'erreur', code: 'fournisseur', message: String(e?.message || e).slice(0, 500) });
    } finally {
      for (const p of permissions.values()) p.clore();
      emettre({ t: 'etat', occupe: false, ferme: true });
    }
  })();

  return {
    envoyer(texte) {
      emettre({ t: 'utilisateur', texte });
      emettre({ t: 'etat', occupe: true });
      entree.pousser({ type: 'user', message: { role: 'user', content: texte }, parent_tool_use_id: null });
    },
    async interrompre() {
      await q.interrupt().catch(() => {});
    },
    async reglerModele(m) {
      await q.setModel(m === 'default' ? undefined : m);
      emettre({ t: 'etat', modele: m });
      contexte();
    },
    async reglerMode(m) {
      if (!MODES.includes(m)) throw new Error('mode_refuse');
      await q.setPermissionMode(m);
      emettre({ t: 'etat', mode: m });
    },
    /** Puissance de réflexion en cours de session ; « default » rend celle du modèle. */
    async reglerEffort(e) {
      if (e !== 'default' && !EFFORTS.includes(e)) throw new Error('effort_refuse');
      await q.applyFlagSettings({ effortLevel: e === 'default' ? null : e });
      emettre({ t: 'etat', effort: e });
    },
    repondrePermission(id, { decision, reponses, motif }) {
      const p = permissions.get(id);
      if (!p) return false;
      if (decision === 'refuser') {
        p.resoudre({ behavior: 'deny', message: motif ? `Refusé : ${String(motif).slice(0, 2000)}` : 'Refusé par l’utilisateur.' });
      } else {
        const saisie = reponses && typeof reponses === 'object' ? { ...p.saisie, answers: reponses } : p.saisie;
        const r = { behavior: 'allow', updatedInput: saisie };
        if (decision === 'toujours' && p.suggestions?.length) r.updatedPermissions = p.suggestions;
        p.resoudre(r);
      }
      p.clore();
      return true;
    },
    fermer() {
      ferme = true;
      entree.fermer();
      try { q.close(); } catch { /* déjà fermée */ }
    },
  };
}

/** Sessions enregistrées d'un dossier de projet (les plus récentes d'abord). */
export async function historique(dossier) {
  const liste = await listSessions({ dir: dossier, limit: 1000, includeWorktrees: false });
  // Une session archivée est à la corbeille : elle n'apparaît plus parmi les discussions.
  // Une session interne (Claude d'une discussion à plusieurs, sous-agent) n'est pas une discussion à part.
  const vues = liste.filter((s) => !s.archived && !estInterne(s.sessionId)).map((s) => ({
    id: s.sessionId,
    titre: (s.customTitle || s.summary || s.firstPrompt || '').slice(0, 120),
    modifieLe: s.lastModified,
  }));
  // Celles que le SDK ne liste pas (reprises après un résumé automatique), trouvées dans son dossier.
  const ecartees = new Set([...liste.map((s) => s.sessionId), ...listerSessionsCorbeille().map((s) => s.id)]);
  const oubliees = (await discussionsNonListees(dossier, ecartees).catch(() => [])).filter((s) => !estInterne(s.id));
  return [...vues, ...oubliees].sort((a, b) => b.modifieLe - a.modifieLe);
}

export async function lireHistorique(dossier, sessionId) {
  const messages = await getSessionMessages(sessionId, { dir: dossier });
  return historiqueVersEvenements(messages).slice(-800);
}
