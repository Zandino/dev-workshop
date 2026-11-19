// Connexion par compte depuis l'écran : le serveur lance la commande officielle de connexion de l'outil,
// relaie à l'écran le lien à ouvrir (et le code à saisir), puis transmet à l'outil le code collé.
// Le lien et les codes ne sont ni journalisés ni gardés ; les identifiants restent dans le dossier du compte,
// écrits par l'outil lui-même, et ne sont jamais lus ici.
import { spawn } from 'node:child_process';
import { lier, binaire } from './fournisseurs/jsonrpc.mjs';
import { envGemini } from './fournisseurs/gemini.mjs';
import { etatDuCompte } from './fournisseurs/index.mjs';

const DELAI_MS = 10 * 60 * 1000;
const HOTES = {
  claude: /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/,
  codex: /(^|\.)openai\.com$/,
  gemini: /^accounts\.google\.com$/,
};
const enCours = new Map();

const sansCouleurs = (texte) => texte.replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');

/** Dernier lien du texte dont l'hôte est bien celui du fournisseur attendu (un nouvel essai en donne un neuf). */
function lienAttendu(type, texte) {
  let dernier = null;
  // Le lien n'est retenu qu'une fois suivi d'un blanc : jamais un morceau de lien encore en cours d'arrivée.
  for (const brut of texte.match(/https:\/\/[^\s"'<>]+(?=\s)/g) || []) {
    try {
      const url = new URL(brut);
      if (HOTES[type].test(url.hostname)) dernier = url.href;
    } catch { /* lien incomplet, la suite arrive */ }
  }
  return dernier;
}

/** Commande lancée dans un pseudo-terminal (les outils n'affichent le lien qu'à un terminal). */
function dansTerminal(commande, env) {
  return spawn('script', ['-qefc', commande, '/dev/null'], { env: { ...env, COLUMNS: '4000', TERM: 'dumb' }, stdio: ['pipe', 'pipe', 'ignore'] });
}

function parTerminal(type, compte, suivre) {
  const env = type === 'claude' ? { ...process.env, CLAUDE_CONFIG_DIR: compte.dossier } : { ...process.env, CODEX_HOME: compte.dossier };
  const commande = type === 'claude' ? 'claude auth login' : `${binaire('codex')} login --device-auth`;
  const enfant = dansTerminal(commande, env);
  let texte = '';
  let annonce = false;
  let invites = 0;
  enfant.stdout.on('data', (d) => {
    texte = (texte + sansCouleurs(d.toString())).slice(-20000);
    const url = lienAttendu(type, texte);
    // Claude redemande le code quand celui collé est incomplet : on le dit à l'écran au lieu de rester muet.
    const vues = (texte.match(/Paste code here/g) || []).length;
    if (annonce && url && vues > invites && invites > 0) suivre({ etape: 'lien', url, code: null, saisie: true, refuse: true });
    invites = vues;
    const code = type === 'codex' ? texte.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b/)?.[0] : null;
    if (url && !annonce && (type !== 'codex' || code)) {
      annonce = true;
      suivre({ etape: 'lien', url, code: code || null, saisie: type === 'claude' });
    }
  });
  enfant.on('exit', (statut) => suivre({ etape: statut === 0 && annonce ? 'reussie' : 'echec' }));
  enfant.on('error', () => suivre({ etape: 'echec' }));
  return {
    saisir: (code) => enfant.stdin.write(code + '\n'),
    arreter: () => enfant.kill('SIGTERM'),
  };
}

/** Gemini : la connexion Google se déclenche par son protocole ; le lien arrive en clair sur sa sortie. */
function parProtocole(compte, suivre) {
  let texte = '';
  let annonce = false;
  let fini = false;
  let dernierLien = null;
  const l = lier(binaire('gemini'), ['--acp'], {
    env: { ...envGemini(compte), NO_BROWSER: 'true' },
    cwd: compte.dossier,
    surTexte(ligne) {
      texte = (texte + sansCouleurs(ligne) + '\n').slice(-20000);
      const url = lienAttendu('gemini', texte);
      if (url && url !== dernierLien) {
        // Après un code refusé, Gemini repart avec un nouveau lien : l'écran le remplace et le signale.
        suivre({ etape: 'lien', url, code: null, saisie: true, refuse: annonce });
        annonce = true;
        dernierLien = url;
      }
    },
    surFin: () => !fini && suivre({ etape: 'echec' }),
  });
  l.demander('initialize', { protocolVersion: 1, clientCapabilities: {} })
    .then(() => l.demander('authenticate', { methodId: 'oauth-personal' }, DELAI_MS))
    .then(() => {
      fini = true;
      suivre({ etape: 'reussie' });
      l.fermer();
    })
    .catch(() => {
      if (fini) return;
      fini = true;
      suivre({ etape: 'echec' });
      l.fermer();
    });
  return { saisir: (code) => l.saisir(code), arreter: () => l.fermer() };
}

/** Démarre la connexion d'un compte. `envoyer` ne s'adresse qu'à la personne qui l'a demandée. */
export function demarrerConnexion(compte, envoyer) {
  if (compte.defaut || !compte.dossier || !HOTES[compte.type]) throw new Error('connexion_refusee');
  annulerConnexion(compte.id);
  let clos = false;
  const suivre = (e) => {
    if (clos) return;
    if (e.etape === 'lien') return envoyer({ t: 'connexion', id: compte.id, ...e });
    clos = true;
    clearTimeout(minuterie);
    enCours.delete(compte.id);
    if (e.etape !== 'reussie') return envoyer({ t: 'connexion', id: compte.id, ...e });
    // « Réussie » n'est annoncé que si l'outil lui-même voit le compte connecté.
    etatDuCompte(compte)
      .then((etat) => envoyer({ t: 'connexion', id: compte.id, etape: etat.connecte ? 'reussie' : 'echec' }))
      .catch(() => envoyer({ t: 'connexion', id: compte.id, etape: 'echec' }));
  };
  const pilote = compte.type === 'gemini' ? parProtocole(compte, suivre) : parTerminal(compte.type, compte, suivre);
  const minuterie = setTimeout(() => {
    pilote.arreter();
    suivre({ etape: 'echec', motif: 'delai' });
  }, DELAI_MS);
  minuterie.unref();
  enCours.set(compte.id, { pilote, suivre });
}

/** Transmet à l'outil le code collé par la personne ; il ne va nulle part ailleurs. */
export function saisirCode(id, code) {
  const c = enCours.get(id);
  const valeur = String(code || '').trim();
  if (!c || !valeur || valeur.length > 2000 || /[\r\n\x00-\x1f]/.test(valeur)) throw new Error('code_invalide');
  c.pilote.saisir(valeur);
}

export function annulerConnexion(id) {
  const c = enCours.get(id);
  if (!c) return;
  c.pilote.arreter();
  c.suivre({ etape: 'echec', motif: 'annulee' });
}

export function annulerToutes() {
  for (const id of [...enCours.keys()]) annulerConnexion(id);
}
