// Aperçu d'un serveur de développement (Vite, Next, Django…) qui tourne sur le serveur : un tunnel SSH vers
// son port, et une fenêtre qui l'affiche. La page n'a aucun accès au poste ; le tunnel se ferme avec la fenêtre.
const { BrowserWindow, ipcMain, session } = require('electron');
const net = require('node:net');
const path = require('node:path');
const { ouvrirTunnel } = require('./ssh');
const { ouvrirDehors } = require('./fenetres');

const RACINE = path.join(__dirname, '..');

/** Un port libre sur le poste, choisi par le système. */
function portLibre() {
  return new Promise((ok, ko) => {
    const srv = net.createServer();
    srv.once('error', ko);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

async function ouvrirApercu(serveur, portDistant, titre) {
  const local = await portLibre();
  const tunnel = await ouvrirTunnel({ ...serveur, port: portDistant, portLocal: local }, () => {});
  const s = session.fromPartition(`apercu-${serveur.id}-${portDistant}`);
  s.setPermissionRequestHandler((_wc, _p, repondre) => repondre(false));
  const fenetre = new BrowserWindow({
    width: 1280, height: 860, title: `${titre} · port ${portDistant}`, autoHideMenuBar: true,
    webPreferences: { session: s, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    ouvrirDehors(url);
    return { action: 'deny' };
  });
  fenetre.on('closed', () => tunnel.arreter());
  await fenetre.loadURL(`http://localhost:${local}/`).catch(() => {}); // une page d'erreur s'affiche si rien n'écoute
}

/**
 * Demande le port à la personne (petite fenêtre), puis ouvre l'aperçu. `serveur` : celui de l'atelier au premier
 * plan ; `textes` : libellés de la petite fenêtre.
 */
function demanderPort(serveur, textes) {
  const fenetre = new BrowserWindow({
    width: 420, height: 250, resizable: false, minimizable: false, autoHideMenuBar: true, title: textes.port_titre,
    webPreferences: { preload: path.join(__dirname, 'pont-port.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  const canal = `apercu-port-${fenetre.id}`;
  ipcMain.handleOnce(canal, async (evenement, port) => {
    if (evenement.sender !== fenetre.webContents) return { ok: false };
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return { ok: false, erreur: textes.port_invalide };
    try {
      await ouvrirApercu(serveur, n, serveur.nom);
      fenetre.close();
      return { ok: true };
    } catch (e) {
      return { ok: false, erreur: `${textes.port_echec} (${e.cle || e.message})` };
    }
  });
  fenetre.on('closed', () => ipcMain.removeHandler(canal));
  fenetre.loadFile(path.join(RACINE, 'accueil', 'port.html'), { query: { canal, textes: JSON.stringify(textes) } });
}

module.exports = { demanderPort, ouvrirApercu };
