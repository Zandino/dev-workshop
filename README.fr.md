# Dev Workshop — L'atelier des dev

Interface graphique, dans le navigateur, pour développer avec des IA depuis un serveur : conversation en direct,
cartes d'outils et diffs, demandes d'accord, jauge de contexte et consommation de jetons, reprise des sessions,
commandes « / » cherchables. Plusieurs comptes (Claude, API compatibles OpenAI) et discussions entre IA.
Interface en français ou en anglais.

Tout tourne sur le serveur : les comptes y sont connectés une fois, l'écran ne fait qu'afficher.

Logiciel libre, développé par l'équipe Deltinfo Studio et publié sous licence Apache 2.0. État : version 0.7, jeune ; lire « Limites
connues » avant de s'en servir.

> **In English.** Dev Workshop is a self-hosted web interface for coding with AI agents (Claude Code, OpenAI Codex,
> Gemini CLI, plus any OpenAI-compatible server such as LM Studio or Ollama) from a server. Accounts sign in once on
> the server; every command and file change comes back to the screen for approval; several agents can discuss the
> same question. The interface is available in French and English. The documentation below is in French.

## Lancer

```bash
git clone <adresse du dépôt> dev-workshop
cd dev-workshop
npm install
npm start
```

Le serveur écoute sur `127.0.0.1:5330` **uniquement**. Lancé dans un terminal, il affiche le lien d'accès complet
(avec le jeton). Depuis le poste :

- VS Code Remote-SSH : onglet « Ports », rediriger le port 5330, puis ouvrir le lien affiché ;
- ou `ssh -L 5330:127.0.0.1:5330 <serveur>`, puis ouvrir le lien affiché.

Il faut Node.js 20 ou plus récent, et Claude Code connecté sur le serveur pour le compte par défaut.

### Logiciel de bureau (Windows ; macOS et Linux à venir)

Le dossier `bureau/` contient un logiciel (Electron) qui évite le terminal : on enregistre son serveur une fois
(alias SSH ou `utilisateur@adresse`, dossier de Dev Workshop sur le serveur), puis « Se connecter » :

1. le logiciel se connecte par SSH avec le client du système (`ssh`), donc avec les clés, l'agent, la configuration et
   les hôtes connus de la personne : il ne lit jamais une clé privée ni un mot de passe, et ne saute jamais la
   vérification de l'hôte (un serveur inconnu se valide une fois dans un terminal) ;
2. si Dev Workshop ne répond pas sur le serveur, il le démarre, détaché (il continue de tourner quand le logiciel se
   ferme ; journal dans `~/.config/dev-workshop/serveur.log`) ;
3. il lit le jeton d'accès sur le serveur, par cette même liaison SSH, et le garde en mémoire : il n'est ni affiché, ni
   écrit sur le disque du poste (la fenêtre de l'atelier n'a qu'un stockage en mémoire, vidé à la fermeture). C'est
   une exception assumée à « le lien n'apparaît que dans un terminal » : il ne sort que vers la personne qui a déjà
   la main sur le serveur par SSH ;
4. il ouvre un tunnel SSH vers `127.0.0.1:5330` et affiche l'atelier dans sa propre fenêtre.

**Premier branchement.** Le bouton « Guide de démarrage » accompagne pas à pas : il trouve la clé SSH du poste ou en
crée une (ed25519, sans phrase secrète, dans `~/.ssh`), ouvre un terminal qui la dépose sur le serveur (c'est là, et
seulement là, que la personne tape le mot de passe du serveur et valide son empreinte ; sous macOS et Linux, une
commande `ssh-copy-id` est proposée), puis teste la connexion.

**Installation sur le serveur.** Si Dev Workshop n'est pas dans le dossier indiqué, « Installer sur ce serveur »
l'installe dans le compte de la personne, sans droits d'administrateur (`bureau/src/installer.sh`) : Node.js 22
depuis nodejs.org s'il manque (version figée, empreinte SHA-256 vérifiée), le code de la version du logiciel depuis
GitHub, puis `npm ci`. En option, une ligne `@reboot` ajoutée au crontab relance Dev Workshop quand le serveur
redémarre. Rien n'est écrasé : un dossier non vide qui n'est pas Dev Workshop est refusé. Linux seulement.

La page du serveur n'a aucun accès au poste (pas de Node, pas de pont) ; ses liens s'ouvrent dans le navigateur.
Les serveurs enregistrés sont rangés dans le dossier d'application de la personne, jamais dans le projet.

```bash
cd bureau
npm install
npx install-electron   # télécharge Electron (cette version ne le fait plus à l'installation)
npm start              # lancer depuis les sources
npm run dist           # fabriquer l'installeur Windows (bureau/dist/)
```

**Télécharger.** Les installeurs (Windows, macOS, Linux en AppImage) sont fabriqués par GitHub Actions à partir de ce
dépôt, à chaque version, et déposés dans les « Releases » du projet (`.github/workflows/bureau.yml`).

**Pas encore signés.** Windows affiche un avertissement SmartScreen au premier lancement (« Informations
complémentaires », puis « Exécuter quand même ») ; si le « Contrôle intelligent des applications » de Windows 11 est
actif, il bloque le logiciel sans proposer de passer outre. Sous macOS, le premier lancement demande une autorisation
dans Réglages système › Confidentialité et sécurité. Une signature gratuite pour logiciels libres est demandée.

**Mises à jour.** Sous Windows et en AppImage, le logiciel vérifie les nouvelles versions au démarrage puis toutes les
six heures, les télécharge, contrôle leur empreinte (sha512) et propose de redémarrer ; rien ne s'installe sans
accord. Cette vérification contacte `github.com` ; elle se coupe en bas de la fenêtre d'accueil (voir `PRIVACY.md`). Sous macOS (non signé), il indique seulement la page des versions (menu Aide › Rechercher des mises à jour).

Variables : `DEVWORKSHOP_PORT` (5330 par défaut), `DEVWORKSHOP_ROOT` (racine des projets, `~/dev` par défaut).

## Comptes

Bouton « Comptes » de l'en-tête. Réglages dans `~/.config/dev-workshop/` (`DEVWORKSHOP_CONFIG` pour un autre dossier).

**Connexion par compte**, sans clé d'API : on ajoute un compte, on clique « Se connecter », la page de connexion du
fournisseur s'ouvre dans le navigateur, et l'outil officiel range la connexion dans le dossier du compte
(`comptes/<id>`). Autant de comptes qu'on veut par fournisseur.

| Compte | Outil piloté | Connexion | État |
| --- | --- | --- | --- |
| Claude (compte du serveur) | Claude Code, `~/.claude` | déjà faite, non modifiable d'ici | essayé |
| Claude (autres comptes) | Claude Code, `CLAUDE_CONFIG_DIR` | lien, puis code à coller | lien essayé, connexion complète non |
| ChatGPT | `codex app-server`, `CODEX_HOME` | lien + code à saisir sur la page | lien essayé, aucun tour réel |
| Gemini | `gemini --acp`, `GEMINI_CLI_HOME` | lien, puis code à coller | lien essayé, aucun tour réel |

Ces trois outils **agissent** (fichiers, commandes). Par défaut (mode manuel), chaque action revient à l'écran pour
accord. Le mode se choisit session par session : manuel, automatique (Claude : un classifieur valide et ne demande
qu'en cas de doute), accepter les modifications, plan, et « tout autoriser » (aucune demande : Claude
`bypassPermissions`, Codex `approvalPolicy: never`, Gemini `yolo`). Ce dernier se confirme à l'écran et reste signalé
en rouge tant qu'il est actif ; avec Codex, les écritures restent bornées au dossier du projet. Les règles de
`~/.claude/CLAUDE.md` sont transmises à tous : consigne ajoutée pour les autres comptes Claude et pour Codex, fichier
`GEMINI.md` du compte pour Gemini. Les autres comptes démarrent sans les compétences, plugins et connecteurs du compte
du serveur.

Le lien et les codes de connexion ne sont envoyés qu'à l'écran qui les demande : ni journal, ni rejeu. Les fichiers
d'identifiants des outils ne sont jamais lus par l'devworkshop.

**IA par adresse** (serveur compatible OpenAI) : LM Studio, Ollama, ou une API avec clé. Adresse, modèle et clé
éventuelle. Le `http` n'est accepté que sur le serveur ou le réseau privé (LM Studio sur un poste du réseau, par
exemple) ; ailleurs il faut `https`. La clé est rangée dans `cles/<id>` et ne ressort plus : l'écran n'en connaît
que la longueur. Ces IA **discutent mais n'agissent pas**. Jetons affichés tels que renvoyés ; ni coût ni taille de
fenêtre, faute de source.

Retirer un compte efface sa clé d'API ; le dossier de connexion d'un compte est laissé en place.

## Discussion à plusieurs

Bouton « Discussion à plusieurs » : deux à quatre participants (compte, modèle, nom), qui peuvent être plusieurs
fois le même compte. Sur chaque demande, les IA parlent à tour de rôle, jamais en même temps, puis s'arrêtent :

- le nombre de tours de parole par IA et par demande est borné (2 par défaut, 6 au plus) ; une IA qui n'a rien à
  ajouter passe son tour, et la discussion s'arrête quand plus personne n'a rien à dire ;
- seul le **texte final** d'une réponse est transmis aux autres : jamais les résultats d'outils ni le contenu des
  fichiers. Un participant « externe » (API hors du serveur) reçoit donc ce que disent les autres IA ; l'écran le
  signale avant de démarrer ;
- chaque message relayé est signé ; la consigne dit à chaque IA qu'un autre participant n'est pas l'utilisateur ;
- le mode reste « demander avant d'agir » (ou « plan ») : chaque demande d'accord revient à l'écran, signée ;
- « Arrêter » coupe la discussion ; un tour en échec l'arrête aussi.

## Sécurité

Cette page donne la main sur le serveur (commandes, fichiers). Les garde-fous sont côté serveur :

- écoute locale seulement, pas d'exposition réseau. L'atelier n'a ni comptes d'utilisateurs ni chiffrement : il
  est fait pour une personne, derrière une redirection de port. Ne pas l'exposer tel quel sur un réseau ;
- jeton d'accès aléatoire (`~/.config/dev-workshop/jeton`, lisible par le seul propriétaire), exigé à l'ouverture
  du canal ; il n'est jamais écrit dans un journal ;
- contrôle des en-têtes `Host` et `Origin` : une autre page ouverte dans le navigateur ne peut pas piloter le port ;
- projets bornés à la racine (`~/dev`), liens symboliques compris ;
- les clés d'API ne sont jamais renvoyées à l'écran ni écrites dans un journal ;
- le contournement complet des permissions n'est pas proposé ; les modes offerts sont « demander avant d'agir »,
  « accepter les modifications » et « plan » ;
- les règles de `~/.claude/CLAUDE.md` et des `CLAUDE.md` de projet s'appliquent aux sessions ouvertes ici
  (`settingSources` : utilisateur, projet, local) ;
- tout texte venu du modèle ou d'un outil est affiché en texte brut ou en Markdown assaini (DOMPurify), sous une
  politique de contenu stricte (aucun script ni style en ligne).

## Jetons et coût

Tous les chiffres viennent de Claude Code, sans table de prix dans ce dépôt : occupation du contexte, jetons
d'entrée, de sortie, de cache lu et écrit par modèle, coût estimé au tarif public depuis l'ouverture de la session,
limite de l'abonnement quand elle est signalée. Avec un abonnement, le coût affiché n'est pas une facture.

## Organisation

```
serveur/index.mjs                 serveur HTTP (fichiers) + WebSocket
serveur/securite.mjs              jeton, origine, dossiers bornés, en-têtes
serveur/canal.mjs                 ordres reçus de l'écran
serveur/sessions.mjs              sessions vivantes, journal rejoué à la reconnexion
serveur/comptes.mjs               comptes et clés d'API
serveur/connexion.mjs             connexion par compte (lien relayé à l'écran)
serveur/salon.mjs                 discussion à plusieurs (tours de parole, relais)
serveur/fournisseurs/             claude.mjs, codex.mjs, gemini.mjs (agents), api.mjs (serveur compatible OpenAI)
public/                           la page, sans étape de construction
public/js/i18n.js                 textes français et anglais
public/js/commandes.js            descriptions traduites des commandes « / »
tests/parcours.mjs                parcours du canal (sécurité, permission, compteurs)
tests/ecran.mjs                   la vraie page dans un navigateur simulé, sur le vrai serveur
```

Une discussion continue de tourner si l'onglet se ferme ; elle apparaît en tête de la liste « Discussions » de son
projet (ou dans « Ouvertes dans d'autres projets ») et se rejoue à la reconnexion. Elle s'arrête avec le serveur et
reste reprenable depuis la liste de son projet.

## Discussions et fiche du projet

- Chaque projet liste ses discussions, les plus récentes en haut. « Toutes les discussions » les montre tous projets
  confondus, avec une recherche dans les titres.
- « Ranger » déplace une discussion dans un autre projet, créé au passage si besoin : elle y reprend avec la fiche de
  ce projet. Refusé si elle est ouverte, interrompue ou à la corbeille. Le SDK de Claude Code ne sait pas déplacer une
  session : Dev Workshop recopie lui-même son fichier dans le dossier de Claude du nouveau projet (dossier de travail
  réécrit, date et sous-agents conservés), puis ne retire l'original, par le SDK, qu'une fois la copie reconnue.
  C'est le seul endroit où il écrit dans les fichiers de Claude Code.
- La fiche du projet (réglages ⚙) est donnée à toutes les IA au début de chaque discussion du projet. Dans une
  discussion, « Retenir pour le projet » demande à l'IA ce qu'il faut garder ; tu relis et corriges, et rien n'est
  ajouté à la fiche sans ton clic.
- Toutes les discussions ouvertes se suivent en direct dans la barre, même quand tu en regardes une autre : ✋ elle a
  besoin de toi (un accord à donner), pastille qui pulse elle travaille, titre en gras elle a fini sans que tu l'aies
  vue (rouge : en échec), verte elle attend ton message. Un projet replié montre la ✋ de ses discussions. Fenêtre au
  premier plan, une bulle cliquable ouvre la discussion qui t'appelle ; en arrière-plan, c'est une notification du
  système. Le logiciel de bureau pose une main levée sur son icône de la barre des tâches (l'icône clignote à chaque
  nouvelle demande). La page n'ayant aucun accès au poste, elle l'annonce dans son titre (« ✋ 2 · Dev Workshop »),
  que le logiciel lit.

## Dictée

- 🎤 à côté de « Envoyer » : un clic écoute, un second clic arrête, Échap annule. Le texte s'ajoute dans la zone de
  saisie, là où est le curseur ; tu le relis, rien ne part sans ton clic. 3 minutes au plus par dictée.
- Moteur, en bas de la barre latérale : **Whisper sur le serveur** (open source, gratuit, la voix ne quitte pas le
  serveur), « rapide » (whisper-small) ou « précis » (whisper-large-v3-turbo), ou **un compte API** déjà déclaré
  (OpenAI, Groq, Mistral… par leur route `/audio/transcriptions` ; la voix part chez eux).
- Whisper ne fait pas partie de l'installation de base : au premier 🎤, Dev Workshop propose de l'installer dans le
  dossier des réglages (Transformers.js et ONNX Runtime, ~750 Mo, sans sudo), puis télécharge le modèle à son premier
  usage (~250 Mo pour « rapide », ~1,1 Go pour « précis »). Relevé sur 4 cœurs de Ryzen 7700X, pour 10 s de voix :
  « rapide » 2,3 s et ~1,2 Go de mémoire, « précis » 4,5 s et ~2,8 Go. Le modèle est libéré après 10 minutes sans
  dictée.
- Il faut une adresse sûre (le logiciel de bureau, ou `localhost` par le tunnel) ; dans un navigateur, il demande
  l'accès au micro.

## Essais

Le serveur doit tourner. Chaque essai fait un tour réel sur le petit modèle :

```bash
DEVWORKSHOP_PORT=5330 node tests/parcours.mjs <projet>
DEVWORKSHOP_PORT=5330 node tests/ecran.mjs <projet> fr     # ou en
DEVWORKSHOP_PORT=5330 node tests/avance.mjs <projet>       # question de Claude, arrêt, cumul, reprise
DEVWORKSHOP_PORT=5330 node tests/salon.mjs <projet>        # comptes, API (faux serveur local), salon
DEVWORKSHOP_PORT=5330 node tests/connexion.mjs <projet>    # connexion par compte jusqu'au lien, sans appel au modèle
```

Les discussions (liste, « Ranger », « Retenir ») s'essaient sans modèle, mais en écrivant dans le dossier de Claude
Code : sur un serveur lancé avec un `HOME` jetable sous `/tmp` (l'essai refuse sinon), avec les mêmes `HOME`,
`DEVWORKSHOP_CONFIG`, `DEVWORKSHOP_ROOT` et `DEVWORKSHOP_PORT` des deux côtés :

```bash
node tests/discussions.mjs prepare        # avant de lancer le serveur : fabrique des discussions factices
node tests/discussions.mjs                # canal : liste, déplacement et ses refus, fiche
node tests/ecran-discussions.mjs          # la vraie page (sur des discussions refabriquées)
node tests/alertes.mjs <projet>           # alertes : règle, canal (fausse API locale), vraie page ; sans modèle
node tests/dictee.mjs <projet> voix.wav "mots attendus"   # dictée : Whisper (installé si besoin), API factice, page
```

Les essais créent des comptes : les lancer avec `DEVWORKSHOP_CONFIG` sur un dossier d'essai, côté serveur et côté
essai. `tests/salon.mjs` joue l'API avec un faux serveur local : aucune API réelle n'y est appelée.

`tests/ecran.mjs` vérifie le comportement de la page, pas sa mise en page : il n'y a pas de navigateur sur le serveur.

## Brancher une autre IA

Ajouter `serveur/fournisseurs/<nom>.mjs` qui exporte `ouvrir({ compte, dossier, modele, mode, reprise, consigne },
emettre)` et renvoie `{ envoyer, interrompre, reglerModele, reglerMode, repondrePermission, fermer }`, puis le
déclarer dans `serveur/fournisseurs/index.mjs` sous un type de compte. Événements à émettre (champ `t`) :

| `t` | Contenu |
| --- | --- |
| `pret` | `sessionId`, `modele`, `mode`, `dossier` |
| `capacites` | `modeles` [{ id, nom }], `commandes` [{ nom, description, argument }] |
| `utilisateur` | `texte` |
| `delta` | `genre` (`texte` ou `reflexion`), `texte` |
| `assistant` | `blocs` (texte, reflexion, outil), `usage`, `sousAgent` |
| `resultat_outil` | `id`, `contenu`, `erreur` |
| `permission` / `permission_fin` | `id`, `outil`, `entree`, `titre`, `description`, `toujours` |
| `tour` | `ok`, `dureeMs`, `appels`, `coutSession`, `modeles` (jetons par modèle) |
| `contexte` | `utilises`, `max`, `pourcent` |
| `limite` | `statut`, `type`, `utilisation`, `retablieLe` |
| `etat` | `occupe`, `mode`, `modele`, `ferme` |

Codex et Gemini CLI sont installés avec le projet, en versions figées (`package.json`) : leurs adaptateurs lisent
leurs protocoles, une montée de version se fait donc avec un essai.

## Limites connues (v0.7)

- les discussions enregistrées, leur reprise et « Ranger » ne concernent que le compte Claude du serveur ;
- pas encore essayés de bout en bout avec un vrai modèle : « Retenir pour le projet », et la reprise par Claude
  d'une discussion rangée (l'essai vérifie que son historique est relu depuis le nouveau projet) ;
- jamais essayé avec un compte réel : une connexion menée à son terme, un tour de Codex ou de Gemini (adaptateurs
  écrits d'après leurs protocoles), une vraie API ou un vrai LM Studio ; le bac à sable de Codex démarre
  bien dans ce conteneur (essai d'écriture bloquée), mais n'a pas été vu sur un vrai tour ;
- Codex : le mode (normal ou plan, en lecture seule) se choisit à l'ouverture de la session ;
- une session Codex ou Gemini envoie chez OpenAI ou Google ce que l'outil lit dans le projet : à réserver aux
  projets où c'est acceptable ;
- LM Studio : l'adresse `localhost` désigne le serveur ; pour un LM Studio sur un poste, donner l'adresse du poste
  et activer son écoute réseau ;
- Gemini et Codex n'indiquent pas de coût ; Gemini n'indique pas de jetons par tour ;

- pas d'images ni de pièces jointes dans la saisie ;
- pas d'explorateur de fichiers ni d'éditeur ; les modifications se lisent dans les cartes d'outils ;
- quelques commandes « / » propres au terminal (couleur, vue épurée…) n'ont pas d'effet ici ;
- les commandes des compétences et des plugins gardent leur description d'origine, signalée comme telle ;
- dictée : essayée avec une voix de synthèse (Windows) et le faux micro de Chromium, pas encore avec une vraie voix
  au micro ; « précis » n'a été mesuré qu'en dehors du serveur ;
- onnxruntime écrit dans le journal du serveur des lignes « pthread_setaffinity_np failed » au chargement du modèle :
  sans conséquence (le conteneur limite les cœurs).

## Licence et dépendances

Dev Workshop est distribué sous licence Apache 2.0 (fichier `LICENSE`), © Deltinfo Studio.

Il pilote des outils qui gardent chacun leur licence et leurs conditions d'usage, et qui demandent chacun un compte
chez leur éditeur :

| Outil | Licence |
| --- | --- |
| Claude Agent SDK et Claude Code (Anthropic) | conditions commerciales d'Anthropic, non libre |
| Codex (OpenAI) | Apache 2.0 |
| Gemini CLI (Google) | Apache 2.0 |
| ws, marked, jsdom | MIT |
| DOMPurify | MPL 2.0 ou Apache 2.0 |
| Dictée, installée à la demande : Transformers.js / ONNX Runtime / modèles Whisper | Apache 2.0 / MIT / MIT |

Dev Workshop n'est affilié ni à Anthropic, ni à OpenAI, ni à Google. Les noms de leurs produits leur appartiennent.

## Code signing policy (politique de signature)

Les versions Windows du logiciel de bureau doivent être signées gratuitement par [SignPath.io](https://signpath.io),
avec un certificat de la [SignPath Foundation](https://signpath.org) (demande en cours ; d'ici là, elles ne sont pas
signées). Seuls les fichiers fabriqués par GitHub Actions à partir de ce dépôt (`.github/workflows/bureau.yml`) sont
signés, et chaque version est approuvée à la main avant signature.

- Auteurs et relecteurs : [Zandino](https://github.com/Zandino). Les contributions extérieures (demandes de fusion)
  sont relues avant d'être fusionnées.
- Approbateurs : [Zandino](https://github.com/Zandino).

Confidentialité : voir [PRIVACY.md](PRIVACY.md). Le logiciel de bureau ne contacte que les serveurs SSH que tu ajoutes
et, pour les mises à jour, `github.com` (désactivable).

## Contribuer, signaler une faille

Voir `CONTRIBUTING.md` et `SECURITY.md`.
