// Onglet « IA » du panneau des terminaux (public/js/terminal-ia.js) : les commandes des IA écrites comme dans un
// terminal, leur sortie à la fin, les commandes simultanées, les échecs, et ce qui n'est pas une commande.
//   node tests/terminal-ia.mjs
import { journalCommandes, commandeDe } from '../public/js/terminal-ia.js';

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const sansCouleurs = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

let ecrit = '';
const j = journalCommandes((s) => { ecrit += s; }, { echec: 'failed' });
const outil = (id, entree, nom = 'Bash', auteur) => ({ t: 'assistant', ...(auteur ? { auteur: { nom: auteur } } : {}), blocs: [{ type: 'outil', id, nom, entree }] });

j.evenement({ t: 'utilisateur', texte: 'lance les tests' });
j.evenement({ t: 'assistant', blocs: [{ type: 'texte', texte: 'Je lance.' }] });
noter('texte et messages : rien d’écrit', ecrit === '');

j.evenement(outil('a', { command: 'npm test', description: 'tests' }));
noter('commande écrite à son lancement', sansCouleurs(ecrit) === '$ npm test\r\n', JSON.stringify(ecrit));
j.evenement({ t: 'resultat_outil', id: 'a', contenu: 'ok 1\nok 2', erreur: false });
noter('sortie à la fin, fins de ligne de terminal', sansCouleurs(ecrit).endsWith('$ npm test\r\nok 1\r\nok 2\r\n'), JSON.stringify(ecrit));

// Deux commandes en même temps : la sortie de la première rappelle sa commande.
ecrit = '';
j.evenement(outil('b', { command: 'sleep 5; echo un' }, 'Bash', 'Claude'));
j.evenement(outil('c', { command: 'echo deux' }));
j.evenement({ t: 'resultat_outil', id: 'c', contenu: 'deux\n' });
j.evenement({ t: 'resultat_outil', id: 'b', contenu: 'un\n' });
const lignes = sansCouleurs(ecrit).split('\r\n').filter(Boolean);
noter('commandes simultanées : chaque sortie sous sa commande', JSON.stringify(lignes) === JSON.stringify(['Claude $ sleep 5; echo un', '$ echo deux', 'deux', 'Claude $ sleep 5; echo un (suite)', 'un']), JSON.stringify(lignes));

ecrit = '';
j.evenement(outil('d', { command: 'false' }));
j.evenement({ t: 'resultat_outil', id: 'd', contenu: '', erreur: true });
noter('échec marqué (texte dans la langue de l’écran)', sansCouleurs(ecrit).includes('✗ failed'));

ecrit = '';
j.evenement(outil('e', { file_path: '/x/y.js' }, 'Read'));
j.evenement({ t: 'resultat_outil', id: 'e', contenu: 'contenu du fichier' });
j.evenement({ t: 'resultat_outil', id: 'inconnu', contenu: 'rien' });
noter('outil sans commande (lecture de fichier) et résultat orphelin : ignorés', ecrit === '');

noter('commande de Codex en tableau', commandeDe({ entree: { command: ['git', 'status'] } }) === 'git status');
noter('commande vide : pas une commande', commandeDe({ entree: { command: '  ' } }) === null);

j.vider();
ecrit = '';
j.evenement({ t: 'resultat_outil', id: 'b', contenu: 'tard' });
j.evenement(outil('f', { command: 'ls' }));
noter('vider (autre discussion) : repart de zéro, sans ligne vide en tête', sansCouleurs(ecrit) === '$ ls\r\n', JSON.stringify(ecrit));

const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
