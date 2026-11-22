// Fabrique ressources/icone.png (512 px) : le dessin de public/icone.svg (carré arrondi en dégradé bleu roi,
// losange blanc). Usage : npm run icone
const { dessiner, ecrire } = require('./png');

const T = 512;
const ARRONDI = (9 / 32) * T;
const DEBUT = [0x41, 0x69, 0xe1]; // bleu roi
const FIN = [0x6f, 0x9b, 0xff];

function dansCarre(x, y) {
  const r = ARRONDI;
  const cx = Math.min(Math.max(x, r), T - r);
  const cy = Math.min(Math.max(y, r), T - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
// Losange centré, demi-diagonale 8,5/32 de la taille.
const dansLosange = (x, y) => Math.abs(x - T / 2) + Math.abs(y - T / 2) <= (8.5 / 32) * T;

ecrire('icone.png', dessiner(T, (x, y) => {
  if (!dansCarre(x, y)) return null;
  if (dansLosange(x, y)) return [255, 255, 255];
  const k = (x + y) / (2 * T);
  return DEBUT.map((c, i) => c + (FIN[i] - c) * k);
}));
