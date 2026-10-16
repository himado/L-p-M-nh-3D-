// REST + WebSocket client.
const KEY = 'doha_token';
let token = null;
try { token = localStorage.getItem(KEY); } catch { /* storage bị chặn */ }

export const getToken = () => token;
export function setToken(t) {
  token = t;
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
}

export async function api(path, body) {
  const res = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'HTTP ' + res.status), { status: res.status });
  return data;
}

export class Socket {
  constructor(handlers) { this.handlers = handlers; this.closedByUser = false; }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws.onmessage = (e) => { const m = JSON.parse(e.data); this.handlers[m.t]?.(m); };
    this.ws.onclose = (e) => {
      this.handlers.closed?.(e);
      if (!this.closedByUser && e.code !== 4001 && e.code !== 4002) setTimeout(() => this.connect(), 2000);
    };
  }
  send(t, data = {}) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t, ...data })); }
  close() { this.closedByUser = true; this.ws?.close(); }
}
