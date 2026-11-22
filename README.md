# Dev Workshop

*L'atelier des dev* — a self-hosted web interface for coding with AI agents from a server, instead of a terminal.

Dev Workshop drives the official tools (Claude Code, OpenAI Codex, Gemini CLI) and any OpenAI-compatible server
(LM Studio, Ollama, an API). Accounts sign in once on the server, the browser only displays, and every command or
file change comes back to the screen for approval.

Free software, built by the Deltinfo Studio team and published under the Apache 2.0 licence. Status: version 0.7, young. Read
"Known limits" before relying on it. Documentation en français : [README.fr.md](README.fr.md).

## What it does

- **Live conversation**: streamed answers, collapsible thinking, tool cards with the command, the diff or the file
  content, then the result.
- **Approvals**: allow, always allow, or deny each action. Modes per session: manual (default), automatic (a
  classifier approves and asks only when unsure), accept edits, plan, and "allow everything" (no prompts), which must
  be confirmed on screen and stays flagged in red while active.
- **Several accounts**: as many Claude, ChatGPT or Google accounts as you want, each signed in from the screen
  with the provider's own sign-in page. No API key needed for these.
- **Local and API models**: LM Studio, Ollama or any OpenAI-compatible address. These can talk but do not touch
  files.
- **Group discussions**: two to four agents answer each other in turn on your request, then stop. An open
  conversation can change its team (add or remove AIs, one AI, or the orchestra) and keep its history. Messages and
  approval requests are signed with the agent's name.
- **Usage limits**: when an AI hits its subscription or quota limit, another connected AI takes over with the
  history. In a group, the limited AI is not retried before its reset time and another takes over its part (an AI
  from outside the group joins as backup if all are limited); in the orchestra, a limited conductor is replaced by
  another Claude account. With nobody left to take over, an alert tells you.
- **Token usage**: context gauge and per-model, per-agent counters, exactly as reported by each tool.
- **Conversations** keep running if the tab closes. Each project lists its conversations; "All conversations"
  searches them across projects, and "Move" puts one in another project, where it resumes with that project's notes;
  an open conversation can be moved too (its AI restarts in the new folder: the server's Claude resumes its own
  session there). Conversations can be renamed from the sidebar (pencil on hover, or F2).
- **Project notes**, given to every AI at the start of each conversation in the project. "Remember for the project"
  asks the AI what is worth keeping; you review it, and nothing is added without your click.
- **Conversation memory** (🧠): your instructions, which the AI follows and may only suggest changing (approval on
  screen), and what the AI remembers, which it keeps up to date itself with its tools and you can correct. Every AI
  of the conversation receives it; it follows the conversation across restarts, team changes and moves. Stored on the
  server, in `memoires/` of the settings folder.
- **Alerts**: every open conversation is followed live in the sidebar, even while you look at another one: a raised
  hand ✋ when it needs your approval, a pulsing dot while it works, a bold title when it finished unseen (red if it
  failed). A clickable bubble (window in front) or a system notification (in the background) opens it, and the
  desktop app puts a raised hand on its taskbar icon. A collapsed project shows the most pressing state of its open
  conversations (✋, then failed, then working, then finished unseen). Projects, and the conversations of a project,
  can be put in any order (drag and drop, or ▲ ▼ on hover, Alt+↑/↓); the order is kept on the server.
- **Conversations talk to each other**: every AI with tools (Claude, Codex, Gemini, Copilot) can list the other open
  conversations of all projects, read them and send them a message. A free conversation handles it on its own (a
  busy one as soon as it is free), and its answer comes back to the sender as a new message; nothing waits, so two
  conversations writing to each other never block. Messages are signed with the conversation they come from. At most
  6 messages per request of yours: beyond that the exchange stops, the message is not sent, and an alert tells you. A
  conversation that acts without asking (allow everything, automatic, accept edits) handles a message from elsewhere only after your approval. The AIs other than Claude
  can also ask you questions in the same tabbed question window as Claude. See README.fr.md, "Entre discussions".
- **Live team** (right of the conversation, resizable; enlarged over it; or detached into its own window for another
  screen, following the conversation shown in the main window): the conversation as a team call. Each AI and each
  sub-agent (Claude's own, and the orchestra's) has a drawn character at its desk, a first name, a style and a role
  (from its sub-agent type, the orchestra's role, or what it mostly does; both editable), and its state: thinking,
  working ("Runs npm test"), waiting for whom, needs you, no news for 3 minutes, done, failed; badges for long
  commands, failures and going in circles. Sub-agents launched in the background stay visible while they work. The one who needs you, else the one who just acted, comes to the front
  with its shared screen (edited file, terminal, browser screenshot). A voice reads what they say, one at a time.
  Voice setting: say everything, essentials only (spoken announcements for every open conversation, even with the
  team closed: "… needs you on <project>", "work finished on <project>", "work stopped on <project>"), or muted;
  plus a volume slider.
  Built from the conversation's own events: no extra model call. Screenshots only show live.
- **Dictation** (🎤): click to talk, click to stop; the text lands in the message box for you to review. Engine:
  Whisper on your server (open source, free, the voice stays on the server; installed on demand, ~750 MB plus the
  model) or an API account you added (OpenAI, Groq, Mistral… via `/audio/transcriptions`). See README.fr.md,
  "Dictée".
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

### Desktop app (Windows; macOS and Linux to follow)

`bureau/` holds an Electron app that replaces the terminal steps. Save your server once (SSH alias or `user@host`, and
the Dev Workshop folder on it), then click Connect. The app uses your system `ssh` (your keys, agent, config and known
hosts; it never sees a key or password and never skips host-key checking), starts Dev Workshop on the server if it is
not answering (detached, so it keeps running), reads the access token over that same SSH link and keeps it in memory
only, opens an SSH tunnel and shows the workshop in its own window. The server page gets no access to your machine.

A **Getting started** guide finds or creates your SSH key (ed25519, no passphrase, in `~/.ssh`), opens a terminal that
adds it to the server (you type the server password there, never in the app; macOS and Linux get an `ssh-copy-id`
command), then tests the connection. If Dev Workshop is missing on the server, **Install on this server** sets it up in
your account without administrator rights (`bureau/src/installer.sh`): Node.js 22 from nodejs.org if missing (pinned,
SHA-256 checked), the matching release from GitHub, `npm ci`, and optionally an `@reboot` crontab line. It never
overwrites anything and refuses a non-empty folder that is not Dev Workshop. Linux servers only.

```bash
cd bureau && npm install && npx install-electron
npm start        # run from source
npm run dist     # build the Windows installer (unsigned) into bureau/dist/
```

Installers (Windows, macOS, Linux AppImage) are built by GitHub Actions from this repository and attached to each
GitHub Release (`.github/workflows/bureau.yml`). They are not signed yet: Windows shows a SmartScreen warning on first
launch, and blocks the app outright when Windows 11 Smart App Control is on; macOS asks for approval in System
Settings › Privacy & Security. On Windows and AppImage the app checks for new releases at start and every six hours,
downloads them, verifies their sha512 and asks before restarting; on macOS it only points to the releases page. The
check contacts `github.com` and can be turned off at the bottom of the home window (see [PRIVACY.md](PRIVACY.md)).

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

## Known limits (v0.7)

- never tried with a real account so far: a sign-in carried through to the end, a turn with Codex or Gemini (their
  adapters are written from the tools' protocols), a real API or LM Studio;
- the page layout has not been checked in a real browser by the authors' test suite, which uses a simulated one;
- saved conversations, resume and "Move" only cover the server's Claude account. Claude Code's SDK cannot move a
  session, so "Move" copies the file itself (working folder rewritten), and removes the original through the SDK only
  once the copy is recognised: the one place where Dev Workshop writes into Claude Code's files;
- not tried end to end with a real model yet: "Remember for the project", and Claude resuming a moved
  conversation (the test checks its history is read from the new project);
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
serveur/veille.mjs       alerts: every connection follows all open conversations
serveur/dictee.mjs       dictation: Whisper on the server, or an API account
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

`tests/discussions.mjs` and `tests/ecran-discussions.mjs` cover conversations (list, move, notes) without any model
call, but they write into Claude Code's folder: run the server and the tests with a scratch `HOME` under `/tmp` (see
README.fr.md, "Essais"). `tests/alertes.mjs <project>` covers alerts (rule table, channel with a fake local API, the
real page) without any model call either. `tests/dictee.mjs <project> voice.wav "expected words"` covers dictation
(Whisper, installed if missing; a fake API; the real page with a fake microphone). `node tests/entre-discussions.mjs`
(simulated conversations, the real `/mcp` address) and `node tests/questions.mjs` (the question window in a simulated
browser) need no server and no model.

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
| Dictation, installed on demand: Transformers.js / ONNX Runtime / Whisper models | Apache 2.0 / MIT / MIT |

Dev Workshop is not affiliated with Anthropic, OpenAI or Google. Their product names belong to them.

## Code signing policy

Windows builds of the desktop app are to be signed for free by [SignPath.io](https://signpath.io), with a certificate
from the [SignPath Foundation](https://signpath.org) (application in progress; until then, builds are unsigned).
Only files built by GitHub Actions from this repository (`.github/workflows/bureau.yml`) are signed, and each release
is approved by hand before signing.

- Committers and reviewers: [Zandino](https://github.com/Zandino). Changes from other contributors (pull requests)
  are reviewed before merging.
- Approvers: [Zandino](https://github.com/Zandino).

Privacy: see [PRIVACY.md](PRIVACY.md). The desktop app only contacts the SSH servers you add and, for update checks,
`github.com` (can be turned off).

## Contributing, reporting a vulnerability

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
