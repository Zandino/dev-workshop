# Privacy policy / Politique de confidentialité

*Français plus bas.*

Dev Workshop has no analytics, no telemetry and no account with us. The project runs no server of its own: nothing is
sent to the Dev Workshop authors.

## Desktop app (`bureau/`)

- **Your servers.** The app connects, over your system `ssh`, only to the servers you add yourself. Their list is kept
  in your user data folder, on your computer.
- **Update checks.** On Windows and Linux (AppImage), the app contacts `github.com` at start and every six hours to see
  whether a newer release exists, and downloads it from GitHub if so. GitHub receives what any web request carries
  (your IP address, the app version in the request). GitHub's own privacy statement applies:
  <https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>.
  **To turn it off:** untick « Check for updates » at the bottom of the app's home window. You can still check by hand
  from Help › Check for updates. On macOS the app never checks on its own.
- **Links** from the workshop open in your usual web browser.

## Server (`serveur/`)

The server runs on your own machine. It sends your messages, and the files you attach or let an AI read, only to the
AI services whose accounts or keys you connect (Anthropic, OpenAI, Google, GitHub, or the API address you enter), and
it starts only the connectors (MCP servers) you add. Each of those services has its own privacy policy. Starting a
connector with `npx` downloads its package from the npm registry.

---

## Français

Dev Workshop n'a ni mesure d'audience, ni télémétrie, ni compte chez nous. Le projet n'a aucun serveur à lui : rien
n'est envoyé à ses auteurs.

### Logiciel de bureau (`bureau/`)

- **Tes serveurs.** Le logiciel se connecte, par le `ssh` du système, aux seuls serveurs que tu ajoutes. Leur liste
  reste sur ton poste, dans ton dossier d'application.
- **Mises à jour.** Sous Windows et Linux (AppImage), le logiciel interroge `github.com` au démarrage puis toutes les
  six heures pour savoir s'il existe une nouvelle version, et la télécharge depuis GitHub le cas échéant. GitHub reçoit
  ce que porte toute requête web (adresse IP, version du logiciel). La politique de confidentialité de GitHub
  s'applique (lien ci-dessus).
  **Pour la couper :** décocher « Vérifier les mises à jour » en bas de la fenêtre d'accueil. La vérification reste
  possible à la main (Aide › Rechercher des mises à jour). Sous macOS, le logiciel ne vérifie jamais de lui-même.
- **Les liens** de l'atelier s'ouvrent dans ton navigateur habituel.

### Serveur (`serveur/`)

Le serveur tourne sur ta machine. Il envoie tes messages, et les fichiers joints ou lus par une IA, aux seuls services
d'IA dont tu branches le compte ou la clé (Anthropic, OpenAI, Google, GitHub, ou l'adresse d'API que tu indiques), et
ne démarre que les connecteurs (serveurs MCP) que tu ajoutes. Chacun a sa propre politique de confidentialité. Démarrer
un connecteur avec `npx` télécharge son paquet depuis le registre npm.
