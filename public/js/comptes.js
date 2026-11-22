// Panneau des comptes : connexion par compte (Claude, ChatGPT, Google) et IA par adresse (LM Studio, Ollama, API).
// Le lien de connexion s'ouvre dans le navigateur de la personne ; une clé d'API saisie ici part une fois
// au serveur et ne revient jamais.
import { h } from './dom.js';
import { t } from './i18n.js';
import { dire } from './canal.js';
import { pastilleLogo } from './logos.js';

const SERVICES = [['claude', 'Claude (Anthropic)'], ['codex', 'ChatGPT (OpenAI Codex)'], ['gemini', 'Gemini (Google)'], ['copilot', 'GitHub Copilot (compte GitHub)']];
const NOM_TYPE = { claude: 'Claude Code', codex: 'OpenAI Codex', gemini: 'Gemini CLI', copilot: 'Copilot CLI', qwen: 'Agent (Qwen Code)', api: null };

/** Adresses de départ des serveurs compatibles OpenAI les plus courants (modifiables). */
const ADRESSES = [
  ['LM Studio', 'http://localhost:1234/v1'],
  ['Ollama', 'http://localhost:11434/v1'],
  ['OpenAI (clé d’API)', 'https://api.openai.com/v1'],
  ['Google Gemini (clé d’API)', 'https://generativelanguage.googleapis.com/v1beta/openai'],
  ['Mistral (clé d’API)', 'https://api.mistral.ai/v1'],
  ['DeepSeek (clé d’API)', 'https://api.deepseek.com/v1'],
  ['Grok, xAI (clé d’API)', 'https://api.x.ai/v1'],
  ['OpenRouter (clé d’API, tous les modèles)', 'https://openrouter.ai/api/v1'],
  ['Groq (clé d’API)', 'https://api.groq.com/openai/v1'],
];

/**
 * Clé enregistrée pour un compte : Gemini (clé d'API AI Studio, la connexion Google personnelle étant fermée)
 * ou Copilot (jeton GitHub, à la place de `copilot login`).
 */
function formulaireCleGemini(c) {
  const cle = h('input', { type: 'password', autocomplete: 'off', placeholder: t(c.type === 'copilot' ? 'copilot_cle_champ' : 'gemini_cle_champ') });
  return h('form.rangee', { onsubmit: (e) => {
    e.preventDefault();
    if (!cle.value.trim()) return;
    dire({ t: 'cle_compte', id: c.id, cle: cle.value.trim() });
    cle.value = '';
    // Le serveur présente la clé (Gemini : à Google), puis renvoie l'état du compte : « Vérification… » d'ici là.
    etats.set(c.id, { verification: true });
    redessiner();
  } },
  h('span.badge.' + (c.cle ? 'oui' : 'non'), {}, c.cle ? t('cle_presente', { n: c.cle }) : t('cle_absente')),
  cle, h('button', { type: 'submit' }, t('enregistrer_cle')));
}

let comptes = [];
const etats = new Map();
const connexions = new Map();
const panneau = () => document.getElementById('panneau-comptes');

export function libelleCompte(c) {
  if (c.type === 'api') return `${c.nom} · ${c.modele}${c.externe ? ' ↗' : ''}`;
  if (c.type === 'qwen') return `${c.nom} · ${c.modele} · ${t('avec_outils')}${c.externe ? ' ↗' : ''}`;
  return c.defaut ? t('compte_defaut') : `${c.nom} · ${NOM_TYPE[c.type]}${c.externe ? ' ↗' : ''}`;
}

const redessiner = () => !panneau().hidden && dessiner();

export function majComptes(liste) {
  comptes = liste;
  redessiner();
}

export function surEtatCompte(m) {
  etats.set(m.id, m);
  redessiner();
}

/** Étapes de la connexion par compte : lien à ouvrir, puis réussite ou échec. */
export function surConnexion(m) {
  if (m.etape === 'lien') connexions.set(m.id, m);
  else if (m.etape === 'verification') {
    connexions.delete(m.id);
    etats.set(m.id, { verification: true });
  } else {
    connexions.delete(m.id);
    etats.delete(m.id);
    if (m.etape === 'reussie') dire({ t: 'etat_compte', id: m.id });
    else if (m.motif !== 'annulee') etats.set(m.id, { connecte: false, echec: true, motif: m.motif && m.motif !== 'delai' ? m.motif : null });
  }
  redessiner();
}

/** À l'ouverture, l'état de chaque compte est demandé à son outil (sans appel au modèle) : le panneau
 * propose alors « Se connecter » seulement à un compte qui ne l'est pas, et « Se déconnecter » aux autres. */
export function ouvrirComptes() {
  panneau().hidden = false;
  for (const c of comptes) {
    if (c.type === 'api' || connexions.has(c.id)) continue;
    etats.set(c.id, { verification: true });
    dire({ t: 'etat_compte', id: c.id });
  }
  dessiner();
}

function blocConnexion(c) {
  const k = connexions.get(c.id);
  if (!k) return null;
  const code = h('input', { type: 'text', autocomplete: 'off', placeholder: t('code_a_coller') });
  return h(
    'div.connexion',
    {},
    k.refuse ? h('p.alerte', {}, t('code_refuse')) : null,
    h('p.aide', {}, t('connexion_etape_lien')),
    h('a.principal', { href: k.url, target: '_blank', rel: 'noopener noreferrer' }, t('ouvrir_lien')),
    k.code ? h('p', {}, t('connexion_code_a_saisir'), ' ', h('strong.code-court', {}, k.code)) : null,
    k.saisie
      ? h('form.rangee', { onsubmit: (e) => {
        e.preventDefault();
        if (code.value.trim()) dire({ t: 'code_connexion', id: c.id, code: code.value.trim() });
        code.value = '';
      } }, code, h('button.principal', { type: 'submit' }, t('valider_code')))
      : h('p.aide', {}, t('connexion_attente')),
    h('button.discret', { type: 'button', onclick: () => dire({ t: 'annuler_connexion', id: c.id }) }, t('annuler')),
  );
}

function etatConnexion(c) {
  const e = etats.get(c.id);
  const verifier = h('button', { type: 'button', onclick: () => dire({ t: 'etat_compte', id: c.id }) }, t('verifier'));
  if (!e) return verifier;
  if (e.verification) return h('span.badge', {}, t('verification_en_cours'));
  if (e.connecte) {
    const badge = h('span.badge.oui', {}, [t('connecte'), e.abonnement, e.adresse].filter(Boolean).join(' · '));
    if (c.defaut) return badge; // le compte du serveur se gère sur le serveur, pas d'ici
    return h('span.rangee', {}, badge, h('button.discret', { type: 'button', onclick: () => {
      if (!confirm(t('confirmer_deconnexion', { nom: c.nom }))) return;
      etats.set(c.id, { verification: true });
      dire({ t: 'deconnecter_compte', id: c.id });
      redessiner();
    } }, t('se_deconnecter')));
  }
  const badge = h('span.badge.non', {}, e.echec ? t('connexion_echec') : t('non_connecte'));
  // Le compte du serveur ne se connecte pas d'ici : on montre le chemin le plus simple.
  const aide = e.motif || (c.defaut ? t('defaut_non_connecte') : null);
  return aide ? h('span', {}, badge, ' ', h('span.aide', {}, aide)) : badge;
}

function carte(c) {
  const detail = [];
  if (c.type === 'api' || c.type === 'qwen') {
    detail.push(
      h('div.rangee', {}, h('span.badge.' + (c.externe ? 'externe' : 'oui'), {}, c.externe ? t('externe') : t('local')), h('span.badge.' + (c.cle ? 'oui' : 'non'), {}, c.cle ? t('cle_presente', { n: c.cle }) : t('cle_absente'))),
      h('p.aide', {}, `${c.url} · ${c.modele}`),
    );
  } else {
    // « Se connecter » seulement quand on sait que le compte ne l'est pas.
    const e = etats.get(c.id);
    const seConnecter = c.connectable && !connexions.has(c.id) && e && !e.verification && !e.connecte
      ? h('button.principal', { type: 'button', onclick: () => dire({ t: 'connecter_compte', id: c.id }) }, t('se_connecter'))
      : null;
    // Gemini : pas de « Se connecter ». La connexion Google aboutit, mais Google refuse ensuite Gemini CLI pour un
    // compte personnel (« This client is no longer supported for Gemini Code Assist », relevé le 21/11/2026) :
    // le bouton menait à une impasse. Seule la clé d'API marche ; le lien mène à la page qui la crée.
    const sansBouton = c.type === 'gemini' || (c.type === 'copilot' && c.cle);
    detail.push(h('div.rangee', {}, etatConnexion(c), sansBouton ? null : seConnecter), blocConnexion(c));
    if (c.type === 'gemini') {
      detail.push(
        h('p.aide', {}, t('gemini_cle_aide'), ' ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener noreferrer' }, t('gemini_creer_cle'))),
        formulaireCleGemini(c),
      );
    }
    if (c.type === 'copilot') detail.push(h('p.aide', {}, t('copilot_cle_aide')), formulaireCleGemini(c));
    if (c.type !== 'claude') detail.push(h('p.aide', {}, t('jamais_essaye')));
  }
  const retirer = c.defaut ? null : h('button.discret', { type: 'button', onclick: () => confirm(t('supprimer_compte', { nom: c.nom })) && dire({ t: 'supprimer_compte', id: c.id }) }, t('supprimer'));
  return h('article.compte', {}, h('header', {}, pastilleLogo(c), h('strong', {}, c.defaut ? t('compte_defaut') : c.nom), h('span.type', {}, NOM_TYPE[c.type] || t('type_api')), retirer), detail);
}

function formulaireConnexion() {
  const service = h('select', {}, SERVICES.map(([id, nom]) => h('option', { value: id }, nom)));
  const nom = h('input', { type: 'text', maxLength: 40, required: true, placeholder: t('nom_compte') });
  return h('form.ajout-compte', { onsubmit: (e) => {
    e.preventDefault();
    dire({ t: 'creer_compte', type: service.value, nom: nom.value });
    nom.value = '';
  } }, h('h3', {}, t('ajouter_connexion')), h('p.aide', {}, t('aide_connexion_compte')), service, nom, h('button.principal', { type: 'submit' }, t('ajouter')));
}

function formulaireAdresse() {
  const nom = h('input', { type: 'text', maxLength: 40, required: true, placeholder: t('nom_compte') });
  const url = h('input', { type: 'url', required: true, placeholder: 'http://…/v1' });
  const modele = h('input', { type: 'text', maxLength: 120, required: true, placeholder: t('nom_modele') });
  const cle = h('input', { type: 'password', autocomplete: 'off', placeholder: t('cle_api') });
  const choix = h('select', { onchange: () => {
    const [libelle, adresse] = ADRESSES[choix.value] || [];
    if (adresse) url.value = adresse;
    if (libelle && !nom.value) nom.value = libelle.replace(/ \(.*/, '');
  } }, h('option', { value: '' }, t('choisir_service')), ADRESSES.map(([libelle], i) => h('option', { value: i }, libelle)));
  // Coché : l'IA devient un agent (Qwen Code) qui lit, modifie et lance des commandes, avec accord.
  const outils = h('input', { type: 'checkbox', checked: true });
  return h('form.ajout-compte', { onsubmit: (e) => {
    e.preventDefault();
    dire({ t: 'creer_compte', type: outils.checked ? 'qwen' : 'api', nom: nom.value, url: url.value, modele: modele.value, cle: cle.value || undefined });
    for (const champ of [nom, url, modele, cle]) champ.value = '';
    choix.value = '';
  } }, h('h3', {}, t('ajouter_api')), h('p.aide', {}, t('aide_api_agent')), choix, nom, url, modele, cle,
  h('label.option', {}, outils, h('span', {}, t('avec_outils_case'))),
  h('button.principal', { type: 'submit' }, t('ajouter')));
}

function dessiner() {
  panneau().replaceChildren(
    h('div.boite', {},
      h('header', {}, h('h2', {}, t('comptes')), h('button', { type: 'button', onclick: () => (panneau().hidden = true) }, t('fermer'))),
      h('div.liste-comptes', {}, comptes.map(carte)),
      h('div.deux', {}, formulaireConnexion(), formulaireAdresse()),
    ),
  );
}
