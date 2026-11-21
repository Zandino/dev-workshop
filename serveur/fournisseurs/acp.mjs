// Moteur commun des outils qui parlent ACP (Agent Client Protocol) : Gemini CLI, GitHub Copilot CLI, Qwen Code.
// Chaque outil n'a qu'une fiche (binaire, dossier du compte, modes, méthode de connexion) ; le reste est ici.
// Chaque action revient à l'écran pour accord, sauf ce que les règles du projet ou le mode choisi permettent.
import { randomUUID } from 'node:crypto';
import { lier } from './jsonrpc.mjs';
import { versAcp } from '../connecteurs.mjs';
import { decisionAuto } from '../regles-accord.mjs';
import { NOM_SERVEUR } from '../entre-discussions.mjs';

/**
 * Fiche d'un outil : { nom, binaire(), args(modele), env(compte), preparer?(compte), modes: {nos modes -> les
 * siens}, methodeAuth?: id de connexion à demander avant d'ouvrir une session, optionModele?: '-m',
 * sansConnexion?(compte): motif quand le compte n'a visiblement aucune connexion (l'outil n'est alors pas interrogé) }.
 */
const initialiser = (l) => l.demander('initialize', { protocolVersion: 1, clientCapabilities: {} });

/** Rend ce que l'outil déclare savoir faire (agentCapabilities). */
async function connecter(fiche, l) {
  const r = await initialiser(l);
  if (fiche.methodeAuth) await l.demander('authenticate', { methodId: fiche.methodeAuth }, 60000).catch(() => {});
  return r?.agentCapabilities || {};
}

/** Nos outils « entre discussions », si l'outil sait joindre un serveur MCP par HTTP (sinon il s'en passe). */
const serveurOutilsDw = (outilsDw, capacites) => (outilsDw && capacites.mcpCapabilities?.http
  ? [{ type: 'http', name: NOM_SERVEUR, url: outilsDw.url, headers: [{ name: 'Authorization', value: `Bearer ${outilsDw.jeton}` }] }]
  : []);

/** Connecté ou non : une session ne s'ouvre que si le compte l'est. Le motif de l'outil est transmis. */
export async function etatAcp(fiche, compte) {
  // Sans aucune connexion, certains outils attendent indéfiniment au lieu de refuser : on répond tout de suite.
  if (fiche.sansConnexion?.(compte)) return { connecte: false, adresse: null, organisation: null, abonnement: null, motif: null };
  fiche.preparer?.(compte);
  const l = lier(fiche.binaire(), fiche.args(null), { env: fiche.env(compte), cwd: compte.dossier });
  try {
    await connecter(fiche, l);
    await l.demander('session/new', { cwd: compte.dossier, mcpServers: [] }, 30000);
    return { connecte: true, adresse: null, organisation: null, abonnement: null };
  } catch (e) {
    return { connecte: false, adresse: null, organisation: null, abonnement: null, injoignable: e.message === 'delai', motif: e.message === 'delai' ? null : String(e.message).slice(0, 300) };
  } finally {
    l.fermer();
  }
}

const texteDe = (contenu) => (Array.isArray(contenu) ? contenu : [contenu]).map((c) => c?.content?.text ?? c?.text ?? '').filter(Boolean).join('\n');
/** Types d'action ACP ramenés aux noms d'outils habituels, pour les règles d'accord du projet. */
const OUTILS = { read: 'Read', search: 'Grep', edit: 'Edit', execute: 'Bash', fetch: 'WebFetch' };

export function ouvrirAcp(fiche, { compte, dossier, modele, mode, consigne, connecteurs, outilsDw }, emettre) {
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

  fiche.preparer?.(compte);
  const l = lier(fiche.binaire(), fiche.args(choisi), {
    env: fiche.env(compte),
    cwd: dossier,
    surDemande(methode, p) {
      if (methode !== 'session/request_permission') throw new Error('demande_non_geree');
      const option = (genre) => (p.options || []).find((o) => o.kind === genre)?.optionId;
      const genre = p.toolCall?.kind;
      const brut = p.toolCall?.rawInput || {};
      // Nos outils (titre de Gemini : « outil (devworkshop MCP Server) ») passent sans demande, comme pour Claude.
      // Titre exact seulement : un autre connecteur ne doit pas pouvoir s'en faire passer pour nous.
      if (outilsDw && (p.toolCall?.title || '').endsWith(` (${NOM_SERVEUR} MCP Server)`) && option('allow_once')) {
        return Promise.resolve({ outcome: { outcome: 'selected', optionId: option('allow_once') } });
      }
      const auto = genre === 'delete'
        ? decisionAuto(dossier, 'Bash', { command: 'rm ' + (brut.file_path || brut.path || '') })
        : decisionAuto(dossier, OUTILS[genre] || p.toolCall?.title || '', brut);
      const choix = auto === 'autoriser' ? option('allow_once') : auto === 'refuser' ? option('reject_once') : null;
      if (choix) return Promise.resolve({ outcome: { outcome: 'selected', optionId: choix } });
      return new Promise((resoudre) => {
        const id = randomUUID();
        accords.set(id, (decision) => {
          accords.delete(id);
          emettre({ t: 'permission_fin', id });
          const retenu = decision === 'refuser' ? option('reject_once') : decision === 'toujours' ? option('allow_always') || option('allow_once') : option('allow_once');
          resoudre(retenu ? { outcome: { outcome: 'selected', optionId: retenu } } : { outcome: { outcome: 'cancelled' } });
        });
        vider();
        emettre({ t: 'permission', id, outil: p.toolCall?.title || genre || fiche.nom, entree: brut, titre: p.toolCall?.title || null, description: texteDe(p.toolCall?.content || []) || null, toujours: Boolean(option('allow_always')) });
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
    const absente = fiche.sansConnexion?.(compte);
    if (absente) throw new Error(`Compte non connecté (${absente}) : connecte-le depuis le panneau « Comptes ».`);
    const capacites = await connecter(fiche, l);
    let r;
    try {
      r = await l.demander('session/new', { cwd: dossier, mcpServers: [...versAcp(connecteurs || []), ...serveurOutilsDw(outilsDw, capacites)] });
    } catch (e) {
      throw new Error(`Compte non connecté (${String(e?.message || e).slice(0, 160)}) : connecte-le depuis le panneau « Comptes ».`);
    }
    session = r.sessionId;
    modes = (r.modes?.availableModes || []).map((m) => m.id);
    const modeles = (r.models?.availableModels || []).map((m) => ({ id: m.modelId, nom: m.name || m.modelId }));
    if (modeles.length) emettre({ t: 'capacites', modeles, commandes: [] });
    const voulu = fiche.modes[mode] || 'default';
    const applique = voulu !== 'default' && modes.includes(voulu);
    if (applique) await l.demander('session/set_mode', { sessionId: session, modeId: voulu }).catch(() => {});
    emettre({ t: 'pret', sessionId: session, modele: choisi || r.models?.currentModelId || null, mode: applique ? mode : 'default', dossier });
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
      // Le protocole n'a pas de consigne de système : le rôle et le contexte ouvrent le premier message.
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
      const voulu = fiche.modes[m];
      if (!voulu || !modes.includes(voulu)) throw new Error('mode_refuse');
      await l.demander('session/set_mode', { sessionId: session, modeId: voulu }, 15000);
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
