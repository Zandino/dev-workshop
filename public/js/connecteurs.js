// Connecteurs partagés (serveurs MCP) : déclarés une fois, donnés à toutes les IA qui y ont droit.
// Les valeurs secrètes (variables, en-têtes) partent au serveur et n'en reviennent jamais : l'écran n'en voit
// que les noms. Laisser une valeur vide à la modification garde l'ancienne.
import { h, notifier } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { dire, ecouter } from './canal.js';
import { libelleCompte } from './comptes.js';
import { pastilleLogo } from './logos.js';

ajouterTextes({
  fr: {
    connecteurs: 'Connecteurs', connecteurs_titre: 'Connecteurs partagés',
    connecteurs_aide: 'Un connecteur (serveur MCP) déclaré ici est donné à toutes les IA qui y ont droit : Claude, ChatGPT, Gemini. Les connecteurs claude.ai (Gmail, Drive…) restent liés à ton compte Anthropic : seul Claude peut s’en servir.',
    connecteurs_vide: 'Aucun connecteur partagé pour l’instant.', connecteur_ajouter: 'Ajouter ou modifier un connecteur',
    connecteur_nom: 'Nom (lettres, chiffres, tirets)', connecteur_type_stdio: 'Programme sur le serveur (stdio)', connecteur_type_http: 'Adresse web (HTTP)',
    connecteur_commande: 'Commande (ex. npx)', connecteur_arguments: 'Arguments, un par ligne', connecteur_env: 'Variables, une par ligne : NOM=valeur',
    connecteur_url: 'Adresse (https://…)', connecteur_entetes: 'En-têtes, un par ligne : Nom: valeur', connecteur_garde: 'Une valeur laissée vide garde l’ancienne.',
    acces_titre: 'Qui y a accès', acces_externe: 'Ce que renvoie un connecteur part alors chez ce fournisseur, hors du serveur.',
    modifier: 'Modifier', refus_connecteur_nom_invalide: 'Nom de connecteur invalide.', refus_connecteur_invalide: 'Connecteur incomplet ou invalide.',
    refus_trop_de_connecteurs: 'Trop de connecteurs.',
    connecteur_catalogue: 'Partir d’un connecteur connu…', connecteur_cle_a_coller: 'Remplace la valeur vide ou COLLE_ICI… par ta clé, puis enregistre.',
    connecteurs_importer: 'Importer', connecteurs_importer_aide: 'Reprendre les connecteurs déjà déclarés dans Claude Code et Gemini sur le serveur',
    connecteurs_importes: '{n} connecteur(s) importé(s) : {noms}.', connecteurs_rien_a_importer: 'Aucun nouveau connecteur à importer (Claude Code et Gemini n’en déclarent pas d’autres sur le serveur).',
  },
  en: {
    connecteurs: 'Connectors', connecteurs_titre: 'Shared connectors',
    connecteurs_aide: 'A connector (MCP server) declared here is given to every AI allowed to use it: Claude, ChatGPT, Gemini. claude.ai connectors (Gmail, Drive…) stay tied to your Anthropic account: only Claude can use them.',
    connecteurs_vide: 'No shared connector yet.', connecteur_ajouter: 'Add or edit a connector',
    connecteur_nom: 'Name (letters, digits, dashes)', connecteur_type_stdio: 'Program on the server (stdio)', connecteur_type_http: 'Web address (HTTP)',
    connecteur_commande: 'Command (e.g. npx)', connecteur_arguments: 'Arguments, one per line', connecteur_env: 'Variables, one per line: NAME=value',
    connecteur_url: 'Address (https://…)', connecteur_entetes: 'Headers, one per line: Name: value', connecteur_garde: 'A value left empty keeps the previous one.',
    acces_titre: 'Who can use them', acces_externe: 'What a connector returns then goes to that vendor, outside the server.',
    modifier: 'Edit', refus_connecteur_nom_invalide: 'Invalid connector name.', refus_connecteur_invalide: 'Incomplete or invalid connector.',
    refus_trop_de_connecteurs: 'Too many connectors.',
    connecteur_catalogue: 'Start from a known connector…', connecteur_cle_a_coller: 'Replace the empty value or COLLE_ICI… with your key, then save.',
    connecteurs_importer: 'Import', connecteurs_importer_aide: 'Bring in the connectors already declared in Claude Code and Gemini on the server',
    connecteurs_importes: '{n} connector(s) imported: {noms}.', connecteurs_rien_a_importer: 'No new connector to import (Claude Code and Gemini declare no other on the server).',
  },
});

/**
 * Catalogue de départ (paquets et adresses vérifiés) : le formulaire se remplit, il ne reste qu'à coller sa clé.
 * Versions figées, comme le reste du projet.
 */
const CATALOGUE = [
  { libelle: 'Navigateur web (Playwright) : ouvrir, cliquer, tester un site', nom: 'navigateur', type: 'stdio', commande: 'npx', arguments: ['-y', '@playwright/mcp@0.0.86', '--headless', '--isolated', '--browser', 'chromium'], envTexte: '' },
  { libelle: 'GitHub (dépôts, issues, PR)', nom: 'github', type: 'http', url: 'https://api.githubcopilot.com/mcp/', entetesTexte: 'Authorization: Bearer COLLE_ICI_TON_JETON_GITHUB' },
  { libelle: 'Supabase (bases, migrations ; lecture seule)', nom: 'supabase', type: 'stdio', commande: 'npx', arguments: ['-y', '@supabase/mcp-server-supabase@0.18.0', '--read-only'], envTexte: 'SUPABASE_ACCESS_TOKEN=' },
  { libelle: 'Notion (pages, bases)', nom: 'notion', type: 'stdio', commande: 'npx', arguments: ['-y', '@notionhq/notion-mcp-server@2.6.1'], envTexte: 'NOTION_TOKEN=' },
  { libelle: 'Stripe (paiements)', nom: 'stripe', type: 'http', url: 'https://mcp.stripe.com', entetesTexte: 'Authorization: Bearer COLLE_ICI_TA_CLE_STRIPE' },
  { libelle: 'Sentry (erreurs en production)', nom: 'sentry', type: 'stdio', commande: 'npx', arguments: ['-y', '@sentry/mcp-server@0.50.0'], envTexte: 'SENTRY_ACCESS_TOKEN=' },
  { libelle: 'Brave Search (recherche web)', nom: 'recherche-web', type: 'stdio', commande: 'npx', arguments: ['-y', '@brave/brave-search-mcp-server@2.2.0'], envTexte: 'BRAVE_API_KEY=' },
  { libelle: 'Firecrawl (lire et extraire des sites)', nom: 'firecrawl', type: 'stdio', commande: 'npx', arguments: ['-y', 'firecrawl-mcp@3.41.0'], envTexte: 'FIRECRAWL_API_KEY=' },
  { libelle: 'Context7 (documentation à jour des bibliothèques)', nom: 'context7', type: 'stdio', commande: 'npx', arguments: ['-y', '@upstash/context7-mcp@4.7.3'], envTexte: 'CONTEXT7_API_KEY=' },
];

const panneau = () => document.getElementById('panneau-connecteurs');
let lireComptes = () => [];
let vue = { serveurs: [], acces: [] };
let edite = null;

const lignes = (texte) => texte.split('\n').map((l) => l.trim()).filter(Boolean);
function paires(texte, separateur) {
  const o = {};
  for (const l of lignes(texte)) {
    const i = l.indexOf(separateur);
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    else o[l] = '';
  }
  return o;
}

function formulaire() {
  const s = edite || { type: 'stdio', arguments: [], env: [], entetes: [] };
  const nom = h('input', { type: 'text', maxLength: 41, required: true, value: s.nom || '', placeholder: t('connecteur_nom') });
  const type = h('select', { onchange: () => basculer() }, h('option', { value: 'stdio', selected: s.type === 'stdio' }, t('connecteur_type_stdio')), h('option', { value: 'http', selected: s.type === 'http' }, t('connecteur_type_http')));
  const commande = h('input', { type: 'text', value: s.commande || '', placeholder: t('connecteur_commande') });
  const args = h('textarea', { rows: 3, placeholder: t('connecteur_arguments') });
  args.value = (s.arguments || []).join('\n');
  const env = h('textarea', { rows: 3, placeholder: t('connecteur_env') });
  env.value = s.envTexte ?? (s.env || []).map((k) => `${k}=`).join('\n');
  const url = h('input', { type: 'url', value: s.url || '', placeholder: t('connecteur_url') });
  const entetes = h('textarea', { rows: 3, placeholder: t('connecteur_entetes') });
  entetes.value = s.entetesTexte ?? (s.entetes || []).map((k) => `${k}: `).join('\n');
  const catalogue = h('select', { onchange: () => {
    const modele = CATALOGUE[catalogue.value];
    if (!modele) return;
    edite = { ...modele, modele: true };
    dessiner();
  } }, h('option', { value: '' }, t('connecteur_catalogue')), CATALOGUE.map((c, i) => h('option', { value: i }, c.libelle)));
  const stdio = h('div.grille', {}, commande, args, env);
  const http = h('div.grille', {}, url, entetes);
  const basculer = () => {
    stdio.hidden = type.value !== 'stdio';
    http.hidden = type.value !== 'http';
  };
  basculer();
  return h('form.ajout-compte', { onsubmit: (e) => {
    e.preventDefault();
    const connecteur = type.value === 'stdio'
      ? { nom: nom.value.trim(), type: 'stdio', commande: commande.value.trim(), arguments: lignes(args.value), env: paires(env.value, '=') }
      : { nom: nom.value.trim(), type: 'http', url: url.value.trim(), entetes: paires(entetes.value, ':') };
    dire({ t: 'connecteur_definir', connecteur });
    edite = null;
  } }, h('h3', {}, t('connecteur_ajouter')), catalogue, nom, type, stdio, http,
  edite?.modele ? h('p.aide', {}, t('connecteur_cle_a_coller')) : edite ? h('p.aide', {}, t('connecteur_garde')) : null,
  h('button.principal', { type: 'submit' }, t('enregistrer')));
}

function carte(s) {
  const detail = s.type === 'stdio' ? [s.commande, ...(s.arguments || [])].join(' ') : s.url;
  const noms = s.type === 'stdio' ? s.env : s.entetes;
  return h('article.compte', {},
    h('header', {}, h('strong', {}, s.nom), h('span.type', {}, s.type === 'stdio' ? 'stdio' : 'HTTP'),
      h('button.discret', { type: 'button', onclick: () => { edite = s; dessiner(); } }, t('modifier')),
      h('button.discret', { type: 'button', onclick: () => dire({ t: 'connecteur_supprimer', nom: s.nom }) }, t('supprimer'))),
    h('p.aide', {}, h('code', {}, detail)),
    noms?.length ? h('div.rangee', {}, noms.map((n) => h('span.badge', {}, n))) : null);
}

function acces() {
  const comptes = lireComptes();
  return h('section.bloc-projet', {}, h('h3', {}, t('acces_titre')),
    vue.acces.map((a) => {
      const c = comptes.find((x) => x.id === a.id);
      if (!c) return null;
      const case_ = h('input', { type: 'checkbox', checked: a.autorise, onchange: (e) => dire({ t: 'connecteur_acces', id: a.id, autorise: e.target.checked }) });
      return h('label.option', {}, case_, pastilleLogo(c), h('span', {}, libelleCompte(c), a.externe ? h('small', {}, t('acces_externe')) : null));
    }));
}

function dessiner() {
  panneau().replaceChildren(h('div.boite', {},
    h('header', {}, h('h2', {}, t('connecteurs_titre')), h('span.ressort'),
      h('button', { type: 'button', title: t('connecteurs_importer_aide'), onclick: () => dire({ t: 'connecteurs_importer' }) }, t('connecteurs_importer')),
      h('button', { type: 'button', onclick: () => (panneau().hidden = true) }, t('fermer'))),
    h('p.aide', {}, t('connecteurs_aide')),
    vue.serveurs.length ? h('div.liste-comptes', {}, vue.serveurs.map(carte)) : h('p.vide', {}, t('connecteurs_vide')),
    h('div.deux', {}, formulaire(), acces())));
}

export function initConnecteurs(comptes) {
  lireComptes = comptes;
  document.getElementById('ouvrir-connecteurs').addEventListener('click', () => {
    panneau().hidden = false;
    edite = null;
    dessiner();
    dire({ t: 'connecteurs_lire' });
  });
  ecouter((m) => {
    if (m.t === 'connecteurs_importes') {
      notifier(m.ajoutes.length ? t('connecteurs_importes', { n: m.ajoutes.length, noms: m.ajoutes.join(', ') }) : t('connecteurs_rien_a_importer'));
      return;
    }
    if (m.t !== 'connecteurs') return;
    vue = m;
    if (!panneau().hidden) dessiner();
  });
}
