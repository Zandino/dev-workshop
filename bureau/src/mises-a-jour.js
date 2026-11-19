// Mises à jour automatiques, depuis les versions publiées sur GitHub (« releases »).
// Elles ne marchent que là où un logiciel non signé peut se remplacer lui-même : l'installeur Windows et
// l'AppImage Linux. Le fichier téléchargé est vérifié par son empreinte (sha512) publiée avec la version.
// Rien ne redémarre sans l'accord de la personne.
const { app, dialog } = require('electron');

const PAGE_VERSIONS = 'https://github.com/Zandino/dev-workshop/releases';
const SIX_HEURES = 6 * 60 * 60 * 1000;

let verificateur = null;
let proposee = false;

/** Vrai si ce logiciel peut se mettre à jour seul ici. */
function possible() {
  if (!app.isPackaged) return false;
  return process.platform === 'win32' || (process.platform === 'linux' && Boolean(process.env.APPIMAGE));
}

function charger(t) {
  if (verificateur) return verificateur;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on('update-downloaded', async (info) => {
    if (proposee) return;
    proposee = true;
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: t('maj_prete', { version: info.version }),
      detail: t('maj_prete_detail'),
      buttons: [t('maj_redemarrer'), t('maj_plus_tard')],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', () => {}); // hors ligne, GitHub injoignable : on réessaiera plus tard
  verificateur = autoUpdater;
  return verificateur;
}

/** Vérifie au démarrage puis toutes les six heures, sans rien afficher tant qu'il n'y a rien de prêt. */
function surveiller(t) {
  if (!possible()) return;
  const v = charger(t);
  const verifier = () => v.checkForUpdates().catch(() => {});
  verifier();
  setInterval(verifier, SIX_HEURES).unref();
}

/** Vérification demandée depuis le menu : on dit toujours ce qu'il en est. */
async function verifierMaintenant(t, ouvrirDehors) {
  if (!possible()) {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: t('maj_manuelle', { version: app.getVersion() }),
      buttons: [t('maj_ouvrir_page'), t('annuler')],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) ouvrirDehors(PAGE_VERSIONS);
    return;
  }
  try {
    const r = await charger(t).checkForUpdates();
    const nouvelle = r?.isUpdateAvailable ?? (r?.updateInfo && r.updateInfo.version !== app.getVersion());
    dialog.showMessageBox({
      type: 'info',
      message: nouvelle ? t('maj_en_cours', { version: r.updateInfo.version }) : t('maj_a_jour', { version: app.getVersion() }),
    });
  } catch (e) {
    dialog.showMessageBox({ type: 'warning', message: t('maj_echec'), detail: e.message });
  }
}

module.exports = { surveiller, verifierMaintenant };
