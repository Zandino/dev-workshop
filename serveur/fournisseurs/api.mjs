// Fournisseur « API compatible OpenAI » : GPT, Gemini, Mistral, Ollama, LM Studio…
// Conversation seule : ce fournisseur ne lit ni ne modifie de fichiers et ne lance aucune commande.
// Jetons : uniquement ceux que l'API renvoie. Aucun prix ni taille de fenêtre n'est supposé.
import { cleDe } from '../comptes.mjs';

const MAX_REPONSE = 400_000;

function enTetes(compte) {
  const cle = cleDe(compte.id);
  return { 'Content-Type': 'application/json', ...(cle ? { Authorization: `Bearer ${cle}` } : {}) };
}

/** Message d'erreur court, sans rien qui vienne de la requête (donc sans clé). */
async function erreurHttp(reponse) {
  let detail = '';
  try {
    const corps = await reponse.json();
    detail = String(corps?.error?.message || corps?.error || '').slice(0, 200);
  } catch { /* corps illisible */ }
  return `HTTP ${reponse.status}${detail ? ' — ' + detail : ''}`;
}

/** Lit un flux d'événements « data: {...} » ligne par ligne. */
async function* lireFlux(corps) {
  const decodeur = new TextDecoder();
  let reste = '';
  for await (const morceau of corps) {
    reste += decodeur.decode(morceau, { stream: true });
    const lignes = reste.split('\n');
    reste = lignes.pop();
    for (const ligne of lignes) {
      const l = ligne.trim();
      if (!l.startsWith('data:')) continue;
      const donnees = l.slice(5).trim();
      if (donnees === '[DONE]') return;
      try {
        yield JSON.parse(donnees);
      } catch { /* fragment incomplet ou commentaire */ }
    }
  }
}

export function ouvrir({ compte, modele, consigne }, emettre) {
  const messages = consigne ? [{ role: 'system', content: consigne }] : [];
  const cumul = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 };
  let choisi = modele && modele !== 'default' ? modele : compte.modele;
  let annulation = null;
  let file = Promise.resolve();
  let ferme = false;

  emettre({ t: 'pret', sessionId: null, modele: choisi, mode: 'default', dossier: null });

  // La liste des modèles est demandée à l'API ; à défaut, on garde celui du compte.
  (async () => {
    let modeles = [{ id: compte.modele, nom: compte.modele }];
    try {
      const r = await fetch(`${compte.url}/models`, { headers: enTetes(compte), signal: AbortSignal.timeout(8000) });
      const liste = r.ok ? (await r.json())?.data : null;
      if (Array.isArray(liste) && liste.length) {
        const ids = [...new Set([compte.modele, ...liste.map((m) => String(m.id)).slice(0, 200)])];
        modeles = ids.map((id) => ({ id, nom: id }));
      }
    } catch { /* API sans liste de modèles */ }
    if (!ferme) emettre({ t: 'capacites', modeles, commandes: [] });
  })();

  async function tour(texte) {
    const debut = Date.now();
    messages.push({ role: 'user', content: texte });
    annulation = new AbortController();
    let reponse = '';
    let usage = null;
    let erreur = null;
    try {
      const r = await fetch(`${compte.url}/chat/completions`, {
        method: 'POST',
        headers: enTetes(compte),
        signal: annulation.signal,
        body: JSON.stringify({ model: choisi, messages, stream: true, stream_options: { include_usage: true } }),
      });
      if (!r.ok) throw new Error(await erreurHttp(r));
      for await (const e of lireFlux(r.body)) {
        if (e.usage) usage = e.usage;
        const d = e.choices?.[0]?.delta?.content;
        if (typeof d === 'string' && d) {
          reponse += d;
          emettre({ t: 'delta', genre: 'texte', texte: d });
          if (reponse.length > MAX_REPONSE) annulation.abort();
        }
      }
    } catch (e) {
      erreur = annulation.signal.aborted ? 'interrompu' : String(e?.message || e).slice(0, 300);
    }
    if (reponse) {
      messages.push({ role: 'assistant', content: reponse });
      emettre({ t: 'assistant', blocs: [{ type: 'texte', texte: reponse }], usage: null, modele: choisi, sousAgent: false });
    } else if (erreur) {
      messages.pop(); // la demande n'a pas eu de réponse : elle ne reste pas dans l'historique envoyé
    }
    cumul.entree += usage?.prompt_tokens || 0;
    cumul.sortie += usage?.completion_tokens || 0;
    cumul.cacheLu += usage?.prompt_tokens_details?.cached_tokens || 0;
    emettre({
      t: 'tour',
      ok: !erreur,
      motif: erreur ? 'erreur' : 'success',
      message: erreur,
      dureeMs: Date.now() - debut,
      appels: 1,
      coutSession: null,
      jetonsConnus: Boolean(usage),
      modeles: [{ modele: choisi, ...cumul, cout: null, fenetre: null }],
    });
    emettre({ t: 'etat', occupe: false });
  }

  return {
    envoyer(texte) {
      emettre({ t: 'utilisateur', texte });
      emettre({ t: 'etat', occupe: true });
      file = file.then(() => tour(texte));
    },
    async interrompre() {
      annulation?.abort();
    },
    async reglerModele(m) {
      choisi = m === 'default' ? compte.modele : String(m).slice(0, 120);
      emettre({ t: 'etat', modele: choisi });
    },
    async reglerMode() {
      throw new Error('mode_sans_objet');
    },
    repondrePermission: () => false,
    fermer() {
      ferme = true;
      annulation?.abort();
    },
  };
}
