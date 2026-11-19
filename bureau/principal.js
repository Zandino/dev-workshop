// Dev Workshop pour le bureau : se connecte à ton serveur par SSH et ouvre l'atelier dans sa propre fenêtre.
// Le serveur reste le seul juge de la sécurité ; ce logiciel ne fait que l'atteindre, par un tunnel SSH.
const { app, BrowserWindow, ipcMain, Menu, dialog, nativeTheme } = require('electron');
const serveurs = require('./src/serveurs');
const { preparer, installer, tester, ouvrirTunnel, portLibre } = require('./src/ssh');
const cle = require('./src/cle-ssh');
const { creerAccueil, creerAtelier, ouvrirDehors } = require('./src/fenetres');
const { choisirLangue, t, tous } = require('./src/textes');
const { demanderPort } = require('./src/apercu-port');
const majs = require('./src/mises-a-jour');

const CODE_SOURCE = 'https://github.com/Zandino/dev-workshop';
let accueil = null;
/** Pendant la fermeture du logiciel, fermer un atelier ne doit pas rouvrir l'accueil. */
let onQuitte = false;
/** Ateliers ouverts, par identifiant de serveur : { fenetre, tunnel }. */
const ateliers = new Map();

function montrerAccueil() {
  if (!accueil || accueil.isDestroyed()) accueil = creerAccueil();
  else accueil.show();
  accueil.focus();
}

function menu() {
  const mac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: t('menu_fichier'),
      submenu: [
        { label: t('menu_serveurs'), accelerator: 'CmdOrCtrl+Shift+O', click: montrerAccueil },
        { type: 'separator' },
        { label: t('menu_fermer'), role: 'close' },
        ...(mac ? [] : [{ label: t('menu_quitter'), role: 'quit' }]),
      ],
    },
    { label: t('menu_edition'), role: 'editMenu' },
    {
      label: t('menu_affichage'),
      submenu: [
        { label: t('menu_recharger'), role: 'reload' },
        { type: 'separator' },
        { label: t('menu_zoom_plus'), role: 'zoomIn' },
        { label: t('menu_zoom_moins'), role: 'zoomOut' },
        { label: t('menu_zoom_normal'), role: 'resetZoom' },
        { type: 'separator' },
        { label: t('menu_port'), accelerator: 'CmdOrCtrl+Shift+P', click: ouvrirPort },
        { type: 'separator' },
        { label: t('menu_plein_ecran'), role: 'togglefullscreen' },
        { label: t('menu_outils'), role: 'toggleDevTools' },
      ],
    },
    {
      label: t('menu_aide'),
      submenu: [
        { label: t('menu_maj'), click: () => majs.verifierMaintenant(t, ouvrirDehors) },
        { label: t('code_source'), click: () => ouvrirDehors(CODE_SOURCE) },
      ],
    },
  ]);
}

/** Aperçu d'un port du serveur de l'atelier au premier plan (ou du seul atelier ouvert). */
function ouvrirPort() {
  const active = BrowserWindow.getFocusedWindow();
  const id = [...ateliers.entries()].find(([, a]) => a.fenetre === active)?.[0] || (ateliers.size === 1 ? [...ateliers.keys()][0] : null);
  if (!id) return dialog.showMessageBox({ type: 'info', message: t('port_aucun_atelier') });
  demanderPort(serveurs.trouver(id), tous().textes);
}

/** Les demandes ne sont acceptées que de la page d'accueil (jamais de la page d'un serveur). */
function depuisAccueil(evenement) {
  return accueil && !accueil.isDestroyed() && evenement.sender === accueil.webContents;
}

function gerer(canal, f) {
  ipcMain.handle(canal, async (evenement, ...args) => {
    if (!depuisAccueil(evenement)) throw new Error('refuse');
    try {
      return { ok: true, valeur: await f(evenement, ...args) };
    } catch (e) {
      return { ok: false, cle: e.cle || e.message, detail: e.detail || '' };
    }
  });
}

/** Si le tunnel tombe (veille, réseau), on le rouvre ; la page se reconnecte d'elle-même. */
function surCoupure(id) {
  const a = ateliers.get(id);
  if (!a || a.fenetre.isDestroyed()) return;
  let essais = 0;
  const reessayer = async () => {
    if (!ateliers.has(id) || a.fenetre.isDestroyed()) return;
    try {
      a.tunnel = await ouvrirTunnel(serveurs.trouver(id), () => surCoupure(id));
    } catch {
      essais += 1;
      if (essais < 5) return setTimeout(reessayer, 2000 * essais);
      const s = serveurs.trouver(id);
      const { response } = await dialog.showMessageBox(a.fenetre, {
        type: 'warning',
        message: t('tunnel_coupe', { nom: s.nom }),
        buttons: [t('tunnel_reconnecter'), t('tunnel_fermer')],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        essais = 0;
        reessayer();
      } else a.fenetre.close();
    }
  };
  setTimeout(reessayer, 1000);
}

async function connecter(evenement, id) {
  const dire = (etape) => !evenement.sender.isDestroyed() && evenement.sender.send('avancement', { id, etape });
  const ouvert = ateliers.get(id);
  if (ouvert && !ouvert.fenetre.isDestroyed()) {
    ouvert.fenetre.show();
    ouvert.fenetre.focus();
    return true;
  }
  let serveur = serveurs.trouver(id);
  dire('ssh');
  const jeton = await preparer(serveur, dire);
  if (!(await portLibre(serveur.portLocal))) serveur = serveurs.changerPortLocal(id);
  dire('tunnel');
  const tunnel = await ouvrirTunnel(serveur, () => surCoupure(id));
  const { fenetre, origine } = creerAtelier(serveur, `${serveur.nom} — Dev Workshop`);
  ateliers.set(id, { fenetre, tunnel });
  fenetre.on('closed', () => {
    ateliers.get(id)?.tunnel.arreter();
    ateliers.delete(id);
    if (!ateliers.size && !onQuitte) montrerAccueil();
  });
  try {
    // Le jeton voyage dans le fragment de l'adresse : il ne part jamais dans une requête HTTP.
    await fenetre.loadURL(`${origine}/#jeton=${jeton}`);
  } catch (e) {
    // Rien ne doit rester derrière un échec : ni tunnel ouvert, ni fenêtre cachée qu'un nouvel essai réafficherait.
    ateliers.delete(id);
    tunnel.arreter();
    if (!fenetre.isDestroyed()) fenetre.destroy();
    throw Object.assign(new Error('distant_inattendu'), { cle: 'distant_inattendu', detail: e.message });
  }
  serveurs.noterConnexion(id);
  dire('ouvert');
  if (accueil && !accueil.isDestroyed()) accueil.hide();
  return true;
}

/** Installe Dev Workshop sur un serveur enregistré (bouton de l'accueil), avec l'avancement. */
function installerSur(evenement, id, auto) {
  const dire = (etape) => !evenement.sender.isDestroyed() && evenement.sender.send('avancement', { id, etape });
  dire('inst_verification');
  return installer(serveurs.trouver(id), { ref: `v${app.getVersion()}`, auto }, dire);
}

/** Guide de premier branchement : clé SSH, dépôt sur le serveur, essai. Les saisies sont vérifiées ici. */
function brancherGuide() {
  const textesTerminal = () => ({ titre: t('guide_terminal_titre'), consigne: t('guide_terminal_consigne'), fin: t('guide_terminal_fin') });
  gerer('guide:cle', () => ({ ...cle.etat(), terminal: process.platform === 'win32' }));
  gerer('guide:creer_cle', () => cle.creer());
  gerer('guide:commande', (_e, saisie) => cle.commandeManuelle(serveurs.validerAcces(saisie)));
  gerer('guide:deposer', (_e, saisie) => cle.deposer(serveurs.validerAcces(saisie), textesTerminal()));
  gerer('guide:tester', (_e, saisie) => tester(serveurs.validerAcces(saisie)));
}

app.on('web-contents-created', (_e, contenu) => {
  contenu.on('will-attach-webview', (e) => e.preventDefault());
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', montrerAccueil);
  // Windows n'affiche les notifications d'une application que si elle a un identifiant (celui de l'installeur).
  if (process.platform === 'win32') app.setAppUserModelId('io.github.zandino.devworkshop');
  app.whenReady().then(() => {
    choisirLangue(app.getPreferredSystemLanguages?.()[0] || app.getLocale());
    nativeTheme.themeSource = 'system';
    Menu.setApplicationMenu(menu());
    gerer('textes', () => ({ ...tous(), version: app.getVersion() }));
    gerer('serveurs:lister', () => serveurs.lister());
    gerer('serveurs:enregistrer', (_e, saisie) => serveurs.enregistrer(saisie || {}));
    gerer('serveurs:supprimer', (_e, id) => serveurs.supprimer(String(id)));
    gerer('connecter', (e, id) => connecter(e, String(id)));
    gerer('installer', (e, id, auto) => installerSur(e, String(id), auto === true));
    brancherGuide();
    gerer('code-source', () => ouvrirDehors(CODE_SOURCE));
    gerer('majs:lire', () => majs.active());
    gerer('majs:definir', (_e, oui) => majs.definirActive(oui === true));
    gerer('confidentialite', () => ouvrirDehors(`${CODE_SOURCE}/blob/main/PRIVACY.md`));
    montrerAccueil();
    majs.surveiller(t);
    app.on('activate', () => BrowserWindow.getAllWindows().length || montrerAccueil());
  });
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
  app.on('before-quit', () => {
    onQuitte = true;
    ateliers.forEach((a) => a.tunnel.arreter());
  });
}
