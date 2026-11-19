// Mode orchestre : une IA cheffe (Claude) répartit le travail entre les IA connectées et choisit, pour chaque
// sous-tâche, l'IA et le niveau de modèle qui suffisent (économie de jetons). Elle dispose d'un outil
// « deleguer » ; chaque sous-agent est un pilote ordinaire (Claude, Codex, Gemini, API), ouvert le temps de sa
// tâche, dans le même dossier et le même mode. Ses demandes d'accord reviennent à l'écran comme les autres.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { fournisseurDe } from './fournisseurs/index.mjs';
import * as claude from './fournisseurs/claude.mjs';
import { listerComptes, compte as compteDe } from './comptes.mjs';
import { consigneDeProjet } from './projets.mjs';
import { connecteursPour } from './connecteurs.mjs';

const MAX_EN_PARALLELE = 3;
const MAX_RESULTAT = 40_000;
const SILENCE_MAX = 3 * 60 * 1000;

const PROFILS = {
  claude: 'Claude Code (outils : fichiers, commandes). Modèles : « haiku » = rapide et économique (tâches simples, recherches dans le code, résumés, petites modifications) ; « sonnet » = équilibré (la plupart du développement) ; « opus » = le plus fort et le plus cher (architecture, raisonnement difficile, bugs coriaces).',
  codex: 'ChatGPT / Codex (outils : fichiers, commandes). Bon en développement, scripts, bases de données et SQL, tests. Laisse le modèle vide pour celui du compte.',
  gemini: 'Gemini (outils : fichiers, commandes). Bon pour lire beaucoup de fichiers d’un coup, les images et documents visuels. Un modèle « flash » est économique, « pro » est plus fort ; laisse vide si tu ne connais pas l’identifiant exact.',
  copilot: 'GitHub Copilot (outils : fichiers, commandes ; modèles de plusieurs fournisseurs selon l’abonnement). Bon en développement courant et sur ce qui touche à GitHub.',
  qwen: 'Agent par clé (Qwen Code, outils : fichiers, commandes) branché sur le modèle indiqué. Souvent économique : bon pour du code simple, des scripts, des tâches répétitives.',
  api: 'IA par API, SANS outils : elle ne lit ni n’écrit aucun fichier. Utile pour un avis, une relecture ou une rédaction à partir du seul texte que tu lui donnes.',
};

function equipe() {
  return listerComptes().map((c) => `- id « ${c.id} » : ${c.defaut ? 'Claude (compte du serveur)' : c.nom}${c.type === 'api' ? ` (modèle ${c.modele})` : ''}. ${PROFILS[c.type] || ''}`).join('\n');
}

function consigneCheffe() {
  return [
    'Tu es la cheffe d’orchestre de cette session. Tu peux confier des sous-tâches à d’autres IA avec l’outil « deleguer ».',
    'Règles :',
    '- Fais toi-même ce qui est court ou demande tout le contexte de la conversation.',
    '- Délègue quand une autre IA est plus indiquée, ou quand un modèle plus léger suffit : c’est ainsi qu’on économise les jetons. Choisis le niveau de modèle selon la difficulté réelle de la sous-tâche.',
    '- Un sous-agent ne voit pas la conversation : donne-lui une tâche complète et autonome (but, fichiers concernés, contraintes, ce qu’il doit rendre).',
    '- Tu peux lancer plusieurs délégations en même temps si elles sont indépendantes (au plus 3).',
    '- Chaque délégation a une part distincte : ne confie jamais deux fois la même chose, ne donne pas les mêmes fichiers à modifier à deux sous-agents en même temps, et ne refais pas toi-même ce que tu as délégué.',
    '- Vérifie ce que rend un sous-agent avant de t’appuyer dessus, puis fais la synthèse pour l’utilisateur.',
    '- Ne délègue jamais une action que l’utilisateur n’a pas demandée.',
    'IA disponibles :',
    equipe(),
  ].join('\n');
}

const consigneSousAgent = (role) => [
  `Tu es un sous-agent, chargé par une IA cheffe d’une tâche précise${role ? ` (rôle : ${role})` : ''}.`,
  'Fais seulement cette tâche, puis termine par un compte rendu clair et court de ce que tu as fait ou trouvé : c’est lui qui sera transmis à la cheffe.',
].join('\n');

/** Ouvre une session orchestrée ; même interface qu'un pilote ordinaire. */
export function ouvrirOrchestre({ compte, dossier, modele, mode, effort }, emettre) {
  const proprietaires = new Map(); // demande d'accord -> pilote qui l'a faite
  const sousAgents = new Set();
  let ferme = false;
  let rang = 0;

  function deleguer({ ia, tache, modele: modeleSous, role }) {
    let c;
    try {
      c = compteDe(String(ia));
    } catch {
      return Promise.resolve(`IA inconnue : « ${ia} ». IA disponibles :\n${equipe()}`);
    }
    if (sousAgents.size >= MAX_EN_PARALLELE) return Promise.resolve('Déjà 3 sous-agents au travail : attends qu’un d’eux ait fini.');
    rang = (rang % 3) + 1; // le rang 0 reste à la cheffe
    const auteur = { nom: String(role || c.nom || c.id).slice(0, 30), rang, externe: c.type !== 'claude', compte: { id: c.id, type: c.type, url: c.url || null } };
    return new Promise((resoudre) => {
      let texte = '';
      let fini = false;
      let pilote = null;
      let dernierSigne = Date.now();
      // Un sous-agent muet (hors demande d'accord) ne doit pas bloquer la cheffe : elle reçoit un échec et continue.
      const veille = setInterval(() => {
        if ([...proprietaires.values()].includes(pilote) || Date.now() - dernierSigne < SILENCE_MAX) return;
        pilote?.interrompre().catch(() => {});
        terminer(`Le sous-agent ne répond plus (aucun signe depuis 3 minutes) : tâche abandonnée.\n${texte}`);
      }, 10_000);
      const terminer = (r) => {
        if (fini) return;
        fini = true;
        clearInterval(veille);
        sousAgents.delete(pilote);
        setTimeout(() => pilote?.fermer(), 200);
        resoudre(String(r || '(aucun compte rendu)').slice(0, MAX_RESULTAT));
      };
      const recevoir = (e) => {
        dernierSigne = Date.now();
        if (ferme || fini || ['pret', 'capacites', 'utilisateur'].includes(e.t)) return;
        if (e.t === 'etat') return e.ferme && terminer(texte || 'Le sous-agent s’est arrêté avant la fin.');
        if (e.t === 'permission') proprietaires.set(e.id, pilote);
        if (e.t === 'permission_fin') proprietaires.delete(e.id);
        if (e.t === 'assistant' && !e.sousAgent) texte = e.blocs.filter((b) => b.type === 'texte').map((b) => b.texte).join('\n\n') || texte;
        emettre({ ...e, auteur });
        if (e.t === 'tour') terminer(e.ok ? texte : `Échec du sous-agent (${e.message || e.motif}).\n${texte}`);
      };
      emettre({ t: 'delegation', auteur, modele: modeleSous || null, tache: String(tache).slice(0, 2000) });
      pilote = fournisseurDe(c).ouvrir({
        compte: c,
        modele: modeleSous || undefined,
        dossier,
        mode,
        consigne: [consigneDeProjet(dossier), consigneSousAgent(role)].filter(Boolean).join('\n\n'),
        connecteurs: connecteursPour(c),
      }, recevoir);
      sousAgents.add(pilote);
      pilote.envoyer(String(tache));
    });
  }

  const outils = createSdkMcpServer({
    name: 'orchestre',
    version: '1.0.0',
    tools: [
      tool(
        'deleguer',
        'Confie une sous-tâche autonome à une IA connectée (voir la liste dans tes consignes), avec le modèle de ton choix. Rend le compte rendu du sous-agent.',
        {
          ia: z.string().describe('id de l’IA (compte) à qui confier la tâche'),
          tache: z.string().describe('la tâche complète : but, fichiers, contraintes, ce qu’il faut rendre'),
          modele: z.string().optional().describe('modèle à utiliser (ex. haiku, sonnet, opus pour Claude) ; vide = celui du compte'),
          role: z.string().optional().describe('nom court du rôle, affiché à l’utilisateur (ex. « Base de données »)'),
        },
        async (args) => ({ content: [{ type: 'text', text: await deleguer(args) }] }),
      ),
    ],
  });

  const cheffe = claude.ouvrir({
    compte,
    dossier,
    modele,
    mode,
    consigne: [consigneDeProjet(dossier), consigneCheffe()].filter(Boolean).join('\n\n'),
    connecteurs: connecteursPour(compte),
    serveursMcp: { orchestre: outils },
    outilsPermis: ['mcp__orchestre__deleguer'],
    effort,
  }, (e) => {
    if (e.t === 'permission') proprietaires.set(e.id, cheffe);
    if (e.t === 'permission_fin') proprietaires.delete(e.id);
    emettre(e);
  });

  return {
    envoyer: (texte) => cheffe.envoyer(texte),
    async interrompre() {
      await Promise.all([cheffe.interrompre(), ...[...sousAgents].map((p) => p.interrompre())]);
    },
    reglerModele: (m) => cheffe.reglerModele(m),
    reglerMode: (m) => cheffe.reglerMode(m),
    reglerEffort: (e) => cheffe.reglerEffort(e),
    repondrePermission: (id, reponse) => (proprietaires.get(id) || cheffe).repondrePermission(id, reponse),
    fermer() {
      ferme = true;
      for (const p of sousAgents) p.fermer();
      cheffe.fermer();
    },
  };
}
