// Traduit les messages du SDK Claude vers les événements communs de l'devworkshop.
const MAX_SORTIE = 20000;

function couper(texte) {
  const t = String(texte ?? '');
  return t.length > MAX_SORTIE ? t.slice(0, MAX_SORTIE) + `\n… (${t.length - MAX_SORTIE} caractères masqués)` : t;
}

/** Contenu d'un résultat d'outil (texte ou blocs) ramené à du texte. */
export function texteDeResultat(contenu) {
  if (typeof contenu === 'string') return couper(contenu);
  if (!Array.isArray(contenu)) return '';
  return couper(
    contenu
      .map((b) => (b.type === 'text' ? b.text : b.type === 'image' ? '[image]' : `[${b.type}]`))
      .join('\n'),
  );
}

/** Taille au-delà de laquelle une capture d'écran ne part pas à l'écran (base64). */
export const MAX_IMAGE = 3 * 1024 * 1024;

/** Première image d'un résultat d'outil (capture du navigateur…), pour le bureau en direct ; null sinon. */
export function imageDeResultat(contenu) {
  if (!Array.isArray(contenu)) return null;
  const b = contenu.find((x) => x?.type === 'image' && x.source?.type === 'base64' && typeof x.source.data === 'string');
  if (!b || b.source.data.length > MAX_IMAGE || !/^image\/(png|jpeg|gif|webp)$/.test(b.source.media_type || '')) return null;
  return { type: b.source.media_type, donnees: b.source.data };
}

/** Jetons d'un appel au modèle. */
export function usageNormalise(u) {
  if (!u) return null;
  return {
    entree: u.input_tokens || 0,
    sortie: u.output_tokens || 0,
    cacheLu: u.cache_read_input_tokens || 0,
    cacheEcrit: u.cache_creation_input_tokens || 0,
  };
}

/** Message de l'assistant -> un événement « assistant ». */
export function assistantVersEvenement(m) {
  const blocs = [];
  for (const b of m.message?.content || []) {
    if (b.type === 'text' && b.text) blocs.push({ type: 'texte', texte: b.text });
    else if (b.type === 'thinking' && b.thinking) blocs.push({ type: 'reflexion', texte: b.thinking });
    else if (b.type === 'tool_use') blocs.push({ type: 'outil', id: b.id, nom: b.name, entree: b.input || {} });
  }
  return {
    t: 'assistant',
    blocs,
    usage: usageNormalise(m.message?.usage),
    modele: m.message?.model || null,
    sousAgent: Boolean(m.parent_tool_use_id),
    parent: m.parent_tool_use_id || null, // l'appel qui a lancé le sous-agent (équipe en direct)
  };
}

/** Notes que Claude Code range dans l'historique à la place de l'utilisateur (arrêt demandé, etc.). */
const NOTE_INTERNE = /^\[Request interrupted by user/;
const saisieReelle = (texte) => Boolean(texte?.trim()) && !NOTE_INTERNE.test(texte.trim());

/** Message « user » du SDK -> événements (texte saisi et résultats d'outils). */
export function utilisateurVersEvenements(m, { avecTexte }) {
  const evenements = [];
  const contenu = m.message?.content;
  if (typeof contenu === 'string') {
    if (avecTexte && saisieReelle(contenu)) evenements.push({ t: 'utilisateur', texte: contenu });
    return evenements;
  }
  for (const b of contenu || []) {
    if (b.type === 'tool_result') {
      evenements.push({
        t: 'resultat_outil',
        id: b.tool_use_id,
        contenu: texteDeResultat(b.content),
        erreur: Boolean(b.is_error),
        parent: m.parent_tool_use_id || null,
        ...(imageDeResultat(b.content) ? { image: imageDeResultat(b.content) } : {}),
      });
    } else if (b.type === 'text' && avecTexte && saisieReelle(b.text) && !m.isSynthetic && !m.isMeta) {
      evenements.push({ t: 'utilisateur', texte: b.text });
    }
  }
  return evenements;
}

/** Le message d'erreur parle-t-il d'une limite d'utilisation (abonnement, quota, débit) ? Tous fournisseurs. */
export function estLimite(texte) {
  return /hit your .{0,20}limit|usage limit|rate limit|weekly limit|daily limit|quota|limit (reached|exceeded)|too many requests|resource.?exhausted|insufficient.?(quota|credit)|credit balance|\b429\b/i.test(String(texte || ''));
}

/** Fin de tour : consommation et coût tels que renvoyés par le SDK, sans recalcul de prix. */
export function resultatVersEvenement(m) {
  const modeles = Object.entries(m.modelUsage || {}).map(([nom, u]) => ({
    modele: nom,
    entree: u.inputTokens || 0,
    sortie: u.outputTokens || 0,
    cacheLu: u.cacheReadInputTokens || 0,
    cacheEcrit: u.cacheCreationInputTokens || 0,
    cout: u.costUSD ?? null,
    fenetre: u.contextWindow || null,
  }));
  const ok = m.subtype === 'success' && !m.is_error;
  // Limite d'abonnement atteinte : l'outil finit le tour en « success » avec is_error, le vrai motif est dans
  // `result` (« You've hit your weekly limit… »). On le montre tel quel, et on le signale comme limite.
  const texte = ok ? null : (m.errors || []).join(' ; ') || (m.is_error && typeof m.result === 'string' ? m.result : '') || m.subtype;
  return {
    t: 'tour',
    ok,
    motif: ok ? m.subtype : estLimite(texte) ? 'limite' : m.subtype === 'success' ? 'erreur' : m.subtype,
    limite: !ok && estLimite(texte),
    message: texte ? String(texte).slice(0, 500) : null,
    dureeMs: m.duration_ms ?? null,
    appels: m.num_turns ?? null,
    coutSession: m.total_cost_usd ?? null,
    modeles,
  };
}

/**
 * Sous-agents suivis par les messages « task_* » du SDK. Indispensable pour ceux lancés en arrière-plan : l'appel de
 * l'outil Agent rend aussitôt « lancé », et la suite n'arrive que par ces messages (vu le 22/11/2026 : un sous-agent
 * de relecture marqué fini dès son lancement dans l'équipe en direct). `suivies` : Map propre à la session
 * (task_id -> { id, description, enFond, outil, resume, le }). Rend l'événement « tache » à émettre, ou null.
 * Seuls les sous-agents comptent (pas les commandes lancées en arrière-plan, ni les tâches « ambiantes »).
 */
export function tacheVersEvenement(m, suivies, maintenant = Date.now()) {
  if (m?.type !== 'system') return null;
  if (m.subtype === 'task_started') {
    const sousAgent = m.task_type ? m.task_type === 'local_agent' : Boolean(m.subagent_type);
    if (!sousAgent || m.ambient || m.skip_transcript || !m.tool_use_id) return null;
    const x = { id: m.tool_use_id, description: String(m.description || '').slice(0, 300), enFond: Boolean(m.is_backgrounded), outil: null, resume: null, le: 0 };
    suivies.set(m.task_id, x);
    return { t: 'tache', etape: 'debut', id: x.id, enFond: x.enFond, description: x.description, type: m.subagent_type || null };
  }
  const x = suivies.get(m.task_id);
  if (!x) return null;
  if (m.subtype === 'task_updated') {
    if (!m.patch?.is_backgrounded || x.enFond) return null;
    x.enFond = true; // passé en arrière-plan en cours de route
    return { t: 'tache', etape: 'debut', id: x.id, enFond: true, description: x.description };
  }
  if (m.subtype === 'task_progress') {
    const outil = m.last_tool_name || null;
    const resume = m.summary ? String(m.summary).slice(0, 300) : null;
    // Le journal de la discussion est borné : un événement quand l'outil ou le résumé change, sinon toutes les 15 s.
    if (outil === x.outil && resume === x.resume && maintenant - x.le < 15_000) return null;
    Object.assign(x, { outil, resume, le: maintenant });
    return { t: 'tache', etape: 'progres', id: x.id, outil, resume, jetons: m.usage?.total_tokens ?? null, outils: m.usage?.tool_uses ?? null };
  }
  if (m.subtype === 'task_notification') {
    suivies.delete(m.task_id);
    return { t: 'tache', etape: 'fin', id: x.id, enFond: x.enFond, statut: m.status, description: x.description, resume: String(m.summary || '').slice(0, 4000), jetons: m.usage?.total_tokens ?? null };
  }
  return null;
}

/** Limites de l'abonnement, quand le SDK les signale. */
export function limiteVersEvenement(m) {
  const i = m.rate_limit_info || {};
  return {
    t: 'limite',
    statut: i.status || null,
    type: i.rateLimitType || null,
    utilisation: typeof i.utilization === 'number' ? i.utilization : null,
    retablieLe: i.resetsAt || null,
  };
}

/** Historique d'une session enregistrée -> liste d'événements rejouables par l'écran. */
export function historiqueVersEvenements(messages) {
  const evenements = [];
  for (const m of messages) {
    if (m.type === 'assistant') {
      const e = assistantVersEvenement(m);
      if (e.blocs.length) evenements.push({ ...e, usage: null });
    } else if (m.type === 'user') {
      evenements.push(...utilisateurVersEvenements(m, { avecTexte: !m.parent_tool_use_id }));
    }
  }
  return evenements;
}
