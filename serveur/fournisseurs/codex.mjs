// Fournisseur « Codex » (OpenAI, connexion par compte ChatGPT) : pilote `codex app-server`.
// Formes des messages : schéma du protocole généré par l'outil lui-même (codex 0.170.0).
// Chaque commande ou modification de fichier revient à l'écran pour accord ; aucun mode sans garde-fou.
import { randomUUID } from 'node:crypto';
import { lier, binaire } from './jsonrpc.mjs';
import { consigneComplete } from './regles.mjs';

const env = (compte) => ({ ...process.env, CODEX_HOME: compte.dossier });

function lancer(compte, crochets) {
  const l = lier(binaire('codex'), ['app-server'], { env: env(compte), ...crochets });
  const pret = l.demander('initialize', { clientInfo: { name: 'dev-workshop', title: 'Dev Workshop', version: '0.3.0' } }).then(() => l.notifier('initialized'));
  return { l, pret };
}

/** Connecté ou non, d'après l'outil lui-même (aucun fichier d'identifiants n'est lu). */
export async function etatCompte(compte) {
  const { l, pret } = lancer(compte, {});
  try {
    await pret;
    const r = await l.demander('account/read', {}, 20000);
    const a = r?.account;
    return { connecte: Boolean(a), adresse: a?.email || null, organisation: a?.workspaceName || null, abonnement: a?.planType || a?.type || null };
  } catch {
    return { connecte: false, adresse: null, organisation: null, abonnement: null, injoignable: true };
  } finally {
    l.fermer();
  }
}

/** Élément du fil de Codex -> bloc « outil » de l'devworkshop. */
function outilDe(item) {
  if (item.type === 'commandExecution') return { id: item.id, nom: 'Bash', entree: { command: item.command, cwd: item.cwd } };
  if (item.type === 'fileChange') {
    const changements = item.changes || [];
    return { id: item.id, nom: 'Patch', entree: { file_path: changements.map((c) => c.path).join(', '), diff: changements.map((c) => `# ${c.path}\n${c.diff || ''}`).join('\n') } };
  }
  if (item.type === 'mcpToolCall') return { id: item.id, nom: `${item.server}:${item.tool}`, entree: item.arguments || {} };
  if (item.type === 'webSearch') return { id: item.id, nom: 'WebSearch', entree: { query: item.query } };
  return null;
}

function resultatDe(item) {
  if (item.type === 'commandExecution') {
    return { contenu: String(item.aggregatedOutput || '').slice(0, 20000), erreur: item.status !== 'completed' || (item.exitCode ?? 0) !== 0 };
  }
  if (item.type === 'fileChange') return { contenu: item.status || '', erreur: item.status === 'failed' || item.status === 'declined' };
  if (item.type === 'mcpToolCall') return { contenu: item.error ? String(item.error.message || item.error) : JSON.stringify(item.result ?? '').slice(0, 20000), erreur: Boolean(item.error) };
  return { contenu: '', erreur: false };
}

export function ouvrir({ compte, dossier, modele, mode, consigne }, emettre) {
  const accords = new Map();
  const elements = new Map();
  let fil = null;
  let tour = null;
  let choisi = modele && modele !== 'default' ? modele : null;
  let usage = null;
  let ferme = false;

  const { l, pret } = lancer(compte, {
    surDemande(methode, p) {
      const commande = methode === 'item/commandExecution/requestApproval';
      if (!commande && methode !== 'item/fileChange/requestApproval') throw new Error('demande_non_geree');
      return new Promise((resoudre) => {
        const id = randomUUID();
        const connu = elements.get(p.itemId);
        accords.set(id, (decision) => {
          accords.delete(id);
          emettre({ t: 'permission_fin', id });
          resoudre({ decision });
        });
        emettre({
          t: 'permission',
          id,
          outil: commande ? 'Bash' : 'Patch',
          entree: commande ? { command: p.command || connu?.entree.command, cwd: p.cwd } : connu?.entree || {},
          titre: null,
          description: p.reason || null,
          toujours: true,
        });
      });
    },
    surNotification(methode, p) {
      if (methode === 'item/agentMessage/delta') emettre({ t: 'delta', genre: 'texte', texte: p.delta });
      else if (methode === 'item/started') {
        const o = outilDe(p.item);
        if (!o) return;
        elements.set(o.id, o);
        emettre({ t: 'assistant', blocs: [{ type: 'outil', ...o }], usage: null, modele: choisi, sousAgent: false });
      } else if (methode === 'item/completed') {
        const i = p.item;
        if (i.type === 'agentMessage' && i.text) emettre({ t: 'assistant', blocs: [{ type: 'texte', texte: i.text }], usage: null, modele: choisi, sousAgent: false });
        else if (i.type === 'reasoning') {
          const texte = [...(i.summary || []), ...(i.content || [])].map((x) => (typeof x === 'string' ? x : x?.text || '')).join('\n').trim();
          if (texte) emettre({ t: 'assistant', blocs: [{ type: 'reflexion', texte }], usage: null, modele: choisi, sousAgent: false });
        } else if (elements.has(i.id)) emettre({ t: 'resultat_outil', id: i.id, ...resultatDe(i) });
      } else if (methode === 'thread/tokenUsage/updated') {
        usage = p.tokenUsage;
        const max = usage.modelContextWindow;
        if (max) emettre({ t: 'contexte', utilises: usage.last.totalTokens, max, pourcent: (usage.last.totalTokens / max) * 100 });
      } else if (methode === 'turn/completed') {
        const t = usage?.total;
        tour = null;
        emettre({
          t: 'tour',
          ok: p.turn.status === 'completed',
          motif: p.turn.status,
          message: p.turn.error?.message || (p.turn.status === 'completed' ? null : p.turn.status),
          dureeMs: p.turn.durationMs ?? null,
          appels: null,
          coutSession: null,
          // Chez OpenAI, les jetons d'entrée comptent ceux lus en cache : on les sépare.
          modeles: t ? [{ modele: choisi || '', entree: Math.max(0, t.inputTokens - t.cachedInputTokens), sortie: t.outputTokens, cacheLu: t.cachedInputTokens, cacheEcrit: t.cacheWriteInputTokens || 0, cout: null, fenetre: usage.modelContextWindow || null }] : [],
        });
        emettre({ t: 'etat', occupe: false });
      } else if (methode === 'error' && !p.willRetry) emettre({ t: 'erreur', code: 'fournisseur', message: String(p.error?.message || '').slice(0, 300) });
    },
    surFin() {
      for (const repondre of [...accords.values()]) repondre('cancel');
      if (!ferme) emettre({ t: 'etat', occupe: false, ferme: true });
    },
  });

  const demarre = (async () => {
    await pret;
    const compteLu = await l.demander('account/read', {});
    if (!compteLu?.account) throw new Error('Compte non connecté : connecte-le depuis le panneau « Comptes ».');
    try {
      const liste = await l.demander('model/list', {});
      const modeles = (liste?.data || []).filter((m) => !m.hidden).map((m) => ({ id: m.model || m.id, nom: m.displayName || m.model }));
      if (modeles.length) emettre({ t: 'capacites', modeles: [{ id: 'default', nom: '' }, ...modeles], commandes: [] });
    } catch { /* liste indisponible : le modèle par défaut du compte sert */ }
    const r = await l.demander('thread/start', {
      cwd: dossier,
      approvalPolicy: 'untrusted',
      sandbox: mode === 'plan' ? 'read-only' : 'workspace-write',
      developerInstructions: consigneComplete(consigne) || null,
      ...(choisi ? { model: choisi } : {}),
    });
    fil = r.thread.id;
    choisi = choisi || r.model;
    emettre({ t: 'pret', sessionId: fil, modele: choisi, mode: mode === 'plan' ? 'plan' : 'default', dossier });
  })();
  // L'échec du démarrage est rapporté à chaque envoi (voir `envoyer`) : ici, on évite seulement un rejet non géré.
  demarre.catch(() => {});

  return {
    envoyer(texte) {
      emettre({ t: 'utilisateur', texte });
      emettre({ t: 'etat', occupe: true });
      demarre
        .then(() => l.demander('turn/start', { threadId: fil, input: [{ type: 'text', text: texte }], ...(choisi ? { model: choisi } : {}) }, 0))
        .then((r) => (tour = r?.turn?.id || null))
        .catch((e) => {
          if (ferme) return;
          emettre({ t: 'tour', ok: false, motif: 'erreur', message: String(e?.message || e).slice(0, 300), dureeMs: null, appels: null, coutSession: null, modeles: [] });
          emettre({ t: 'etat', occupe: false });
        });
    },
    async interrompre() {
      if (fil && tour) await l.demander('turn/interrupt', { threadId: fil, turnId: tour }, 10000).catch(() => {});
    },
    async reglerModele(m) {
      choisi = m === 'default' ? null : String(m).slice(0, 120);
      emettre({ t: 'etat', modele: choisi || 'default' });
    },
    async reglerMode() {
      throw new Error('mode_sans_objet'); // le mode de Codex se choisit à l'ouverture de la session
    },
    repondrePermission(id, { decision }) {
      const repondre = accords.get(id);
      if (!repondre) return false;
      repondre(decision === 'refuser' ? 'decline' : decision === 'toujours' ? 'acceptForSession' : 'accept');
      return true;
    },
    fermer() {
      ferme = true;
      l.fermer();
    },
  };
}
