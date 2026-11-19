// Fournisseur « Claude Code » : pilote le SDK d'agent et relaie les demandes de permission à l'écran.
import { randomUUID } from 'node:crypto';
import { optionsDeCompte } from './claude-compte.mjs';
import { query, listSessions, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import {
  assistantVersEvenement,
  utilisateurVersEvenements,
  resultatVersEvenement,
  limiteVersEvenement,
  historiqueVersEvenements,
} from './claude-normaliser.mjs';

/** Modes proposés. Le contournement complet des permissions n'est volontairement pas offert. */
export const MODES = ['default', 'acceptEdits', 'plan'];

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

export function ouvrir({ dossier, modele, mode, reprise, compte, consigne }, emettre) {
  const entree = fileEntree();
  const permissions = new Map();
  let fenetre = null;
  let ferme = false;

  const canUseTool = (outil, saisie, o) =>
    new Promise((resoudre) => {
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
    ...optionsDeCompte(compte, consigne),
  };
  if (modele && modele !== 'default') options.model = modele;
  if (reprise) options.resume = reprise;

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
      emettre({ t: 'pret', sessionId: m.session_id, modele: m.model, mode: m.permissionMode, dossier: m.cwd });
    } else if (m.type === 'system' && m.subtype === 'status') {
      if (m.permissionMode) emettre({ t: 'etat', mode: m.permissionMode });
      if (m.status === 'compacting') emettre({ t: 'info', code: 'compactage' });
    } else if (m.type === 'system' && m.subtype === 'compact_boundary') {
      emettre({ t: 'info', code: 'compacte' });
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
      emettre(resultatVersEvenement(m));
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
  const liste = await listSessions({ dir: dossier, limit: 40, includeWorktrees: false });
  return liste.map((s) => ({
    id: s.sessionId,
    titre: (s.customTitle || s.summary || s.firstPrompt || '').slice(0, 120),
    modifieLe: s.lastModified,
  }));
}

export async function lireHistorique(dossier, sessionId) {
  const messages = await getSessionMessages(sessionId, { dir: dossier });
  return historiqueVersEvenements(messages).slice(-800);
}
