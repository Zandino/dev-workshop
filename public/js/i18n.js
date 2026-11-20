// Textes de l'interface, en français et en anglais. Ajouter une langue = ajouter une colonne ici
// et un fichier de commandes (voir commandes.js).
const TEXTES = {
  fr: {
    titre: 'Dev Workshop', projets: 'Projets', nouveau_projet: 'Nouveau projet…', creer: 'Créer',
    en_cours: 'Sessions en cours', historique: 'Sessions passées', aucune_session: 'Aucune session pour ce projet.',
    nouvelle_session: 'Nouvelle session', fermer_session: 'Fermer la session', sans_titre: 'Sans titre',
    choisir_projet: 'Choisis un projet à gauche pour commencer.',
    accueil: 'Écris ta demande : la session démarre dans le projet « {projet} ».',
    saisie: 'Écris ta demande… ( / pour les commandes, Maj+Entrée pour un saut de ligne )',
    envoyer: 'Envoyer', arreter: 'Arrêter', modele: 'Modèle', mode: 'Mode', fournisseur: 'Compte', langue: 'Langue',
    mode_default: 'Manuel : demander avant d’agir', mode_acceptEdits: 'Accepter les modifications', mode_plan: 'Plan (sans modifier)',
    mode_auto: 'Automatique : ne demander qu’en cas de doute', mode_bypassPermissions: '⚠ Tout autoriser (sans demander)',
    modele_defaut: 'Par défaut',
    etat_pret: 'prêt', etat_non_installe: 'non installé sur le serveur', etat_adaptateur_a_ecrire: 'à brancher',
    contexte: 'Contexte', jetons: 'Jetons', conso_titre: 'Consommation de la session',
    conso_note: 'Coût estimé par Claude Code au tarif public, depuis l’ouverture de la session. Avec un abonnement, ce n’est pas une facture.',
    entree: 'Entrée', sortie: 'Sortie', cache_lu: 'Cache lu', cache_ecrit: 'Cache écrit', cout: 'Coût estimé',
    fenetre: 'Fenêtre', total: 'Total', dernier_tour: 'Dernier tour', limite: 'Limite de l’abonnement',
    limite_five_hour: '5 heures', limite_seven_day: '7 jours', limite_autre: 'période en cours',
    limite_retablie: 'remise à zéro le {date}', utilise: 'utilisé',
    reflexion: 'Réflexion', sous_agent: 'Sous-agent', resultat: 'Résultat', erreur: 'Erreur', en_attente: 'en cours…',
    tour_fini: 'Terminé en {duree} · {appels} appel(s) au modèle', tour_echec: 'Tour interrompu : {motif}',
    info_compactage: 'Résumé de la conversation en cours…', info_compacte: 'Conversation résumée pour libérer du contexte.',
    perm_titre: '{outil} demande ton accord', autoriser: 'Autoriser', toujours: 'Toujours autoriser', refuser: 'Refuser',
    motif: 'Dire pourquoi (facultatif)', repondre: 'Répondre', autre: 'Autre réponse…',
    plan_titre: 'Plan proposé', approuver: 'Approuver le plan',
    cmd_aucune: 'Aucune commande ne correspond.', cmd_non_traduite: 'description d’origine',
    jeton_titre: 'Accès à l’atelier', jeton_aide: 'Colle le jeton d’accès affiché au lancement du serveur (ou ouvre le lien complet).',
    jeton_champ: 'Jeton d’accès', entrer: 'Entrer', jeton_refuse: 'Jeton refusé.',
    connexion_perdue: 'Connexion perdue, nouvelle tentative…', session_fermee: 'Session fermée.',
    refus: 'Demande refusée : {code}',
    refus_dossier_hors_racine: 'Dossier hors de la racine des projets.', refus_trop_de_sessions: 'Trop de sessions ouvertes : fermes-en une.',
    refus_nom_invalide: 'Nom de projet invalide (lettres, chiffres, tirets).', refus_session_inconnue: 'Cette session n’existe plus.',
    refus_fournisseur_indisponible: 'Cette IA n’est pas disponible sur le serveur.',
    lignes: '{n} ligne(s)', copier: 'Copier', copie: 'Copié',
    comptes: 'Comptes', compte_defaut: 'Claude (compte du serveur)', type_api: 'Serveur compatible OpenAI', fermer: 'Fermer',
    verifier: 'Vérifier la connexion', connecte: 'Connecté', non_connecte: 'Non connecté', externe: 'externe', local: 'local',
    cle_presente: 'clé enregistrée ({n} caractères)', cle_absente: 'sans clé', supprimer: 'Retirer',
    supprimer_compte: 'Retirer le compte « {nom} » de la liste ?',
    ajouter_api: 'Ajouter une IA par adresse', aide_api: 'LM Studio, Ollama ou une API compatible OpenAI. Ces IA discutent, mais ne touchent pas aux fichiers. La clé, s’il y en a une, reste sur le serveur.',
    nom_compte: 'Nom du compte', nom_modele: 'Nom du modèle', cle_api: 'Clé d’API (facultative en local)', choisir_service: 'Partir d’un service connu…', ajouter: 'Ajouter',
    salon_bouton: 'Discussion à plusieurs', salon_titre: 'Discussion à plusieurs IA',
    salon_aide: 'Pas de chef : les IA se concertent d’abord (sans rien modifier) jusqu’à se mettre d’accord sur qui fait quoi, puis chacune fait sa part. Seul le texte de leurs réponses est transmis aux autres, jamais le contenu des fichiers ni les résultats d’outils.',
    nom_participant: 'Nom dans la discussion', ajouter_participant: 'Ajouter un participant', salon_echanges: 'Tours de parole par IA pour le travail (après la concertation)',
    info_salon_accord: 'accord trouvé : chacune passe à sa part', info_salon_sans_accord: 'pas d’accord complet après 3 tours : chacune fait sa part de la dernière répartition',
    salon_externe: 'Un participant est externe : ce que disent les autres IA lui sera envoyé, hors du serveur.', salon_demarrer: 'Démarrer',
    salon_pause: 'Discussion terminée ({n} prise(s) de parole).', salon_pause_reste: 'Tours de parole épuisés ({n} prises de parole) alors que les IA n’avaient pas fini : écris « continuez » pour qu’elles reprennent, ou augmente les tours dans « Discussion à plusieurs ».',
    info_rien_a_ajouter: 'rien à ajouter.', refus_adresse_non_chiffree: 'Adresse en http refusée hors du serveur : utilise https.',
    code_refuse: 'Code refusé ou incomplet : rouvre la page de connexion et recolle le code en entier.',
    toi: 'toi', code_source: 'code source', pied_serveur: 'tout tourne sur ton serveur',
    se_connecter: 'Se connecter', ouvrir_lien: 'Ouvrir la page de connexion', annuler: 'Annuler', valider_code: 'Valider',
    connexion_etape_lien: 'Ouvre la page de connexion, identifie-toi avec ton compte, puis reviens ici.',
    connexion_code_a_saisir: 'Code à saisir sur la page :', code_a_coller: 'Colle ici le code donné par la page',
    connexion_attente: 'La connexion se termine toute seule une fois le code saisi sur la page.', connexion_echec: 'Connexion non aboutie',
    connexion_verification: 'Code accepté, vérification de la connexion…',
    reflechit: 'réfléchit…', verification_en_cours: 'Vérification…', se_deconnecter: 'Se déconnecter',
    confirmer_deconnexion: 'Déconnecter « {nom} » sur le serveur ? Il faudra se reconnecter pour l’utiliser.',
    compte_orchestre: '🎼 Orchestre : Claude répartit le travail', delegation: 'tâche confiée · modèle {modele}',
    refus_orchestre_claude: 'L’orchestre se dirige depuis un compte Claude.',
    info_participant_ecarte: 'ne répond pas : mis à l’écart, les autres continuent', info_participant_muet: 'muet depuis 3 minutes : mis à l’écart, les autres continuent',
    gemini_cle_aide: 'Google a fermé la connexion par compte Google personnel dans Gemini CLI. Avec une clé d’API Gemini (aistudio.google.com), Gemini garde tous ses outils. Enregistre-la, puis « Vérifier la connexion ».',
    gemini_cle_champ: 'Clé d’API Gemini', enregistrer_cle: 'Enregistrer la clé',
    copilot_cle_aide: 'Soit « Se connecter » (compte GitHub, code à saisir sur github.com), soit un jeton GitHub ayant le droit « Copilot Requests ».',
    copilot_cle_champ: 'Jeton GitHub (facultatif)', avec_outils: 'outils', avec_outils_case: 'Avec outils : un agent (Qwen Code) qui lit, modifie et lance des commandes, avec ton accord',
    aide_api_agent: 'DeepSeek, Mistral, Grok, OpenRouter, LM Studio, Ollama ou toute API compatible OpenAI. Avec outils, l’IA travaille sur les fichiers comme Claude ; sans, elle discute seulement. La clé reste sur le serveur.',
    ajouter_connexion: 'Ajouter un compte (connexion par compte)',
    defaut_non_connecte: 'Ce compte se connecte sur le serveur lui-même. Le plus simple : ajoute un compte Claude ci-dessous (« Ajouter un compte ») et connecte-le d’ici.',
    aide_connexion_compte: 'Claude, ChatGPT ou Google : tu te connectes avec ton compte, sans clé d’API. Chaque compte a son dossier sur le serveur, et tes règles (CLAUDE.md) s’y appliquent.',
    jamais_essaye: 'Branchement écrit d’après le protocole de l’outil, pas encore essayé avec un compte réel.',
    refus_connexion_refusee: 'Ce compte ne se connecte pas d’ici.', refus_code_invalide: 'Code refusé ou connexion déjà terminée.',
    info_salon_arrete: 'tour en échec, discussion arrêtée.', info_participant_parti: 'a quitté la discussion.',
    refus_adresse_invalide: 'Adresse d’API invalide (http ou https).', refus_modele_invalide: 'Indique un nom de modèle.', refus_cle_invalide: 'Clé d’API invalide.',
    refus_noms_en_double: 'Deux participants portent le même nom.', refus_salon_modele_fixe: 'À plusieurs, le modèle se choisit par participant.',
    refus_mode_refuse: 'Ce mode n’est pas permis ici.', refus_mode_sans_objet: 'Le mode ne se change pas en cours de session pour cette IA.',
    refus_trop_de_comptes: 'Trop de comptes enregistrés.', refus_compte_inconnu: 'Compte inconnu.',
  },
  en: {
    titre: 'Dev Workshop', projets: 'Projects', nouveau_projet: 'New project…', creer: 'Create',
    en_cours: 'Running sessions', historique: 'Past sessions', aucune_session: 'No session for this project yet.',
    nouvelle_session: 'New session', fermer_session: 'Close session', sans_titre: 'Untitled',
    choisir_projet: 'Pick a project on the left to get started.',
    accueil: 'Type your request: the session starts in project “{projet}”.',
    saisie: 'Type your request… ( / for commands, Shift+Enter for a new line )',
    envoyer: 'Send', arreter: 'Stop', modele: 'Model', mode: 'Mode', fournisseur: 'Account', langue: 'Language',
    mode_default: 'Manual: ask before acting', mode_acceptEdits: 'Accept edits', mode_plan: 'Plan (no changes)',
    mode_auto: 'Automatic: ask only when unsure', mode_bypassPermissions: '⚠ Allow everything (never ask)',
    modele_defaut: 'Default',
    etat_pret: 'ready', etat_non_installe: 'not installed on the server', etat_adaptateur_a_ecrire: 'not wired yet',
    contexte: 'Context', jetons: 'Tokens', conso_titre: 'Session usage',
    conso_note: 'Cost estimated by Claude Code at list price, since the session was opened. On a subscription this is not an invoice.',
    entree: 'Input', sortie: 'Output', cache_lu: 'Cache read', cache_ecrit: 'Cache write', cout: 'Estimated cost',
    fenetre: 'Window', total: 'Total', dernier_tour: 'Last turn', limite: 'Subscription limit',
    limite_five_hour: '5 hours', limite_seven_day: '7 days', limite_autre: 'current period',
    limite_retablie: 'resets on {date}', utilise: 'used',
    reflexion: 'Thinking', sous_agent: 'Subagent', resultat: 'Result', erreur: 'Error', en_attente: 'running…',
    tour_fini: 'Done in {duree} · {appels} model call(s)', tour_echec: 'Turn stopped: {motif}',
    info_compactage: 'Summarizing the conversation…', info_compacte: 'Conversation summarized to free up context.',
    perm_titre: '{outil} needs your approval', autoriser: 'Allow', toujours: 'Always allow', refuser: 'Deny',
    motif: 'Say why (optional)', repondre: 'Answer', autre: 'Other answer…',
    plan_titre: 'Proposed plan', approuver: 'Approve plan',
    cmd_aucune: 'No matching command.', cmd_non_traduite: 'original description',
    jeton_titre: 'Workshop access', jeton_aide: 'Paste the access token shown when the server starts (or open the full link).',
    jeton_champ: 'Access token', entrer: 'Enter', jeton_refuse: 'Token rejected.',
    connexion_perdue: 'Connection lost, retrying…', session_fermee: 'Session closed.',
    refus: 'Request refused: {code}',
    refus_dossier_hors_racine: 'Folder outside the projects root.', refus_trop_de_sessions: 'Too many open sessions: close one.',
    refus_nom_invalide: 'Invalid project name (letters, digits, dashes).', refus_session_inconnue: 'This session no longer exists.',
    refus_fournisseur_indisponible: 'This AI is not available on the server.',
    lignes: '{n} line(s)', copier: 'Copy', copie: 'Copied',
    comptes: 'Accounts', compte_defaut: 'Claude (server account)', type_api: 'OpenAI-compatible server', fermer: 'Close',
    verifier: 'Check sign-in', connecte: 'Signed in', non_connecte: 'Not signed in', externe: 'external', local: 'local',
    cle_presente: 'key stored ({n} characters)', cle_absente: 'no key', supprimer: 'Remove',
    supprimer_compte: 'Remove account “{nom}” from the list?',
    ajouter_api: 'Add an AI by address', aide_api: 'LM Studio, Ollama or an OpenAI-compatible API. These AIs can talk but do not touch files. The key, if any, stays on the server.',
    nom_compte: 'Account name', nom_modele: 'Model name', cle_api: 'API key (optional for local)', choisir_service: 'Start from a known service…', ajouter: 'Add',
    salon_bouton: 'Group discussion', salon_titre: 'Discussion between several AIs',
    salon_aide: 'No leader: the AIs first discuss (without changing anything) until they agree on who does what, then each does its part. Only the text of their answers is passed on, never file contents or tool results.',
    nom_participant: 'Name in the discussion', ajouter_participant: 'Add a participant', salon_echanges: 'Speaking turns per AI for the work (after the discussion)',
    info_salon_accord: 'agreement reached: each one moves on to its part', info_salon_sans_accord: 'no full agreement after 3 rounds: each does its part of the latest split',
    salon_externe: 'One participant is external: what the other AIs say will be sent to it, outside the server.', salon_demarrer: 'Start',
    salon_pause: 'Discussion over ({n} speaking turn(s)).', salon_pause_reste: 'Speaking turns used up ({n}) before the AIs were done: type “carry on” to let them resume, or raise the turns in “Group discussion”.',
    info_rien_a_ajouter: 'nothing to add.', refus_adresse_non_chiffree: 'Plain http refused outside the server: use https.',
    code_refuse: 'Code rejected or incomplete: reopen the sign-in page and paste the whole code again.',
    toi: 'you', code_source: 'source code', pied_serveur: 'everything runs on your server',
    se_connecter: 'Sign in', ouvrir_lien: 'Open the sign-in page', annuler: 'Cancel', valider_code: 'Submit',
    connexion_etape_lien: 'Open the sign-in page, log in with your account, then come back here.',
    connexion_code_a_saisir: 'Code to enter on the page:', code_a_coller: 'Paste the code given by the page here',
    connexion_attente: 'Sign-in completes by itself once the code is entered on the page.', connexion_echec: 'Sign-in did not complete',
    connexion_verification: 'Code accepted, checking the sign-in…',
    reflechit: 'thinking…', verification_en_cours: 'Checking…', se_deconnecter: 'Sign out',
    confirmer_deconnexion: 'Sign “{nom}” out on the server? You will need to sign in again to use it.',
    compte_orchestre: '🎼 Orchestra: Claude shares out the work', delegation: 'task handed over · model {modele}',
    refus_orchestre_claude: 'The orchestra is led from a Claude account.',
    info_participant_ecarte: 'not answering: set aside, the others carry on', info_participant_muet: 'silent for 3 minutes: set aside, the others carry on',
    gemini_cle_aide: 'Google closed personal Google-account sign-in in Gemini CLI. With a Gemini API key (aistudio.google.com), Gemini keeps all its tools. Save it, then “Check connection”.',
    gemini_cle_champ: 'Gemini API key', enregistrer_cle: 'Save the key',
    copilot_cle_aide: 'Either “Sign in” (GitHub account, code to enter on github.com), or a GitHub token with the “Copilot Requests” permission.',
    copilot_cle_champ: 'GitHub token (optional)', avec_outils: 'tools', avec_outils_case: 'With tools: an agent (Qwen Code) that reads, edits and runs commands, with your approval',
    aide_api_agent: 'DeepSeek, Mistral, Grok, OpenRouter, LM Studio, Ollama or any OpenAI-compatible API. With tools, the AI works on files like Claude; without, it only chats. The key stays on the server.',
    ajouter_connexion: 'Add an account (account sign-in)',
    defaut_non_connecte: 'This account signs in on the server itself. Simplest: add a Claude account below (“Add an account”) and sign it in from here.',
    aide_connexion_compte: 'Claude, ChatGPT or Google: you sign in with your account, no API key. Each account has its own folder on the server, and your rules (CLAUDE.md) apply to it.',
    jamais_essaye: 'Wired from the tool’s protocol, not yet tried with a real account.',
    refus_connexion_refusee: 'This account cannot be signed in from here.', refus_code_invalide: 'Code rejected or sign-in already finished.',
    info_salon_arrete: 'turn failed, discussion stopped.', info_participant_parti: 'left the discussion.',
    refus_adresse_invalide: 'Invalid API address (http or https).', refus_modele_invalide: 'Enter a model name.', refus_cle_invalide: 'Invalid API key.',
    refus_noms_en_double: 'Two participants share the same name.', refus_salon_modele_fixe: 'In a group, the model is set per participant.',
    refus_mode_refuse: 'This mode is not allowed here.', refus_mode_sans_objet: 'The mode cannot be changed mid-session for this AI.',
    refus_trop_de_comptes: 'Too many accounts stored.', refus_compte_inconnu: 'Unknown account.',
  },
};

export const LANGUES = { fr: 'Français', en: 'English' };

function lire(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}

let courante = lire('devworkshop.langue');
if (!TEXTES[courante]) courante = (navigator.language || 'fr').startsWith('en') ? 'en' : 'fr';

export const langue = () => courante;

/** Le changement de langue recharge la page : la session se rejoue depuis le serveur, rien n'est perdu. */
export function changerLangue(code) {
  if (!TEXTES[code] || code === courante) return;
  try { localStorage.setItem('devworkshop.langue', code); } catch { /* stockage indisponible */ }
  location.reload();
}

export function t(cle, valeurs = {}) {
  const modele = TEXTES[courante][cle] ?? TEXTES.fr[cle] ?? cle;
  return modele.replace(/\{(\w+)\}/g, (_, nom) => valeurs[nom] ?? '');
}

export const aTexte = (cle) => cle in TEXTES[courante];

/** Un module apporte ses propres textes ({ fr: {…}, en: {…} }), au chargement, avant traduirePage. */
export function ajouterTextes(textes) {
  for (const code of Object.keys(TEXTES)) Object.assign(TEXTES[code], textes[code] || {});
}

/** Applique les textes aux éléments statiques marqués data-i18n / data-i18n-attr="attribut:cle". */
export function traduirePage(racine = document) {
  document.documentElement.lang = courante;
  for (const el of racine.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of racine.querySelectorAll('[data-i18n-attr]')) {
    const [attribut, cle] = el.dataset.i18nAttr.split(':');
    el.setAttribute(attribut, t(cle));
  }
}
