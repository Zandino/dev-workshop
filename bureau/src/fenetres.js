// Fenêtres du logiciel : l'accueil (liste des serveurs, page locale) et un atelier par serveur (page du serveur).
// La page du serveur n'a aucun accès au poste : ni Node, ni pont, ni nouvelle fenêtre, ni navigation ailleurs.
const { BrowserWindow, nativeTheme, shell, session } = require('electron');
const path = require('node:path');
const { suivreBesoins } = require('./main-levee');

const RACINE = path.join(__dirname, '..');
const ICONE = path.join(RACINE, 'ressources', 'icone.png');
const fond = () => (nativeTheme.shouldUseDarkColors ? '#111114' : '#f7f7f9');

/** Seuls les liens https sortent, et vers le navigateur de la personne. */
function ouvrirDehors(url) {
  try {
    if (new URL(url).protocol === 'https:') shell.openExternal(url);
  } catch { /* lien invalide : ignoré */ }
}

function creerAccueil() {
  const fenetre = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: fond(),
    icon: ICONE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'pont.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    ouvrirDehors(url);
    return { action: 'deny' };
  });
  fenetre.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    ouvrirDehors(url);
  });
  fenetre.once('ready-to-show', () => fenetre.show());
  fenetre.loadFile(path.join(RACINE, 'accueil', 'index.html'));
  return fenetre;
}

/**
 * Une session par serveur, en mémoire seulement : la page range le jeton dans son stockage local, qui disparaît
 * donc à la fermeture du logiciel au lieu d'être écrit sur le disque. Les serveurs ne se mélangent pas entre eux.
 */
function sessionDuServeur(id) {
  const s = session.fromPartition(`serveur-${id}`);
  // Copier dans le presse-papiers (bouton « Copier ») et notifications (session finie, accord attendu) ;
  // tout le reste (micro, caméra, position…) est refusé.
  const permis = new Set(['clipboard-sanitized-write', 'notifications']);
  s.setPermissionRequestHandler((_wc, permission, repondre) => repondre(permis.has(permission)));
  s.setPermissionCheckHandler((_wc, permission) => permis.has(permission));
  return s;
}

function creerAtelier(serveur, titre) {
  const origine = `http://localhost:${serveur.portLocal}`;
  const fenetre = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 820,
    minHeight: 560,
    show: false,
    title: titre,
    backgroundColor: fond(),
    icon: ICONE,
    autoHideMenuBar: true,
    webPreferences: {
      session: sessionDuServeur(serveur.id),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  // La page change son titre (« Dev Workshop ») : on garde le nom du serveur dans la barre de titre. Elle y
  // annonce aussi les discussions qui attendent ton accord : main levée sur l'icône (main-levee.js).
  const besoins = suivreBesoins(fenetre, titre);
  fenetre.on('page-title-updated', (e, titrePage) => {
    e.preventDefault();
    besoins(titrePage);
  });
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    ouvrirDehors(url);
    return { action: 'deny' };
  });
  fenetre.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin === origine) return;
    e.preventDefault();
    ouvrirDehors(url);
  });
  fenetre.webContents.on('will-attach-webview', (e) => e.preventDefault());
  fenetre.once('ready-to-show', () => fenetre.show());
  return { fenetre, origine };
}

module.exports = { creerAccueil, creerAtelier, ouvrirDehors };
