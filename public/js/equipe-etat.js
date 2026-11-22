// L'équipe d'une discussion, en direct : chaque IA et chaque sous-agent est un membre, avec un prénom, un style
// (avatar, couleur) et une fonction, et un état lu dans les événements de la discussion (aucun appel à une IA).
// Membres : l'IA seule (« principal »), les participants d'une discussion à plusieurs ou les sous-agents de
// l'orchestre (leur nom d'auteur), et les sous-agents que Claude lance lui-même (outil Task/Agent, rattachés à
// l'appel qui les a lancés). Ce module ne touche pas à la page : equipe.js l'affiche, tests/equipe.mjs l'essaie.

/** Prénoms donnés aux membres (f : féminin, pour accorder la fonction). */
export const PRENOMS = [
  ['Léa', 1], ['Hugo', 0], ['Inès', 1], ['Nathan', 0], ['Chloé', 1], ['Louis', 0], ['Manon', 1], ['Jules', 0],
  ['Zoé', 1], ['Gabriel', 0], ['Camille', 1], ['Arthur', 0], ['Jade', 1], ['Malik', 0], ['Sarah', 1], ['Noé', 0],
  ['Lina', 1], ['Adam', 0], ['Emma', 1], ['Rayan', 0], ['Alice', 1], ['Théo', 0], ['Nour', 1], ['Victor', 0],
  ['Rose', 1], ['Samuel', 0], ['Maëlle', 1], ['Yanis', 0], ['Anaïs', 1], ['Paul', 0], ['Elsa', 1], ['Marius', 0],
];

/** Fonctions : [masculin, féminin]. */
const FONCTIONS = {
  chef: ['Chef d’orchestre', 'Cheffe d’orchestre'],
  dev: ['Développeur', 'Développeuse'],
  tests: ['Testeur', 'Testeuse'],
  analyse: ['Analyste', 'Analyste'],
  recherche: ['Explorateur', 'Exploratrice'],
  archi: ['Architecte', 'Architecte'],
  relecture: ['Relecteur', 'Relectrice'],
  web: ['Navigateur web', 'Navigatrice web'],
  redaction: ['Rédacteur', 'Rédactrice'],
  assistant: ['Assistant', 'Assistante'],
};

const TACHE = /^(Task|Agent)$/;
const ECRITURE = /^(Edit|MultiEdit|Write|NotebookEdit|Patch|write_file|replace|edit|create)$/i;
const TERMINAL = /^(Bash|shell|execute|run_shell_command|local_shell)$/i;
const LECTURE = /^(Read|Grep|Glob|LS|read_file|search|grep|glob|list_directory|WebSearch|WebFetch)$/i;
const NAVIGATEUR = /^mcp__navigateur|browser|playwright|puppeteer/i;
const TEST = /\b(test|tests|vitest|jest|pytest|playwright test|go test|cargo test|phpunit|check|typecheck|lint)\b/i;
export const SILENCE_BLOQUE = 3 * 60 * 1000;
export const COMMANDE_LONGUE = 60 * 1000;
export const DEPART_SOUS_AGENT = 2 * 60 * 1000;
const MAX_SORTIE = 6000;

const hachage = (texte) => {
  let h = 2166136261;
  for (const c of String(texte)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
};

/** Ce que fait un outil, en quelques mots, pour l'étiquette de la tuile. */
export function actionDe(nom, e = {}) {
  const court = (x) => String(x || '').replace(/\s+/g, ' ').slice(0, 60);
  if (TERMINAL.test(nom)) return `Lance ${court(e.command || e.cmd)}`;
  if (ECRITURE.test(nom)) return `Modifie ${court(String(e.file_path || e.path || '').split('/').pop())}`;
  if (/^Read$|read_file/i.test(nom)) return `Lit ${court(String(e.file_path || e.path || '').split('/').pop())}`;
  if (/Grep|Glob|search|grep|glob/i.test(nom)) return `Cherche ${court(e.pattern || e.query)}`;
  if (/WebSearch|WebFetch/.test(nom)) return `Se renseigne sur le web`;
  if (NAVIGATEUR.test(nom)) return `Navigue ${court(e.url)}`;
  if (TACHE.test(nom)) return `Confie : ${court(e.description || e.subagent_type)}`;
  return court(nom.replace(/^mcp__[^_]+__/, ''));
}

/** Fonction d'un sous-agent de Claude d'après son type. */
function fonctionDuType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('explore')) return 'recherche';
  if (t.includes('plan') || t.includes('archi')) return 'archi';
  if (t.includes('review') || t.includes('relect')) return 'relecture';
  if (t.includes('test')) return 'tests';
  if (t.includes('doc') || t.includes('writ')) return 'redaction';
  return null;
}

export function creerEquipe({ session = '', principal = null, personnalises = {} } = {}) {
  const membres = new Map(); // clé -> membre
  const appels = new Map(); // id d'appel d'outil -> { cle, genre, depuis }
  const pris = new Set(); // prénoms déjà donnés dans cette discussion
  const equipe = { membres, principal: principal || { nom: 'IA', compte: null }, ecranDe: null, maintenant: Date.now };

  function prenomPour(cle) {
    const voulu = personnalises[cle]?.prenom;
    let i = hachage(`${session}|${cle}`) % PRENOMS.length;
    for (let n = 0; n < PRENOMS.length && pris.has(PRENOMS[i][0]); n += 1) i = (i + 1) % PRENOMS.length;
    pris.add(PRENOMS[i][0]);
    return { prenom: voulu || PRENOMS[i][0], feminin: Boolean(PRENOMS[i][1]) };
  }

  function membre(cle, { ia, parent = null, fonction = null, fonctionLibre = null, ordre = null } = {}) {
    if (membres.has(cle)) return membres.get(cle);
    const { prenom, feminin } = prenomPour(cle);
    const h = hachage(`${session}|${cle}|style`);
    const m = {
      cle, prenom, feminin, parent, ordre,
      ia: ia || equipe.principal,
      style: { couleur: h % 8, cheveux: (h >> 3) % 6, peau: (h >> 6) % 5, accessoire: (h >> 9) % 4 },
      fonction, fonctionLibre, activite: { dev: 0, tests: 0, analyse: 0, web: 0 },
      etat: 'pret', action: '', parole: '', attendQui: new Set(),
      ecran: { fichier: null, terminal: null, navigateur: null, dernier: null },
      echecs: 0, commandeDepuis: null, dernierSigne: equipe.maintenant(), dernieresActions: [], boucle: false,
      arriveLe: equipe.maintenant(), finiLe: null, erreur: false,
    };
    membres.set(cle, m);
    return m;
  }

  /** Le membre qui parle dans un événement : sous-agent de Claude (parent), auteur nommé, ou l'IA seule. */
  function auteurDe(e) {
    if (e.parent && membres.has(`sous:${e.parent}`)) return membres.get(`sous:${e.parent}`);
    if (e.auteur?.nom) return membre(`auteur:${e.auteur.nom}`, { ia: { nom: e.auteur.nom, compte: e.auteur.compte || null }, parent: e.auteur.rang > 0 && equipe.chef ? equipe.chef : null });
    return membre('principal');
  }

  function signe(m, etat) {
    m.dernierSigne = equipe.maintenant();
    if (etat) m.etat = etat;
    if (m.finiLe && etat && etat !== 'fini') m.finiLe = null;
  }

  function outil(m, b) {
    const e = b.entree || {};
    m.action = actionDe(b.nom, e);
    // Le même appel trois fois d'affilée : l'IA tourne peut-être en rond.
    const empreinte = `${b.nom}|${JSON.stringify(e).slice(0, 300)}`;
    m.dernieresActions = [...m.dernieresActions.slice(-2), empreinte];
    m.boucle = m.dernieresActions.length === 3 && m.dernieresActions.every((x) => x === empreinte);
    if (TACHE.test(b.nom)) {
      // Claude confie une tâche à un sous-agent : il arrive avec son ordre, son chef l'attend.
      const sous = membre(`sous:${b.id}`, { ia: { nom: `sous-agent de ${m.prenom}`, compte: m.ia.compte }, parent: m.cle, fonction: fonctionDuType(e.subagent_type), ordre: e.description || e.prompt || '' });
      sous.action = String(e.description || '').slice(0, 60);
      signe(sous, 'travaille');
      m.attendQui.add(sous.cle);
      appels.set(b.id, { cle: m.cle, genre: 'tache', sous: sous.cle });
      signe(m, 'attend');
      return;
    }
    signe(m, 'travaille');
    if (ECRITURE.test(b.nom)) {
      m.activite.dev += 1;
      m.ecran.fichier = { chemin: e.file_path || e.path || e.notebook_path || '', nom: b.nom, entree: e };
      m.ecran.dernier = 'fichier';
    } else if (TERMINAL.test(b.nom)) {
      if (TEST.test(e.command || '')) m.activite.tests += 1;
      else m.activite.dev += 0.5;
      m.ecran.terminal = { commande: e.command || e.cmd || '', sortie: null, erreur: false };
      m.ecran.dernier = 'terminal';
      m.commandeDepuis = equipe.maintenant();
      appels.set(b.id, { cle: m.cle, genre: 'terminal' });
    } else if (NAVIGATEUR.test(b.nom)) {
      m.activite.web += 1;
      m.ecran.navigateur = { ...(m.ecran.navigateur || {}), action: b.nom.replace(/^mcp__[^_]+__/, ''), adresse: e.url || m.ecran.navigateur?.adresse || '' };
      m.ecran.dernier = 'navigateur';
      appels.set(b.id, { cle: m.cle, genre: 'navigateur' });
    } else if (LECTURE.test(b.nom)) {
      m.activite.analyse += 1;
    }
    if (!appels.has(b.id)) appels.set(b.id, { cle: m.cle, genre: 'autre' });
  }

  /** Un événement de la discussion. Rend le membre concerné (pour la voix), ou null. */
  equipe.recevoir = (e) => {
    if (e.t === 'delegation') {
      // Orchestre : la cheffe confie une tâche ; le sous-agent (nommé par son rôle) arrive avec son ordre.
      const chef = membre('principal');
      chef.fonction = 'chef';
      equipe.chef = chef.cle;
      const sous = membre(`auteur:${e.auteur?.nom}`, { ia: { nom: e.auteur?.nom, compte: e.auteur?.compte || null }, parent: chef.cle, fonctionLibre: e.auteur?.nom || null, ordre: e.tache || '' });
      sous.parent = chef.cle;
      signe(sous, 'travaille');
      sous.action = String(e.tache || '').slice(0, 60);
      chef.attendQui.add(sous.cle);
      signe(chef, 'attend');
      return sous;
    }
    if (e.t === 'delta') {
      const m = auteurDe(e);
      if (m.etat !== 'attend') signe(m, e.genre === 'reflexion' ? 'reflechit' : 'ecrit');
      return null;
    }
    if (e.t === 'assistant') {
      const m = auteurDe(e);
      let parle = null;
      for (const b of e.blocs || []) {
        if (b.type === 'outil') outil(m, b);
        else if (b.type === 'texte' && b.texte.trim()) {
          m.parole = b.texte;
          parle = m;
          if (m.etat !== 'attend') signe(m, 'ecrit');
        }
      }
      return parle;
    }
    if (e.t === 'resultat_outil') {
      const a = appels.get(e.id);
      if (!a) return null;
      appels.delete(e.id);
      const m = membres.get(a.cle);
      if (!m) return null;
      m.dernierSigne = equipe.maintenant();
      if (e.erreur) m.echecs += 1;
      if (a.genre === 'tache') {
        // Le sous-agent a rendu son compte rendu : il a fini, son chef ne l'attend plus.
        const sous = membres.get(a.sous);
        if (sous) {
          sous.etat = e.erreur ? 'erreur' : 'fini';
          sous.parole = String(e.contenu || '').slice(0, 2000);
          sous.finiLe = equipe.maintenant();
        }
        m.attendQui.delete(a.sous);
        if (!m.attendQui.size && m.etat === 'attend') m.etat = 'travaille';
      } else if (a.genre === 'terminal' && m.ecran.terminal) {
        m.ecran.terminal.sortie = String(e.contenu || '').slice(-MAX_SORTIE);
        m.ecran.terminal.erreur = Boolean(e.erreur);
        m.commandeDepuis = null;
      } else if (a.genre === 'navigateur' && m.ecran.navigateur) {
        if (e.image?.donnees) m.ecran.navigateur.image = `data:${e.image.type};base64,${e.image.donnees}`;
        else if (e.imageVue) m.ecran.navigateur.perdue = true;
      }
      return null;
    }
    if (e.t === 'permission') {
      const m = auteurDe(e);
      m.besoin = true;
      signe(m, 'besoin');
      m.action = e.questions ? 'Te pose une question' : `Demande ton accord : ${actionDe(e.outil || '', e.entree || {})}`;
      return m;
    }
    if (e.t === 'permission_fin') {
      for (const m of membres.values()) {
        if (m.etat === 'besoin') {
          m.besoin = false;
          signe(m, m.attendQui.size ? 'attend' : 'travaille');
        }
      }
      return null;
    }
    if (e.t === 'tour') {
      const m = auteurDe(e);
      m.erreur = e.ok === false;
      if (e.auteur && m.parent) {
        m.etat = e.ok === false ? 'erreur' : 'fini';
        m.finiLe = equipe.maintenant();
        const chef = membres.get(m.parent);
        chef?.attendQui.delete(m.cle);
      } else {
        m.etat = e.ok === false ? 'erreur' : 'pret';
      }
      return null;
    }
    if (e.t === 'etat' && e.occupe === false && !e.auteur) {
      for (const m of membres.values()) {
        if (m.parent && m.etat !== 'fini' && m.etat !== 'erreur') { m.etat = 'fini'; m.finiLe = equipe.maintenant(); }
        else if (!m.parent && !['erreur', 'besoin'].includes(m.etat)) m.etat = 'pret';
        m.attendQui.clear();
        m.commandeDepuis = null;
      }
    }
    return null;
  };

  /** Fonction affichée (choisie à la main, donnée par l'orchestre, d'après le type, ou d'après ce qu'il fait). */
  equipe.fonctionDe = (m) => {
    if (personnalises[m.cle]?.fonction) return personnalises[m.cle].fonction;
    if (m.fonctionLibre) return m.fonctionLibre;
    const genre = m.feminin ? 1 : 0;
    if (m.fonction) return FONCTIONS[m.fonction][genre];
    const a = m.activite;
    const max = Math.max(a.dev, a.tests, a.analyse, a.web);
    if (!max) return FONCTIONS.assistant[genre];
    const cle = a.tests === max ? 'tests' : a.dev === max ? 'dev' : a.web === max ? 'web' : 'analyse';
    return FONCTIONS[cle][genre];
  };

  /** État affiché, avec ce qui se calcule à l'instant : bloqué (silence), commande longue, départ d'un sous-agent. */
  equipe.vue = (m) => {
    const maintenant = equipe.maintenant();
    const etat = ['travaille', 'reflechit', 'ecrit', 'attend'].includes(m.etat) && maintenant - m.dernierSigne > SILENCE_BLOQUE ? 'bloque' : m.etat;
    return {
      etat,
      commandeLongue: m.commandeDepuis !== null && maintenant - m.commandeDepuis > COMMANDE_LONGUE,
      parti: Boolean(m.parent && m.finiLe && maintenant - m.finiLe > DEPART_SOUS_AGENT),
      attend: [...m.attendQui].map((c) => membres.get(c)?.prenom).filter(Boolean),
    };
  };

  /** Les membres dans l'ordre d'affichage : chaque chef suivi de ses sous-agents ; ceux partis depuis 2 min, non. */
  equipe.liste = () => {
    const tous = [...membres.values()].filter((m) => !equipe.vue(m).parti);
    const racines = tous.filter((m) => !m.parent || !membres.has(m.parent));
    const ordre = [];
    const ajouter = (m, niveau) => {
      ordre.push({ m, niveau });
      for (const f of tous.filter((x) => x.parent === m.cle)) ajouter(f, niveau + 1);
    };
    for (const r of racines) ajouter(r, 0);
    return ordre;
  };

  /** Le membre au premier plan : celui qui a besoin de toi, sinon celui qui a agi en dernier. */
  equipe.vedette = () => {
    const tous = equipe.liste().map((x) => x.m);
    return tous.find((m) => m.etat === 'besoin') || [...tous].sort((a, b) => b.dernierSigne - a.dernierSigne)[0] || null;
  };

  return equipe;
}
