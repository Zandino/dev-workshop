#!/bin/bash
# Tous les essais qui se passent d'IA et de compte (environ 270 vérifications), dans des dossiers jetables : à lancer
# avant chaque publication ; GitHub les lance aussi à chaque demande de fusion (.github/workflows/essais.yml).
# Code de sortie : le nombre d'essais en échec (0 : tout est passé).
#   bash tests/tout.sh
set -u
cd "$(dirname "$0")/.."
B=$(mktemp -d)
mkdir -p "$B/home" "$B/config" "$B/projets/essai"
export HOME="$B/home" DEVWORKSHOP_CONFIG="$B/config" DEVWORKSHOP_ROOT="$B/projets"
echecs=0

# lancer <nom> <commande…> : une ligne de bilan ; en cas d'échec, les vérifications ratées.
lancer() {
  local nom=$1
  shift
  local sortie code
  sortie=$("$@" 2>&1)
  code=$?
  echo "### $nom : $(printf '%s\n' "$sortie" | tail -n 1)"
  if [ "$code" -ne 0 ]; then
    echecs=$((echecs + 1))
    printf '%s\n' "$sortie" | grep -v '^OK' | tail -n 25
  fi
}

for f in serveur/*.mjs serveur/fournisseurs/*.mjs public/js/*.js; do
  node --check "$f" || { echo "### syntaxe : $f"; echecs=$((echecs + 1)); }
done

# Sans serveur (navigateur simulé, fausses IA).
for e in entre-discussions questions jauge barre-ordre equipe-direct skins voix-equipe relais-limite memoire-discussion taches; do
  lancer "$e" node "tests/$e.mjs"
done

# Avec le serveur, sans modèle.
DEVWORKSHOP_PORT=5351 node serveur/index.mjs > "$B/serveur.log" 2>&1 &
P=$!
sleep 3
lancer alertes env DEVWORKSHOP_PORT=5351 node tests/alertes.mjs essai
lancer equipe env DEVWORKSHOP_PORT=5351 node tests/equipe.mjs essai
kill "$P"
sleep 1
lancer reprise-comptes env DEVWORKSHOP_PORT=5352 node tests/reprise-comptes.mjs
lancer renommer env DEVWORKSHOP_PORT=5354 node tests/renommer.mjs
lancer demenager env DEVWORKSHOP_PORT=5355 node tests/demenager.mjs
lancer doublons env DEVWORKSHOP_PORT=5357 node tests/doublons.mjs
node tests/discussions.mjs prepare > /dev/null 2>&1
lancer copies env DEVWORKSHOP_PORT=5356 node tests/copies.mjs

if grep -qiE 'error|erreur|exception' "$B/serveur.log"; then
  echo "### journal du serveur :"
  grep -iE 'error|erreur|exception' "$B/serveur.log" | head -n 5
fi
echo
if [ "$echecs" -eq 0 ]; then echo "Tous les essais sont passés."; else echo "$echecs essai(s) en échec."; fi
rm -rf "$B"
exit "$echecs"
