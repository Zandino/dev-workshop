// Dessin d'images PNG en Node pur, sans dépendance : utilisé par icone.js et main-levee.js.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ECH = 4; // sur-échantillonnage pour des bords lisses

/**
 * Image carrée de `taille` pixels. `couleur(x, y)` reçoit un point (en pixels, non entier) et rend
 * [r, v, b] ou null (transparent). Chaque pixel est la moyenne de ECH × ECH points.
 */
function dessiner(taille, couleur) {
  const pixels = Buffer.alloc(taille * (taille * 4 + 1));
  for (let y = 0; y < taille; y++) {
    pixels[y * (taille * 4 + 1)] = 0; // filtre PNG « aucun »
    for (let x = 0; x < taille; x++) {
      const somme = [0, 0, 0];
      let couvert = 0;
      for (let sy = 0; sy < ECH; sy++) {
        for (let sx = 0; sx < ECH; sx++) {
          const c = couleur(x + (sx + 0.5) / ECH, y + (sy + 0.5) / ECH);
          if (!c) continue;
          couvert++;
          for (let i = 0; i < 3; i++) somme[i] += c[i];
        }
      }
      const o = y * (taille * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) pixels[o + i] = couvert ? Math.round(somme[i] / couvert) : 0;
      pixels[o + 3] = Math.round((255 * couvert) / (ECH * ECH));
    }
  }
  return encoder(taille, pixels);
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
function encoder(taille, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RVBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', zlib.deflateSync(pixels, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

/** Écrit l'image dans ressources/ et l'annonce. */
function ecrire(nom, png) {
  const sortie = path.join(__dirname, '..', 'ressources', nom);
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, png);
  console.log(`${sortie} (${png.length} octets)`);
}

module.exports = { dessiner, ecrire };
