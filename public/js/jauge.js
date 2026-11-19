// Jauge de contexte et détail de la consommation : uniquement les chiffres renvoyés par chaque IA.
// Dans une discussion à plusieurs, chaque participant a ses propres lignes.
import { h, jetons, nombre, dollars, dateCourte } from './dom.js';
import { t, aTexte } from './i18n.js';

const COLONNES = ['entree', 'sortie', 'cacheLu', 'cacheEcrit'];
const CLES = { entree: 'entree', sortie: 'sortie', cacheLu: 'cache_lu', cacheEcrit: 'cache_ecrit' };
let conso = null;

export function razJauge() {
  conso = { contexte: null, limite: null, tours: new Map(), dernier: null };
  dessiner();
}

/** Reçoit les événements « contexte », « tour » et « limite ». */
export function majJauge(e) {
  if (!conso) razJauge();
  const qui = e.auteur?.nom || '';
  if (e.t === 'contexte') conso.contexte = e;
  if (e.t === 'limite') conso.limite = e;
  if (e.t === 'tour') {
    conso.tours.set(qui, { tour: e, precedent: conso.tours.get(qui)?.tour || null });
    conso.dernier = qui;
  }
  dessiner();
}

function somme(tour) {
  const s = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 };
  for (const m of tour?.modeles || []) for (const k of COLONNES) s[k] += m[k] || 0;
  return s;
}

/** Coût total : la somme des coûts connus ; rien si aucune IA n'en fournit. */
function coutTotal() {
  const connus = [...conso.tours.values()].map((x) => x.tour.coutSession).filter((c) => c != null);
  return connus.length ? connus.reduce((a, b) => a + b, 0) : null;
}

function ligne(libelle, valeurs) {
  return h('tr', {}, h('th', { scope: 'row' }, libelle), valeurs.map((v) => h('td', {}, v)));
}

function tableau() {
  if (!conso.tours.size) return null;
  const lignes = [];
  const total = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 };
  for (const [qui, { tour }] of conso.tours) {
    for (const m of tour.modeles) {
      lignes.push(ligne(qui ? `${qui} · ${m.modele}` : m.modele, [...COLONNES.map((c) => nombre(m[c])), dollars(m.cout)]));
      for (const c of COLONNES) total[c] += m[c] || 0;
    }
  }
  const { tour, precedent } = conso.tours.get(conso.dernier);
  const apres = somme(tour);
  const avant = somme(precedent);
  const ecart = tour.coutSession == null ? null : tour.coutSession - (precedent?.coutSession || 0);
  return h(
    'table.conso',
    {},
    h('thead', {}, h('tr', {}, h('th', {}, ''), COLONNES.map((c) => h('th', { scope: 'col' }, t(CLES[c]))), h('th', { scope: 'col' }, t('cout')))),
    h(
      'tbody',
      {},
      lignes,
      ligne(t('total'), [...COLONNES.map((c) => nombre(total[c])), dollars(coutTotal())]),
      ligne(t('dernier_tour') + (conso.dernier ? ` (${conso.dernier})` : ''), [...COLONNES.map((c) => nombre(Math.max(0, apres[c] - avant[c]))), dollars(ecart)]),
    ),
  );
}

function blocLimite() {
  const l = conso.limite;
  if (!l || (l.utilisation == null && !l.retablieLe)) return null;
  const periode = aTexte('limite_' + l.type) ? t('limite_' + l.type) : t('limite_autre');
  const morceaux = [periode];
  if (l.utilisation != null) morceaux.push(`${Math.round(l.utilisation * 100)} % ${t('utilise')}`);
  if (l.retablieLe) morceaux.push(t('limite_retablie', { date: dateCourte(l.retablieLe * 1000) }));
  const qui = l.auteur?.nom ? ` (${l.auteur.nom})` : '';
  return h('p.limite' + (l.statut && l.statut !== 'allowed' ? '.alerte' : ''), {}, h('strong', {}, t('limite') + qui + ' : '), morceaux.join(' · '));
}

function dessiner() {
  const pastille = document.getElementById('jauge');
  const panneau = document.getElementById('conso');
  const c = conso?.contexte;
  const pourcent = c ? Math.min(100, c.pourcent) : 0;
  const barre = h('span.barre', {}, h('span.plein'));
  barre.firstChild.style.width = `${pourcent}%`;
  pastille.classList.toggle('haute', pourcent >= 80);
  const cout = conso?.tours.size ? coutTotal() : null;
  const sortis = [...(conso?.tours.values() || [])].reduce((s, x) => s + somme(x.tour).sortie, 0);
  const format = new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 1 });
  pastille.replaceChildren(
    h('span.libelle', {}, t('contexte') + (c?.auteur?.nom ? ` (${c.auteur.nom})` : '')),
    barre,
    h('span.valeur', {}, c ? `${format.format(pourcent)} % · ${jetons(c.utilises)} / ${jetons(c.max)}` : conso?.tours.size ? `${jetons(sortis)} ${t('sortie').toLowerCase()}` : '–'),
    cout != null ? h('span.cout', {}, dollars(cout)) : null,
  );
  panneau.replaceChildren(
    h('h2', {}, t('conso_titre')),
    c ? h('p', {}, `${t('contexte')} : ${nombre(c.utilises)} / ${nombre(c.max)} ${t('jetons').toLowerCase()}`) : null,
    tableau(),
    blocLimite(),
    h('p.note', {}, t('conso_note')),
  );
}
