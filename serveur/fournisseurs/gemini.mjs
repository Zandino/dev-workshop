// Fournisseur « Gemini » (Google, connexion par compte) : pilote `gemini --acp` (Agent Client Protocol).
// Noms des méthodes et des mises à jour relevés dans l'outil lui-même (gemini-cli 0.69.0).
// Chaque action revient à l'écran pour accord ; le mode « tout accepter » de l'outil n'est jamais proposé.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lier, binaire } from './jsonrpc.mjs';
import { reglesCommunes } from './regles.mjs';

export const envGemini = (compte) => ({ ...process.env, GEMINI_CLI_HOME: compte.dossier });

/** Gemini lit ses consignes générales dans <dossier du compte>/.gemini/GEMINI.md : on y range les règles communes. */
function poserRegles(compte) {
  const regles = reglesCommunes();
  if (!regles) return;
  const dossier = path.join(compte.dossier, '.gemini');
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(dossier, 'GEMINI.md'), regles + '\n', { mode: 0o600 });
}

const initialiser = (l) => l.demander('initialize', { protocolVersion: 1, clientCapabilities: {} });

/** Connecté ou non : une session ne s'ouvre que si le compte l'est. */
export async function etatCompte(compte) {
  const l = lier(binaire('gemini'), ['--acp'], { env: envGemini(compte), cwd: compte.dossier });
  try {
    await initialiser(l);
    await l.demander('session/new', { cwd: compte.dossier, mcpServers: [] }, 30000);
    return { connecte: true, adresse: null, organisation: null, abonnement: null };
  } catch (e) {
    return { connecte: false, adresse: null, organisation: null, abonnement: null, injoignable: e.message === 'delai' };
  } finally {
    l.fermer();
  }
}

const texteDe = (contenu) => (Array.isArray(contenu) ? contenu : [contenu]).map((c) => c?.content?.text ?? c?.text ?? '').filter(Boolean).join('\n');

export function ouvrir({ compte, dossier, modele, mode, consigne }, emettre) {
  const accords = new Map();
  let session = null;
  let ecrit = '';
  let pense = '';
  let premier = true;
  let ferme = false;
  let choisi = modele && modele !== 'default' ? modele : null;
  let modes = [];

  /** Le texte accumulé devient un message complet avant chaque outil et en fin de tour. */
  function vider() {
    const blocs = [];
    if (pense.trim()) blocs.push({ type: 'reflexion', texte: pense });
    if (ecrit.trim()) blocs.push({ type: 'texte', texte: ecrit });
    pense = '';
    ecrit = '';
    if (blocs.length) emettre({ t: 'assistant', blocs, usage: null, modele: choisi, sousAgent: false });
  }

  poserRegles(compte);
  const l = lier(binaire('gemini'), ['--acp', ...(choisi ? ['-m', choisi] : [])], {
    env: envGemini(compte),
    cwd: dossier,
    surDemande(methode, p) {
      if (methode !== 'session/request_permission') throw new Error('demande_non_geree');
      return new Promise((resoudre) => {
        const id = randomUUID();
        const option = (genre) => (p.options || []).find((o) => o.kind === genre)?.optionId;
        accords.set(id, (decision) => {
          accords.delete(id);
          emettre({ t: 'permission_fin', id });
          const choix = decision === 'refuser' ? option('reject_once') : decision === 'toujours' ? option('allow_always') || option('allow_once') : option('allow_once');
          resoudre(choix ? { outcome: { outcome: 'selected', optionId: choix } } : { outcome: { outcome: 'cancelled' } });
        });
        vider();
        emettre({
          t: 'permission',
          id,
          outil: p.toolCall?.title || p.toolCall?.kind || 'Gemini',
          entree: p.toolCall?.rawInput || {},
          titre: p.toolCall?.title || null,
          description: texteDe(p.toolCall?.content || []) || null,
          toujours: Boolean(option('allow_always')),
        });
      });
    },
    surNotification(methode, p) {
      if (methode !== 'session/update') return;
      const u = p.update || {};
      if (u.sessionUpdate === 'agent_message_chunk') {
        const texte = u.content?.text || '';
        ecrit += texte;
        if (texte) emettre({ t: 'delta', genre: 'texte', texte });
      } else if (u.sessionUpdate === 'agent_thought_chunk') {
        const texte = u.content?.text || '';
        pense += texte;
        if (texte) emettre({ t: 'delta', genre: 'reflexion', texte });
      } else if (u.sessionUpdate === 'tool_call') {
        vider();
        emettre({ t: 'assistant', blocs: [{ type: 'outil', id: u.toolCallId, nom: u.title || u.kind || 'outil', entree: u.rawInput || {} }], usage: null, modele: choisi, sousAgent: false });
      } else if (u.sessionUpdate === 'tool_call_update' && ['completed', 'failed'].includes(u.status)) {
        emettre({ t: 'resultat_outil', id: u.toolCallId, contenu: texteDe(u.content || []).slice(0, 20000), erreur: u.status === 'failed' });
      } else if (u.sessionUpdate === 'usage_update' && typeof u.used === 'number' && typeof u.size === 'number' && u.size > 0) {
        emettre({ t: 'contexte', utilises: u.used, max: u.size, pourcent: (u.used / u.size) * 100 });
      }
    },
    surFin() {
      for (const repondre of [...accords.values()]) repondre('refuser');
      if (!ferme) emettre({ t: 'etat', occupe: false, ferme: true });
    },
  });

  const demarre = (async () => {
    await initialiser(l);
    let r;
    try {
      r = await l.demander('session/new', { cwd: dossier, mcpServers: [] });
    } catch {
      throw new Error('Compte non connecté : connecte-le depuis le panneau « Comptes ».');
    }
    session = r.sessionId;
    modes = (r.modes?.availableModes || []).map((m) => m.id);
    const modeles = (r.models?.availableModels || []).map((m) => ({ id: m.modelId, nom: m.name || m.modelId }));
    if (modeles.length) emettre({ t: 'capacites', modeles, commandes: [] });
    if (mode === 'plan' && modes.includes('plan')) await l.demander('session/set_mode', { sessionId: session, modeId: 'plan' }).catch(() => {});
    emettre({ t: 'pret', sessionId: session, modele: choisi || r.models?.currentModelId || null, mode: mode === 'plan' && modes.includes('plan') ? 'plan' : 'default', dossier });
  })();
  const echec = (e) => {
    emettre({ t: 'tour', ok: false, motif: 'erreur', message: String(e?.message || e).slice(0, 300), dureeMs: null, appels: null, coutSession: null, modeles: [] });
    emettre({ t: 'etat', occupe: false });
  };
  // L'échec du démarrage est rapporté à chaque envoi (voir `envoyer`) : ici, on évite seulement un rejet non géré.
  demarre.catch(() => {});

  return {
    envoyer(texte) {
      emettre({ t: 'utilisateur', texte });
      emettre({ t: 'etat', occupe: true });
      const debut = Date.now();
      // Le protocole n'a pas de consigne de système : le rôle (discussion à plusieurs) ouvre le premier message.
      const envoi = premier && consigne ? `${consigne}\n\n${texte}` : texte;
      premier = false;
      demarre
        .then(() => l.demander('session/prompt', { sessionId: session, prompt: [{ type: 'text', text: envoi }] }, 0))
        .then((r) => {
          vider();
          const ok = r?.stopReason === 'end_turn';
          emettre({ t: 'tour', ok, motif: r?.stopReason || 'inconnu', message: ok ? null : r?.stopReason || null, dureeMs: Date.now() - debut, appels: null, coutSession: null, modeles: [] });
          emettre({ t: 'etat', occupe: false });
        })
        .catch((e) => !ferme && echec(e));
    },
    async interrompre() {
      if (session) l.notifier('session/cancel', { sessionId: session });
    },
    async reglerModele(m) {
      await l.demander('session/set_model', { sessionId: session, modelId: m }, 15000);
      choisi = m;
      emettre({ t: 'etat', modele: m });
    },
    async reglerMode(m) {
      if (!['default', 'plan'].includes(m) || !modes.includes(m)) throw new Error('mode_refuse');
      await l.demander('session/set_mode', { sessionId: session, modeId: m }, 15000);
      emettre({ t: 'etat', mode: m });
    },
    repondrePermission(id, { decision }) {
      const repondre = accords.get(id);
      if (!repondre) return false;
      repondre(decision);
      return true;
    },
    fermer() {
      ferme = true;
      l.fermer();
    },
  };
}
