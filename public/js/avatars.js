// Personnages et décors de l'équipe en direct, dessinés ici (SVG) : chaque membre est assis à son bureau, devant son
// ordinateur, dans son décor (bureau, bibliothèque, serre, montagne, café, ville à l'aube). Le style (couleur,
// coiffure, teint, accessoire, décor) vient du membre (equipe-etat.js) ; les animations (taper, réfléchir, lever la
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

// --- Décors (fond 160 × 100) ---
function decor(n) {
  switch (n % 6) {
    case 1: // bibliothèque
      return [el('rect', { width: 160, height: 100, fill: '#e9dcc7' }),
        ...[18, 40, 62].map((y) => el('rect', { x: 8, y, width: 54, height: 3, fill: '#9b7652' })),
        ...[0, 1, 2].flatMap((r) => [0, 1, 2, 3, 4, 5].map((i) => el('rect', { x: 10 + i * 8, y: 6 + r * 22, width: 6, height: 12, rx: 1, fill: ['#c0504d', '#4f81bd', '#9bbb59', '#f79646', '#8064a2', '#4bacc6'][(i + r) % 6] }))),
        el('rect', { x: 110, y: 14, width: 36, height: 26, rx: 2, fill: '#fff8e8', stroke: '#9b7652', 'stroke-width': 2 }),
        el('path', { d: 'M114 36 l9 -12 l7 8 l5 -6 l7 10 z', fill: '#9bbb59' })];
    case 2: // serre
      return [el('rect', { width: 160, height: 100, fill: '#dff2e1' }),
        ...[0, 1, 2, 3].map((i) => el('path', { d: `M${i * 40} 0 v70`, stroke: '#b9d9bd', 'stroke-width': 2 })),
        el('path', { d: 'M0 22 h160', stroke: '#b9d9bd', 'stroke-width': 2 }),
        el('path', { d: 'M14 70 q6 -26 0 -40 q12 14 4 40 z', fill: '#3f9d5a' }), el('path', { d: 'M24 70 q10 -20 20 -24 q-8 12 -14 24 z', fill: '#56b870' }),
        el('rect', { x: 10, y: 66, width: 24, height: 10, rx: 2, fill: '#c46b45' }),
        el('circle', { cx: 140, cy: 30, r: 14, fill: '#56b870' }), el('rect', { x: 137, y: 40, width: 6, height: 28, fill: '#7a5636' })];
    case 3: // montagne
      return [el('rect', { width: 160, height: 100, fill: '#cfe8f6' }), el('circle', { cx: 128, cy: 22, r: 10, fill: '#ffe39a' }),
        el('path', { d: 'M0 74 l36 -44 l26 30 l24 -36 l40 50 l34 -22 v48 h-160 z', fill: '#8fa9c4' }),
        el('path', { d: 'M30 37 l6 -7 l6 7 z M80 32 l6 -8 l6 8 z', fill: '#fff' })];
    case 4: // café
      return [el('rect', { width: 160, height: 100, fill: '#b5654a' }),
        ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((r) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => el('rect', { x: i * 20 + (r % 2) * 10 - 10, y: r * 10, width: 18, height: 8, rx: 1, fill: '#a75a40' }))),
        el('rect', { x: 112, y: 12, width: 34, height: 22, rx: 3, fill: '#2b2b30' }), el('text', { x: 129, y: 27, 'text-anchor': 'middle', 'font-size': 8, fill: '#f6e7c8' }, 'café'),
        el('path', { d: 'M20 10 v14', stroke: '#333', 'stroke-width': 1 }), el('circle', { cx: 20, cy: 27, r: 4, fill: '#ffd76a' })];
    case 5: // ville à l'aube
      return [el('rect', { width: 160, height: 100, fill: '#f7d2c4' }), el('circle', { cx: 80, cy: 58, r: 22, fill: '#ffb98a' }),
        ...[[6, 40, 18], [26, 30, 16], [44, 46, 14], [104, 34, 18], [124, 44, 14], [140, 28, 16]].map(([x, y, w]) => el('rect', { x, y, width: w, height: 100 - y, fill: '#7d6b8c' })),
        ...[[10, 46], [30, 36], [108, 40], [144, 34]].map(([x, y]) => el('rect', { x, y, width: 4, height: 4, fill: '#ffe39a' }))];
    default: // bureau
      return [el('rect', { width: 160, height: 100, fill: '#dfe6f2' }),
        el('rect', { x: 104, y: 10, width: 44, height: 36, rx: 2, fill: '#bfe3ff', stroke: '#fff', 'stroke-width': 3 }),
        ...[0, 1, 2, 3, 4].map((i) => el('path', { d: `M104 ${14 + i * 7} h44`, stroke: '#e9f2fb', 'stroke-width': 2 })),
        el('rect', { x: 12, y: 16, width: 26, height: 18, rx: 2, fill: '#fff', stroke: '#9aa9c0' }), el('path', { d: 'M15 30 l6 -7 l5 5 l4 -3 l5 5', fill: 'none', stroke: '#4f6bed' }),
        el('path', { d: 'M20 70 q-6 -18 4 -26 q2 12 -2 26 z', fill: '#3f9d5a' }), el('rect', { x: 14, y: 68, width: 14, height: 8, rx: 2, fill: '#c46b45' })];
  }
}

// --- Personnage (repère 120 × 100 : tête autour de (60, 42), épaules à 60) ---
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

function accessoire(n, couleur) {
  if (n === 1) {
    return [el('g', { fill: 'none', stroke: '#222', 'stroke-width': 1.6 },
      el('circle', { cx: 53, cy: 41, r: 5 }), el('circle', { cx: 67, cy: 41, r: 5 }), el('path', { d: 'M58 41 h4' }))];
  }
  if (n === 2) {
    return [el('path', { d: 'M40 42 q20 -34 40 0', fill: 'none', stroke: '#333', 'stroke-width': 3 }),
      el('rect', { x: 36, y: 38, width: 7, height: 11, rx: 3, fill: '#333' }), el('rect', { x: 77, y: 38, width: 7, height: 11, rx: 3, fill: '#333' }),
      el('path', { d: 'M40 48 q2 8 12 9', fill: 'none', stroke: '#333', 'stroke-width': 1.5 }), el('circle', { cx: 53, cy: 57, r: 1.8, fill: '#333' })];
  }
  if (n === 3) return [el('path', { d: 'M41 34 q19 -26 38 0 z', fill: couleur }), el('rect', { x: 40, y: 31, width: 40, height: 6, rx: 3, fill: '#fff', opacity: 0.85 })];
  return [];
}

function personne(style) {
  const couleur = COULEURS[style.couleur % COULEURS.length];
  const peau = PEAUX[style.peau % PEAUX.length];
  const teinte = CHEVEUX[(style.cheveux + style.couleur) % CHEVEUX.length];
  return el('g', { class: 'personne' },
    el('path', { d: 'M30 100 q0 -40 30 -40 q30 0 30 40 z', fill: couleur }),
    el('rect', { x: 55, y: 54, width: 10, height: 8, fill: peau }),
    el('circle', { cx: 60, cy: 42, r: 17, fill: peau }),
    ...cheveux(style.cheveux, teinte),
    el('g', { class: 'yeux' }, el('ellipse', { cx: 53, cy: 42, rx: 3.6, ry: 4, fill: '#fff' }), el('ellipse', { cx: 67, cy: 42, rx: 3.6, ry: 4, fill: '#fff' }),
      el('circle', { cx: 53.5, cy: 42.5, r: 2.2, fill: '#1d1d24' }), el('circle', { cx: 67.5, cy: 42.5, r: 2.2, fill: '#1d1d24' })),
    el('circle', { cx: 49, cy: 47, r: 2.5, fill: '#e98b8b', opacity: 0.35 }), el('circle', { cx: 71, cy: 47, r: 2.5, fill: '#e98b8b', opacity: 0.35 }),
    el('ellipse', { class: 'bouche', cx: 60, cy: 50, rx: 4, ry: 1.4, fill: '#7a2e2e' }),
    ...accessoire(style.accessoire, couleur));
}

/** Une scène : le décor du membre, lui à son bureau devant son ordinateur, et ce que son état fait apparaître. */
export function scene(style) {
  const couleur = COULEURS[style.couleur % COULEURS.length];
  const peau = PEAUX[style.peau % PEAUX.length];
  return el('svg', { viewBox: '0 0 160 100', class: 'scene-svg', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' },
    ...decor(style.decor ?? style.couleur),
    el('g', { transform: 'translate(22 4)' }, personne(style),
      // Main levée (a besoin de toi), bulle de pensée (réfléchit), « z z » (sans nouvelles), coche (fini), sablier (attend).
      el('g', { class: 'main-haut' }, el('rect', { x: 84, y: 30, width: 7, height: 26, rx: 3, fill: couleur }), el('circle', { cx: 87.5, cy: 28, r: 5.5, fill: peau }))),
    el('g', { class: 'bulle' }, el('circle', { cx: 124, cy: 20, r: 10, fill: '#fff', stroke: '#ccd' }), el('circle', { cx: 112, cy: 33, r: 3, fill: '#fff', stroke: '#ccd' }),
      el('text', { x: 124, y: 24, 'text-anchor': 'middle', 'font-size': 11, fill: '#557' }, '…')),
    el('text', { class: 'dodo', x: 118, y: 26, 'font-size': 13, fill: '#667' }, 'z z'),
    el('text', { class: 'sablier', x: 16, y: 26, 'font-size': 16 }, '⏳'),
    // Bureau et ordinateur, au premier plan
    el('rect', { x: 0, y: 86, width: 160, height: 14, fill: '#8a6a4a' }), el('rect', { x: 0, y: 86, width: 160, height: 2, fill: '#a7835f' }),
    el('g', { class: 'ordinateur' },
      el('path', { d: 'M56 87 l6 -22 h36 l6 22 z', fill: '#d9dde6' }),
      el('circle', { class: 'voyant', cx: 80, cy: 77, r: 2.5, fill: couleur })),
    el('g', { class: 'mains' }, el('circle', { class: 'main-g', cx: 60, cy: 87, r: 4.5, fill: peau }), el('circle', { class: 'main-d', cx: 100, cy: 87, r: 4.5, fill: peau })),
    el('rect', { x: 126, y: 76, width: 10, height: 10, rx: 2, fill: '#fff' }), el('path', { d: 'M136 79 q5 2 0 5', fill: 'none', stroke: '#fff', 'stroke-width': 2 }));
}

/** Petite pastille ronde du membre (liste des agents), à sa couleur. */
export const couleurDe = (style) => COULEURS[style.couleur % COULEURS.length];
