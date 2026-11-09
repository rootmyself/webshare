# WebShare — Onboarding Guide

> Generated on 2026-11-09 with thoughtbot's `onboard` skill (six parallel
> explorer agents) from a static read of the repository. No build, deployment,
> or runtime verification was performed.
>
> Refresh by re-running the `onboard` skill; the source playbooks live in the
> thoughtbot skills marketplace.

## Quick Summary

WebShare gives each *channel* a private Chromium session on a shared Linux host
and streams it to participants as a noVNC web page. A Spring MVC WAR allocates
an in-memory slot and redirects users to a per-slot noVNC URL; a small
Node/Express service launches Chromium inside the matching Xvfb display; and
Bash scripts pre-provision Xvfb, x11vnc, and websockify at boot. The `host`
user gets keyboard/mouse control, while everyone else joins view-only.

There is no database, message queue, authentication layer, CI, or automated
test suite. All slot state lives in JVM memory, and the deployment target is
Linux under `/usr/webshare/release`.

## Documents

| Document | What it covers |
|----------|----------------|
| [Overview](./overview.md) | Purpose, tech stack, entry points, configuration, how to run |
| [Architecture](./architecture.md) | System design, module/layer relationships, slot model, port math |
| [Structure](./structure.md) | Annotated directory tree, naming conventions, where to find things |
| [Flows](./flows.md) | Every HTTP endpoint and runtime flow as sequence diagrams |
| [Patterns](./patterns.md) | Design patterns, error handling, conventions, anti-patterns |
| [Components](./components.md) | Test-client screens, JSP views, noVNC integration surface, UI state machines |

## Suggested Reading Order

1. **Overview** — understand what WebShare is and which runtimes are involved.
2. **Architecture** — see how the Spring control plane, Node supervisor, and X11/noVNC data plane fit together.
3. **Structure** — learn where each piece lives before opening files.
4. **Flows** — trace session creation, joining, teardown, and the VNC stream end to end.
5. **Patterns** — learn the conventions (and the traps) so new code fits in.
6. **Components** — map the test harness, JSP pages, and noVNC viewer.

## Key Runtime Facts

| Fact | Value |
|------|-------|
| Spring app | Tomcat, HTTPS `:8443`, context path `/webshare` |
| Node control service | `:3000`, endpoints `/create`, `/kill`, `/clean` |
| Slot → display | slot `N` = Xvfb `:N` = x11vnc `50000+N` = websockify `60000+N` |
| Default slot count | 50 (`auto_start.sh`), hard cap 100 (`SlotManager.CLIENT_COUNT`) |
| State store | JVM heap only (`SlotManager`, `UsingInfo`) |
| Auth | None (wildcard CORS, x11vnc `-nopw`) |
| Build | `mvn clean package`; no test suite; no CI |

## Notable Findings

The explorers found several real issues worth reading before changing code:

- **Broken join-session URL:** `WebShareService.enterSession` has three format
  specifiers but only two arguments, and duplicates the scheme. See
  [Flows](./flows.md) and [Patterns](./patterns.md).
- **Slot allocation race:** `getFreeSlot()` does `peek()` then `take()`, and
  `UsingInfo` user counts are not synchronized. See [Architecture](./architecture.md).
- **Missing runtime dependency:** `noVNC_server.sh` invokes
  `noVNC/websockify/run`, but that directory is not checked in. See
  [Structure](./structure.md).
- **Security exposure:** no authentication, `-nopw` x11vnc, raw URL
  interpolation into shell commands, and GET requests used for mutations. See
  [Patterns](./patterns.md) and [Flows](./flows.md).
- **Destructive scripts:** `auto_stop.sh` and `x11_clean.sh` use host-wide
  `killall`/`kill -9` and delete `/tmp/.X*-lock`. See [Structure](./structure.md).
- **Secrets are git-ignored:** `/ssl_cert/` and `/webshare_project/SSL/` are
  intentionally excluded. `tomcat_need/server.xml` uses a `CHANGE_ME`
  keystore-password placeholder; supply the real password at deploy time.

## Agent Configuration

Repository-level agent setup lives in:

- `AGENTS.md` — build/run commands, conventions, safety rules
- `docs/agents/issue-tracker.md` — GitHub Issues workflow
- `docs/agents/triage-labels.md` — triage label vocabulary
- `docs/agents/domain.md` — single-context domain-doc layout
