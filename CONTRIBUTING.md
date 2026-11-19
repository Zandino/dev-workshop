# Contributing

Thank you for your interest in Dev Workshop. The project is young: usage feedback and bug reports are as useful as
code. Issues and pull requests are welcome in English or French.

## Reporting a bug, suggesting an idea

Open an issue describing what you did, what you expected and what happened, with your Node.js version and the
versions of the tools driven (`npm ls`). Never paste a token, an API key, a sign-in link or a sign-in code into an
issue.

A security vulnerability is not reported in a public issue: see `SECURITY.md`.

## Proposing a change

1. One subject per pull request, with a description of what changes and why.
2. The code follows what is there:
   - identifiers, comments and messages in French;
   - a file stays under 250 lines; beyond that, split it;
   - no build step on the browser side: ES modules served as they are;
   - every visible text goes through `public/js/i18n.js`, in French and in English;
   - no inline style or script (the page's content policy forbids them).
3. Security is decided by the server: what the screen forbids, the server forbids too. No mode that bypasses
   approval requests will be accepted.
4. The tests pass (`tests/`). They open real sessions: run them with `DEVWORKSHOP_CONFIG` on a scratch folder and on
   a small model. `tests/connexion.mjs` makes no model call.

## Adding another agent

The steps and the list of events are in `README.fr.md` ("Brancher une autre IA"). An adapter talks to the vendor's
official tool; it never reads that tool's credential files.

## Licence of contributions

By proposing a change, you agree that it is distributed under the project's licence (Apache 2.0).
