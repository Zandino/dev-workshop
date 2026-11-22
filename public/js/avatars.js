// Personnages de l'équipe en direct, dessinés ici (SVG) : chacun à son bureau, devant son ordinateur. Le style
// (couleur, cheveux, peau, accessoire) vient du membre (equipe-etat.js) ; les animations (taper, réfléchir, lever la
// main, sursauter, fêter) sont en CSS (equipe.css), selon la classe d'état posée sur la tuile.

const COULEURS = ['#4f6bed', '#e0567a', '#2fa37a', '#f08a24', '#8e5cd9', '#1f9bb8', '#d6463b', '#6b7a8f'];
const PEAUX = ['#f6d7bd', '#e8b993', '#c98d63', '#9a6440', '#6b4128'];
const CHEVEUX = ['#2b2118', '#5a3a22', '#a8642c', '#d9b46a', '#7a7a7a', '#1d1d24'];

const NS = 'http://www.w3.org/2000/svg';
function el(nom, attributs = {}, ...enfants) {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attributs)) n.setAttribute(k, String(v));
  for (const e of enfants.flat()) if (e) n.append(e);
  return n;
}

/** Chevelure selon le style (0 court, 1 long, 2 chignon, 3 bouclé, 4 en pétard, 5 rasé). */
function cheveux(style, teinte) {
  const c = { fill: teinte };
  switch (style) {
    case 1: return [el('path', { ...c, d: 'M41 40 q19 -26 38 0 v22 q-4 -6 -6 -16 q-13 6 -26 0 q-2 10 -6 16 z' })];
    case 2: return [el('circle', { ...c, cx: 60, cy: 17, r: 7 }), el('path', { ...c, d: 'M42 38 q18 -20 36 0 q-18 -8 -36 0 z' })];
    case 3: return [0, 1, 2, 3, 4, 5].map((i) => el('circle', { ...c, cx: 43 + i * 7, cy: 26 + (i % 2) * 3, r: 7 }));
    case 4: return [el('path', { ...c, d: 'M44 34 l4 -14 l5 10 l5 -14 l5 14 l5 -12 l4 12 l5 -8 l2 14 q-17 -8 -35 -2 z' })];
    case 5: return [el('path', { ...c, d: 'M43 36 q17 -14 34 0 q-17 -5 -34 0 z', opacity: 0.55 })];
    default: return [el('path', { ...c, d: 'M42 38 q18 -24 36 0 q-6 -6 -18 -6 q-12 0 -18 6 z' })];
  }
}

/** Accessoire (0 aucun, 1 lunettes, 2 casque audio, 3 bonnet). */
function accessoire(n, couleur) {
  if (n === 1) {
    return [el('g', { class: 'lunettes', fill: 'none', stroke: '#222', 'stroke-width': 1.6 },
      el('circle', { cx: 53, cy: 41, r: 5 }), el('circle', { cx: 67, cy: 41, r: 5 }), el('path', { d: 'M58 41 h4' }))];
  }
  if (n === 2) {
    return [el('path', { d: 'M40 42 q20 -34 40 0', fill: 'none', stroke: '#333', 'stroke-width': 3 }),
      el('rect', { x: 36, y: 38, width: 7, height: 11, rx: 3, fill: '#333' }), el('rect', { x: 77, y: 38, width: 7, height: 11, rx: 3, fill: '#333' })];
  }
  if (n === 3) return [el('path', { d: 'M41 34 q19 -26 38 0 z', fill: couleur }), el('rect', { x: 40, y: 31, width: 40, height: 6, rx: 3, fill: '#fff', opacity: 0.85 })];
  return [];
}

/** Le personnage d'un membre, à son bureau. */
export function avatar(style) {
  const couleur = COULEURS[style.couleur % COULEURS.length];
  const peau = PEAUX[style.peau % PEAUX.length];
  const teinte = CHEVEUX[(style.cheveux + style.couleur) % CHEVEUX.length];
  return el('svg', { viewBox: '0 0 120 100', class: 'avatar', 'aria-hidden': 'true' },
    // Bulle de pensée (réfléchit), main levée (a besoin de toi), « z » (bloqué), coche (fini) : montrées par le CSS.
    el('g', { class: 'bulle' }, el('circle', { cx: 92, cy: 14, r: 9, fill: '#fff', stroke: '#ccd' }), el('circle', { cx: 82, cy: 27, r: 3, fill: '#fff', stroke: '#ccd' }),
      el('text', { x: 92, y: 18, 'text-anchor': 'middle', 'font-size': 10, fill: '#557' }, '…')),
    el('g', { class: 'main-haut' }, el('rect', { x: 84, y: 30, width: 6, height: 22, rx: 3, fill: couleur }), el('circle', { cx: 87, cy: 28, r: 5, fill: peau })),
    el('text', { class: 'dodo', x: 86, y: 22, 'font-size': 12, fill: '#889' }, 'z z'),
    el('g', { class: 'coche' }, el('circle', { cx: 92, cy: 16, r: 9, fill: '#2fa37a' }), el('path', { d: 'M87 16 l4 4 l7 -8', stroke: '#fff', 'stroke-width': 2.5, fill: 'none' })),
    // Corps et tête
    el('g', { class: 'personne' },
      el('path', { d: 'M34 86 q0 -26 26 -26 q26 0 26 26 z', fill: couleur }),
      el('rect', { x: 55, y: 54, width: 10, height: 8, fill: peau }),
      el('circle', { cx: 60, cy: 42, r: 17, fill: peau }),
      ...cheveux(style.cheveux, teinte),
      el('g', { class: 'yeux' }, el('circle', { cx: 53, cy: 42, r: 2, fill: '#222' }), el('circle', { cx: 67, cy: 42, r: 2, fill: '#222' })),
      el('ellipse', { class: 'bouche', cx: 60, cy: 50, rx: 4, ry: 1.4, fill: '#7a2e2e' }),
      ...accessoire(style.accessoire, couleur)),
    // Bureau, ordinateur, mains qui tapent
    el('rect', { x: 8, y: 84, width: 104, height: 8, rx: 2, fill: '#8a6a4a' }),
    el('g', { class: 'ordinateur' }, el('rect', { x: 44, y: 70, width: 32, height: 15, rx: 2, fill: '#3a3f4b' }), el('rect', { x: 46, y: 72, width: 28, height: 10, rx: 1, class: 'ecran-pc', fill: '#9fd3ff' })),
    el('g', { class: 'mains' }, el('circle', { class: 'main-g', cx: 42, cy: 82, r: 4, fill: peau }), el('circle', { class: 'main-d', cx: 78, cy: 82, r: 4, fill: peau })),
  );
}

export const couleurDe = (style) => COULEURS[style.couleur % COULEURS.length];
