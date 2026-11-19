// Connecteurs partagés (serveurs MCP) : déclarés une fois ici, donnés à toutes les IA qui y ont droit.
// Les comptes Claude y ont droit par défaut ; ChatGPT (Codex) et Gemini seulement sur accord, car ce qu'un
// connecteur renvoie part alors chez OpenAI ou Google. Les API sans outils n'en reçoivent pas.
// Les valeurs (variables d'environnement, en-têtes) restent sur le serveur : l'écran n'en voit que les noms.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DOSSIER_CONFIG } from './securite.mjs';

const FICHIER = path.join(DOSSIER_CONFIG, 'connecteurs.json');
const NOM = /^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$/;
const CLE = /^[A-Za-z_][A-Za-z0-9_-]{0,80}$/;
const MAX = 30;

function lire() {
  try {
    const d = JSON.parse(readFileSync(FICHIER, 'utf8'));
    return { serveurs: Array.isArray(d.serveurs) ? d.serveurs : [], acces: d.acces && typeof d.acces === 'object' ? d.acces : {} };
  } catch {
    return { serveurs: [], acces: {} };
  }
}

function ecrire(d) {
  mkdirSync(DOSSIER_CONFIG, { recursive: true, mode: 0o700 });
  writeFileSync(FICHIER, JSON.stringify(d, null, 2) + '\n', { mode: 0o600 });
}

function paires(objet) {
  const sortie = {};
  for (const [k, v] of Object.entries(objet && typeof objet === 'object' ? objet : {})) {
    if (!CLE.test(k)) throw new Error('connecteur_invalide');
    sortie[k] = String(v ?? '').slice(0, 4000);
  }
  return sortie;
}

/** Vérifie un connecteur saisi : { nom, type: 'stdio', commande, arguments, env } ou { nom, type: 'http', url, entetes }. */
function valider(s) {
  const nom = String(s?.nom || '').trim();
  if (!NOM.test(nom)) throw new Error('connecteur_nom_invalide');
  if (s.type === 'stdio') {
    const commande = String(s.commande || '').trim();
    if (!commande || commande.length > 300) throw new Error('connecteur_invalide');
    const args = Array.isArray(s.arguments) ? s.arguments.map((a) => String(a).slice(0, 1000)).slice(0, 40) : [];
    return { nom, type: 'stdio', commande, arguments: args, env: paires(s.env) };
  }
  if (s.type === 'http') {
    let url;
    try {
      url = new URL(String(s.url || ''));
    } catch {
      throw new Error('connecteur_invalide');
    }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('connecteur_invalide');
    return { nom, type: 'http', url: url.href, entetes: paires(s.entetes) };
  }
  throw new Error('connecteur_invalide');
}

/** Vue pour l'écran : jamais une valeur secrète, seulement les noms des variables et des en-têtes. */
export function vueConnecteurs(comptes) {
  const d = lire();
  return {
    serveurs: d.serveurs.map((s) => ({
      nom: s.nom,
      type: s.type,
      ...(s.type === 'stdio' ? { commande: s.commande, arguments: s.arguments, env: Object.keys(s.env || {}) } : { url: s.url, entetes: Object.keys(s.entetes || {}) }),
    })),
    acces: comptes.filter((c) => c.type !== 'api').map((c) => ({ id: c.id, autorise: aAcces(c, d), externe: c.type !== 'claude' })),
  };
}

/** Ajoute ou remplace un connecteur. Une valeur laissée vide garde l'ancienne (l'écran ne la connaît pas). */
export function definirConnecteur(saisie) {
  const d = lire();
  const nouveau = valider(saisie);
  const ancien = d.serveurs.find((s) => s.nom === nouveau.nom);
  const champ = nouveau.type === 'stdio' ? 'env' : 'entetes';
  if (ancien && ancien.type === nouveau.type) {
    for (const [k, v] of Object.entries(nouveau[champ])) if (v === '' && ancien[champ]?.[k] !== undefined) nouveau[champ][k] = ancien[champ][k];
  }
  const autres = d.serveurs.filter((s) => s.nom !== nouveau.nom);
  if (autres.length >= MAX) throw new Error('trop_de_connecteurs');
  ecrire({ ...d, serveurs: [...autres, nouveau] });
}

export function supprimerConnecteur(nom) {
  const d = lire();
  ecrire({ ...d, serveurs: d.serveurs.filter((s) => s.nom !== String(nom)) });
}

export function reglerAcces(id, autorise) {
  const d = lire();
  ecrire({ ...d, acces: { ...d.acces, [String(id)]: Boolean(autorise) } });
}

function aAcces(compte, d = lire()) {
  if (compte.type === 'api') return false;
  const choix = d.acces[compte.id];
  return choix === undefined ? compte.type === 'claude' : choix === true;
}

/** Connecteurs à donner à ce compte (liste vide s'il n'y a pas droit). */
export function connecteursPour(compte) {
  const d = lire();
  return aAcces(compte, d) ? d.serveurs : [];
}

function lireJson(fichier) {
  try {
    return JSON.parse(readFileSync(fichier, 'utf8'));
  } catch {
    return null;
  }
}

/** Un serveur MCP tel que l'écrivent Claude Code ou Gemini -> notre format (null s'il est illisible). */
function depuisOutil(nom, v) {
  if (!v || typeof v !== 'object') return null;
  if (v.command) return { nom, type: 'stdio', commande: v.command, arguments: Array.isArray(v.args) ? v.args : [], env: v.env || {} };
  const url = v.url || v.httpUrl;
  return url ? { nom, type: 'http', url, entetes: v.headers || {} } : null;
}

/**
 * Reprend les serveurs MCP déjà déclarés dans les outils du serveur : Claude Code (compte du serveur et
 * autres comptes Claude) et Gemini. Ce sont des réglages, pas des identifiants de connexion. Un connecteur
 * qui porte déjà ce nom ici n'est pas remplacé.
 */
export function importerConnecteurs(comptes, accueil) {
  const sources = [path.join(accueil, '.claude.json')];
  for (const c of comptes) {
    if (c.type === 'claude' && c.dossier) sources.push(path.join(c.dossier, '.claude.json'));
    if (c.type === 'gemini' && c.dossier) sources.push(path.join(c.dossier, '.gemini', 'settings.json'));
  }
  const d = lire();
  const ajoutes = [];
  const ignores = [];
  for (const source of sources) {
    for (const [nom, v] of Object.entries(lireJson(source)?.mcpServers || {})) {
      if (d.serveurs.some((s) => s.nom === nom)) { ignores.push(nom); continue; }
      try {
        const brut = depuisOutil(nom, v);
        if (!brut || d.serveurs.length >= MAX) throw new Error('illisible');
        d.serveurs.push(valider(brut));
        ajoutes.push(nom);
      } catch {
        ignores.push(nom);
      }
    }
  }
  if (ajoutes.length) ecrire(d);
  return { ajoutes, ignores, sources: sources.length };
}

/** Format du SDK Claude (option mcpServers). */
export function versClaude(liste) {
  return Object.fromEntries(liste.map((s) => [
    s.nom,
    s.type === 'stdio' ? { type: 'stdio', command: s.commande, args: s.arguments, env: s.env } : { type: 'http', url: s.url, headers: s.entetes },
  ]));
}

/** Format du protocole ACP (Gemini, session/new). */
export function versAcp(liste) {
  const tableau = (o) => Object.entries(o || {}).map(([name, value]) => ({ name, value }));
  return liste.map((s) => (s.type === 'stdio'
    ? { name: s.nom, command: s.commande, args: s.arguments, env: tableau(s.env) }
    : { type: 'http', name: s.nom, url: s.url, headers: tableau(s.entetes) }));
}

/** Bloc TOML pour la configuration de Codex ([mcp_servers.<nom>]). Les chaînes JSON sont des chaînes TOML valides. */
export function versCodexToml(liste) {
  const q = JSON.stringify;
  const table = (o) => `{ ${Object.entries(o || {}).map(([k, v]) => `${q(k)} = ${q(v)}`).join(', ')} }`;
  return liste.map((s) => [
    `[mcp_servers.${q(s.nom)}]`,
    ...(s.type === 'stdio'
      ? [`command = ${q(s.commande)}`, `args = [${s.arguments.map(q).join(', ')}]`, ...(Object.keys(s.env || {}).length ? [`env = ${table(s.env)}`] : [])]
      : [`url = ${q(s.url)}`, ...(Object.keys(s.entetes || {}).length ? [`http_headers = ${table(s.entetes)}`] : [])]),
  ].join('\n')).join('\n\n');
}
