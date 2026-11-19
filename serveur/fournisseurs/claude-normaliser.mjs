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
      });
    } else if (b.type === 'text' && avecTexte && saisieReelle(b.text) && !m.isSynthetic && !m.isMeta) {
      evenements.push({ t: 'utilisateur', texte: b.text });
    }
  }
  return evenements;
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
  return {
    t: 'tour',
    ok: m.subtype === 'success' && !m.is_error,
    motif: m.subtype,
    message: m.subtype === 'success' ? null : (m.errors || []).join(' ; ') || m.subtype,
    dureeMs: m.duration_ms ?? null,
    appels: m.num_turns ?? null,
    coutSession: m.total_cost_usd ?? null,
    modeles,
  };
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
