// Canal WebSocket : une connexion authentifiée par jeton, puis des ordres courts en JSON.
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as claude from './fournisseurs/claude.mjs';
import { etatDuCompte } from './fournisseurs/index.mjs';
import { demarrerConnexion, saisirCode, annulerConnexion } from './connexion.mjs';
import { compte, listerComptes, creerCompte, definirCle, supprimerCompte } from './comptes.mjs';
import { preparerParticipants } from './salon.mjs';
import { MODES, EFFORTS } from './fournisseurs/claude.mjs';
import { jetonValide, resoudreProjet, RACINE_PROJETS } from './securite.mjs';
import { ouvrirSession, attacher, session, fermerSession, listerVivantes, interrompues } from './sessions.mjs';
import { ordresProjets } from './ordres-projets.mjs';
import { messageAvecFichiers } from './fichiers.mjs';
import { listerCorbeille } from './projets.mjs';
import { listerSessionsCorbeille } from './corbeille-sessions.mjs';
import { enDeplacement } from './deplacer-session.mjs';
import { veiller } from './veille.mjs';
import { ordresDictee } from './dictee.mjs';
import { verifierCleGemini } from './fournisseurs/gemini.mjs';
import { repondreQuestion } from './entre-discussions.mjs';
import { lireOrdre, trier } from './ordre.mjs';

const NOM_PROJET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const MAX_TEXTE = 200_000;

function projets() {
  return readdirSync(RACINE_PROJETS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Version affichée dans le pied de page de l'écran. */
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function etatGeneral() {
  const ordre = lireOrdre(); // ordre choisi dans la barre (ordre.mjs)
  return { t: 'general', version: VERSION, comptes: listerComptes(), projets: trier(projets(), ordre.projets), ordreDiscussions: ordre.discussions, vivantes: listerVivantes(), modes: MODES, corbeille: listerCorbeille().length + listerSessionsCorbeille().length, interrompues: interrompues() };
}

export function brancher(ws, jeton) {
  let authentifie = false;
  const abonnements = new Map();
  const envoyer = (o) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(o));
  };
  const delai = setTimeout(() => !authentifie && ws.close(4401, 'jeton'), 5000);
  // Veille (voir veille.mjs) : les alertes partent tout de suite ; l'état des discussions ouvertes, regroupé
  // (un tour de Claude change d'état plusieurs fois par seconde).
  let quitterVeille = () => {};
  let regroupement = null;
  const suivreVeille = (alerte) => {
    if (alerte) envoyer({ t: 'alerte', ...alerte });
    regroupement ??= setTimeout(() => {
      regroupement = null;
      envoyer({ t: 'vivantes', vivantes: listerVivantes() });
    }, 200);
  };

  const ordres = {
    general: () => envoyer(etatGeneral()),

    // Les sessions passées sont celles du compte par défaut (voir README, « Limites connues »).
    async historique(m) {
      envoyer({ t: 'historique', projet: m.projet, sessions: await claude.historique(resoudreProjet(m.projet)) });
    },

    // Toutes les discussions de tous les projets, les plus récentes d'abord (vue « Toutes les discussions »).
    async toutes_discussions() {
      const liste = [];
      for (const projet of projets()) {
        try {
          for (const s of await claude.historique(resoudreProjet(projet))) liste.push({ ...s, projet });
        } catch { /* projet illisible : ignoré */ }
      }
      envoyer({ t: 'discussions', liste: liste.sort((a, b) => b.modifieLe - a.modifieLe) });
    },

    creer_projet(m) {
      if (!NOM_PROJET.test(String(m.nom || ''))) throw new Error('nom_invalide');
      mkdirSync(path.join(RACINE_PROJETS, m.nom), { recursive: false });
      envoyer(etatGeneral());
    },

    creer_compte(m) {
      const id = creerCompte({ type: m.type, nom: m.nom, url: m.url, modele: m.modele });
      if (['api', 'qwen'].includes(m.type) && m.cle) definirCle(id, m.cle);
      envoyer(etatGeneral());
    },

    // Une clé Gemini est d'abord présentée à Google : refusée, elle n'est pas enregistrée et l'écran dit pourquoi.
    // Enregistrée, l'état du compte suit tout de suite (sans attendre « Vérifier »).
    async cle_compte(m) {
      const c = compte(String(m.id));
      // Une clé d'API ne contient jamais d'espace : ceux collés avec elle (retour à la ligne compris) partent.
      const cle = String(m.cle || '').replace(/\s+/g, '');
      if (c.type === 'gemini' && cle) {
        const v = await verifierCleGemini(cle);
        if (v.refusee) {
          envoyer({ t: 'etat_compte', id: c.id, connecte: false, echec: true, motif: v.message });
          throw new Error('cle_gemini_refusee');
        }
      }
      definirCle(c.id, cle);
      envoyer(etatGeneral());
      envoyer({ t: 'etat_compte', id: c.id, ...(await etatDuCompte(c)) });
    },

    supprimer_compte(m) {
      annulerConnexion(String(m.id));
      supprimerCompte(String(m.id));
      envoyer(etatGeneral());
    },

    async etat_compte(m) {
      const c = compte(String(m.id));
      envoyer({ t: 'etat_compte', id: c.id, ...(await etatDuCompte(c)) });
    },

    // Connexion par compte : le lien et le code ne sont envoyés qu'à cette connexion, jamais au journal.
    connecter_compte(m) {
      demarrerConnexion(compte(String(m.id)), envoyer);
    },

    code_connexion(m) {
      saisirCode(String(m.id), m.code);
    },

    annuler_connexion(m) {
      annulerConnexion(String(m.id));
    },

    async ouvrir(m) {
      const commun = {
        dossier: resoudreProjet(m.projet),
        titre: typeof m.titre === 'string' ? m.titre.slice(0, 80) : '',
      };
      const modeleDe = (v) => (typeof v === 'string' && v ? v.slice(0, 120) : undefined);
      let s;
      if (Array.isArray(m.participants) && m.participants.length > 1) {
        s = await ouvrirSession({ ...commun, participants: preparerParticipants(m.participants), mode: MODES.includes(m.mode) ? m.mode : 'default', echanges: m.echanges });
      } else {
        const c = compte(String(m.compte || 'defaut'));
        const reprise = c.defaut && typeof m.reprise === 'string' && /^[0-9a-f-]{36}$/.test(m.reprise) ? m.reprise : undefined;
        if (reprise && enDeplacement(reprise)) throw new Error('discussion_occupee'); // copie en cours (« Ranger »)
        s = await ouvrirSession({ ...commun, compte: c, modele: modeleDe(m.modele), mode: MODES.includes(m.mode) ? m.mode : 'default', reprise, orchestre: m.orchestre === true, effort: EFFORTS.includes(m.effort) ? m.effort : undefined });
      }
      ordres.attacher({ session: s.id });
    },

    attacher(m) {
      if (abonnements.has(m.session)) return;
      abonnements.set(m.session, attacher(m.session, envoyer));
    },

    detacher(m) {
      abonnements.get(m.session)?.();
      abonnements.delete(m.session);
    },

    envoyer(m) {
      const texte = String(m.texte || '');
      if (!texte.trim() || texte.length > MAX_TEXTE) throw new Error('texte_invalide');
      const s = session(m.session);
      s.pilote.envoyer(messageAvecFichiers(texte, s.dossier, m.fichiers, s.avecOutils));
    },

    interrompre: (m) => session(m.session).pilote.interrompre(),
    modele: (m) => session(m.session).pilote.reglerModele(String(m.modele).slice(0, 80)),
    mode: (m) => session(m.session).pilote.reglerMode(m.mode),
    // Puissance de réflexion : seuls les comptes Claude la règlent en cours de session.
    effort(m) {
      const pilote = session(m.session).pilote;
      if (!pilote.reglerEffort) throw new Error('effort_sans_objet');
      return pilote.reglerEffort(String(m.effort));
    },

    permission(m) {
      if (!['autoriser', 'toujours', 'refuser'].includes(m.decision)) throw new Error('decision_invalide');
      const s = session(m.session);
      if (repondreQuestion(s.id, String(m.id), m)) return; // question posée par une IA autre que Claude
      s.pilote.repondrePermission(String(m.id), {
        decision: m.decision,
        reponses: m.reponses,
        motif: m.motif,
      });
    },

    fermer(m) {
      ordres.detacher(m);
      fermerSession(m.session);
      envoyer(etatGeneral());
    },
  };

  const projetsEtFichiers = ordresProjets(envoyer, () => envoyer(etatGeneral()), (id) => ordres.attacher({ session: id }));
  const dictee = ordresDictee(envoyer);
  for (const lot of [projetsEtFichiers, dictee]) {
    for (const [nom, f] of Object.entries(lot.ordres)) if (!Object.hasOwn(ordres, nom)) ordres[nom] = f;
  }

  ws.on('message', async (donnees) => {
    let m;
    try {
      m = JSON.parse(donnees.toString());
    } catch {
      return ws.close(4400, 'json');
    }
    if (!authentifie) {
      if (m?.t !== 'bonjour' || !jetonValide(jeton, m.jeton)) return ws.close(4401, 'jeton');
      authentifie = true;
      clearTimeout(delai);
      quitterVeille = veiller(suivreVeille);
      return envoyer(etatGeneral());
    }
    const ordre = Object.hasOwn(ordres, m?.t) ? ordres[m.t] : null;
    if (!ordre) return envoyer({ t: 'refus', ordre: String(m?.t).slice(0, 40), code: 'ordre_inconnu' });
    try {
      await ordre(m);
    } catch (e) {
      // Seul un code court part vers l'écran : jamais de chemin ni de trace.
      const code = /^[a-z_]{3,40}$/.test(e?.message || '') ? e.message : 'echec';
      if (code === 'echec') console.error(`[dev-workshop] ordre « ${m.t} » en échec :`, e?.message || e);
      envoyer({ t: 'refus', ordre: m.t, code, session: m.session });
    }
  });

  ws.on('close', () => {
    clearTimeout(delai);
    quitterVeille();
    clearTimeout(regroupement);
    projetsEtFichiers.fermer();
    dictee.fermer();
    for (const quitter of abonnements.values()) quitter();
    abonnements.clear();
  });
}
