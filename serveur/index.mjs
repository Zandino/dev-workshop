// Dev Workshop — serveur local. Écoute sur 127.0.0.1 uniquement : on y accède par une redirection de port SSH.
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { chargerJeton, hoteAutorise, origineAutorisee, EN_TETES_SECURITE } from './securite.mjs';
import { brancher } from './canal.mjs';
import { fermerTout } from './sessions.mjs';
import { annulerToutes } from './connexion.mjs';
import { purgerCorbeille } from './projets.mjs';
import { servirApercu } from './apercu.mjs';
import { servirMcp } from './mcp-http.mjs';
import { servirSkin } from './skins.mjs';
import { purgerSessions } from './corbeille-sessions.mjs';

// La corbeille garde un projet 30 jours : on la passe en revue au démarrage, puis toutes les 6 heures.
function revoirCorbeille() {
  const n = purgerCorbeille();
  if (n) console.log(`Corbeille : ${n} projet(s) effacé(s) définitivement après 30 jours.`);
  purgerSessions().then((s) => s && console.log(`Corbeille : ${s} session(s) effacée(s) définitivement après 30 jours.`), () => {});
}
revoirCorbeille();
setInterval(revoirCorbeille, 6 * 3600 * 1000).unref();

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(RACINE, 'public');
const HOTE = '127.0.0.1';
const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const jeton = chargerJeton();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

// Bibliothèques servies depuis node_modules, sans étape de construction.
const TIERS = {
  '/tiers/marked.js': 'node_modules/marked/lib/marked.esm.js',
  '/tiers/purify.js': 'node_modules/dompurify/dist/purify.es.mjs',
};

function fichierDemande(chemin) {
  if (TIERS[chemin]) return path.join(RACINE, TIERS[chemin]);
  const relatif = chemin === '/' ? 'index.html' : chemin.slice(1);
  const complet = path.normalize(path.join(PUBLIC, relatif));
  return complet.startsWith(PUBLIC + path.sep) ? complet : null;
}

const serveur = http.createServer((req, res) => {
  const repondre = (code, texte) => {
    res.writeHead(code, { ...EN_TETES_SECURITE, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(texte);
  };
  if (!hoteAutorise(req.headers.host)) return repondre(421, 'Hôte refusé');
  let chemin;
  try {
    chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return repondre(400, 'Adresse invalide');
  }
  if (servirMcp(chemin, req, res)) return; // outils des IA entre discussions (POST, jeton propre à chaque IA)
  if (req.method !== 'GET' && req.method !== 'HEAD') return repondre(405, 'Méthode refusée');
  if (servirApercu(chemin, req, res)) return;
  if (servirSkin(chemin, req, res)) return; // personnages en images de l'équipe en direct
  const fichier = fichierDemande(chemin);
  try {
    if (!fichier || !statSync(fichier).isFile()) throw new Error('absent');
  } catch {
    return repondre(404, 'Introuvable');
  }
  res.writeHead(200, { ...EN_TETES_SECURITE, 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(fichier).pipe(res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
serveur.on('upgrade', (req, socket, tete) => {
  const ok =
    req.url === '/ws' && hoteAutorise(req.headers.host) && origineAutorisee(req.headers.origin, req.headers.host);
  if (!ok) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, tete, (ws) => brancher(ws, jeton));
});

serveur.listen(PORT, HOTE, () => {
  console.log(`Dev Workshop à l'écoute sur http://${HOTE}:${PORT}`);
  if (process.stdout.isTTY) {
    // Le lien d'accès ne s'affiche que dans un terminal tenu par une personne, jamais dans un journal.
    console.log(`Lien d'accès (à garder pour toi) : http://localhost:${PORT}/#jeton=${jeton}`);
  } else {
    console.log('Jeton d’accès : fichier « jeton » du dossier des réglages (non affiché hors terminal).');
  }
});

function arreter() {
  fermerTout();
  annulerToutes();
  serveur.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
