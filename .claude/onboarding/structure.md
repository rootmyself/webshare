# WebShare — Directory Structure

WebShare is split into three cooperating runtimes: a Spring MVC WAR that serves
the public API, a Node/Express service that shells out to X11 scripts, and an
Xvfb + x11vnc + websockify + Chromium stack that hosts one remote browser per
slot. A static `test_client/` harness exercises the Spring API manually.

## Project Root

```text
webshare/
├── AGENTS.md                         # Agent/coding guidance for this repo
├── .gitignore                        # Ignores secrets, build output, node_modules, editor metadata
├── .claude/
│   └── onboarding/                   # Generated onboarding docs (this file lives here)
├── docs/
│   └── agents/                       # Agent workflow configuration
│       ├── domain.md                 # Where domain docs / ADRs belong
│       ├── issue-tracker.md          # GitHub Issues conventions (gh CLI)
│       └── triage-labels.md          # Canonical triage labels
├── ssl_cert/                         # Git-ignored TLS material — never commit
│   └── webshare_twosonsoft_com/      # CA chain, server cert, private key
├── test_client/                      # Static manual test harness (no build step)
│   ├── .vscode/                      # Ignored editor config
│   ├── index.html                    # Single-session test UI
│   ├── index_api.html                # Minimal connect/disconnect API test UI
│   ├── index_performance.html        # Multi-session load test UI
│   ├── script.js                     # Logic for index.html
│   ├── script_api.js                 # Logic for index_api.html
│   ├── script_performance.js         # Logic for index_performance.html
│   ├── style.css                     # Shared styles for index/test pages
│   ├── style_performance.css         # Styles for the load-test page
│   ├── test.html                     # Placeholder iframe target
│   ├── web_share.js                  # Reference HTTP API client (snake_case)
│   └── webshare.js                   # Unused camelCase client variant (not referenced by pages)
├── tomcat_need/
│   └── server.xml                    # Reference Tomcat config (HTTPS on :8443)
├── webshare_project/                 # Linux deployment bundle / X11 + noVNC stack
│   ├── auto_start.sh                 # Boots Xvfb, x11vnc, websockify, Node, Tomcat
│   ├── auto_stop.sh                  # Destructive host-wide shutdown
│   ├── noVNC_server.sh               # Starts one websockify per slot
│   ├── x11_clean.sh                  # Kills all Xvfb and removes X locks
│   ├── x11_kill.sh                   # Kills Chromium for one slot
│   ├── x11_start.sh                  # Launches Chromium for one slot
│   ├── SSL/                          # Git-ignored keystore/key material
│   ├── noVNC/                        # Vendored noVNC 1.2.0 (MPL-2.0); websockify/ is missing
│   │   ├── app/                      # noVNC UI layer
│   │   ├── core/                     # VNC protocol, rendering, input
│   │   ├── docs/                     # Upstream API docs and RFB protocol PDFs
│   │   ├── po/                       # Upstream translation sources
│   │   ├── tests/                    # Upstream noVNC tests only
│   │   ├── utils/                    # Upstream helper scripts
│   │   ├── vendor/pako/              # Vendored zlib implementation
│   │   ├── vnc.html                  # Full noVNC client page
│   │   └── vnc_lite.html             # Minimal noVNC page
│   └── x11_server/                   # Node/Express control service (:3000)
│       ├── index.js                  # /create, /kill, /clean handlers
│       ├── package.json              # express + shelljs, npm start
│       ├── package-lock.json
│       └── node_modules/             # Local install output (git-ignored)
└── webshare_spring/
    └── webshare/                     # Maven WAR project
        ├── pom.xml                   # Spring 4.3.1, WAR packaging, Java 1.6 target
        └── src/
            ├── main/
            │   ├── java/com/webshare/    # controller/, dto/, service/, util/
            │   ├── resources/            # log4j.xml
            │   └── webapp/               # WEB-INF/{web.xml,spring/,views/}
            └── test/resources/           # log4j.xml only — no Java tests
```

## How the Pieces Fit

1. **Spring WAR** receives `GET /webshare/connect/...`, asks `SlotManager` for a
   free slot, and calls the Node service over plain HTTP at
   `http://<x11_addr>:3000/create`.
2. **Node control service** shells out to `x11_start.sh` / `x11_kill.sh` /
   `x11_clean.sh` under `/usr/webshare/release`.
3. **X11 stack** runs Chromium on display `:slot`, x11vnc on `50000 + slot`, and
   websockify/noVNC on `60000 + slot`. Spring redirects the user to
   `https://<spring-host>:<60000 + slot>/vnc.html?autoconnect=true&view_only=...`.

The slot number is the same value as the X11 display number and the offset used
for both VNC ports. Xvfb, x11vnc, and websockify are pre-provisioned at boot by
`auto_start.sh`; a `/create` request only launches Chromium on an already-running
display. The `user` path segment controls mode: `host` joins as controller
(`view_only=false`), any other value joins as view-only (`view_only=true`).

## Key Directories

### `webshare_spring/webshare/`

A standard Maven WAR, organized **by layer** under `com.webshare`:

- `controller/` — HTTP endpoints. `HomeController.java` serves `/`;
  `UserController.java` owns every public route (`/connect`, `/disconnect`,
  `/clear`, `/status`).
- `service/` — `WebShareService.java` orchestrates session creation, joins,
  leaves, clears, status checks, and noVNC URL construction.
- `dto/` — `UsingInfo.java` (slot ID + user count) and `LogInfo.java` (enum-based
  console logger).
- `util/` — `SlotManager.java` (process-wide singleton slot pool backed by an
  `ArrayBlockingQueue` plus a `ConcurrentHashMap` of channel → `UsingInfo`) and
  `RequsetManager.java` (singleton HTTP client to the Node service; the typo in
  the class name is pre-existing).
- `resources/log4j.xml` — console logging config. A duplicate exists under
  `src/test/resources/` for tests, but there are no Java tests.
- `webapp/WEB-INF/web.xml` — registers the `DispatcherServlet` and root context.
- `webapp/WEB-INF/spring/root-context.xml` — empty root context.
- `webapp/WEB-INF/spring/appServlet/servlet-context.xml` — enables annotations,
  scans `com.webshare.service` and `com.webshare.controller`, and resolves JSPs
  from `/WEB-INF/views/`.
- `webapp/WEB-INF/views/` — `home.jsp` (root page), `result.jsp` (disconnect /
  clear confirmation), and `status.jsp` (currently unused because `/status`
  returns JSON via `@ResponseBody`).

`mvn clean package` produces
`target/controller-1.0.0-BUILD-SNAPSHOT.war`. `target/` is generated and absent
from a clean checkout.

Note: the POM declares `<java-version>1.7</java-version>` but the compiler plugin
sets `source`/`target` to `1.6`; the code is written in pre-generics-era Java
with no lambdas or `var`.

### `webshare_project/`

The Linux deployment bundle. These scripts assume the repository has been
copied to `/usr/webshare/release` and Tomcat lives at `/usr/tomcat`; most paths
are absolute, not relative to the script location.

- `auto_start.sh` — orchestrator. Stops any prior stack, starts `client_count`
  Xvfb displays (`:0` … `:N-1`), starts `uim-xim` and x11vnc per display, invokes
  `noVNC_server.sh`, starts the Node service, and launches Tomcat with
  `-Dclient_count` and `-Dx11_addr` JVM properties. Defaults: 50 clients,
  `1920x1920x16`, port base 50000.
- `auto_stop.sh` — host-wide shutdown: `killall -9 node`, Tomcat shutdown,
  `x11_clean.sh`, and kills every `websockify`.
- `noVNC_server.sh` — kills existing websockify processes, then starts one
  `websockify/run --web ... --ssl-only` per slot. Defaults: 4 clients, x11 base
  50000, noVNC base 60000.
- `x11_start.sh` — validates args, resizes the framebuffer with `xrandr`, and
  launches Chromium in kiosk mode with the configured URL.
- `x11_kill.sh` — kills the Chromium process belonging to one display.
- `x11_clean.sh` — kills all Xvfb processes and deletes `/tmp/.X*-lock`.

`SSL/` holds local keystore/key material and is git-ignored.

### `webshare_project/x11_server/`

A single-file CommonJS Express application. It has no controllers, models, or
tests — all behavior is in `index.js`:

- `GET /create?port=&url=&width=&height=` → `x11_start.sh`
- `GET /kill?port=` → `x11_kill.sh`
- `GET /clean` → `x11_clean.sh`

It listens on port 3000, assumes X11 ports start at 50000, derives
`display = port - 50000`, and runs scripts from the hard-coded
`/usr/webshare/release` directory. Responses are sent immediately; the shell
commands run asynchronously. `npm start` runs `node index.js`. This service does
not start Xvfb, x11vnc, or websockify; `auto_start.sh` owns those.

### `webshare_project/noVNC/`

Vendored upstream **noVNC 1.2.0** (`@novnc/novnc`, MPL-2.0), not first-party
code. `app/` contains the browser UI, `core/` contains the RFB protocol,
rendering, and input code, and `vnc.html` / `vnc_lite.html` are the client pages
served per slot. `tests/` and `.github/` belong to upstream noVNC — they are not
this project's test suite or CI. `.metadata/` is Eclipse workspace metadata and
is git-ignored.

`noVNC_server.sh` expects a `websockify/run` executable under this directory,
but `webshare_project/noVNC/websockify/` is **absent from the repository**. The
stack cannot start websockify until it is supplied at deploy time.

### `test_client/`

A static, no-build manual test harness. Open an HTML file directly in a browser;
there is no `package.json`, bundler, or dev server.

Three page variants pair with matching scripts and styles:

| Page | Script | Purpose |
| --- | --- | --- |
| `index.html` | `script.js` | Single session, full connect/disconnect flow |
| `index_api.html` | `script_api.js` | Minimal connect/disconnect API exercise |
| `index_performance.html` | `script_performance.js` | Many iframes / slots at once |

`web_share.js` is the client actually loaded by the HTML pages. It uses a
lowercase class name and snake_case methods (`class web_share`,
`connect_leader`, `connect_follower`) and hard-codes port 8443 with base path
`/webshare`. `webshare.js` is an unused PascalCase variant (`class Webshare`,
`connectByLeader`) but no HTML page loads it.

Sample IPs (`221.139.104.115`, `192.168.0.211`) are placeholders, not
configuration. `test.html` is only a placeholder iframe target.

### `docs/agents/`

Configuration for agent workflows, not product documentation.

- `issue-tracker.md` — issues live in GitHub `rootmyself/webshare` via `gh`.
- `triage-labels.md` — mapping of the five canonical triage roles.
- `domain.md` — describes the single-context docs layout. It references a root
  `GLOSSARY.md` and `docs/adr/`, but neither exists in the repository yet.

### `tomcat_need/`

Contains only a reference `server.xml`, not a Tomcat installation. It defines
the HTTPS connector on port 8443 with
`keystoreFile="/usr/webshare/release/SSL/genes.keystore"` and uses the
placeholder `keystorePass="CHANGE_ME"`. Supply the real password at deploy
time; never commit it. The real Tomcat is expected at `/usr/tomcat`.

### Secret and generated directories

- `ssl_cert/` and `webshare_project/SSL/` — TLS private keys, certificates, and
  keystores. Both are git-ignored on purpose; never commit or print them.
- `webshare_project/x11_server/node_modules/` — local npm install output,
  git-ignored.
- `webshare_project/noVNC/.metadata/` — Eclipse workspace metadata, git-ignored.
- `test_client/.vscode/` — ignored editor config; its launch path points at
  another developer's machine.
- `webshare_spring/webshare/target/` — Maven build output, created on demand and
  git-ignored.

## Naming Conventions

| Concern | Convention | Example |
| --- | --- | --- |
| Java packages | `com.webshare.<layer>`, all lowercase | `com.webshare.controller` |
| Java classes | PascalCase, layer suffix where useful | `UserController`, `WebShareService`, `UsingInfo`, `SlotManager` |
| Java methods/fields | camelCase (some legacy snake_case fields exist) | `createSession`, `free_slot` |
| Spring XML | lowercase with hyphens | `root-context.xml`, `servlet-context.xml` |
| JSP views | lowercase single word | `home.jsp`, `result.jsp` |
| Shell scripts | lowercase, underscore-separated, verb-last or product-prefixed | `x11_start.sh`, `auto_stop.sh`, `noVNC_server.sh` |
| Node entry point | `index.js`, CommonJS `require` | `webshare_project/x11_server/index.js` |
| Static pages | `index[_variant].html` | `index_api.html`, `index_performance.html` |
| Static scripts/styles | `script[_variant].js`, `style[_variant].css` | `script_performance.js` |
| Test client classes | Inconsistent: snake_case in `web_share.js`, PascalCase in `webshare.js` | `class web_share` vs `class Webshare` |
| noVNC upstream files | Lowercase dirs; dot-separated test names | `core/rfb.js`, `tests/test.rfb.js` |
| Agent docs | Lowercase kebab-case Markdown | `issue-tracker.md`, `triage-labels.md` |

## Where to Find...

| If you need to... | Look in |
| --- | --- |
| Add or change a public HTTP endpoint | `webshare_spring/webshare/src/main/java/com/webshare/controller/UserController.java` |
| Add session/business logic | `webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` |
| Change slot allocation or status logic | `webshare_spring/webshare/src/main/java/com/webshare/util/SlotManager.java` |
| Change how Spring calls the Node service | `webshare_spring/webshare/src/main/java/com/webshare/util/RequsetManager.java` |
| Change the slot count | `SlotManager.java` (`CLIENT_COUNT`, `-Dclient_count`) and `webshare_project/auto_start.sh` (`client_count=50`, default deployment) |
| Change the Chromium launch URL | `webshare_project/x11_start.sh` (`url="www.google.com"` default) and the `url` query parameter passed through `WebShareService.createSession` |
| Change Chromium flags, user agent, or extension | `webshare_project/x11_start.sh` (the `chromium --temp-profile --kiosk ...` command) |
| Adjust the public noVNC port base | `WebShareService.java` (`NOVNC_PORT = 60000`) |
| Adjust the Node control-service port | `webshare_project/x11_server/index.js` (`PORT = 3000`) and `RequsetManager.java` (`PORT = 3000`) |
| Adjust the X11/VNC port base | `x11_server/index.js` (`X11_PORT`), `RequsetManager.java` (`X11PORT`), `x11_start.sh` / `x11_kill.sh` (`x11_port`), `noVNC_server.sh` (`x11_port`, `noVNC_port`), `auto_start.sh` (`start_port`) |
| Change noVNC / websockify flags or proxy behavior | `webshare_project/noVNC_server.sh`; the client page is `webshare_project/noVNC/vnc.html` |
| Change deployment startup or shutdown | `webshare_project/auto_start.sh`, `webshare_project/auto_stop.sh` |
| Change Spring MVC wiring or JSP resolution | `webshare_spring/webshare/src/main/webapp/WEB-INF/web.xml` and `.../WEB-INF/spring/appServlet/servlet-context.xml` |
| Change Tomcat HTTPS / TLS configuration | `tomcat_need/server.xml`; keystore material lives in `webshare_project/SSL/` (git-ignored) |
| Change logging | `webshare_spring/webshare/src/main/resources/log4j.xml` |
| Add a manual browser test page | `test_client/` (follow the `index[_variant]` + `script[_variant]` pattern) |
| Find a sample API client | `test_client/web_share.js` (loaded by pages), `test_client/webshare.js` (unused variant) |
| Find issue/triage/agent conventions | `docs/agents/` and `AGENTS.md` |
| Build the WAR | `webshare_spring/webshare/pom.xml` |

## Important Files

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Repo-wide guidance for AI coding agents |
| `webshare_spring/webshare/pom.xml` | Maven build: WAR packaging, Spring 4.3.1, Java 1.6 source/target |
| `webshare_spring/webshare/src/main/webapp/WEB-INF/web.xml` | Servlet container entry point; registers `DispatcherServlet` |
| `webshare_spring/webshare/src/main/webapp/WEB-INF/spring/appServlet/servlet-context.xml` | Annotation-driven MVC, component scan, JSP view resolver |
| `webshare_spring/webshare/src/main/java/com/webshare/controller/UserController.java` | All public HTTP routes and their parameters |
| `webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` | Session lifecycle and noVNC URL generation |
| `webshare_spring/webshare/src/main/java/com/webshare/util/SlotManager.java` | In-memory slot pool and channel→slot mapping |
| `webshare_spring/webshare/src/main/java/com/webshare/util/RequsetManager.java` | Outbound HTTP calls to the Node control service |
| `webshare_project/x11_server/index.js` | Node control-service entry point and shell invocation |
| `webshare_project/x11_start.sh` | Chromium launch command and per-slot startup |
| `webshare_project/x11_kill.sh` | Per-slot Chromium teardown |
| `webshare_project/x11_clean.sh` | Host-wide Xvfb teardown |
| `webshare_project/noVNC_server.sh` | websockify-per-slot startup |
| `webshare_project/auto_start.sh` | Full-stack startup orchestration |
| `webshare_project/auto_stop.sh` | Full-stack shutdown orchestration |
| `webshare_project/noVNC/vnc.html` | noVNC client page users land on |
| `test_client/web_share.js` | Reference client for the Spring HTTP API |
| `tomcat_need/server.xml` | Reference Tomcat HTTPS connector config |
| `docs/agents/issue-tracker.md` | GitHub issue conventions |
| `docs/agents/triage-labels.md` | Canonical triage labels |

## Notable Gaps and Gotchas

- **No root README.** There is no project-level README; `AGENTS.md` and this
  onboarding directory are the closest entry points.
- **No automated project tests and no CI.** `src/test/` contains only a logging
  config. The `tests/` and `.github/` directories under `noVNC/` are upstream
  noVNC assets, not this project's suite.
- **Missing websockify.** `noVNC_server.sh` calls
  `webshare_project/noVNC/websockify/run`, but that directory is not present.
- **Vendored noVNC.** Treat `webshare_project/noVNC/` as third-party code
  (MPL-2.0); prefer configuration over patching it.
- **Hard-coded deployment paths.** Scripts and the Node service assume
  `/usr/webshare/release` and `/usr/tomcat`. Running from a checkout requires
  editing paths or recreating that layout.
- **Two test-client libraries.** `web_share.js` is the one actually loaded by
  the HTML pages; `webshare.js` is an unused duplicate variant.
- **Internal control plane is unauthenticated.** The Node API on port 3000 uses
  plain HTTP, GET requests, and no authentication. Spring also allows `*` CORS.
  Keep port 3000 on a trusted network.
- **Secret material is intentionally ignored.** `ssl_cert/` and
  `webshare_project/SSL/` must never be committed; `tomcat_need/server.xml`
  uses a `CHANGE_ME` keystore-password placeholder that must be replaced at
  deploy time.
