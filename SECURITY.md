# Security

Dev Workshop gives control over the machine it runs on: the agents run commands and change files there.
Vulnerabilities are taken seriously.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: on the repository page, open the **Security** tab and choose
**Report a vulnerability**. Do not open a public issue and do not publish details before a fix is available.

Give the version, the steps to reproduce and what an attacker could obtain. Do not attach any real token, key or
credentials.

## What the project guarantees, and what it does not

- Dev Workshop listens on the local address and is used behind a port forward. It has no user accounts and no
  encryption: exposing it on a network as is is not a supported use.
- Access is protected by a token, `Host` and `Origin` checks, and a strict content policy. Projects are confined to
  a root folder.
- By default (manual mode), every action of an agent comes back to the screen for approval. The user may choose,
  session by session, a mode with fewer prompts, up to "allow everything", in which the agent acts without asking:
  it must be confirmed on screen and stays flagged while active. That choice, and its risks, are the user's.
- API keys and sign-ins stay on the server; Dev Workshop does not read the credential files of the tools it drives.
- An agent sends to its vendor whatever it reads in the project. Which projects are handed to which agent remains
  the user's choice.

## Supported versions

Only the latest published version receives fixes.
