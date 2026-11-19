# Lancé sur le serveur par le logiciel de bureau, par SSH (sh -s). POSIX, sans bash.
# Démarre Dev Workshop s'il ne répond pas, puis donne le jeton d'accès.
# Les valeurs DW_DOSSIER, DW_PORT et DW_RACINE sont posées en tête par le logiciel.
# Sorties lues par le logiciel : ETAT:…, ERREUR:…, JOURNAL:…, JETON:… (une par ligne).

# Le PATH d'une session SSH sans terminal est réduit : on reprend celui de la personne (node, claude…).
[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1
PATH="$HOME/.local/bin:$HOME/bin:$PATH"
export PATH

case "$DW_DOSSIER" in "~/"*) DW_DOSSIER="$HOME/${DW_DOSSIER#\~/}" ;; esac
case "$DW_RACINE" in "~/"*) DW_RACINE="$HOME/${DW_RACINE#\~/}" ;; esac
CONFIG="${DEVWORKSHOP_CONFIG:-$HOME/.config/dev-workshop}"

command -v node >/dev/null 2>&1 || { echo "ERREUR:node_absent"; exit 3; }

repond() {
  node -e "fetch('http://127.0.0.1:'+process.argv[1]+'/',{method:'HEAD'}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))" "$DW_PORT" >/dev/null 2>&1
}

if repond; then
  echo "ETAT:deja_lance"
else
  [ -f "$DW_DOSSIER/serveur/index.mjs" ] || { echo "ERREUR:dossier_absent"; exit 4; }
  [ -d "$DW_DOSSIER/node_modules" ] || { echo "ERREUR:dependances_absentes"; exit 5; }
  mkdir -p "$CONFIG" && chmod 700 "$CONFIG"
  cd "$DW_DOSSIER" || { echo "ERREUR:dossier_absent"; exit 4; }
  [ -n "$DW_RACINE" ] && { DEVWORKSHOP_ROOT="$DW_RACINE"; export DEVWORKSHOP_ROOT; }
  DEVWORKSHOP_PORT="$DW_PORT"
  export DEVWORKSHOP_PORT
  echo "ETAT:demarrage"
  # Détaché de la session SSH : le serveur continue de tourner quand le logiciel se ferme.
  if command -v setsid >/dev/null 2>&1; then
    nohup setsid node serveur/index.mjs >>"$CONFIG/serveur.log" 2>&1 </dev/null &
  else
    nohup node serveur/index.mjs >>"$CONFIG/serveur.log" 2>&1 </dev/null &
  fi
  i=0
  until repond; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "ERREUR:demarrage"
      tail -n 6 "$CONFIG/serveur.log" 2>/dev/null | sed 's/^/JOURNAL:/'
      exit 6
    fi
    sleep 1
  done
  echo "ETAT:demarre"
fi

[ -r "$CONFIG/jeton" ] || { echo "ERREUR:jeton_absent"; exit 7; }
printf 'JETON:%s\n' "$(cat "$CONFIG/jeton")"
