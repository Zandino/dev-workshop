// Adresse locale /mcp : les outils « entre discussions » (outils-discussions.mjs) pour les IA qui ne tournent pas
// dans le serveur même (Codex, Gemini, Copilot, Qwen). Protocole MCP, transport HTTP « streamable » dans sa forme
// la plus simple : une requête JSON-RPC par POST, une réponse JSON, sans flux ni session côté serveur.
// Chaque IA a son propre jeton (en-tête Authorization) : il dit quelle discussion appelle. Une page web ne peut pas
// s'en servir (en-tête Origin refusé), et le serveur n'écoute que sur 127.0.0.1.
import { EN_TETES_SECURITE } from './securite.mjs';
import { contexteDe, outilsDe, descriptionMcp, appelerOutil, NOM_SERVEUR } from './outils-discussions.mjs';

const MAX_CORPS = 1024 * 1024;
const MAX_LOT = 10; // requêtes par lot : une IA n'a aucune raison d'en envoyer davantage d'un coup
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

async function traiter(ctx, m) {
  const p = m.params || {};
  switch (m.method) {
    case 'initialize':
      return {
        protocolVersion: VERSIONS.includes(p.protocolVersion) ? p.protocolVersion : VERSIONS[1],
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: NOM_SERVEUR, version: '1.0.0' },
      };
    case 'ping':
      return {};
    // Demandés d'office par certains outils (Codex 0.170) : nous n'avons que des outils.
    case 'resources/list':
      return { resources: [] };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'prompts/list':
      return { prompts: [] };
    case 'tools/list':
      return { tools: outilsDe(ctx).map(descriptionMcp) };
    case 'tools/call': {
      const r = await appelerOutil(ctx, String(p.name || ''), p.arguments);
      return { content: [{ type: 'text', text: r.erreur || r.texte }], isError: Boolean(r.erreur) };
    }
    default: {
      const e = new Error(`Méthode inconnue : ${String(m.method).slice(0, 60)}`);
      e.code = -32601;
      throw e;
    }
  }
}

/** Rend true si la requête était pour /mcp (et y a été répondu). */
export function servirMcp(chemin, req, res) {
  if (chemin !== '/mcp') return false;
  const fin = (code, corps) => {
    res.writeHead(code, { ...EN_TETES_SECURITE, 'Content-Type': 'application/json' });
    res.end(corps === undefined ? '' : JSON.stringify(corps));
  };
  if (req.headers.origin) return fin(403, { error: 'origine' }), true;
  const ctx = contexteDe(/^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '')?.[1]);
  if (!ctx) return fin(401, { error: 'jeton' }), true;
  if (req.method === 'DELETE') return fin(200), true;
  if (req.method !== 'POST') return fin(405, { error: 'methode' }), true; // pas de flux d'événements (GET)

  let taille = 0;
  const morceaux = [];
  req.on('data', (d) => {
    taille += d.length;
    if (taille > MAX_CORPS) req.destroy();
    else morceaux.push(d);
  });
  req.on('end', async () => {
    let lu;
    try {
      lu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
    } catch {
      return fin(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } });
    }
    const lot = Array.isArray(lu) ? lu : [lu];
    if (lot.length > MAX_LOT) return fin(400, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Lot trop grand' } });
    const reponses = [];
    for (const m of lot) {
      if (!m || typeof m !== 'object' || m.id === undefined || m.id === null) continue; // notification : rien à rendre
      try {
        reponses.push({ jsonrpc: '2.0', id: m.id, result: await traiter(ctx, m) });
      } catch (e) {
        reponses.push({ jsonrpc: '2.0', id: m.id, error: { code: e.code || -32603, message: String(e.message || e).slice(0, 300) } });
      }
    }
    if (!reponses.length) return fin(202);
    fin(200, Array.isArray(lu) ? reponses : reponses[0]);
  });
  return true;
}
