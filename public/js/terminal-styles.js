// Les styles qu'xterm.js pose lui-même (taille des caractères, couleurs, barre de défilement) passent par des balises
// <style> créées à la volée, que la politique de sécurité de la page (style-src 'self', securite.mjs) ignore : vérifié
// dans Chrome le 25/11/2026, la balise est sans effet. Au lieu d'assouplir cette politique, chaque balise est recopiée
// dans une feuille de style construite (CSSStyleSheet), que la politique laisse passer, et tenue à jour.
// La console du navigateur signale encore chaque balise refusée (« Applying inline style violates… ») : attendu, la
// copie la remplace (vérifié dans Chrome le 25/11/2026 : rendu correct, trois feuilles par terminal).

const feuilles = new Map(); // balise <style> -> sa feuille construite

function refleter(balise) {
  let f = feuilles.get(balise);
  if (!f) {
    f = new CSSStyleSheet();
    feuilles.set(balise, f);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, f];
  }
  try {
    f.replaceSync(balise.textContent || '');
  } catch { /* règle illisible : la précédente reste */ }
}

function oublier(balise) {
  const f = feuilles.get(balise);
  if (!f) return;
  feuilles.delete(balise);
  document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => x !== f);
}

/** Suit les balises <style> créées sous `racine`, ou dans <head> (ajout, changement de texte, retrait). */
export function refleterStyles(racine) {
  const balisesDe = (n) => (n.nodeName === 'STYLE' ? [n] : n.querySelectorAll ? [...n.querySelectorAll('style')] : []);
  const surveillees = [racine, document.head];
  surveillees.forEach((r) => r.querySelectorAll('style').forEach(refleter));
  const observateur = new MutationObserver((changements) => {
    for (const c of changements) {
      const cible = c.target.nodeName === 'STYLE' ? c.target : c.target.parentNode?.nodeName === 'STYLE' ? c.target.parentNode : null;
      if (cible) refleter(cible);
      c.addedNodes.forEach((n) => balisesDe(n).forEach(refleter));
      c.removedNodes.forEach((n) => balisesDe(n).forEach(oublier));
    }
  });
  surveillees.forEach((r) => observateur.observe(r, { childList: true, subtree: true, characterData: true }));
  return () => observateur.disconnect();
}
