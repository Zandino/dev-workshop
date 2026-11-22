// Crochet de chargement : les fournisseurs d'IA, les comptes et la mémoire du serveur sont remplacés par tests/faux/ia.mjs.
const FAUX = new URL('./ia.mjs', import.meta.url).href;
const REMPLACES = /\/serveur\/(fournisseurs\/index|fournisseurs\/claude|comptes|memoire)\.mjs$/;

export async function resolve(specifier, context, next) {
  const r = await next(specifier, context);
  return REMPLACES.test(r.url) ? { url: FAUX, shortCircuit: true } : r;
}
