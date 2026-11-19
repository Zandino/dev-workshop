// Logos des IA (public/logos/, LobeHub Icons, licence MIT ; voir NOTICE). Les marques appartiennent à leurs
// propriétaires : les logos ne servent qu'à reconnaître le service de chaque compte.
import { h } from './dom.js';

const PAR_TYPE = { claude: 'claude', codex: 'openai', gemini: 'gemini', copilot: 'copilot' };

/** Compte par adresse (API compatible OpenAI) : on reconnaît le service à son adresse. */
const PAR_ADRESSE = [
  [/anthropic\.com/, 'claude'],
  [/openai\.com/, 'openai'],
  [/generativelanguage\.googleapis\.com|googleapis\.com/, 'gemini'],
  [/mistral\.ai/, 'mistral'],
  [/deepseek\.com/, 'deepseek'],
  [/x\.ai/, 'grok'],
  [/openrouter\.ai/, 'openrouter'],
  [/groq\.com/, 'groq'],
  [/dashscope|qwen|aliyuncs/, 'qwen'],
  [/:11434\b/, 'ollama'],
  [/:1234\b/, 'lmstudio'],
];

/** Nom du logo d'un compte (vue de l'écran : { type, url }), ou null. */
export function logoDe(compte) {
  if (!compte) return null;
  if (PAR_TYPE[compte.type]) return PAR_TYPE[compte.type];
  // Compte par clé (discussion seule ou agent Qwen Code) : reconnu à son adresse ; l'agent, à défaut, logo Qwen.
  if (compte.type === 'api' || compte.type === 'qwen') return PAR_ADRESSE.find(([motif]) => motif.test(compte.url || ''))?.[1] || (compte.type === 'qwen' ? 'qwen' : null);
  return null;
}

/** Pastille ronde avec le logo (ou l'initiale du nom, à défaut). */
export function pastilleLogo(compte, nom = '') {
  const logo = logoDe(compte);
  if (logo) return h('span.logo-ia', { 'aria-hidden': 'true' }, h('img', { src: `/logos/${logo}.svg`, alt: '', draggable: false }));
  return h('span.logo-ia.initiale', { 'aria-hidden': 'true' }, (nom || compte?.nom || '?').trim().charAt(0).toUpperCase());
}
