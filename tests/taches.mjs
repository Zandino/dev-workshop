// Essai de la lecture des messages « task_* » du SDK de Claude (fournisseurs/claude-normaliser.mjs) : seuls les
// sous-agents sont suivis, les progrès sont espacés, la fin donne le compte rendu. Sans serveur ni modèle.
//   node tests/taches.mjs
import { tacheVersEvenement } from '../serveur/fournisseurs/claude-normaliser.mjs';

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const suivies = new Map();
const sys = (subtype, x) => ({ type: 'system', subtype, ...x });

const debut = tacheVersEvenement(sys('task_started', { task_id: 'k1', tool_use_id: 'toolu_1', description: 'Relecture', subagent_type: 'general-purpose', task_type: 'local_agent', is_backgrounded: true }), suivies);
noter('début d’un sous-agent en arrière-plan', debut?.t === 'tache' && debut.etape === 'debut' && debut.id === 'toolu_1' && debut.enFond === true && debut.type === 'general-purpose');
noter('commande lancée en arrière-plan : ignorée', tacheVersEvenement(sys('task_started', { task_id: 'k2', tool_use_id: 'toolu_2', description: 'npm test', task_type: 'local_bash' }), suivies) === null);
noter('tâche « ambiante » : ignorée', tacheVersEvenement(sys('task_started', { task_id: 'k3', tool_use_id: 'toolu_3', task_type: 'local_agent', ambient: true }), suivies) === null);
noter('ancienne version sans task_type : reconnue à son type de sous-agent', tacheVersEvenement(sys('task_started', { task_id: 'k4', tool_use_id: 'toolu_4', subagent_type: 'Explore' }), suivies)?.id === 'toolu_4');
noter('tâche inconnue : rien', tacheVersEvenement(sys('task_progress', { task_id: 'zz', last_tool_name: 'Read' }), suivies) === null);

const t0 = 1_000_000;
const p1 = tacheVersEvenement(sys('task_progress', { task_id: 'k1', last_tool_name: 'Grep', usage: { total_tokens: 1200, tool_uses: 3, duration_ms: 4000 } }), suivies, t0);
noter('progrès : dernier outil, jetons', p1?.etape === 'progres' && p1.outil === 'Grep' && p1.jetons === 1200 && p1.outils === 3);
noter('même outil 5 s plus tard : pas d’événement (journal borné)', tacheVersEvenement(sys('task_progress', { task_id: 'k1', last_tool_name: 'Grep', usage: { total_tokens: 1500 } }), suivies, t0 + 5000) === null);
noter('… mais un nouvel outil, tout de suite', tacheVersEvenement(sys('task_progress', { task_id: 'k1', last_tool_name: 'Read', usage: { total_tokens: 1600 } }), suivies, t0 + 6000)?.outil === 'Read');
noter('… et le même, au bout de 15 s', tacheVersEvenement(sys('task_progress', { task_id: 'k1', last_tool_name: 'Read', usage: { total_tokens: 9000 } }), suivies, t0 + 22_000)?.jetons === 9000);
const k4 = tacheVersEvenement(sys('task_updated', { task_id: 'k4', patch: { is_backgrounded: true } }), suivies);
noter('passé en arrière-plan en cours de route : signalé', k4?.etape === 'debut' && k4.enFond === true && k4.id === 'toolu_4');
const fin = tacheVersEvenement(sys('task_notification', { task_id: 'k1', tool_use_id: 'toolu_1', status: 'completed', output_file: '/tmp/x', summary: 'Trois commits relus.', usage: { total_tokens: 20000 } }), suivies);
noter('fin : statut, compte rendu, en arrière-plan', fin?.etape === 'fin' && fin.statut === 'completed' && fin.resume === 'Trois commits relus.' && fin.enFond === true && fin.description === 'Relecture' && fin.jetons === 20000);
noter('après sa fin, la tâche n’est plus suivie', !suivies.has('k1'));

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
