# Dev Workshop

*L'atelier des dev* — a self-hosted web interface for coding with AI agents from a server, instead of a terminal.

Dev Workshop drives the official tools (Claude Code, OpenAI Codex, Gemini CLI) and any OpenAI-compatible server
(LM Studio, Ollama, an API). Accounts sign in once on the server, the browser only displays, and every command or
file change comes back to the screen for approval.

Free software, built by the Deltinfo Studio team and published under the Apache 2.0 licence. Status: version 0.3, young. Read
"Known limits" before relying on it. Documentation en français : [README.fr.md](README.fr.md).

## What it does

- **Live conversation**: streamed answers, collapsible thinking, tool cards with the command, the diff or the file
  content, then the result.
- **Approvals**: allow, always allow, or deny each action. No mode that bypasses approvals is offered.
- **Several accounts**: as many Claude, ChatGPT or Google accounts as you want, each signed in from the screen
  with the provider's own sign-in page. No API key needed for these.
- **Local and API models**: LM Studio, Ollama or any OpenAI-compatible address. These can talk but do not touch
  files.
- **Group discussions**: two to four agents answer each other in turn on your request, then stop. Messages and
  approval requests are signed with the agent's name.
- **Token usage**: context gauge and per-model, per-agent counters, exactly as reported by each tool.
- **Sessions** keep running if the tab closes, and past sessions can be resumed.
- **French and English** interface, including the searchable `/` command palette.

## Run it

```bash
git clone <repository address> dev-workshop
cd dev-workshop
npm install
npm start
```

Requirements: Node.js 20 or newer, and Claude Code signed in on the server for the default account.

The server listens on `127.0.0.1:5330` **only**. Started in a terminal, it prints the full access link (with the
token). From your own machine, forward the port, then open the printed link:

```bash
ssh -L 5330:127.0.0.1:5330 <server>
```

Settings: `DEVWORKSHOP_PORT` (default 5330), `DEVWORKSHOP_ROOT` (projects root, default `~/dev`), `DEVWORKSHOP_CONFIG`
(settings folder, default `~/.config/dev-workshop`).

## Accounts

| Account | Tool driven | Sign-in | Acts on code |
| --- | --- | --- | --- |
| Claude (server account) | Claude Code, `~/.claude` | already done on the server | yes, with approval |
| Claude (other accounts) | Claude Code, `CLAUDE_CONFIG_DIR` | link, then a code to paste | yes, with approval |
| ChatGPT | `codex app-server`, `CODEX_HOME` | link and a code to enter on the page | yes, with approval |
| Gemini | `gemini --acp`, `GEMINI_CLI_HOME` | link, then a code to paste | yes, with approval |
| LM Studio, Ollama, API | OpenAI-compatible HTTP | address, model, optional key | no, talks only |

Each account has its own folder under the settings folder; the official tool writes its sign-in there. Dev Workshop
never reads those credential files. An API key typed in the screen is stored on the server (owner-readable only) and
never sent back: the screen only knows its length. Plain `http` is accepted only for the server itself or a private
network address.

The rules in `~/.claude/CLAUDE.md` are passed to every agent, whatever the account.

## Security model

This page gives control over the machine it runs on. The safeguards are enforced by the server:

- local listening only. Dev Workshop has no user accounts and no encryption: it is built for one person behind a port
  forward. Do not expose it on a network as is;
- a random access token, required when the channel opens and never written to a log;
- `Host` and `Origin` checks, so another page open in the browser cannot drive the port;
- projects confined to the projects root, symbolic links included;
- text coming from a model or a tool is shown as plain text or sanitised Markdown, under a strict content policy;
- in a group discussion only the final text of an answer is relayed, never tool results or file contents. An agent
  hosted outside the server is flagged before the discussion starts.

An agent sends to its vendor whatever it reads in the project. Which projects you hand to which agent is your call.

## Known limits (v0.3)

- never tried with a real account so far: a sign-in carried through to the end, a turn with Codex or Gemini (their
  adapters are written from the tools' protocols), a real API or LM Studio;
- the page layout has not been checked in a real browser by the authors' test suite, which uses a simulated one;
- past sessions and resume only cover the server's Claude account;
- Codex: the mode (normal, or read-only plan) is chosen when the session opens;
- Codex and Gemini report no cost, and Gemini no per-turn token counts;
- no images or attachments in the composer, no file explorer;
- about 40 of the `/` commands have a French description; the others keep the original one.

## Layout of the code

```
serveur/index.mjs        HTTP (static files) and WebSocket server
serveur/securite.mjs     token, origin, confined folders, headers
serveur/canal.mjs        orders received from the screen
serveur/sessions.mjs     live sessions, journal replayed on reconnect
serveur/comptes.mjs      accounts and API keys
serveur/connexion.mjs    account sign-in (link relayed to the screen)
serveur/salon.mjs        group discussion (turns, relay)
serveur/fournisseurs/    one adapter per kind of agent
public/                  the page, no build step
tests/                   end-to-end checks against a running server
```

Code, comments and identifiers are in French; the interface texts live in `public/js/i18n.js` in both languages.
Adding another agent is described in [README.fr.md](README.fr.md), "Brancher une autre IA".

## Tests

The tests talk to a running server and open real sessions, so run them on a small model and with
`DEVWORKSHOP_CONFIG` pointing at a scratch folder, on both the server and the test:

```bash
DEVWORKSHOP_PORT=5331 node tests/connexion.mjs <project>   # account sign-in up to the link, no model call
DEVWORKSHOP_PORT=5331 node tests/parcours.mjs <project>    # channel security, approval, counters
DEVWORKSHOP_PORT=5331 node tests/ecran.mjs <project> en    # the real page in a simulated browser
```

## Licence and third-party tools

Dev Workshop is distributed under the Apache 2.0 licence (see `LICENSE` and `NOTICE`), © Deltinfo Studio.

It drives tools that keep their own licence and terms, and each needs an account with its vendor:

| Tool | Licence |
| --- | --- |
| Claude Agent SDK and Claude Code (Anthropic) | Anthropic's commercial terms, not free software |
| Codex (OpenAI) | Apache 2.0 |
| Gemini CLI (Google) | Apache 2.0 |
| ws, marked, jsdom | MIT |
| DOMPurify | MPL 2.0 or Apache 2.0 |

Dev Workshop is not affiliated with Anthropic, OpenAI or Google. Their product names belong to them.

## Contributing, reporting a vulnerability

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
