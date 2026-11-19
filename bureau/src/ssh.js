// Liaison avec le serveur par le client SSH du système (OpenSSH, présent sur Windows 10+, macOS et Linux).
// On s'appuie sur la configuration SSH de la personne : alias, clés, agent, hôtes connus. Le logiciel ne voit
// jamais une clé ni un mot de passe, et ne désactive jamais la vérification de l'hôte.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

// Fins de ligne Unix quoi qu'il arrive : un « \r » venu d'une copie Windows casserait le script sur le serveur.
const SCRIPT = fs.readFileSync(path.join(__dirname, 'distant.sh'), 'utf8').replace(/\r\n/g, '\n');

/** Entre apostrophes pour sh : la seule séquence à protéger est l'apostrophe elle-même. */
const cite = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

function optionsCommunes(serveur) {
  const o = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3'];
  if (serveur.portSsh) o.push('-p', String(serveur.portSsh));
  return o;
}

/** Traduit la réponse de ssh en une clé de texte compréhensible (le détail brut reste disponible). */
function motifSsh(sortieErreur) {
  const e = sortieErreur || '';
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(e)) return 'ssh_cle_hote';
  if (/Permission denied|Too many authentication failures/i.test(e)) return 'ssh_refuse';
  if (/Could not resolve hostname|Name or service not known|No such host/i.test(e)) return 'ssh_hote_inconnu';
  if (/timed out|Connection timed out/i.test(e)) return 'ssh_delai';
  if (/Connection refused/i.test(e)) return 'ssh_ferme';
  if (/not recognized|ENOENT/i.test(e)) return 'ssh_absent';
  return 'ssh_echec';
}

class ErreurLiaison extends Error {
  constructor(cle, detail = '') {
    super(cle);
    this.cle = cle;
    this.detail = detail.trim().slice(-1500);
  }
}

/**
 * Prépare le serveur : le démarre s'il ne répond pas, puis lit son jeton. `etape` reçoit l'avancement.
 * Le jeton n'est rendu qu'à l'appelant ; il n'est ni journalisé ni écrit.
 */
function preparer(serveur, etape) {
  return new Promise((resoudre, rejeter) => {
    const entete = `DW_DOSSIER=${cite(serveur.dossier)}\nDW_PORT=${cite(serveur.port)}\nDW_RACINE=${cite(serveur.racine || '')}\n`;
    let enfant;
    try {
      enfant = spawn('ssh', [...optionsCommunes(serveur), '-T', '--', serveur.hote, 'sh -s'], { windowsHide: true });
    } catch (e) {
      return rejeter(new ErreurLiaison('ssh_absent', e.message));
    }
    let sortie = '';
    let erreurs = '';
    let jeton = null;
    let motif = null;
    const journal = [];
    enfant.stdout.on('data', (d) => {
      sortie += d.toString();
      let fin;
      while ((fin = sortie.indexOf('\n')) >= 0) {
        const ligne = sortie.slice(0, fin).replace(/\r$/, '');
        sortie = sortie.slice(fin + 1);
        if (ligne.startsWith('JETON:')) jeton = ligne.slice(6).trim();
        else if (ligne.startsWith('ETAT:')) etape(ligne.slice(5));
        else if (ligne.startsWith('ERREUR:')) motif = ligne.slice(7);
        else if (ligne.startsWith('JOURNAL:')) journal.push(ligne.slice(8));
      }
    });
    enfant.stderr.on('data', (d) => { erreurs = (erreurs + d.toString()).slice(-4000); });
    enfant.on('error', (e) => rejeter(new ErreurLiaison(e.code === 'ENOENT' ? 'ssh_absent' : 'ssh_echec', e.message)));
    enfant.on('close', (code) => {
      if (jeton && /^[A-Za-z0-9_-]{32,}$/.test(jeton)) return resoudre(jeton);
      if (motif) return rejeter(new ErreurLiaison('distant_' + motif, journal.join('\n')));
      if (code === 255) return rejeter(new ErreurLiaison(motifSsh(erreurs), erreurs));
      rejeter(new ErreurLiaison('distant_inattendu', erreurs || `code ${code}`));
    });
    enfant.stdin.end(entete + SCRIPT);
  });
}

/** Le port local accepte-t-il une connexion ? */
function portOuvert(port) {
  return new Promise((resoudre) => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.once('connect', () => { s.destroy(); resoudre(true); });
    s.once('error', () => resoudre(false));
  });
}

/** Le port local est-il libre pour y poser le tunnel ? */
function portLibre(port) {
  return new Promise((resoudre) => {
    const srv = net.createServer();
    srv.once('error', () => resoudre(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resoudre(true)));
  });
}

/**
 * Ouvre le tunnel : 127.0.0.1:portLocal du poste → 127.0.0.1:port du serveur. Résout quand le port répond.
 * Rend { arreter, enfant } ; `surFin` est appelé si le tunnel tombe ensuite.
 */
function ouvrirTunnel(serveur, surFin) {
  return new Promise((resoudre, rejeter) => {
    const renvoi = `127.0.0.1:${serveur.portLocal}:127.0.0.1:${serveur.port}`;
    const enfant = spawn('ssh', [...optionsCommunes(serveur), '-N', '-T', '-o', 'ExitOnForwardFailure=yes', '-L', renvoi, '--', serveur.hote], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let erreurs = '';
    let pret = false;
    let arrete = false;
    enfant.stderr.on('data', (d) => { erreurs = (erreurs + d.toString()).slice(-4000); });
    enfant.on('error', (e) => !pret && rejeter(new ErreurLiaison('ssh_absent', e.message)));
    enfant.on('close', () => {
      if (!pret) return rejeter(new ErreurLiaison(motifSsh(erreurs), erreurs));
      if (!arrete) surFin(erreurs);
    });
    const debut = Date.now();
    const essayer = async () => {
      if (enfant.exitCode !== null) return;
      if (await portOuvert(serveur.portLocal)) {
        pret = true;
        return resoudre({ enfant, arreter: () => { arrete = true; enfant.kill(); } });
      }
      if (Date.now() - debut > 20000) {
        enfant.kill();
        return rejeter(new ErreurLiaison('ssh_delai', erreurs));
      }
      setTimeout(essayer, 250);
    };
    setTimeout(essayer, 300);
  });
}

module.exports = { preparer, ouvrirTunnel, portLibre, ErreurLiaison };
