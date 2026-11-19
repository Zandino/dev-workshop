// Commandes « / » : descriptions traduites dans la langue de l'interface et recherche.
// Claude Code fournit les descriptions en anglais ; ce qui n'a pas de traduction ici garde son texte d'origine.
import { langue } from './i18n.js';
import { normaliser } from './dom.js';

const TRADUCTIONS = {
  fr: {
    advisor: 'Laisser Claude consulter un modèle plus fort aux moments clés',
    autocompact: 'Régler le seuil de remplissage du contexte avant le résumé automatique',
    batch: 'Préparer un grand changement puis l’exécuter en parallèle sur plusieurs agents isolés',
    clear: 'Démarrer une nouvelle session, contexte vide ; l’ancienne reste reprenable',
    'code-review': 'Relire les modifications en cours (ou une PR, une branche) à la recherche de bogues',
    color: 'Changer la couleur de la barre de saisie pour cette session',
    compact: 'Libérer du contexte en résumant la conversation',
    config: 'Modifier un réglage (clé=valeur)',
    context: 'Afficher l’occupation du contexte',
    debug: 'Activer les journaux de débogage et aider au diagnostic',
    'deep-research': 'Recherche approfondie sur le web avec sources vérifiées et citées',
    doctor: 'Vérifier l’installation de Claude Code et corriger les problèmes',
    effort: 'Régler le niveau d’effort du modèle',
    fast: 'Activer ou couper le mode rapide',
    'fewer-permission-prompts': 'Proposer une liste d’autorisations pour réduire les demandes d’accord',
    focus: 'Vue épurée : la demande, le résumé et la réponse',
    goal: 'Fixer un objectif : Claude continue jusqu’à ce qu’il soit atteint',
    import: 'Importer la configuration d’un autre assistant de code',
    init: 'Créer le fichier CLAUDE.md qui documente le projet',
    insights: 'Produire un rapport d’analyse de tes sessions',
    'list-agents': 'Lister les sous-agents et les autres sessions Claude joignables',
    loop: 'Répéter une demande ou une commande à intervalle régulier',
    mcp: 'Gérer les serveurs MCP (reconnecter, activer, désactiver)',
    model: 'Choisir le modèle',
    'output-style': 'Lister les styles de réponse ou en changer',
    recap: 'Résumer la session en une ligne',
    'reload-plugins': 'Appliquer les changements de plugins en attente',
    'reload-skills': 'Recharger les compétences ajoutées ou modifiées',
    rename: 'Renommer la conversation',
    run: 'Lancer l’application du projet pour voir un changement fonctionner',
    schedule: 'Créer ou gérer des agents planifiés dans le cloud',
    'security-review': 'Faire une revue de sécurité des modifications en cours',
    simplify: 'Simplifier et nettoyer le code modifié, puis appliquer les corrections',
    'skill-doctor': 'Montrer les compétences chargées mais inutilisées, qui coûtent du contexte',
    'team-onboarding': 'Préparer un guide de prise en main pour l’équipe',
    ultrareview: 'Lancer une revue approfondie dans le cloud (payante, 5 à 15 min)',
    'update-config': 'Configurer Claude Code (permissions, automatismes, variables)',
    usage: 'Afficher le coût de la session et l’utilisation de l’abonnement',
    'usage-credits': 'Configurer les crédits d’usage ou en demander à l’administrateur',
    verify: 'Vérifier de bout en bout qu’un changement fait bien ce qu’il doit',
  },
  en: {},
};

/** Mots que l'on tape naturellement dans chaque langue pour retrouver une commande. */
const MOTS_CLES = {
  fr: {
    clear: 'effacer vider nouveau', compact: 'résumer compacter', context: 'contexte jetons', usage: 'coût consommation tokens',
    model: 'modèle', 'code-review': 'relecture revue', 'security-review': 'sécurité audit', init: 'initialiser',
    rename: 'renommer titre', loop: 'boucle répéter', schedule: 'planifier', effort: 'réflexion niveau', fast: 'rapide',
    simplify: 'simplifier nettoyer', verify: 'vérifier tester', run: 'lancer démarrer', doctor: 'diagnostic santé',
  },
  en: {},
};

let commandes = [];

/** Enregistre les commandes reçues du fournisseur et prépare leur texte de recherche. */
export function definirCommandes(liste) {
  const code = langue();
  commandes = (liste || [])
    .filter((c) => !c.nom.startsWith('__'))
    .map((c) => {
      const traduite = TRADUCTIONS[code]?.[c.nom];
      return {
        nom: c.nom,
        argument: c.argument,
        description: traduite || c.description,
        traduite: Boolean(traduite) || code === 'en',
        recherche: normaliser([c.nom, traduite, c.description, MOTS_CLES[code]?.[c.nom]].filter(Boolean).join(' ')),
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Les commandes dont le nom commence par la saisie d'abord, puis celles qui la contiennent. */
export function chercherCommandes(saisie, max = 30) {
  const q = normaliser(saisie);
  if (!q) return commandes.slice(0, max);
  const debut = [];
  const reste = [];
  for (const c of commandes) {
    if (normaliser(c.nom).startsWith(q)) debut.push(c);
    else if (q.split(/\s+/).every((mot) => c.recherche.includes(mot))) reste.push(c);
  }
  return [...debut, ...reste].slice(0, max);
}
