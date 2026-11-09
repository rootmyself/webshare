# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

**WebShare** is a browser-sharing service. A Spring MVC application allocates a
remote-browser "slot" to each channel, a Node/Express control service starts
Chromium inside an Xvfb display on the host, and users watch or control that
browser through noVNC (websockify + x11vnc).

There are three cooperating runtimes:

1. **Spring MVC WAR** (`webshare_spring/webshare`) — public HTTP API, slot
   allocation, redirects users to their noVNC URL.
2. **Node/Express control service** (`webshare_project/x11_server`) — receives
   `create` / `kill` / `clean` requests from Spring and shells out to the X11
   scripts.
3. **X11 + noVNC stack** (`webshare_project`) — Xvfb displays, x11vnc,
   websockify, Chromium, and the vendored noVNC 1.2.0 client.

The deployment target is Linux (`/usr/webshare/release`, Tomcat at
`/usr/tomcat`). The shell scripts will not run on macOS as-is.

## Read this first

- **Onboarding guide:** `.claude/onboarding/index.md` — architecture, structure,
  flows, patterns, and UI mapping generated from this codebase.
- **Domain docs:** `docs/agents/domain.md` and `docs/agents/issue-tracker.md`.

## Repository layout

```text
webshare_spring/webshare/   Maven WAR: Spring MVC controllers, service, slot manager
webshare_project/           Linux deployment bundle
├── x11_server/             Express control service (port 3000)
├── noVNC/                  Vendored noVNC 1.2.0 client (MPL-2.0)
├── SSL/                    Local keystore/key material (git-ignored)
└── *.sh                    Xvfb / x11vnc / Chromium / noVNC lifecycle scripts
test_client/                Static HTML/JS harness for the Spring API
tomcat_need/server.xml      Reference Tomcat server.xml (SSL connector)
ssl_cert/                   TLS certificate/key material (git-ignored)
```

## Runtime topology and ports

| Component | Port | Notes |
| --- | --- | --- |
| Spring MVC (Tomcat) | 8443 HTTPS | Context path `/webshare`; client assumes 8443 |
| Node control service | 3000 | `GET /create`, `/kill`, `/clean` |
| x11vnc (per slot) | 50000 + slot | Loopback-facing VNC server |
| websockify / noVNC (per slot) | 60000 + slot | `--ssl-only`, serves `vnc.html` |
| Xvfb displays | `:0` … `:N-1` | Slot = display number |

Slot count defaults to 50 and is capped at 100. `-Dclient_count=N` and
`-Dx11_addr=<host>` are passed to Tomcat by `auto_start.sh`.

## HTTP API (Spring)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/connect/{channelId}/{user}/{width}/{height}?url=` | Create or join a slot, then redirect to noVNC |
| GET | `/connect/{channelId}/{user}` | Join an existing slot |
| GET | `/disconnect/{channelId}/{user}` | Release one user; destroy slot at zero |
| GET | `/clear/{channelId}/{user}` | Destroy the slot immediately |
| GET | `/status/{channelId}/{user}` | JSON `{"status": "free" \| "using" \| "busy"}` |

`user` is `host` (control, `view_only=false`) or any other value (view-only).
`SlotManager` is a process-wide singleton backed by an `ArrayBlockingQueue` of
free slots and a `ConcurrentHashMap` of channel → `UsingInfo`.

## Build and run

```bash
# Spring WAR
cd webshare_spring/webshare
mvn clean package
# -> target/controller-1.0.0-BUILD-SNAPSHOT.war (deploy as webshare.war)

# Node control service
cd webshare_project/x11_server
npm install
npm start        # listens on :3000

# noVNC / websockify (Linux, needs websockify under noVNC/websockify)
bash webshare_project/noVNC_server.sh -cl 4 -ip 127.0.0.1

# Full stack (Linux only)
bash webshare_project/auto_start.sh -cl 50 -r 1920x1920x16
bash webshare_project/auto_stop.sh
```

There is no automated test suite and no CI. `mvn test` passes with zero tests.
Do not claim a change is verified unless you actually built or exercised it.

## Code conventions

- Java is pre-generics-era style with **no lambdas** and no `var`; the compiler
  targets Java 1.6. Match the existing style in `com.webshare.*`.
- Spring wiring is annotation-based (`@Controller`, `@Service`, `@Autowired`);
  views are JSPs resolved from `/WEB-INF/views/`.
- Most Java and shell comments are Korean. Keep user-facing messages and new
  comments consistent with the surrounding file.
- The control service uses CommonJS (`require`) and `shelljs`; keep it simple
  and synchronous like the existing handlers.
- `test_client/` is vanilla HTML/CSS/JS with no build step. `web_share.js` is
  the reference client for the HTTP API.

## Safety rules

- **Never commit TLS private keys, keystores, or certificates.** `/ssl_cert/`
  and `/webshare_project/SSL/` are git-ignored on purpose.
- `tomcat_need/server.xml` uses the placeholder `keystorePass="CHANGE_ME"`.
  Supply the real keystore password at deploy time; never commit it.
- Hard-coded IPs in `test_client/` (`221.139.104.115`, `192.168.0.211`) are
  sample endpoints, not configuration.
- The shell scripts call `killall -9 node`, `killall Xvfb`, and delete
  `/tmp/.X*-lock`. Treat them as destructive host-level operations.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues (`rootmyself/webshare`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` and `docs/adr/` at the repository root. See `docs/agents/domain.md`.
