// Plan #40. The remote browser service behind the in-app window. One interface, so tests (and the owner's choice of service) do not touch the pages.
import { isMerimenUrl } from "./rules";

export interface BrowserProvider {
  name: string;
  create(): Promise<string>; // the session id; nothing secret is kept by us, the connect address is rebuilt when needed
  /** The address of the live window to embed. Secret-ish: shown only to the user who opened the session, never logged. */
  liveViewUrl(id: string): Promise<string>;
  /** Addresses of the open tabs (read-only, from the browser's own target list). Never logged. */
  pageUrls(id: string): Promise<string[]>;
  navigate(id: string, url: string): Promise<void>;
  release(id: string): Promise<void>;
}

// ---- Browserbase (the service the schema already names). Needs BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID. ----
// keepAlive: without it the service ends the session when our short CDP connection closes. We always release explicitly; `timeout` is the hard stop.
// NOTE: written from the public API description and not yet run against the real service (no key yet). See PR #40's checklist.
const BB = "https://api.browserbase.com/v1";
export function browserbase(env: Record<string, string | undefined> = process.env): BrowserProvider | null {
  const key = env.BROWSERBASE_API_KEY, projectId = env.BROWSERBASE_PROJECT_ID;
  if (!key || !projectId) return null;
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${BB}${path}`, { ...init, headers: { "X-BB-API-Key": key, "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (!r.ok) throw new Error(`browser service ${r.status}`); // never include the body: it can hold secrets
    return r.json();
  };
  const connect = (id: string) => `wss://connect.browserbase.com?apiKey=${encodeURIComponent(key)}&sessionId=${encodeURIComponent(id)}`; // holds the API key: never stored, never logged
  return {
    name: "browserbase",
    async create() {
      const j = await call("/sessions", { method: "POST", body: JSON.stringify({ projectId, timeout: 3600, keepAlive: true, browserSettings: { recordSession: false, logSession: false } }) });
      return j.id as string;
    },
    async liveViewUrl(id) {
      const j = await call(`/sessions/${id}/debug`);
      return j.debuggerFullscreenUrl ?? j.pages?.[0]?.debuggerFullscreenUrl;
    },
    pageUrls: (id) => cdpPageUrls(connect(id)),
    navigate: (id, url) => cdpNavigate(connect(id), url),
    async release(id) { await call(`/sessions/${id}`, { method: "POST", body: JSON.stringify({ projectId, status: "REQUEST_RELEASE" }) }); },
  };
}

// ---- A minimal DevTools-protocol client over Node's built-in WebSocket (no extra package). ----
function cdp<T>(wsUrl: string, run: (send: (method: string, params?: object, sessionId?: string) => Promise<any>) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let n = 0; const waiting = new Map<number, (m: any) => void>();
    const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("browser timeout")); }, 20_000);
    const done = (f: () => void) => { clearTimeout(timer); try { ws.close(); } catch {} f(); };
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); waiting.get(m.id)?.(m); };
    ws.onerror = () => done(() => reject(new Error("browser connection failed")));
    ws.onopen = () => {
      const send = (method: string, params: object = {}, sessionId?: string) => new Promise<any>((res, rej) => {
        const id = ++n; waiting.set(id, (m) => (m.error ? rej(new Error("browser command failed")) : res(m.result)));
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      run(send).then((v) => done(() => resolve(v)), (e) => done(() => reject(e)));
    };
  });
}
export const cdpPageUrls = (wsUrl: string) => cdp(wsUrl, async (send) => {
  const { targetInfos } = await send("Target.getTargets");
  return (targetInfos as { type: string; url: string }[]).filter((t) => t.type === "page").map((t) => t.url);
});
export const cdpNavigate = (wsUrl: string, url: string) => cdp(wsUrl, async (send) => {
  if (!isMerimenUrl(url)) throw new Error("not allowed"); // the address lock: only Merimen's claims pages
  const { targetInfos } = await send("Target.getTargets");
  const page = (targetInfos as { type: string; targetId: string }[]).find((t) => t.type === "page");
  if (!page) throw new Error("no tab");
  const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
  await send("Page.navigate", { url }, sessionId);
});

// ---- Test double. Only outside production, only with EXT_BROWSER_FAKE=1. Looks logged in 8 seconds after it opens. ----
const fakeOpened = new Map<string, number>();
export function fakeProvider(): BrowserProvider {
  return {
    name: "fake",
    async create() { const id = `fake-${Date.now()}`; fakeOpened.set(id, Date.now()); return id; },
    async liveViewUrl(id) {
      const html = `<body style="font:16px system-ui;margin:0;background:#fff"><div style="background:#eef;padding:8px 12px;border-bottom:1px solid #ccd">www.merimen.com.my/claims/ (test window, ${id.slice(0, 9)})</div><div style="padding:24px"><b>Merimen sign in</b><p>This is a stand-in for the remote browser.</p><div style="border:1px solid #ccd;padding:8px;width:220px">User ID</div><br><div style="border:1px solid #ccd;padding:8px;width:220px">Password</div></div></body>`;
      return `data:text/html,${encodeURIComponent(html)}`;
    },
    async pageUrls(id) {
      const t = fakeOpened.get(id) ?? 0;
      return [Date.now() - t > 8000 ? "https://www.merimen.com.my/claims/index.cfm?fusebox=MTRadjuster&CFID=1&CFTOKEN=2&RID=3" : "https://www.merimen.com.my/claims/"];
    },
    async navigate() {},
    async release(id) { fakeOpened.delete(id); },
  };
}

export function getProvider(): BrowserProvider | null {
  const real = browserbase();
  if (real) return real;
  if (process.env.NODE_ENV !== "production" && process.env.EXT_BROWSER_FAKE === "1") return fakeProvider();
  return null;
}
