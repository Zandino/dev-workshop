// Mises à jour automatiques, depuis les versions publiées sur GitHub (« releases »).
// Elles ne marchent que là où un logiciel non signé peut se remplacer lui-même : l'installeur Windows et
// l'AppImage Linux. Le fichier téléchargé est vérifié par son empreinte (sha512) publiée avec la version.
// Rien ne redémarre sans l'accord de la personne. La vérification contacte github.com : elle se coupe depuis l'accueil
// (réglage gardé dans le dossier d'application de la personne).
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const PAGE_VERSIONS = 'https://github.com/Zandino/dev-workshop/releases';
const SIX_HEURES = 6 * 60 * 60 * 1000;

let verificateur = null;
let proposee = false;

const fichierReglages = () => path.join(app.getPath('userData'), 'reglages.json');

function lireReglages() {
  try {
    return JSON.parse(fs.readFileSync(fichierReglages(), 'utf8')) || {};
  } catch {
    return {};
  }
}

/** Vérification automatique des mises à jour : activée tant que la personne ne l'a pas coupée. */
function active() {
  return lireReglages().majAuto !== false;
}

function definirActive(oui) {
  const r = { ...lireReglages(), majAuto: Boolean(oui) };
  fs.mkdirSync(path.dirname(fichierReglages()), { recursive: true });
  fs.writeFileSync(fichierReglages(), JSON.stringify(r, null, 2) + '\n', { mode: 0o600 });
  if (verificateur) verificateur.autoDownload = r.majAuto;
  return r.majAuto;
}

/** Vrai si ce logiciel peut se mettre à jour seul ici. */
function possible() {
  if (!app.isPackaged) return false;
  return process.platform === 'win32' || (process.platform === 'linux' && Boolean(process.env.APPIMAGE));
}

function charger(t) {
  if (verificateur) return verificateur;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = active();
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

/** Vérifie au démarrage puis toutes les six heures (si la personne ne l'a pas coupé), sans rien afficher tant qu'il n'y a rien de prêt. */
function surveiller(t) {
  if (!possible()) return;
  const verifier = () => active() && charger(t).checkForUpdates().catch(() => {});
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
    const v = charger(t);
    const r = await v.checkForUpdates();
    const nouvelle = r?.isUpdateAvailable ?? (r?.updateInfo && r.updateInfo.version !== app.getVersion());
    // Demandée à la main : on télécharge même si la vérification automatique est coupée.
    if (nouvelle && !v.autoDownload) v.downloadUpdate().catch(() => {});
    dialog.showMessageBox({
      type: 'info',
      message: nouvelle ? t('maj_en_cours', { version: r.updateInfo.version }) : t('maj_a_jour', { version: app.getVersion() }),
    });
  } catch (e) {
    dialog.showMessageBox({ type: 'warning', message: t('maj_echec'), detail: e.message });
  }
}

module.exports = { surveiller, verifierMaintenant, active, definirActive };
