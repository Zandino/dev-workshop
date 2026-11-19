// Clé SSH de la personne, pour le guide de premier branchement : trouver une clé existante, en créer une si
// besoin, et la déposer sur le serveur. Le dépôt se fait dans un terminal : c'est là que la personne tape le
// mot de passe du serveur (et valide son empreinte) ; le logiciel ne les voit jamais.
// Rien n'est écrasé : une clé existante est réutilisée telle quelle.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DOSSIER_SSH = () => path.join(os.homedir(), '.ssh');
const NOMS = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
/** Une ligne de clé publique sûre à recopier dans une commande : type et contenu seulement. */
const CLE = /^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) ([A-Za-z0-9+/]+={0,3})(?:\s|$)/;

/** Programme OpenSSH du système (sous Windows, celui de Windows plutôt qu'un autre trouvé dans le PATH). */
function programme(nom) {
  if (process.platform !== 'win32') return nom;
  const officiel = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', `${nom}.exe`);
  return fs.existsSync(officiel) ? officiel : nom;
}

function trouver() {
  for (const nom of NOMS) {
    const publique = path.join(DOSSIER_SSH(), `${nom}.pub`);
    if (fs.existsSync(publique) && fs.existsSync(path.join(DOSSIER_SSH(), nom))) return { nom, publique };
  }
  return null;
}

/** État pour le guide : { existe, affichage } (chemin lisible, jamais le contenu de la clé privée). */
function etat() {
  const c = trouver();
  return c ? { existe: true, affichage: `~/.ssh/${c.nom}.pub` } : { existe: false, affichage: '' };
}

/** Ligne publique réduite à « type contenu », vérifiée ; lance une erreur si la clé est illisible. */
function lignePublique() {
  const c = trouver();
  if (!c) throw new Error('guide_cle_absente');
  const m = fs.readFileSync(c.publique, 'utf8').trim().match(CLE);
  if (!m) throw new Error('guide_cle_illisible');
  return `${m[1]} ${m[2]}`;
}

/** Crée une clé ed25519 sans phrase secrète (le logiciel se connecte seul), sauf si une clé existe déjà. */
function creer() {
  if (trouver()) return Promise.resolve(etat());
  fs.mkdirSync(DOSSIER_SSH(), { recursive: true, mode: 0o700 });
  const fichier = path.join(DOSSIER_SSH(), 'id_ed25519');
  return new Promise((resoudre, rejeter) => {
    const enfant = spawn(programme('ssh-keygen'), ['-t', 'ed25519', '-N', '', '-C', 'dev-workshop', '-f', fichier], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let erreurs = '';
    enfant.stderr.on('data', (d) => { erreurs += d.toString(); });
    enfant.on('error', () => rejeter(Object.assign(new Error('ssh_absent'), { detail: '' })));
    enfant.on('close', (code) => (code === 0 && trouver() ? resoudre(etat()) : rejeter(Object.assign(new Error('guide_cle_echec'), { detail: erreurs.slice(-800) }))));
  });
}

/**
 * Commande lancée sur le serveur : ajoute la clé à authorized_keys une seule fois (reconnue à son contenu,
 * qu'elle y soit déjà avec ou sans commentaire), droits stricts.
 */
function commandeDistante(ligne) {
  const contenu = ligne.split(' ')[1];
  return `umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qF '${contenu}' ~/.ssh/authorized_keys || echo '${ligne}' >> ~/.ssh/authorized_keys) && echo DEPOSEE`;
}

/** Commande à recopier soi-même dans un terminal (autres systèmes, ou si le bouton ne convient pas). */
function commandeManuelle(acces) {
  const port = acces.portSsh ? ` -p ${acces.portSsh}` : '';
  const c = trouver();
  const nom = c ? c.nom : 'id_ed25519';
  if (process.platform === 'win32') {
    return `type $env:USERPROFILE\\.ssh\\${nom}.pub | ssh${port} ${acces.hote} "umask 077; mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`;
  }
  return `ssh-copy-id -i ~/.ssh/${nom}.pub${port} ${acces.hote}`;
}

/**
 * Ouvre un terminal qui dépose la clé (Windows). Résout quand la fenêtre se ferme ; le résultat se vérifie
 * ensuite par un essai de connexion. `textes` : libellés du terminal (titre, fin).
 */
function deposer(acces, textes) {
  if (process.platform !== 'win32' || acces.hote.includes('%')) return Promise.reject(new Error('guide_terminal_indisponible'));
  const ligne = lignePublique();
  const port = acces.portSsh ? ` -p ${acces.portSsh}` : '';
  // Un fichier de commandes : pas de « % » ni de guillemet doublé dans ce qui est écrit, rien à interpréter.
  const sur = (s) => String(s).replace(/[%"^&|<>]/g, ' ');
  const fichier = path.join(os.tmpdir(), `dev-workshop-cle-${process.pid}-${Date.now()}.cmd`);
  fs.writeFileSync(fichier, [
    '@echo off',
    'chcp 65001 >nul',
    `title ${sur(textes.titre)}`,
    `echo ${sur(textes.consigne)}`,
    'echo.',
    `"${programme('ssh')}"${port} ${acces.hote} "${commandeDistante(ligne)}"`,
    'echo.',
    `echo ${sur(textes.fin)}`,
    'pause >nul',
    'exit',
    '',
  ].join('\r\n'), { encoding: 'utf8', mode: 0o600 });
  return new Promise((resoudre) => {
    const enfant = spawn('cmd.exe', ['/d', '/s', '/c', `start "Dev Workshop" /wait "${fichier}"`], {
      windowsVerbatimArguments: true,
      windowsHide: false,
      stdio: 'ignore',
    });
    const fin = () => { fs.rmSync(fichier, { force: true }); resoudre(true); };
    enfant.on('close', fin);
    enfant.on('error', fin);
  });
}

module.exports = { etat, creer, deposer, commandeManuelle };
