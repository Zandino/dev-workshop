// Chemins de fichiers cités par une IA (public/js/chemins.js) : ce qui devient un lien, ce qui n'en devient pas, et la
// pose des liens dans un message rendu (navigateur simulé).
//   node tests/chemins.mjs
import { JSDOM } from 'jsdom';
import { trouverChemins, lierChemins } from '../public/js/chemins.js';

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const chemins = (texte) => trouverChemins(texte).map((x) => x.chemin);
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const cas = [
  ['dossier personnel', 'Elles sont dans ~/travaux/maquettes/.', ['~/travaux/maquettes/']],
  ['absolu, ponctuation de fin retirée', 'Voir /home/moi/rapport.pdf, puis la suite.', ['/home/moi/rapport.pdf']],
  ['fichiers joints du projet', 'Déposé dans .devworkshop/fichiers/capture-1.png', ['.devworkshop/fichiers/capture-1.png']],
  ['relatif avec dossier et extension', 'J’ai modifié src/app.js et store/nouveautes-1.4.23.md.', ['src/app.js', 'store/nouveautes-1.4.23.md']],
  ['entre guillemets français', 'le fichier « ~/notes/plan.txt » est prêt', ['~/notes/plan.txt']],
  ['entre parenthèses', '(voir ./docs/guide.md)', ['./docs/guide.md']],
  ['adresse web : rien', 'https://example.org/a/b.html et http://x.y/z', []],
  ['chemin Windows : rien', 'C:\\Users\\moi\\fichier.txt', []],
  ['nom seul sans dossier : rien', 'index.html et package.json', []],
  ['relatif sans extension : rien', 'la branche feat/terminal et et/ou', []],
  ['date : rien', 'le 26/11/2026', []],
  ['un seul niveau absolu : rien', 'la racine /tmp suffit', []],
];
for (const [nom, texte, attendu] of cas) {
  const lu = chemins(texte);
  noter(nom, egal(lu, attendu), JSON.stringify(lu));
}

// Dans un message rendu : texte et code en ligne oui ; bloc de code et lien existant non.
const { window } = new JSDOM('<!doctype html><div id="m"><p>Captures dans <code>~/travaux/maquettes/</code> et /srv/site/index.html.</p><pre><code>cat ~/secret/a.txt</code></pre><p><a href="https://x.y">~/deja/lien.txt</a></p></div>');
const racine = window.document.getElementById('m');
lierChemins(racine, 'Ouvrir dans l’aperçu');
const liens = [...racine.querySelectorAll('a.chemin-fichier')];
noter('liens posés : code en ligne et texte', egal(liens.map((a) => a.dataset.chemin), ['~/travaux/maquettes/', '/srv/site/index.html']), JSON.stringify(liens.map((a) => a.dataset.chemin)));
noter('… avec le titre, et le texte autour intact', liens[0]?.title === 'Ouvrir dans l’aperçu' && racine.querySelector('p').textContent === 'Captures dans ~/travaux/maquettes/ et /srv/site/index.html.');
noter('bloc de code et lien existant : non touchés', !racine.querySelector('pre a') && racine.querySelectorAll('a').length === 3);

const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
