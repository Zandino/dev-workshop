// Chemins de fichiers cités par une IA dans ses messages : ils deviennent des liens qui ouvrent le fichier dans l'aperçu
// (apercu-fichier.js, serveur/ouvrir-fichier.mjs). Reconnus : « ~/… », un chemin absolu d'au moins deux dossiers,
// « .devworkshop/… », et un chemin relatif qui a un dossier et une extension (« src/app.js »). Les chemins Windows
// (« C:\… », sur le PC) et les adresses web ne sont pas touchés. Le serveur décide de ce qui s'ouvre : un lien vers un
// fichier absent ou interdit répond par un message, sans rien afficher.

const AVANT = String.raw`(?<=^|[\s(«"'“‘\[])`;
const CORPS = String.raw`[^\s<>"'\`«»“”‘’()\[\]{}|]+`;
const MOTIF = new RegExp(
  `${AVANT}(?:~\\/${CORPS}|\\/(?:[\\w.-]+\\/)+${CORPS}|\\.devworkshop\\/${CORPS}|(?:\\.{1,2}\\/)?[\\w-][\\w.-]*\\/(?:[\\w.-]+\\/)*[\\w-][\\w.-]*\\.[A-Za-z0-9]{1,8})`,
  'g',
);
const FIN = /[.,;:!?…)\]»”’]+$/; // ponctuation de la phrase, collée au chemin

/** Les chemins d'un texte : [{ debut, fin, chemin }]. Fonction pure (essais : tests/chemins.mjs). */
export function trouverChemins(texte) {
  const trouves = [];
  for (const m of String(texte ?? '').matchAll(MOTIF)) {
    let chemin = m[0].replace(FIN, '');
    if (/^\/\//.test(chemin) || /:\/\//.test(texte.slice(Math.max(0, m.index - 10), m.index + 3))) continue; // adresse web
    if (chemin.length < 3 || chemin.endsWith('/') && chemin.length < 4) continue;
    trouves.push({ debut: m.index, fin: m.index + chemin.length, chemin });
  }
  return trouves;
}

/** Remplace, sous `racine`, chaque chemin d'un texte par un lien ; ni dans un lien existant ni dans un bloc de code. */
export function lierChemins(racine, titre = '') {
  const doc = racine.ownerDocument;
  const marcheur = doc.createTreeWalker(racine, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: (n) => (n.parentElement?.closest('a, pre, button, textarea') ? 2 /* REJECT */ : 1 /* ACCEPT */),
  });
  const noeuds = [];
  while (marcheur.nextNode()) noeuds.push(marcheur.currentNode);
  for (const n of noeuds) {
    const trouves = trouverChemins(n.data);
    if (!trouves.length) continue;
    const morceaux = doc.createDocumentFragment();
    let pos = 0;
    for (const { debut, fin, chemin } of trouves) {
      morceaux.append(n.data.slice(pos, debut));
      const a = doc.createElement('a');
      a.href = '#';
      a.className = 'chemin-fichier';
      a.dataset.chemin = chemin;
      if (titre) a.title = titre;
      a.textContent = chemin;
      morceaux.append(a);
      pos = fin;
    }
    morceaux.append(n.data.slice(pos));
    n.replaceWith(morceaux);
  }
}
