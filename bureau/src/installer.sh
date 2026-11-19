# Lancé sur le serveur par le logiciel de bureau, par SSH (sh -s), quand la personne clique « Installer ».
# Installe Dev Workshop sans droits d'administrateur : Node.js s'il manque (version figée, empreinte vérifiée),
# le code de la version publiée sur GitHub, ses dépendances, et, si demandé, le démarrage automatique (crontab).
# Ne supprime ni n'écrase jamais rien : un dossier non vide qui n'est pas Dev Workshop est refusé.
# Valeurs posées en tête par le logiciel : DW_DOSSIER, DW_PORT, DW_RACINE, DW_REF, DW_AUTO (1 ou 0), et pour les
# essais seulement DW_ARCHIVE (archive locale sur le serveur, à la place du téléchargement).
# Sorties lues par le logiciel, une par ligne : ETAT:…, AVERTISSEMENT:…, ERREUR:…, JOURNAL:…, FIN:ok.
# Tout le travail est dans une fonction appelée à la dernière ligne : un script reçu à moitié ne fait rien, et les
# commandes lancées (npm, curl, tar) ne peuvent pas lire la suite du script sur l'entrée standard.

installer() {
  NODE_VERSION=v22.23.5
  NODE_SHA_X64=c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1
  NODE_SHA_ARM64=8bd3dc69eee8f3f226315a80d7d1d4faccf217a4c8fae500168ac2e38f3bdba3
  DEPOT=https://codeload.github.com/Zandino/dev-workshop/tar.gz/refs/tags

  [ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1 </dev/null
  PATH="$HOME/.local/bin:$HOME/bin:$PATH"
  export PATH
  case "$DW_DOSSIER" in "~/"*) DW_DOSSIER="$HOME/${DW_DOSSIER#\~/}" ;; esac
  case "$DW_RACINE" in "~/"*) DW_RACINE="$HOME/${DW_RACINE#\~/}" ;; esac
  CONFIG="${DEVWORKSHOP_CONFIG:-$HOME/.config/dev-workshop}"
  TRAVAIL=$(mktemp -d 2>/dev/null) || { echo "ERREUR:inattendu"; return 1; }
  trap 'rm -rf "$TRAVAIL"' EXIT

  echo "ETAT:verification"
  [ "$(uname -s)" = Linux ] || { echo "ERREUR:systeme"; return 1; }
  case "$(uname -m)" in
    x86_64 | amd64) ARCH=x64; NODE_SHA=$NODE_SHA_X64 ;;
    aarch64 | arm64) ARCH=arm64; NODE_SHA=$NODE_SHA_ARM64 ;;
    *) echo "ERREUR:processeur"; return 1 ;;
  esac
  for outil in tar gzip; do command -v "$outil" >/dev/null 2>&1 || { echo "ERREUR:outil_absent"; echo "JOURNAL:$outil"; return 1; }; done
  if command -v curl >/dev/null 2>&1; then telecharger() { curl -fsSL --retry 2 -o "$2" "$1" </dev/null; }
  elif command -v wget >/dev/null 2>&1; then telecharger() { wget -q -O "$2" "$1" </dev/null; }
  else echo "ERREUR:outil_absent"; echo "JOURNAL:curl / wget"; return 1; fi
  command -v script >/dev/null 2>&1 || echo "AVERTISSEMENT:script_absent"
  mkdir -p "$HOME/.local/bin" "$HOME/.local/share/dev-workshop" "$CONFIG" && chmod 700 "$CONFIG"
  libre=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
  [ -n "$libre" ] && [ "$libre" -lt 3000000 ] && { echo "ERREUR:place"; return 1; }

  echo "ETAT:node"
  majeur=$(node -v 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')
  if [ -n "$majeur" ] && [ "$majeur" -ge 20 ]; then
    echo "ETAT:node_present"
  else
    if ls /lib/ld-musl-* >/dev/null 2>&1; then echo "ERREUR:musl"; return 1; fi
    nom="node-$NODE_VERSION-linux-$ARCH"
    cible="$HOME/.local/share/dev-workshop/$nom"
    if [ ! -x "$cible/bin/node" ]; then
      telecharger "https://nodejs.org/dist/$NODE_VERSION/$nom.tar.gz" "$TRAVAIL/node.tar.gz" || { echo "ERREUR:telechargement"; echo "JOURNAL:nodejs.org"; return 1; }
      if command -v sha256sum >/dev/null 2>&1; then calcule=$(sha256sum "$TRAVAIL/node.tar.gz" | cut -d' ' -f1)
      else calcule=$(shasum -a 256 "$TRAVAIL/node.tar.gz" | cut -d' ' -f1); fi
      [ "$calcule" = "$NODE_SHA" ] || { echo "ERREUR:empreinte"; return 1; }
      tar -xzf "$TRAVAIL/node.tar.gz" -C "$HOME/.local/share/dev-workshop" </dev/null || { echo "ERREUR:inattendu"; return 1; }
    fi
    for b in node npm npx; do ln -sf "$cible/bin/$b" "$HOME/.local/bin/$b"; done
    hash -r 2>/dev/null
    echo "ETAT:node_installe"
  fi

  echo "ETAT:code"
  if [ -f "$DW_DOSSIER/serveur/index.mjs" ]; then
    echo "ETAT:code_present"
  else
    if [ -d "$DW_DOSSIER" ] && [ -n "$(ls -A "$DW_DOSSIER" 2>/dev/null)" ]; then echo "ERREUR:dossier_occupe"; return 1; fi
    archive="$TRAVAIL/dev-workshop.tar.gz"
    if [ -n "$DW_ARCHIVE" ]; then cp "$DW_ARCHIVE" "$archive" || { echo "ERREUR:telechargement"; return 1; }
    else telecharger "$DEPOT/$DW_REF" "$archive" || { echo "ERREUR:telechargement"; echo "JOURNAL:github.com $DW_REF"; return 1; }; fi
    mkdir -p "$DW_DOSSIER" && tar -xzf "$archive" -C "$DW_DOSSIER" --strip-components=1 </dev/null || { echo "ERREUR:inattendu"; return 1; }
    [ -f "$DW_DOSSIER/serveur/index.mjs" ] || { echo "ERREUR:inattendu"; return 1; }
  fi

  echo "ETAT:dependances"
  cd "$DW_DOSSIER" || { echo "ERREUR:inattendu"; return 1; }
  if ! npm ci --omit=dev --no-audit --no-fund --loglevel=error >"$TRAVAIL/npm.log" 2>&1 </dev/null; then
    echo "ERREUR:npm"
    tail -n 8 "$TRAVAIL/npm.log" | sed 's/^/JOURNAL:/'
    return 1
  fi
  node -e "import('@anthropic-ai/claude-agent-sdk').then(()=>process.exit(0),()=>process.exit(1))" </dev/null || { echo "ERREUR:npm"; echo "JOURNAL:claude-agent-sdk"; return 1; }

  if [ "$DW_AUTO" = 1 ]; then
    echo "ETAT:demarrage_auto"
    demarrage_auto
  fi
  echo "FIN:ok"
}

# Une ligne « @reboot » dans le crontab de la personne : ajoutée une seule fois, rien d'autre n'est modifié.
demarrage_auto() {
  command -v crontab >/dev/null 2>&1 || { echo "AVERTISSEMENT:cron_absent"; return 0; }
  marque="# dev-workshop:$DW_DOSSIER"
  if actuel=$(crontab -l 2>"$TRAVAIL/cron.err" </dev/null); then :
  elif grep -qi "no crontab" "$TRAVAIL/cron.err"; then actuel=""
  else echo "AVERTISSEMENT:cron_illisible"; return 0; fi
  case "$actuel" in *"$marque"*) echo "ETAT:demarrage_auto_present"; return 0 ;; esac
  # « % » a un sens particulier pour cron : un tel chemin n'est pas mis en démarrage automatique.
  case "$DW_DOSSIER$DW_RACINE$CONFIG" in *%*) echo "AVERTISSEMENT:cron_illisible"; return 0 ;; esac
  env_racine=""
  [ -n "$DW_RACINE" ] && env_racine="DEVWORKSHOP_ROOT='$DW_RACINE' "
  ligne="@reboot sleep 20; . \"\$HOME/.profile\" >/dev/null 2>&1; cd '$DW_DOSSIER' && PATH=\"\$HOME/.local/bin:\$PATH\" DEVWORKSHOP_PORT=$DW_PORT ${env_racine}node serveur/index.mjs >>'$CONFIG/serveur.log' 2>&1 $marque"
  if [ -n "$actuel" ]; then printf '%s\n%s\n' "$actuel" "$ligne"; else printf '%s\n' "$ligne"; fi | crontab - \
    && echo "ETAT:demarrage_auto_ok" || echo "AVERTISSEMENT:cron_illisible"
}

installer
