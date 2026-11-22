// Le serveur entier, sur les fausses IA de tests/faux/ia.mjs (aucune vraie IA, aucun compte) : pour voir l'écran
// travailler dans un navigateur sans écran. Chaque compte répond « Bien reçu. ».
//   DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=… DEVWORKSHOP_PORT=… node tests/faux/serveur.mjs
import { register } from 'node:module';

register('./crochet.mjs', import.meta.url);
const faux = await import('./ia.mjs');
for (const c of faux.COMPTES) faux.comportements[c.id] = faux.repondre('Bien reçu.');
faux.faux.echoUtilisateur = true;
await import('../../serveur/index.mjs');
