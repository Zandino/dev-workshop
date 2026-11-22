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
  // Copier dans le presse-papiers (bouton « Copier »), notifications (discussion finie, accord attendu) et le micro
  // pour la dictée (🎤, le son seul) ; tout le reste (caméra, écran, position…) est refusé.
  const permis = new Set(['clipboard-sanitized-write', 'notifications']);
  const micro = (types) => Array.isArray(types) && types.length > 0 && types.every((t) => t === 'audio');
  s.setPermissionRequestHandler((_wc, permission, repondre, details) => {
    repondre(permis.has(permission) || (permission === 'media' && micro(details?.mediaTypes)));
  });
  s.setPermissionCheckHandler((_wc, permission, _origine, details) => permis.has(permission) || (permission === 'media' && details?.mediaType === 'audio'));
  return s;
}

/** La seule nouvelle fenêtre permise : l'équipe en direct détachée (/equipe.html), sur le même serveur. */
function estFenetreEquipe(url, origine) {
  try {
    const u = new URL(url);
    return u.origin === origine && u.pathname === '/equipe.html';
  } catch {
    return false;
  }
}

/** Les garde-fous d'une page du serveur : ni fenêtre, ni navigation ailleurs, ni webview. */
function proteger(contenu, origine) {
  contenu.setWindowOpenHandler(({ url }) => {
    ouvrirDehors(url);
    return { action: 'deny' };
  });
  contenu.on('will-navigate', (e, url) => {
    if (new URL(url).origin === origine) return;
    e.preventDefault();
    ouvrirDehors(url);
  });
  contenu.on('will-attach-webview', (e) => e.preventDefault());
}

function creerAtelier(serveur, titre) {
  const origine = `http://localhost:${serveur.portLocal}`;
  const sessionServeur = sessionDuServeur(serveur.id);
  const preferences = { session: sessionServeur, contextIsolation: true, sandbox: true, nodeIntegration: false };
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
    webPreferences: { ...preferences, spellcheck: true },
  });
  // La page change son titre (« Dev Workshop ») : on garde le nom du serveur dans la barre de titre. Elle y
  // annonce aussi les discussions qui attendent ton accord : main levée sur l'icône (main-levee.js).
  const besoins = suivreBesoins(fenetre, titre);
  fenetre.on('page-title-updated', (e, titrePage) => {
    e.preventDefault();
    besoins(titrePage);
  });
  proteger(fenetre.webContents, origine);
  // Sauf l'équipe détachée : sa propre fenêtre (à poser sur un autre écran), même session (donc même jeton), mêmes
  // garde-fous. La page la ferme elle-même quand la fenêtre principale se ferme.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (estFenetreEquipe(url, origine)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1180, height: 780, minWidth: 420, minHeight: 360, backgroundColor: '#15171d', icon: ICONE, autoHideMenuBar: true, webPreferences: preferences,
        },
      };
    }
    ouvrirDehors(url);
    return { action: 'deny' };
  });
  fenetre.webContents.on('did-create-window', (enfant) => proteger(enfant.webContents, origine));
  fenetre.on('closed', () => {
    for (const autre of BrowserWindow.getAllWindows()) {
      if (autre.webContents.getURL().startsWith(`${origine}/equipe.html`)) autre.close();
    }
  });
  fenetre.once('ready-to-show', () => fenetre.show());
  return { fenetre, origine };
}

module.exports = { creerAccueil, creerAtelier, ouvrirDehors };
