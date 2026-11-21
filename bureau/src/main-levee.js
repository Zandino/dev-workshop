// Main levée sur l'icône du logiciel : une discussion attend ton accord. La page du serveur n'a aucun pont vers
// le poste (voir fenetres.js) : elle l'annonce dans son titre (« ✋ 2 · Dev Workshop », public/js/alertes.js) et
// on n'en lit que ce nombre. Windows : une petite main sur l'icône de la barre des tâches, qui clignote quand une
// nouvelle demande arrive fenêtre en arrière-plan. macOS : ✋ sur l'icône du Dock. Linux : un compteur, selon le
// bureau.
const { app, nativeImage } = require('electron');
const path = require('node:path');
const { t } = require('./textes');

const IMAGE = path.join(__dirname, '..', 'ressources', 'main-levee.png');
const besoins = new Map(); // fenêtre d'atelier -> nombre de discussions qui t'attendent (un atelier par serveur)
let image = null;

/** Le nombre annoncé en tête du titre de la page ; 0 s'il n'y en a pas. */
function lireBesoins(titrePage) {
  const m = /^✋ (\d{1,3}) · /.exec(String(titrePage || ''));
  return m ? Number(m[1]) : 0;
}

function majDock() {
  const total = [...besoins.values()].reduce((a, b) => a + b, 0);
  if (process.platform === 'darwin') app.dock?.setBadge(total ? '✋' : '');
  else if (process.platform === 'linux') app.setBadgeCount(total);
}

/** Rend la fonction à appeler à chaque changement du titre de la page ; `titre` : celui de la fenêtre. */
function suivreBesoins(fenetre, titre) {
  besoins.set(fenetre, 0);
  fenetre.on('focus', () => fenetre.flashFrame(false));
  fenetre.on('closed', () => {
    besoins.delete(fenetre);
    majDock();
  });
  return (titrePage) => {
    const n = lireBesoins(titrePage);
    const avant = besoins.get(fenetre) || 0;
    if (n === avant || fenetre.isDestroyed()) return;
    besoins.set(fenetre, n);
    fenetre.setTitle(n ? `✋ ${titre}` : titre);
    if (process.platform === 'win32') {
      image ??= nativeImage.createFromPath(IMAGE);
      fenetre.setOverlayIcon(n ? image : null, n ? t('main_levee', { n }) : '');
    }
    majDock();
    if (n > avant && !fenetre.isFocused()) fenetre.flashFrame(true);
  };
}

module.exports = { suivreBesoins, lireBesoins };
