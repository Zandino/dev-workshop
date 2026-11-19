// Fabrique ressources/icone.png (512 px) : le dessin de public/icone.svg (carré arrondi en dégradé, losange blanc),
// tracé en Node pur, sans dépendance. Usage : npm run icone
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const T = 512;
const ECH = 4; // sur-échantillonnage pour des bords lisses
const ARRONDI = (9 / 32) * T;
const DEBUT = [0x6d, 0x4a, 0xff];
const FIN = [0xb0, 0x6d, 0xff];

function dansCarre(x, y) {
  const r = ARRONDI;
  const cx = Math.min(Math.max(x, r), T - r);
  const cy = Math.min(Math.max(y, r), T - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
// Losange centré, demi-diagonale 8,5/32 de la taille.
const dansLosange = (x, y) => Math.abs(x - T / 2) + Math.abs(y - T / 2) <= (8.5 / 32) * T;

const pixels = Buffer.alloc(T * (T * 4 + 1));
for (let y = 0; y < T; y++) {
  pixels[y * (T * 4 + 1)] = 0; // filtre PNG « aucun »
  for (let x = 0; x < T; x++) {
    let couvert = 0;
    let blanc = 0;
    for (let sy = 0; sy < ECH; sy++) {
      for (let sx = 0; sx < ECH; sx++) {
        const px = x + (sx + 0.5) / ECH;
        const py = y + (sy + 0.5) / ECH;
        if (dansCarre(px, py)) {
          couvert++;
          if (dansLosange(px, py)) blanc++;
        }
      }
    }
    const n = ECH * ECH;
    const k = (x + y) / (2 * T);
    const fond = DEBUT.map((c, i) => c + (FIN[i] - c) * k);
    const part = couvert ? blanc / couvert : 0;
    const o = y * (T * 4 + 1) + 1 + x * 4;
    for (let i = 0; i < 3; i++) pixels[o + i] = Math.round(fond[i] * (1 - part) + 255 * part);
    pixels[o + 3] = Math.round((255 * couvert) / n);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type), donnees]);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc(corps));
  return Buffer.concat([longueur, corps, somme]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(T, 0);
ihdr.writeUInt32BE(T, 4);
ihdr[8] = 8; // 8 bits par canal
ihdr[9] = 6; // RVBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloc('IHDR', ihdr),
  bloc('IDAT', zlib.deflateSync(pixels, { level: 9 })),
  bloc('IEND', Buffer.alloc(0)),
]);
const sortie = path.join(__dirname, '..', 'ressources', 'icone.png');
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, png);
console.log(`${sortie} (${png.length} octets)`);
