// « Pendant ton absence » : en revenant sur une session qui a continué sans toi, une carte résume ce qui s'est
// passé depuis (tours finis, outils, fichiers modifiés, accords en attente, dernière réponse).
import { h, dateCourte } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { ecouter } from './canal.js';

ajouterTextes({
  fr: {
    absence_titre: 'Pendant ton absence (depuis {date})', absence_tours: '{ok} tour(s) terminé(s), {echec} en échec',
    absence_outils: '{n} action(s) d’outil', absence_fichiers: 'Fichiers modifiés : {liste}', absence_accords: '{n} demande(s) d’accord t’attendent',
    absence_derniere: 'Dernière réponse', absence_rien: 'Rien de nouveau.',
  },
  en: {
    absence_titre: 'While you were away (since {date})', absence_tours: '{ok} turn(s) finished, {echec} failed',
    absence_outils: '{n} tool action(s)', absence_fichiers: 'Files changed: {liste}', absence_accords: '{n} approval request(s) waiting for you',
    absence_derniere: 'Last answer', absence_rien: 'Nothing new.',
  },
});

const ECRITURE = /^(Edit|Write|MultiEdit|NotebookEdit|Patch|write_file|replace)/i;
const nomFichier = (b) => String(b.entree?.file_path || b.entree?.path || '').split(/[\\/]/).pop();

function carte(depuis, evenements) {
  const recents = evenements.filter((e) => (e.le || 0) > depuis);
  if (!recents.some((e) => ['assistant', 'tour', 'permission'].includes(e.t))) return null;
  const tours = recents.filter((e) => e.t === 'tour' && !e.auteur);
  const outils = recents.filter((e) => e.t === 'assistant').flatMap((e) => (e.blocs || []).filter((b) => b.type === 'outil'));
  const fichiers = [...new Set(outils.filter((b) => ECRITURE.test(b.nom)).map(nomFichier).filter(Boolean))];
  const attente = new Set();
  for (const e of evenements) {
    if (e.t === 'permission') attente.add(e.id);
    if (e.t === 'permission_fin') attente.delete(e.id);
  }
  const derniere = recents.filter((e) => e.t === 'assistant').flatMap((e) => (e.blocs || []).filter((b) => b.type === 'texte')).pop();
  return h('section.absence', {},
    h('h3', {}, t('absence_titre', { date: dateCourte(depuis) })),
    h('ul', {},
      tours.length ? h('li', {}, t('absence_tours', { ok: tours.filter((x) => x.ok).length, echec: tours.filter((x) => !x.ok).length })) : null,
      outils.length ? h('li', {}, t('absence_outils', { n: outils.length })) : null,
      fichiers.length ? h('li', {}, t('absence_fichiers', { liste: fichiers.slice(0, 12).join(', ') + (fichiers.length > 12 ? '…' : '') })) : null,
      attente.size ? h('li.attente', {}, t('absence_accords', { n: attente.size })) : null),
    derniere ? h('p', {}, h('strong', {}, t('absence_derniere') + ' : '), derniere.texte.replace(/\s+/g, ' ').slice(0, 280) + (derniere.texte.length > 280 ? '…' : '')) : null);
}

/** Après le rejeu d'une session (app.js), la carte se pose en bas du fil, juste avant le direct. */
export function initAbsence() {
  ecouter((m) => {
    if (m.t !== 'rejouer' || !m.absentDepuis) return;
    const c = carte(m.absentDepuis, m.evenements || []);
    if (!c) return;
    const fil = document.getElementById('fil');
    fil.append(c);
    c.scrollIntoView({ block: 'end' });
  });
}
