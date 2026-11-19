// Résolution des chemins « /js/… » et « /tiers/… » de la page quand on la charge dans Node.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TIERS = {
  '/tiers/marked.js': 'node_modules/marked/lib/marked.esm.js',
  '/tiers/purify.js': 'node_modules/dompurify/dist/purify.es.mjs',
};

export function resolve(specifier, context, next) {
  if (TIERS[specifier]) return { url: pathToFileURL(path.join(racine, TIERS[specifier])).href, shortCircuit: true };
  return next(specifier, context);
}
