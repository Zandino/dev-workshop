// Fichiers joints : bouton « + », glisser-déposer sur l'atelier, ou image collée dans la saisie.
// Chaque fichier part au serveur par morceaux (un message du canal est limité à 1 Mo), puis attend en puce
// au-dessus de la saisie ; il est cité dans le prochain message envoyé.
import { h, notifier } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';

ajouterTextes({
  fr: {
    joindre: 'Joindre des fichiers (ou glisse-les ici, ou colle une image)', fichier_trop_gros: '« {nom} » dépasse 25 Mo.',
    fichier_envoi: 'envoi {pourcent} %', fichier_echec: 'échec', retirer_fichier: 'Retirer',
    fichiers_en_cours: 'Attends la fin de l’envoi des fichiers.', deposer: 'Dépose tes fichiers pour les joindre',
    refus_fichier_invalide: 'Fichier refusé par le serveur.', refus_fichier_trop_gros: 'Fichier trop gros (25 Mo au plus).',
    refus_trop_de_fichiers: 'Dix fichiers au plus par message.', refus_fichier_introuvable: 'Un fichier joint n’existe plus sur le serveur.',
  },
  en: {
    joindre: 'Attach files (or drop them here, or paste an image)', fichier_trop_gros: '“{nom}” is larger than 25 MB.',
    fichier_envoi: 'uploading {pourcent} %', fichier_echec: 'failed', retirer_fichier: 'Remove',
    fichiers_en_cours: 'Wait until the files are uploaded.', deposer: 'Drop your files to attach them',
    refus_fichier_invalide: 'File refused by the server.', refus_fichier_trop_gros: 'File too large (25 MB at most).',
    refus_trop_de_fichiers: 'Ten files at most per message.', refus_fichier_introuvable: 'An attached file no longer exists on the server.',
  },
});

const MORCEAU = 512 * 1024;
const MAX = 25 * 1024 * 1024;
const MAX_PAR_MESSAGE = 10;
let projet = () => null;
let joints = [];
const attentes = new Map();

const identifiant = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (o) => o.toString(36).padStart(2, '0')).join('').slice(0, 16);

function enBase64(tranche) {
  return new Promise((ok, ko) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(String(lecteur.result).split(',')[1] || '');
    lecteur.onerror = () => ko(lecteur.error);
    lecteur.readAsDataURL(tranche);
  });
}

function dessiner() {
  const zone = document.getElementById('pieces');
  zone.hidden = !joints.length;
  zone.replaceChildren(...joints.map((j) => h('span.piece' + (j.etat === 'echec' ? '.echec' : j.etat === 'pret' ? '.prete' : ''), { title: j.nom },
    h('span.nom', {}, j.nom),
    j.etat === 'envoi' ? h('span.avance', {}, t('fichier_envoi', { pourcent: Math.round((j.fait / j.total) * 100) })) : null,
    j.etat === 'echec' ? h('span.avance', {}, t('fichier_echec')) : null,
    h('button.discret', { type: 'button', title: t('retirer_fichier'), onclick: () => retirer(j) }, '✕'))));
}

function retirer(j) {
  if (j.etat === 'envoi') dire({ t: 'fichier_annuler', id: j.id });
  attentes.get(j.id)?.ko(new Error('annule'));
  joints = joints.filter((x) => x !== j);
  dessiner();
}

async function envoyerFichier(fichier) {
  const nom = fichier.name || `capture-${Date.now()}.png`;
  if (fichier.size > MAX) return notifier(t('fichier_trop_gros', { nom }), { echec: true });
  if (joints.length >= MAX_PAR_MESSAGE) return notifier(t('refus_trop_de_fichiers'), { echec: true });
  const j = { id: identifiant(), nom, etat: 'envoi', fait: 0, total: Math.max(1, Math.ceil(fichier.size / MORCEAU)), chemin: null };
  joints.push(j);
  dessiner();
  try {
    for (let i = 0; i < j.total; i++) {
      const donnees = await enBase64(fichier.slice(i * MORCEAU, (i + 1) * MORCEAU));
      const reponse = await new Promise((ok, ko) => {
        attentes.set(j.id, { ok, ko });
        dire({ t: 'fichier', projet: projet(), id: j.id, nom, index: i, total: j.total, donnees });
      });
      j.fait = i + 1;
      if (reponse.chemin) Object.assign(j, { chemin: reponse.chemin, etat: 'pret' });
      dessiner();
    }
  } catch (e) {
    if (e.message !== 'annule') {
      j.etat = 'echec';
      dessiner();
    }
  } finally {
    attentes.delete(j.id);
  }
}

export function joindreFichiers(liste) {
  if (!projet()) return;
  for (const f of liste) envoyerFichier(f);
}

/** Chemins des fichiers prêts, à citer dans le message ; null si un envoi n'est pas fini. */
export function prendrePieces() {
  if (joints.some((j) => j.etat === 'envoi')) {
    notifier(t('fichiers_en_cours'));
    return null;
  }
  const chemins = joints.filter((j) => j.etat === 'pret').map((j) => j.chemin);
  joints = [];
  dessiner();
  return chemins;
}

export function initPieces(lireProjet) {
  projet = lireProjet;
  const choix = document.getElementById('fichier-joint');
  document.getElementById('joindre').addEventListener('click', () => choix.click());
  choix.addEventListener('change', () => {
    joindreFichiers([...choix.files]);
    choix.value = '';
  });
  document.getElementById('champ').addEventListener('paste', (e) => {
    const fichiers = [...(e.clipboardData?.files || [])];
    if (!fichiers.length) return;
    e.preventDefault();
    joindreFichiers(fichiers);
  });
  const scene = document.querySelector('.scene');
  scene.dataset.depot = t('deposer');
  scene.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files') || !projet()) return;
    e.preventDefault();
    scene.classList.add('depot');
  });
  scene.addEventListener('dragleave', (e) => e.target === scene && scene.classList.remove('depot'));
  scene.addEventListener('drop', (e) => {
    scene.classList.remove('depot');
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    joindreFichiers([...e.dataTransfer.files]);
  });
  ecouter((m) => {
    if (m.t === 'fichier_avance' || m.t === 'fichier_recu') attentes.get(m.id)?.ok(m);
    // Un refus du serveur ne dit pas de quel fichier il s'agit : les envois en cours s'arrêtent tous.
    else if (m.t === 'refus' && m.ordre === 'fichier') for (const a of attentes.values()) a.ko(new Error(m.code));
  });
}
