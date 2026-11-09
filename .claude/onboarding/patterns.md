# WebShare — Design Patterns & Conventions

WebShare is three cooperating runtimes plus a browser test client:

```text
browser ── HTTPS :8443 ──> Spring MVC WAR ── HTTP :3000 ──> Node/Express
   │                              │                         │ shell
   │                              └─ slot bookkeeping       └─> Xvfb / x11vnc / Chromium
   └──── WSS :60000+slot ────────> websockify ──> x11vnc ──> Xvfb
```

This document describes the conventions the code actually follows, not an ideal
target. Java, Node, Bash and browser code each have their own local style, and
some of those styles are old or inconsistent. `webshare_project/noVNC/` is
vendored third-party code and is excluded from this document.

There is no test suite, linter, or formatter config. See
[Testing Conventions](#testing-conventions) before claiming a change is verified.

> **Short on time?** Read [Conventions Summary](#conventions-summary) first, then
> use [Anti-Patterns](#anti-patterns-to-avoid) as a pre-commit checklist.

---

## Error Handling

Domain errors are values, not exceptions. The Java layer performs null checks,
logs, and returns a sentinel string or a success page. There are no custom exception
classes, no `@ExceptionHandler`, no `ResponseStatusException`, and no non-2xx
responses. Outbound HTTP failures are swallowed.

The clearest example is `WebShareService.enterSession`:

```java
public String enterSession(String id, boolean isControl, String hostUrl) {

    UsingInfo usingInfo = slotManager.getUsingSlot(id);

    if(usingInfo == null) {
        LogInfo log = LogInfo.ErrorType;
        log.setAndPrint("No Seesion Available!!");
        return "NO URL BECAUSE OF ERROR";
    }

    usingInfo.increaseUserCount();
    ...
}
```

`UserController` then treats that sentinel as a redirect target:

```java
String clientURL = service.enterSession(channelId, isControl, request.getRequestURL().toString());
...
return "redirect:" + clientURL;
```

When the sentinel comes back, Spring issues a redirect toward a relative URL
containing `NO URL BECAUSE OF ERROR`; it does not resolve to a real endpoint.
There is no error status, JSON body, or recovery path. `createSession` uses the
same sentinel when `getFreeSlot()` returns `-1`.

Outbound calls to the Node service use a catch-all that prints and continues:

```java
private void request(String url) {
    LogInfo log = LogInfo.RequestType;
    log.setAndPrint(String.format("Request to X11 WAS\nURL: %s", url));

    try {
        URL obj = new URL(url);
        URLConnection conn = obj.openConnection();
        conn.getInputStream();
    } catch(Exception e) {
        e.printStackTrace();
    }
}
```

There is no connect/read timeout, the response body is not consumed or closed,
and any failure is ignored by the caller. `createSession` proceeds as if the
remote slot started.

The Node service has no error handling at all. It starts a shell command
asynchronously and immediately reports success:

```js
app.get('/create', (req, res) => {
    console.log("get");
    const obj = extract(req);
    run(obj.port, obj.url, obj.width, obj.height);
    res.send("finished!");
});
```

`run()` uses `shell.exec(..., { async: true })`, so the response is sent before
the script finishes, and the exit code is never inspected. `finished!` means
"request accepted", not "browser started".

Bash scripts validate arguments and exit `1` on bad input:

```bash
if ! [[ "$port" =~ ^[0-9]+$ ]]
    then
        echo "Error) Wrong argument: -p & --port option value is not number!"
        exit 1
fi
```

Runtime failures of background processes are not checked; scripts still print
`Finished!` and exit `0`.

The browser client reports validation problems with `alert()` and a boolean
return. Fetch failures are rethrown into the promise chain:

```js
.catch(err => {throw err});
```

That produces an unhandled rejection. `res.ok` is never checked and there are no
timeouts.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 57–74),
`webshare_spring/webshare/src/main/java/com/webshare/util/RequsetManager.java` (lines 46–57),
`webshare_project/x11_server/index.js` (lines 15–24, 47–66),
`webshare_project/x11_kill.sh` (lines 19–31),
`test_client/web_share.js` (lines 74–115).

---

## Logging

Two Java logging mechanisms coexist:

1. **SLF4J + log4j** in `HomeController` only.
2. **`LogInfo`, an enum that prints to `System.out`**, everywhere else.

`LogInfo` is the project's home-grown logger. It has four constants, each
carrying a banner string, and a mutable `message` field:

```java
public enum LogInfo {
    ErrorType  ("----------------------   Error   ----------------------"),
    VarType    ("----------------------  Variable ----------------------"),
    RequestType("----------------------  Request  ----------------------"),
    AlartType  ("----------------------   Alart   ----------------------")
    ;

    private static final boolean LOG_ENABLE = true;

    private final String type;
    private String message;

    LogInfo(String type) {
        this.type = type;
    }

    public void setAndPrint(String message) {
        setMessage(message);
        print();
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public void print() {
        if(LOG_ENABLE) {
            System.out.println(type);
            System.out.println(message);
            System.out.println();
        }
    }
}
```

Every controller method follows the same three-line ritual:

```java
LogInfo log = LogInfo.RequestType;
log.setAndPrint(String.format("Service: "
                + "connect\nChannelId: %s\nUser: %s\nUrl: %s",
                channelId, userType, url));

service.printSlotLog();
```

`printSlotLog()` dumps the entire free/using slot table after every request,
rather than logging a diff:

```java
public void printSlotLog() {
    LogInfo log = LogInfo.VarType;
    log.setAndPrint("FREE SLOT\n" + slotManager.logFreeSlot());
    log.setAndPrint("USING SLOT\n" + slotManager.logUsingSlot());
}
```

The one SLF4J usage is the Spring sample controller:

```java
private static final Logger logger = LoggerFactory.getLogger(HomeController.class);
...
logger.info("Welcome home! The client locale is {}.", locale);
```

`log4j.xml` configures a single console appender with the pattern
`%-5p: %c - %m%n`, sets `com.webshare.controller` to `info`, and the root logger
to `warn`. There is no file appender.

Node and Bash use the platform defaults:

```js
console.log("get");
...
console.log(`Start server with listening port ${PORT}`);
```

```bash
echo "Start..."
echo "Finished!"
echo "Error) Port number out of range!"
```

Conventions and caveats:

- No timestamps, request IDs, levels, or structured fields in `LogInfo`,
  `console.log`, or `echo` output.
- `LogInfo` constants are enum singletons with a shared mutable `message`.
  Concurrent requests can overwrite each other between `setMessage` and
  `print`. Do not use it as a model for new code; SLF4J is already available.
- Each method creates its own `LogInfo` local; `printSlotLog` reuses one local
  for two messages.
- Korean comments are common in log-adjacent code; user-facing messages are
  English.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/dto/LogInfo.java`,
`webshare_spring/webshare/src/main/java/com/webshare/controller/HomeController.java` (lines 22, 29),
`webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 103–107),
`webshare_spring/webshare/src/main/resources/log4j.xml`,
`webshare_project/x11_server/index.js` (lines 48, 55, 62, 70).

---

## Configuration Access

There is no config module, `.env`, or application properties file. Settings come
from three places:

1. JVM system properties read directly during class/bean construction.
2. Hard-coded constants in Java, Node, and JavaScript.
3. Command-line arguments parsed by Bash, with defaults at the top of each
   script.

### JVM system properties

`SlotManager` reads `client_count` during static initialization:

```java
public class SlotManager {

    static final int CLIENT_COUNT = 100;

    /* singleton initialize */
    private static SlotManager instance = new SlotManager(System.getProperty("client_count"));

    private SlotManager(String count) {

        int slotSize = CLIENT_COUNT;

        if(count != null)
            slotSize = Integer.parseInt(count);

        for(int i = 0; i < slotSize; ++i) {
            free_slot.add(i);
        }
    }
```

`WebShareService` reads `x11_addr` in its no-arg constructor and falls back to
the host's own address:

```java
private final int NOVNC_PORT = 60000;

public WebShareService() {
    // for remote server
    this.x11ServerIpAddr = System.getProperty("x11_addr");

    // for local server
    if(this.x11ServerIpAddr == null) {
        this.x11ServerIpAddr = getLocalAddr();
    }
}
```

`auto_start.sh` is the only place that sets them, by appending to `JAVA_OPTS`
before starting Tomcat:

```bash
export JAVA_OPTS="$JAVA_OPTS -Dclient_count=$client_count"
export JAVA_OPTS="$JAVA_OPTS -Dx11_addr=$host_ip"
# ip settings (by array)
bash /usr/tomcat/bin/startup.sh
```

There is no validation around these properties. A non-numeric `client_count`
makes the static initializer fail with `NumberFormatException` (surfaced as
`ExceptionInInitializerError`); a value above 100 fails while filling the
`ArrayBlockingQueue`, whose capacity is fixed at `CLIENT_COUNT`.

### Hard-coded constants and paths

The Node service keeps all settings in three lines:

```js
const PORT = 3000;
const X11_PORT = 50000;

const webshare_dir = '/usr/webshare/release';
```

The browser client fixes the HTTPS port and context path:

```js
const SERVER_PORT = 8443;
...
this.base_url =
    `https://${server_ip}:${SERVER_PORT}/webshare`;
```

Bash scripts put defaults at the top and allow overrides through flags:

```bash
client_count=50
resolution="1920x1920x16"
start_port="50000"
```

### Settings map

| Setting | Where it is set/read | Default |
| --- | --- | --- |
| `client_count` | `-Dclient_count` → `SlotManager` static init | 100 (queue capacity); `auto_start.sh` default 50 |
| `x11_addr` | `-Dx11_addr` → `WebShareService` constructor | `InetAddress.getLocalHost().getHostAddress()` |
| Node control port | `const PORT` in `index.js` | 3000 |
| x11vnc port base | `RequsetManager.X11PORT`, `x11_start.sh`, `noVNC_server.sh` | 50000 |
| websockify/noVNC port base | `WebShareService.NOVNC_PORT`, `noVNC_server.sh` | 60000 |
| Spring HTTPS port | `tomcat_need/server.xml` connector | 8443 |
| Deployment directory | `index.js`, all shell scripts | `/usr/webshare/release` |
| Tomcat home | `auto_start.sh`, `auto_stop.sh` | `/usr/tomcat` |
| Client HTTPS port | `SERVER_PORT` in `web_share.js` | 8443 |

`tomcat_need/server.xml` points the SSL connector at
`/usr/webshare/release/SSL/genes.keystore` and uses the placeholder
`keystorePass="CHANGE_ME"`. Supply the real password at deploy time and never
commit it. `/ssl_cert/` and `/webshare_project/SSL/` are git-ignored on purpose.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/util/SlotManager.java` (lines 13–28),
`webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 16–26, 110–122),
`webshare_project/auto_start.sh` (lines 14–16, 103–106),
`webshare_project/x11_server/index.js` (lines 10–13),
`test_client/web_share.js` (lines 1, 20–22),
`webshare_project/noVNC_server.sh` (lines 7–10),
`tomcat_need/server.xml` (SSL connector around lines 72–75).

---

## Singleton & In-Memory State

`SlotManager` is the process-wide source of truth for slots. It uses the same
eager-singleton shape as `RequsetManager`: a `private static` instance, a
`private` constructor, and a `getInstance()` accessor.

```java
public class SlotManager {

    static final int CLIENT_COUNT = 100;

    /* singleton initialize */
    private static SlotManager instance = new SlotManager(System.getProperty("client_count"));

    private SlotManager(String count) {
        int slotSize = CLIENT_COUNT;

        if(count != null)
            slotSize = Integer.parseInt(count);

        for(int i = 0; i < slotSize; ++i) {
            free_slot.add(i);
        }
    }

    public static SlotManager getInstance() {
        return instance;
    }
```

The state is two collections:

```java
/* value */
/* synchronized variable (thread-safe) */
private BlockingQueue<Integer> free_slot
            = new ArrayBlockingQueue<Integer>(CLIENT_COUNT);

private ConcurrentHashMap<String, UsingInfo> using_slot
            = new ConcurrentHashMap<String, UsingInfo>();
```

`UsingInfo` is a mutable, reference-counted record for one allocated channel:

```java
public class UsingInfo {
    public UsingInfo(int slotId) {
        this.slotId = slotId;
    }

    public int increaseUserCount() {
        return ++userCount;
    }
    public int decreaseUserCount() {
        return --userCount;
    }

    public int getSlotId() {
        return slotId;
    }

    public int getUserCount() {
        return userCount;
    }

    private int slotId;
    private int userCount = 0;
}
```

Status is derived on read rather than stored:

```java
public String getSlotStatus(String id) {    // 슬롯 상태 (사용가능한 슬롯이 있는지 없는지)
    String status = "free";

    if(getUsingSlot(id) != null) {
        status = "using";
    } else if(free_slot.isEmpty()){
        status = "busy";
    }

    return status;
}
```

The three values mean:

- `free` — this channel has no slot, and at least one slot is available.
- `using` — this channel currently owns a slot.
- `busy` — this channel has no slot, and no slots are available.

A channel that owns a slot reports `using` even if the free queue is empty,
because the `using` check comes first.

Slot teardown is shared by `disconnect` and `clear`:

```java
if(usingInfo.decreaseUserCount() == 0) {
    destorySlot(id, usingInfo);
}
...
private void destorySlot(String id, UsingInfo slotInfo) {
    requestManager.killSession(x11ServerIpAddr, slotInfo.getSlotId());
    slotManager.removeUsingSlot(id);
    slotManager.addFreeSlot(slotInfo.getSlotId());
}
```

`/clear` calls `destorySlot` immediately; `/disconnect` destroys only when the
last user leaves. `UsingInfo` has no lower-bound guard, so an extra or
concurrent disconnect can drive the counter negative.

`WebShareService` reaches both singletons through field initializers rather
than Spring injection:

```java
private RequsetManager requestManager = RequsetManager.getInstance();
private SlotManager slotManager = SlotManager.getInstance();

private String x11ServerIpAddr;
```

Both classes live in `com.webshare.util` even though they are stateful
services. `RequsetManager` is stateless apart from its singleton instance.

Concurrency note: the collections are thread-safe, but the operations are not
atomic. `createSession` does a `getUsingSlot` check and then a separate
`getFreeSlot`/`addUsingSlot` sequence; two requests for the same new channel can
both pass the check. `UsingInfo.userCount` is a plain `int`. `getFreeSlot`
peeks and then takes, so two callers can both see a slot and one can block in
`take()`. These are documented in
[Anti-Patterns](#anti-patterns-to-avoid); do not assume the current code is
safe under concurrent load just because it uses concurrent collections.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/util/SlotManager.java` (lines 11–121),
`webshare_spring/webshare/src/main/java/com/webshare/util/RequsetManager.java` (lines 9–21),
`webshare_spring/webshare/src/main/java/com/webshare/dto/UsingInfo.java`,
`webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 76–97, 139–154).

---

## Slot Lifecycle & Port Mapping

The slot number is both the X11 display number and the offset for every port.
The formulas are duplicated in Java, Node, and Bash, so changes must be kept in
sync.

| Resource | Formula | Slot 0 | Slot 3 |
| --- | --- | --- | --- |
| Xvfb display | `:slot` | `:0` | `:3` |
| x11vnc `-rfbport` | `50000 + slot` | 50000 | 50003 |
| Node `/create?port=` | `50000 + slot` | 50000 | 50003 |
| websockify / noVNC | `60000 + slot` | 60000 | 60003 |
| Browser URL | `https://<host>:60000+slot/vnc.html` | `https://<host>:60000/vnc.html` | `https://<host>:60003/vnc.html` |

Java side:

```java
private final int NOVNC_PORT = 60000;
...
String clientUrl = String.format(
        convertHostUrl(hostUrl) + ":%s/vnc.html?autoconnect=true&view_only=%b",
        (NOVNC_PORT + usingInfo.getSlotId()), isControl);
```

```java
static final int PORT = 3000;
static final int X11PORT = 50000;
...
String requestUrl = String.format(
        "http://%s:%d/create?port=%d&url=%s&width=%s&height=%s",
        server, PORT, (X11PORT + slot), url, width, height);
```

Bash side:

```bash
x11vnc -display :$var -shared -forever -nopw -rfbport $(($var + $start_port)) &
...
${novnc_dir}/websockify/run --web ${novnc_dir} --ssl-only $(($noVNC_port+$var)) ${x11_ip}:$(($x11_port+$var)) &
```

```bash
display=$(($port - $x11_port))
```

Lifecycle:

1. `GET /connect/{channelId}/{host}/{width}/{height}?url=` calls
   `WebShareService.createSession`.
2. If the channel is unknown, `SlotManager.getFreeSlot()` takes the next free
   slot, `RequsetManager.createSession` calls Node `/create`, and Node runs
   `x11_start.sh`, which launches Chromium on `:slot`.
3. `SlotManager.addUsingSlot` creates `UsingInfo(slot)`, then
   `increaseUserCount()` sets the count to 1.
4. Joining through `GET /connect/{channelId}/{user}` increments the same count.
5. `/disconnect` decrements the count; at zero it calls Node `/kill`
   (`x11_kill.sh`), removes the map entry, and returns the slot to the queue.
6. `/clear` skips the countdown and destroys the slot immediately.
7. `/status` reports `free`, `using`, or `busy` from the derived status above.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 32–101),
`webshare_spring/webshare/src/main/java/com/webshare/util/RequsetManager.java` (lines 11–38),
`webshare_spring/webshare/src/main/java/com/webshare/util/SlotManager.java` (lines 68–112),
`webshare_project/x11_start.sh` (lines 29–30, 56–69),
`webshare_project/x11_kill.sh` (lines 34, 39–43),
`webshare_project/noVNC_server.sh` (lines 73–79),
`webshare_project/auto_start.sh` (lines 48–51, 78–86).

---

## Layering, Spring Wiring & Java Style

The Java side is a small layered application:

```text
com.webshare.controller   HomeController, UserController
com.webshare.service      WebShareService
com.webshare.util         SlotManager, RequsetManager
com.webshare.dto          UsingInfo, LogInfo
```

- Controllers own the HTTP shape (paths, redirects, view names, JSON).
- `WebShareService` owns slot orchestration and URL construction.
- `util` owns process-wide state and the Node HTTP client.
- `dto` holds mutable records and the log enum.

There are no interfaces, repositories, service abstractions, or persistence.
Spring wiring is annotation-based and field-injected:

```java
@CrossOrigin(origins = "*")
@Controller
public class UserController {

    @Autowired
    WebShareService service;
```

The field is package-private (no `private`). `WebShareService` is discovered by
component scan:

```xml
<context:component-scan base-package="com.webshare.service" />
<context:component-scan base-package="com.webshare.controller" />
```

`dto` and `util` are not scanned; their objects are created with `new` or
`getInstance()`. `root-context.xml` is empty, so the servlet context owns every
bean. `WebShareService` has a second constructor,
`WebShareService(String localhost)`, that is never called; Spring uses the
no-arg constructor that reads `x11_addr`.

Language level: `pom.xml` declares `<java-version>1.7</java-version>` but the
Maven compiler plugin is pinned to `source`/`target` `1.6`. Write Java 6-era
code: no lambdas, no `var`, no diamond operator, no try-with-resources, no
`java.nio.file` convenience APIs. Use explicit generic types such as
`new HashMap<String, String>()`. Match the existing tab indentation and the
space-before-parenthesis style in annotations
(`@PathVariable ("channelId")`, `@RequestParam ("url")`) in the file you are
editing, even though conventional Spring style omits that space.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/controller/UserController.java` (lines 26–31),
`webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 13–30),
`webshare_spring/webshare/src/main/webapp/WEB-INF/spring/appServlet/servlet-context.xml`,
`webshare_spring/webshare/pom.xml` (compiler plugin).

---

## Controller & View Resolution

`UserController` is the entire public API. The class is annotated with
`@CrossOrigin(origins = "*")`, every mapping is `RequestMethod.GET`, and every
path variable is a `String`. Only `/status` uses `@ResponseBody`; the command
endpoints return a view name or a redirect string.

View names resolve through `InternalResourceViewResolver`:

```xml
<beans:bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
    <beans:property name="prefix" value="/WEB-INF/views/" />
    <beans:property name="suffix" value=".jsp" />
</beans:bean>
```

A command endpoint adds one model attribute and returns `result`:

```java
@RequestMapping(value = "/disconnect/{channelId}/{user}",
                method = RequestMethod.GET)
public String leaveSession(
        Model model,
        @PathVariable ("channelId") String channelId,
        @PathVariable ("user") String userType) {

    service.leaveSession(channelId);

    model.addAttribute("type", "disconnect");
    ...
    return "result";
}
```

The JSP renders that attribute and always says "success":

```jsp
<h1>${type} success!</h1>
```

`/status` returns a map that Jackson serializes:

```java
@RequestMapping(value = "/status/{channelId}/{user}",
                method = RequestMethod.GET)
@ResponseBody
public HashMap<String, String> sessionStatus(
        Model model,
        @PathVariable ("channelId") String channelId,
        @PathVariable ("user") String userType) {

    String sessionStatus = service.status(channelId);
    ...
    HashMap<String, String> sessionInfo = new HashMap<String, String>();
    sessionInfo.put("status", sessionStatus);
    return sessionInfo;
}
```

The redirect path is built by string concatenation, not by
`RedirectView`/`UriComponentsBuilder`:

```java
// redirect? forwarding?
return "redirect:" + clientURL;
```

`status.jsp` exists but is unreachable: the old `model.addAttribute("status", ...)`
and `return "status"` lines are commented out in the controller. `/` is the
untouched Spring sample page (`home.jsp`) and is not part of the WebShare API.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/controller/UserController.java` (lines 33–142),
`webshare_spring/webshare/src/main/java/com/webshare/controller/HomeController.java`,
`webshare_spring/webshare/src/main/webapp/WEB-INF/views/result.jsp`,
`webshare_spring/webshare/src/main/webapp/WEB-INF/views/status.jsp`.

---

## API Response Shape

There is no response envelope, error object, pagination, auth header, or
content negotiation. The shape depends on the route.

### Spring endpoints

| Endpoint | Success response | Failure response |
| --- | --- | --- |
| `GET /connect/{channelId}/{host}/{width}/{height}?url=` | `302` to `https://<host>:<60000+slot>/vnc.html?autoconnect=true&view_only=false` | `302` to literal `NO URL BECAUSE OF ERROR` if no slot is free |
| `GET /connect/{channelId}/{user}` | `302` to the same noVNC URL with `view_only=<user != "host">` | Sentinel path; currently throws before redirecting (see below) |
| `GET /disconnect/{channelId}/{user}` | `200 text/html`, `<h1>disconnect success!</h1>` | Same page; still says success |
| `GET /clear/{channelId}/{user}` | `200 text/html`, `<h1>clear success!</h1>` | Same page; still says success |
| `GET /status/{channelId}/{user}` | `200 application/json`, `{"status":"free"}` | None; always one of `free`, `using`, `busy` |

The noVNC URL is built here:

```java
String clientUrl = String.format(
        convertHostUrl(hostUrl) + ":%s/vnc.html?autoconnect=true&view_only=%b",
        (NOVNC_PORT + usingInfo.getSlotId()), isControl);
```

`view_only` is the `isControl` boolean. Despite its name, `isControl` is `false`
for `host` and `true` for everyone else:

```java
boolean isControl = userType.equals("host") ? false : true;
```

The shorter join endpoint is currently broken: `enterSession` has a doubled
`://` and three format specifiers (`%s`, `%s`, `%b`) with only two arguments, so
`String.format` throws `MissingFormatArgumentException` before the redirect can
be returned. See [Anti-Patterns](#anti-patterns-to-avoid).

### Node control endpoints

| Endpoint | Response |
| --- | --- |
| `GET /create?port=&url=&width=&height=` | `200 text/plain`, `finished!` |
| `GET /kill?port=` | `200 text/plain`, `finished!` |
| `GET /clean` | `200 text/plain`, `finished!` |

```js
app.get('/create', (req, res) => {
    console.log("get");
    const obj = extract(req);
    run(obj.port, obj.url, obj.width, obj.height);
    res.send("finished!");
});
```

### Client expectations

The client expects the `/status` key exactly as returned:

```js
fetch(request_url)
.then(res => res.json())
.then((out) => {
    resolve(out.status);
})
```

Conventions for new endpoints:

- Keys are lower-case single words (`status`); values are strings.
- Commands are plain text or JSP HTML; only `/status` is JSON.
- Everything is `GET`, including destructive operations. There is no CSRF
  token, cookie, or auth header.
- If you introduce an error envelope or status code, document it and apply it
  consistently; do not mix it into the existing endpoints silently.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/controller/UserController.java` (lines 122–142),
`webshare_spring/webshare/src/main/java/com/webshare/service/WebShareService.java` (lines 32–74, 146–151),
`webshare_project/x11_server/index.js` (lines 47–66),
`test_client/web_share.js` (lines 102–116).

---

## Validation

Validation lives at the edges, and only on the client and in Bash. The Java and
Node services trust their inputs.

### Java: none

`UserController` accepts `width` and `height` as `String` and passes them
through. `WebShareService` never parses them. `url` is passed to
`RequsetManager`, which concatenates it into a query string without
`URLEncoder`. There is no length, range, scheme, or character check. The only
server-side capacity guard is the `client_count > 100` check in
`auto_start.sh`, which is an orchestration limit, not request validation.

### Node: none

`extract` reads query values raw:

```js
function extract(request) {
    const port = request.query.port;
    const todo = request.query.todo;
    const url = request.query.url;
    const display = port - X11_PORT;

    const width = request.query.width;
    const height = request.query.height;

    return {
        port,
        todo,
        url,
        display,
        width, height
    };
}
```

No value is checked or escaped before it is interpolated into a shell command.

### Bash: numeric, range, and format checks

Bash is the only layer with real validation. It checks numeric arguments with
regexes, ranges with arithmetic, resolutions with a format regex, and the noVNC
host with an IPv4 regex:

```bash
if ! [[ "$resolution" =~ ^[0-9]+x[0-9]+$ ]]
    then
        echo "Error) Wrong resolution value: -r & --resolution option value should be like [W]x[H]!"
        exit 1
fi
```

```bash
if ! [[ "$x11_ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
    then
        echo "Error) Wrong host IP: Check your internet status or argument type!"
        exit 1
fi
```

The IPv4 regex is permissive about octet values (it accepts `999.999.999.999`),
unlike the client-side regex. Ports below 1024 are rejected; client counts above
100 are rejected in `auto_start.sh`.

### Browser: regex + resolution bounds

`web_share.js` centralizes all checks in `exception_check`. It validates the
server IP:

```js
const ip_regExp = /^([01]?\d\d?|2[0-4]\d|25[0-5])(\.([01]?\d\d?|2[0-4]\d|25[0-5])){3}$/;
if(!ip_regExp.test(this.ip)) {
    alert('Error: wrong ip address!');
    return false;
}
```

It validates the iframe, the URL (with or without protocol), and the resolution
bounds (`0..1920` in the current `web_share.js`):

```js
const url_with_protocol_regExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
const url_regExp = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
if(!url_with_protocol_regExp.test(url) && !url_regExp.test(url)) {
    alert("Error: wrong url!");
    return false;
}
```

```js
if(width < MIN_WIDTH || height < MIN_HEIGHT) {
    alert(`Error: resolution is too small! minimum resolution is (${MIN_WIDTH}x${MIN_HEIGHT}).`);
    return false;
}
if(width > MAX_WIDTH || height > MAX_HEIGHT) {
    alert(`Error: resolution is too big! maximum resolution is (${MAX_WIDTH}x${MAX_HEIGHT}).`);
    return false;
}
```

Because the checks are client-side, any direct HTTP call bypasses them. The
server IP must be an IPv4 literal; hostnames such as `localhost` fail the client
regex.

Found in: `test_client/web_share.js` (lines 165–206),
`webshare_project/x11_start.sh` (lines 35–53),
`webshare_project/x11_kill.sh` (lines 21–31),
`webshare_project/noVNC_server.sh` (lines 41–68),
`webshare_project/auto_start.sh` (lines 34–39),
`webshare_spring/webshare/src/main/java/com/webshare/controller/UserController.java` (lines 33–57),
`webshare_project/x11_server/index.js` (lines 27–44).

---

## Node Control Service Conventions

`webshare_project/x11_server/index.js` is deliberately minimal: one file, no
router modules, no middleware, no validation, no error handler. It uses
CommonJS `require`, Express 4, and `shelljs`.

Layout is consistent:

1. `require` imports.
2. Constants (`PORT`, `X11_PORT`, `webshare_dir`).
3. Shell wrappers (`run`, `kill`, `clean`).
4. Query extraction (`extract`).
5. One `app.get` per route.
6. `app.listen` at the bottom.

```js
const express = require('express');
const shell = require('shelljs');

const app = express();
const PORT = 3000;
const X11_PORT = 50000;

const webshare_dir = '/usr/webshare/release';

function run(port, url, width, height) {
    shell.exec(`bash ${webshare_dir}/x11_start.sh -p ${port} -u ${url} -r ${width}x${height}`, { async: true });
}
function kill(port) {
    shell.exec(`bash ${webshare_dir}/x11_kill.sh -p ${port}`, { async: true });
}
function clean() {
    shell.exec(`bash ${webshare_dir}/x11_clean.sh`, { async: true });
}
```

Routes follow the same three-line pattern:

```js
app.get('/clean', (req, res) => {
    console.log("get");
    const obj = extract(req);
    clean();
    res.send("finished!");
});
```

Style details:

- 4-space indentation, semicolons, single quotes for `require`, double quotes
  for short strings, template literals for shell commands.
- `const`/`let` and arrow functions are used freely; this is modern Node, unlike
  the Java 6-era Spring code.
- Korean comments describe each section (`// express 모듈을 가지고 온다.`,
  `// 사용할 변수를 추출하는 함수`).
- `extract` returns `todo` and `display`, but no handler uses them.
- Every route logs the same `get`; there is no route name, status, or timing.
- No `await`, no promise handling, no status codes other than 200.

Found in: `webshare_project/x11_server/index.js` (whole file, 72 lines),
`webshare_project/x11_server/package.json`.

---

## Shell Script Conventions

All first-party scripts use the same template: shebang, defaults, argument
parsing, validation, action, bookend messages, `exit 0` (or `exit 1` on bad
input). There is no `set -e`, `set -u`, or `pipefail`.

| Script | Role | Destructive behavior |
| --- | --- | --- |
| `auto_start.sh` | Stop, then start Xvfb, uim, x11vnc, websockify, Node, Tomcat | Calls `auto_stop.sh` first |
| `auto_stop.sh` | Stop the whole stack | `killall -9 node`, `killall Xvfb`, kills websockify |
| `x11_start.sh` | Launch Chromium on one display | No |
| `x11_kill.sh` | Kill Chromium for one display | `kill -9` by display match |
| `x11_clean.sh` | Kill all Xvfb and remove lock files | Yes, host-wide |
| `noVNC_server.sh` | Start websockify per slot | Kills existing websockify first |

The argument loop is identical everywhere:

```bash
while [ "$*" ];
do
    param=$1; shift; OPTARG=$1
    case $param in
    -cl   |--client)     client_count="${OPTARG}";   shift ;;
    -r    |--resolution) resolution="${OPTARG}";     shift ;;
    -s    |--ipSlot)     ip_slot="${OPTARG}";        shift ;;
    *)                                               break ;;
    esac
done
```

`while [ "$*" ]` means "while there are remaining arguments". Each matching
branch shifts the option value as well as the flag. An unknown option breaks
out of the loop silently rather than erroring.

Defaults sit at the top of each file; validation follows the loop:

```bash
if [ $(($client_count)) -gt 100 ]
    then
        echo "Error) Too many sessions to create!"
        exit 1
fi
```

Long-running processes are started with `&`:

```bash
for (( var=0; var<${client_count}; ++var ))
do
    Xvfb :$var -screen 0 ${resolution} &
done
echo "Create Xvfb Done!"
```

Teardown uses process-name matching and `kill -9`:

```bash
ps -ef | grep "chromium" | grep -w "display=:${display}" | awk '{print $2}'| xargs kill -9
```

Messages are English with `Error)` prefixes and `===>` arrows; comments are
frequently Korean. Most scripts print `Start...`/`Finished!`-style bookends and
end with `exit 0`; `auto_start.sh` orchestrates the others and has no explicit
`exit`.

The scripts assume Linux tools (`hostname -I`, `xrandr`, `killall`, `uim-xim`,
Chromium) and the `/usr/webshare/release` + `/usr/tomcat` layout. They will not
run on macOS as-is.

Found in: `webshare_project/auto_start.sh`, `auto_stop.sh`, `x11_start.sh`,
`x11_kill.sh`, `x11_clean.sh`, `noVNC_server.sh`.

---

## Browser Client Conventions

`test_client/` is a no-build harness: static HTML, CSS, and vanilla ES6 classes.
`web_share.js` is the live reference client and is loaded by all three pages
(`index.html`, `index_api.html`, `index_performance.html`). `webshare.js` is a
parallel camelCase implementation that no HTML file loads, and `script_api.js`
is stale. Treat `web_share.js` as the source of truth.

The class stores the connection fields and builds the base URL in the
constructor:

```js
class web_share {

    constructor(server_ip, room_id, user_type) {
        this.ip = server_ip;
        this.id = room_id;
        this.user_type = user_type;

        this.base_url =
            `https://${server_ip}:${SERVER_PORT}/webshare`;
            // `https://${server_ip}/webshare`;
    }
```

There are two ways to issue a command:

1. **Navigate the iframe** for endpoints that return a redirect or JSP HTML.
2. **`fetch`** for the "now" variants and `/status`.

```js
disconnect(screen) {
    if(!this.exception_check())
        return false;

    const request_url = this.base_url + `/disconnect/${this.id}/${this.user_type}`;
    screen.src = request_url;

    return true;
}
```

```js
disconnect_now() {
    const request_url = this.base_url + `/disconnect/${this.id}/${this.user_type}`;
    fetch(request_url)
    .then((res) => {
        console.log(res);
        return res;
    })
    .catch(err => {throw err});
}
```

`status()` wraps `fetch` in an extra `Promise` and resolves to the status string:

```js
status() {
    if(!this.exception_check())
        return;

    const request_url = this.base_url + `/status/${this.id}/${this.user_type}`;

    return new Promise((resolve, reject) => {
        fetch(request_url)
        .then(res => res.json())
        .then((out) => {
            resolve(out.status);
        })
        .catch(err => {throw err});
    });
}
```

Public method return types are mixed: `connect_leader`, `connect_follower`,
`disconnect`, and `clear` return booleans; `status` returns a Promise of a
string; `check_server_leader` resolves `'true'` or `'false'`;
`check_server_follewer` resolves `'true'`, `'false'`, or `'retry'`;
`disconnect_now` and `clear_now` return `undefined`. This is the existing
contract; do not assume a uniform `Result` type.

Follower retry is immediate recursion with no delay:

```js
this.check_server_follewer()
.then((msg) => {
    if(msg === 'true') {
        this.connect_url('follower', screen);
    } else if(msg === 'retry') {
        this.connect_follower(screen);
    }
});
```

If the channel is still `free`, `check_server_follewer` resolves `'retry'` and
`connect_follower` runs again until the leader creates the slot. There is no
backoff or retry limit.

Validation is centralized in `exception_check(type, screen, url, width, height)`
and returns a boolean; user feedback is `alert()`. The "leader" path validates
the URL and resolution; the "follower" path validates only the IP and iframe.
Because `disconnect`/`clear` call `exception_check()` with the default
`type='none'`, they skip the iframe check and will throw if `screen` is
undefined.

Other details:

- Constants at the top of the file: `SERVER_PORT = 8443`, `MIN_WIDTH = 0`,
  `MAX_WIDTH = 1920`, `MIN_HEIGHT = 0`, `MAX_HEIGHT = 1920`.
- 4-space indentation, single quotes, template literals, arrow functions.
- Korean comments in `web_share.js`; English `alert()` messages.
- The `port` input in `index.html` is read by `script.js` but never used;
  `SERVER_PORT` is fixed at 8443.
- CSS uses BEM-like block/element names (`container_left__input`,
  `container_up__box`) and flexbox; no framework or preprocessor.
- There is no framework, bundler, module system, or test runner.

Found in: `test_client/web_share.js` (whole file),
`test_client/script.js`, `test_client/script_performance.js`,
`test_client/index.html`, `test_client/index_api.html`,
`test_client/index_performance.html`,
`test_client/webshare.js` (unused legacy variant),
`test_client/script_api.js` (stale).

---

## Naming Conventions

Naming is not uniform across the four runtimes. Match the layer you are editing.

| Element | Convention | Examples |
| --- | --- | --- |
| Java package | lowercase, `com.webshare.<layer>` | `com.webshare.controller`, `com.webshare.service`, `com.webshare.util`, `com.webshare.dto` |
| Java class | PascalCase | `UserController`, `WebShareService`, `SlotManager`, `UsingInfo` |
| Java method | camelCase, verb-first | `createSession`, `getFreeSlot`, `printSlotLog`, `destorySlot` |
| Java fields | mixed: camelCase in DTOs, snake_case in managers | `slotId`, `userCount` vs `free_slot`, `using_slot` |
| Java constants | UPPER_SNAKE | `CLIENT_COUNT`, `NOVNC_PORT`, `LOG_ENABLE` |
| Java enum constants | PascalCase role names (with banner text) | `ErrorType`, `VarType`, `RequestType`, `AlartType` |
| Node functions | lowerCamel, short verbs | `run`, `kill`, `clean`, `extract` |
| Node variables | lowerCamel locals, UPPER_SNAKE constants, occasional snake_case | `obj`, `PORT`, `X11_PORT`, `webshare_dir` |
| Bash variables | lower_snake, quoted at assignment | `client_count`, `start_port`, `x11_ip` |
| Bash options | short + long flags | `-cl\|--client`, `-p\|--port`, `-ip\|--ip` |
| JS class | mixed: legacy snake_case vs parallel PascalCase | `web_share` (live) vs `Webshare` (unused) |
| JS methods | mixed: snake_case in `web_share`, camelCase in `Webshare` | `connect_leader` vs `connectByLeader` |
| JS constants | UPPER_SNAKE at top of file | `SERVER_PORT`, `MIN_WIDTH`, `MAX_HEIGHT` |
| Files | class name for Java; mixed `snake_case.js` / `camelCase.js`; mostly `snake_case.sh` | `WebShareService.java`, `web_share.js`, `auto_start.sh` (`noVNC_server.sh` is the exception) |

The mixed field naming is visible in one class:

```java
private BlockingQueue<Integer> free_slot
            = new ArrayBlockingQueue<Integer>(CLIENT_COUNT);

private ConcurrentHashMap<String, UsingInfo> using_slot
            = new ConcurrentHashMap<String, UsingInfo>();
```

```java
private int slotId;
private int userCount = 0;
```

The two client implementations show the same split:

```js
class web_share {
    connect_leader(screen, url, width, height) { ... }
    check_server_follewer() { ... }
}
```

```js
class Webshare {
    connectByLeader(screen, url, width, height) { ... }
    isServerFollewer() { ... }
}
```

### Known typos and misleading names

Do not propagate these into new code. If you rename one, update every call site
and the file name in the same change.

| Name | Correct spelling / meaning |
| --- | --- |
| `RequsetManager` | `RequestManager` |
| `destorySlot` | `destroySlot` |
| `check_server_follewer` | `check_server_follower` |
| `isServerFollewer` | `isServerFollower` |
| `AlartType` | `AlertType` |
| `"No Seesion Available!!"` | `"No Session Available!!"` |
| `isControl` | Actually "is view-only": `false` for `host`, `true` for everyone else |

### Comments and messages

- Internal comments are often Korean in `SlotManager`, `WebShareService`,
  `UsingInfo`, `x11_server/index.js`, and `auto_start.sh`.
- Javadoc and most controller comments are English.
- User-facing messages (`alert()`, `result.jsp`, `Error)` lines) are English.
- Keep new `LogInfo` banners consistent with the existing width and spacing if
  you must add a constant; otherwise prefer SLF4J.

### Indentation

- Java: tabs.
- Node and browser JavaScript: 4 spaces.
- Bash: 4 spaces (a few loop bodies use tabs).
- No `.editorconfig`, checkstyle, ESLint, or Prettier config exists for
  first-party code; the vendored `noVNC/` directory has its own `.eslintrc`.

Found in: `webshare_spring/webshare/src/main/java/com/webshare/util/SlotManager.java`,
`webshare_spring/webshare/src/main/java/com/webshare/dto/UsingInfo.java`,
`test_client/web_share.js`, `test_client/webshare.js`,
`webshare_project/x11_server/index.js`.

---

## Testing Conventions

There are none. This is the most important convention to understand before
claiming a change is done.

- `webshare_spring/webshare/src/test/` contains only `resources/log4j.xml`.
  There are zero test classes.
- `pom.xml` declares JUnit 4.7 in `test` scope, but nothing uses it. `mvn test`
  succeeds with zero tests.
- `webshare_project/x11_server/package.json` defines
  `"test": "echo \"Error: no test specified\" && exit 1"`.
- There is no Jest/Mocha, no `__tests__`, no fixtures, no mocking setup.
- There is no linter or formatter config for first-party code.
- There is no CI configuration.

Verification is manual and Linux-only:

1. `mvn clean package` for the WAR (deploy as `webshare.war`).
2. Start the Node service and the X11/noVNC stack with `auto_start.sh`.
3. Exercise the HTTP API through `test_client/` or `curl`.
4. Watch `System.out` / `console.log` / Tomcat logs.

Do not claim a change is verified unless you actually built or exercised it.
The shell scripts call `killall -9 node`, `killall Xvfb`, and delete
`/tmp/.X*-lock`; do not run them casually on a shared host.

Found in: `webshare_spring/webshare/src/test/resources/log4j.xml`,
`webshare_spring/webshare/pom.xml`,
`webshare_project/x11_server/package.json`,
`webshare_project/auto_start.sh`, `webshare_project/auto_stop.sh`.

---

## Conventions Summary

| Concern | Convention |
| --- | --- |
| Error handling | Null checks + `LogInfo` + sentinel string `"NO URL BECAUSE OF ERROR"`; no exceptions or non-2xx responses; controllers always return 200/302 |
| Logging | SLF4J/log4j only in `HomeController`; `LogInfo` enum → `System.out` elsewhere; `console.log` in Node; `echo` in Bash |
| Configuration | JVM system properties (`client_count`, `x11_addr`) read at class init; hard-coded constants and paths; Bash CLI args; no config module or env vars |
| State | Eager static singletons (`SlotManager`, `RequsetManager`); `ArrayBlockingQueue` of free slots + `ConcurrentHashMap` of channel → `UsingInfo` |
| Dependency injection | Spring `@Autowired` field injection for the controller; `getInstance()` field initializers for the singletons; no interfaces |
| Layering | `controller` → `service` → `util`; `dto` records; no repositories, database, or ORM |
| HTTP | All operations are `GET`; class-level `@CrossOrigin(origins = "*")`; no auth, cookies, or CSRF |
| Response shape | `/status` → `{"status":"free"\|"using"\|"busy"}`; commands → 302 redirect or `result.jsp` HTML; Node → `finished!` text |
| Validation | Browser regex + resolution bounds; Bash numeric/range/IP checks; none in Java or Node |
| Naming | Java PascalCase/camelCase (snake_case fields in managers); Node camelCase; Bash lower_snake; browser JS mixed legacy styles |
| Typos | `RequsetManager`, `destorySlot`, `check_server_follewer`, `AlartType`; do not propagate |
| Comments | Korean internal comments in Java/Node/Bash; English user-facing messages |
| Indentation | Tabs in Java; 4 spaces in Node/JS/Bash |
| Java level | Source/target 1.6; no lambdas, `var`, diamond, or try-with-resources |
| Testing | None; JUnit dependency unused; `mvn test` runs zero tests; manual Linux verification |
| Secrets | TLS material is git-ignored; `tomcat_need/server.xml` uses a `CHANGE_ME` keystore-password placeholder — supply it at deploy time |

---

## Anti-Patterns to Avoid

These are existing behaviors, documented so they are not copied accidentally.
They are not all bugs, but none of them should be treated as the house style for
new work.

### 1. Shell interpolation without validation or quoting

`index.js` inserts `url`, `width`, and `height` straight into a Bash command:

```js
shell.exec(`bash ${webshare_dir}/x11_start.sh -p ${port} -u ${url} -r ${width}x${height}`, { async: true });
```

No value is validated or quoted. A `url` containing spaces, `;`, `$(...)`, or
backticks changes the command. The Java side has the same class of problem in a
milder form: `RequsetManager` concatenates `url` into a query string without
`URLEncoder`, so an `&` in the URL silently becomes a new query parameter.

New code should validate against an allowlist, URL-encode query values, and
avoid string-based `shell.exec` (prefer an argument array such as `execFile`).

### 2. GET for mutations, wildcard CORS, no auth

Every command is a `GET`, both controllers use
`@CrossOrigin(origins = "*")`, and there is no authentication or CSRF token.
Any web page that can reach the host can call `/clear/{channel}/{user}` and
destroy someone else's slot. Do not add more destructive GET endpoints without
considering auth and CSRF; if you add an API, use the appropriate method and
document the auth model.

### 3. Hard-coded deployment details

Ports, paths, and sample IPs are literals scattered across four languages:

- `SERVER_PORT = 8443` and `/webshare` in `web_share.js`.
- `221.139.104.115` in `test_client/index.html`, `192.168.0.211` in
  `script_api.js`.
- `/usr/webshare/release` in `index.js` and three shell scripts.
- `/usr/tomcat` in `auto_start.sh` and `auto_stop.sh`.
- `3000`, `50000`, `60000` in Java, Node, and Bash.

These are sample/deployment values, not configuration. If you add a setting,
put it in one place per runtime rather than copying another literal.

### 4. Global destructive cleanup

The stop path is host-wide:

```bash
killall -9 node
...
killall Xvfb
...
find /tmp/ -name ".X*-lock" 2> /dev/null -delete
```

`auto_start.sh` calls `auto_stop.sh` before starting, so even a "start" kills
every Node process and every Xvfb on the machine. `noVNC_server.sh` also kills
all websockify processes by name. Do not run these on a shared host, and do not
add more `killall`/`xargs kill -9` calls to new scripts.

### 5. Check-then-act races in slot state

`SlotManager` uses concurrent collections but not atomic operations:

```java
UsingInfo usingInfo = slotManager.getUsingSlot(id);

if(usingInfo == null) {
    int freeSlot = slotManager.getFreeSlot();
    ...
    usingInfo = createNewSlot(freeSlot, id, startUrl, width, height, isControl);
}
```

Two concurrent requests for the same new channel can both see `null` and
allocate two slots. `getFreeSlot` does `peek()` then `take()`, so two callers
can both pass the check and one blocks in `take()` until a slot is returned.
`UsingInfo.userCount` is a plain `int` mutated without synchronization, and the
queue capacity is fixed at 100 while `client_count` can be set higher.

If you touch this area, prefer `computeIfAbsent`-style atomic map operations,
synchronize the check-and-allocate sequence, and use `poll()` instead of
`peek()` + `take()`.

### 6. Broken join URL builder

`WebShareService.enterSession` has a doubled scheme separator and a format
string with three specifiers but only two arguments:

```java
convertHostUrl(hostUrl) +  "://%s:%s/vnc.html?autoconnect=true&view_only=%b",
(NOVNC_PORT + usingInfo.getSlotId()), isControl);
```

`convertHostUrl` already returns `https://host`, so the result would contain
`https://host://60000/...` even if the argument count were correct. As written,
`String.format` throws `MissingFormatArgumentException` for `%b`, so
`GET /connect/{channelId}/{user}` fails at runtime. The line above it,
`convertHostUrl(hostUrl);`, is dead code. Fix the format string and add a test
before relying on the join path.

### 7. Success pages that hide failure

`result.jsp` always says success:

```jsp
<h1>${type} success!</h1>
```

`/disconnect` and `/clear` return it even when no session existed, and the
controller never sets an error status. The browser client treats iframe
navigation as success because it has no response body to inspect. Node always
returns `finished!`. If you build a new API, use real status codes or a
documented result envelope; do not copy this pattern for machine clients.

### 8. `LogInfo` as a logger

`LogInfo` is an enum with a mutable `message` field. Enum constants are
process-wide singletons, so two concurrent requests can interleave their
messages between `setMessage` and `print`. It also writes to `System.out`, has
no timestamps or levels, and uses a hard-coded `LOG_ENABLE` flag. SLF4J is
already on the classpath and is used correctly in `HomeController`; use it for
new code.

### 9. Duplicated and stale client code

- `test_client/webshare.js` defines a camelCase `Webshare` class that no HTML
  page loads.
- `test_client/script_api.js` constructs the old five-argument
  `new web_share(server_ip, client_id, screen, 'host', web_url)` shape and calls
  `connect_leader()` / `disconnect()` without arguments; the current constructor
  takes `(server_ip, room_id, user_type)`, and the methods need an iframe.
- `script_performance.js` calls `api.disconnect()` without a screen; the current
  `disconnect` skips the iframe check and then dereferences `screen`.
- The live file is `web_share.js` (snake_case). Copy from it, not from the
  legacy variants.

### 10. Secrets and key material

`tomcat_need/server.xml` uses the placeholder `keystorePass="CHANGE_ME"`; the
real password is supplied at deploy time and is not version-controlled.
`/ssl_cert/` and `/webshare_project/SSL/` are git-ignored. Never commit private
keys, keystores, certificates, or real passwords.

### 11. Misleading boolean names

`isControl` is `false` for `host` and `true` for every other user, and it is
passed directly as the noVNC `view_only` flag:

```java
boolean isControl = userType.equals("host") ? false : true;
...
String clientUrl = String.format(
        convertHostUrl(hostUrl) + ":%s/vnc.html?autoconnect=true&view_only=%b",
        (NOVNC_PORT + usingInfo.getSlotId()), isControl);
```

The name reads as "this user has control", but the value means "this user is
view-only". Rename it to `isViewOnly` (or invert it) if you touch this code;
until then, read the call site rather than trusting the name.

### 12. Shell robustness gaps

- No `set -euo pipefail`; failed background jobs do not stop the script.
- The Xvfb wait loop counts `/tmp` lock files and then sleeps a fixed 3 seconds;
  it does not verify that each display is actually usable.
- `EXTENSION_PATH="~/.config/chromium/Default/Extensions"` stores a literal
  `~` because the assignment is quoted; Chromium receives a path starting with
  `~`, not the home directory.
- Chromium runs with `--no-sandbox`.
- `x11_start.sh` defines `-c`/`--connect` and `-i`/`--internet` options but
  never uses `connect_type` or `internet_type`.
- `x11_clean.sh` deletes every `.X*-lock` in `/tmp`, not just the displays this
  application owns.

Keep shell changes small and test them on a disposable Linux host.

### 13. Minor dead code and leftovers

- `RequsetManager.clearAllSessions` is never called.
- `UserController` still contains commented-out view-returning code for
  `/status`, and `status.jsp` is unreachable.
- `extract` computes `todo` and `display`, but no handler uses either.
- `createNewSlot` accepts `isControl` but never uses it.
- `WebShareService` declares its singleton fields after the methods, at the
  bottom of the class.
- `script.js` reads the `port` input, stores it in `temp_port`, and never uses
  it.

None of these affect the main path today, but they make the code harder to
navigate. Remove or fix them when you are already editing the surrounding file.
