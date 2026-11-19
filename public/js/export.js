// Export d'une conversation : un fichier Markdown lisible (demandes, réponses, outils utilisés), fabriqué
// dans la page à partir des événements reçus. Rien ne repart vers le serveur.
import { t, ajouterTextes } from './i18n.js';

ajouterTextes({
  fr: { ex_titre: 'Session Dev Workshop', ex_projet: 'Projet', ex_ia: 'IA', ex_le: 'Exporté le', ex_toi: 'Toi', ex_outil: 'Outil', ex_resultat_erreur: 'Résultat en erreur', ex_interrompu: 'Tour interrompu', ex_erreur: 'Erreur' },
  en: { ex_titre: 'Dev Workshop session', ex_projet: 'Project', ex_ia: 'AI', ex_le: 'Exported on', ex_toi: 'You', ex_outil: 'Tool', ex_resultat_erreur: 'Failed result', ex_interrompu: 'Turn interrupted', ex_erreur: 'Error' },
});

function bloc(texte, max = 4000) {
  const t = String(texte ?? '');
  const coupe = t.length > max ? t.slice(0, max) + '\n…' : t;
  return '```\n' + coupe.replace(/```/g, '`​``') + '\n```';
}

function resumeOutil(entree) {
  if (!entree || typeof entree !== 'object') return '';
  const v = entree.command || entree.file_path || entree.path || entree.pattern || entree.url || entree.description || '';
  return v ? ` — \`${String(v).slice(0, 160).replace(/`/g, "'")}\`` : '';
}

/** Markdown de la session ; `evenements` : ce que la page a reçu (rejeu et direct). */
export function versMarkdown({ titre, projet, compte, evenements }) {
  const lignes = [`# ${titre || t('ex_titre')}`, '', `- ${t('ex_projet')} : ${projet || '–'}`, ...(compte ? [`- ${t('ex_ia')} : ${compte}`] : []), `- ${t('ex_le')} : ${new Date().toLocaleString()}`, ''];
  for (const e of evenements) {
    if (e.t === 'utilisateur') lignes.push(`## ${t('ex_toi')}`, '', e.texte, '');
    else if (e.t === 'assistant' && !e.sousAgent) {
      const qui = e.auteur?.nom || compte || t('ex_ia');
      for (const b of e.blocs || []) {
        if (b.type === 'texte') lignes.push(`## ${qui}`, '', b.texte, '');
        else if (b.type === 'outil') lignes.push(`> ${t('ex_outil')} **${b.nom}**${resumeOutil(b.entree)}`, '');
      }
    } else if (e.t === 'resultat_outil' && e.erreur) lignes.push(`> ${t('ex_resultat_erreur')} :`, '', bloc(e.contenu, 1500), '');
    else if (e.t === 'tour' && !e.ok) lignes.push(`> ${t('ex_interrompu')} : ${e.message || e.motif || ''}`, '');
    else if (e.t === 'erreur') lignes.push(`> ${t('ex_erreur')} : ${e.message || ''}`, '');
    else if (e.t === 'delegation') lignes.push(`> → **${e.auteur?.nom || ''}** (${e.modele || '–'}) : ${String(e.tache || '').split('\n')[0].slice(0, 300)}`, '');
  }
  return lignes.join('\n');
}

/** Propose le fichier à l'enregistrement (fenêtre « Enregistrer sous » du système). */
export function telecharger(nomFichier, contenu, type = 'text/markdown') {
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([contenu], { type: `${type};charset=utf-8` }));
  lien.download = nomFichier;
  document.body.append(lien);
  lien.click();
  setTimeout(() => {
    URL.revokeObjectURL(lien.href);
    lien.remove();
  }, 1000);
}

export function nomExport(titre) {
  const base = String(titre || 'session').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'session';
  return `${base}-${new Date().toISOString().slice(0, 10)}.md`;
}
