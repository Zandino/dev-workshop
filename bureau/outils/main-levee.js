// Fabrique ressources/main-levee.png (64 px) : une main blanche levée sur un rond orange, posée sur l'icône de la
// barre des tâches quand une discussion attend ton accord (src/main-levee.js). Usage : npm run icone
const { dessiner, ecrire } = require('./png');

const T = 64;
const U = T / 32; // le dessin est pensé sur une grille de 32
const ORANGE = [0xd9, 0x77, 0x06]; // --orange de l'atelier
const BLANC = [255, 255, 255];

/** Distance du point (x, y) au segment [a, b]. */
function distanceSegment(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + k * dx), y - (ay + k * dy));
}
// Doigts (de l'index à l'auriculaire) et pouce : des segments arrondis ; la paume : un rectangle arrondi.
const DOIGTS = [
  [[12.4, 17], [12.4, 9.6], 1.4],
  [[15.6, 17], [15.6, 8], 1.4],
  [[18.8, 17], [18.8, 8.8], 1.4],
  [[21.8, 18], [21.8, 11.6], 1.25],
  [[11.8, 21.2], [8, 15.6], 1.45],
];
function dansPaume(x, y) {
  const [cx, cy, dx, dy, r] = [16.8, 20, 5.3, 5.2, 3];
  const qx = Math.max(Math.abs(x - cx) - (dx - r), 0);
  const qy = Math.max(Math.abs(y - cy) - (dy - r), 0);
  return Math.hypot(qx, qy) <= r;
}
const dansMain = (x, y) => dansPaume(x, y) || DOIGTS.some(([a, b, r]) => distanceSegment(x, y, a, b) <= r);

ecrire('main-levee.png', dessiner(T, (px, py) => {
  const [x, y] = [px / U, py / U];
  if (Math.hypot(x - 16, y - 16) > 15.6) return null;
  return dansMain(x, y) ? BLANC : ORANGE;
}));
