// Canal WebSocket : une connexion authentifiée par jeton, puis des ordres courts en JSON.
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as claude from './fournisseurs/claude.mjs';
import { etatDuCompte } from './fournisseurs/index.mjs';
import { demarrerConnexion, saisirCode, annulerConnexion } from './connexion.mjs';
import { compte, listerComptes, creerCompte, definirCle, supprimerCompte } from './comptes.mjs';
import { MAX_PARTICIPANTS } from './salon.mjs';
import { MODES } from './fournisseurs/claude.mjs';
import { jetonValide, resoudreProjet, RACINE_PROJETS } from './securite.mjs';
import { ouvrirSession, attacher, session, fermerSession, listerVivantes } from './sessions.mjs';

const NOM_PROJET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const MAX_TEXTE = 200_000;

function projets() {
  return readdirSync(RACINE_PROJETS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function etatGeneral() {
  return { t: 'general', comptes: listerComptes(), projets: projets(), vivantes: listerVivantes(), modes: MODES };
}

export function brancher(ws, jeton) {
  let authentifie = false;
  const abonnements = new Map();
  const envoyer = (o) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(o));
  };
  const delai = setTimeout(() => !authentifie && ws.close(4401, 'jeton'), 5000);

  const ordres = {
    general: () => envoyer(etatGeneral()),

    // Les sessions passées sont celles du compte par défaut (voir README, « Limites connues »).
    async historique(m) {
      envoyer({ t: 'historique', projet: m.projet, sessions: await claude.historique(resoudreProjet(m.projet)) });
    },

    creer_projet(m) {
      if (!NOM_PROJET.test(String(m.nom || ''))) throw new Error('nom_invalide');
      mkdirSync(path.join(RACINE_PROJETS, m.nom), { recursive: false });
      envoyer(etatGeneral());
    },

    creer_compte(m) {
      const id = creerCompte({ type: m.type, nom: m.nom, url: m.url, modele: m.modele });
      if (m.type === 'api' && m.cle) definirCle(id, m.cle);
      envoyer(etatGeneral());
    },

    cle_compte(m) {
      definirCle(String(m.id), m.cle);
      envoyer(etatGeneral());
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
        if (m.participants.length > MAX_PARTICIPANTS) throw new Error('trop_de_participants');
        const vues = listerComptes();
        const participants = m.participants.map((p, i) => {
          const c = compte(String(p.compte));
          const nom = String(p.nom || '').trim().slice(0, 30) || `${c.nom} ${i + 1}`;
          return { compte: c, modele: modeleDe(p.modele), nom, externe: Boolean(vues.find((v) => v.id === c.id)?.externe) };
        });
        if (new Set(participants.map((p) => p.nom)).size !== participants.length) throw new Error('noms_en_double');
        // À plusieurs, on démarre toujours en « demander avant d'agir ».
        s = await ouvrirSession({ ...commun, participants, mode: 'default', echanges: m.echanges });
      } else {
        const c = compte(String(m.compte || 'defaut'));
        const reprise = c.defaut && typeof m.reprise === 'string' && /^[0-9a-f-]{36}$/.test(m.reprise) ? m.reprise : undefined;
        s = await ouvrirSession({ ...commun, compte: c, modele: modeleDe(m.modele), mode: MODES.includes(m.mode) ? m.mode : 'default', reprise });
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
      session(m.session).pilote.envoyer(texte);
    },

    interrompre: (m) => session(m.session).pilote.interrompre(),
    modele: (m) => session(m.session).pilote.reglerModele(String(m.modele).slice(0, 80)),
    mode: (m) => session(m.session).pilote.reglerMode(m.mode),

    permission(m) {
      if (!['autoriser', 'toujours', 'refuser'].includes(m.decision)) throw new Error('decision_invalide');
      session(m.session).pilote.repondrePermission(String(m.id), {
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
    for (const quitter of abonnements.values()) quitter();
    abonnements.clear();
  });
}
