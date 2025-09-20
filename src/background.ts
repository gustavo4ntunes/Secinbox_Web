
// === Toggle de verificação por origem/aba ===
// Armazena por ORIGIN (https://site.com) e permite sobrepor por aba em tempo de vida.
const scanningState = new Map<number, boolean>(); // por tabId (runtime)

async function getEnabled(origin: string, tabId?: number): Promise<boolean> {
  if (tabId != null && scanningState.has(tabId)) return !!scanningState.get(tabId);
  const key = `scanEnabled:${origin}`;
  const stored = await chrome.storage.local.get(key);
  return stored[key] !== false; // padrão: true
}

async function setEnabled(origin: string, enabled: boolean, tabId?: number) {
  if (tabId != null) scanningState.set(tabId, enabled);
  const key = `scanEnabled:${origin}`;
  await chrome.storage.local.set({ [key]: enabled });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'GET_SCANNING_STATE') {
      const enabled = await getEnabled(msg.origin, msg.tabId ?? sender.tab?.id);
      sendResponse({ enabled });
    } else if (msg?.type === 'TOGGLE_SCANNING') {
      const tabId = msg.tabId ?? sender.tab?.id;
      const origin = msg.origin;
      const enabled = !(await getEnabled(origin, tabId));
      await setEnabled(origin, enabled, tabId);
      // avisa o content script do tab atual
      if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'SCANNING_STATE', enabled });
      sendResponse({ enabled });
    } else if (msg?.type === 'IS_SCANNING_ENABLED') {
      const enabled = await getEnabled(msg.origin ?? (sender.tab?.url ? new URL(sender.tab.url).origin : ''), sender.tab?.id);
      sendResponse({ enabled });
    }
  })();
  return true; // async
});

chrome.tabs.onRemoved.addListener((tabId) => scanningState.delete(tabId));
// === Fim toggle ===

// Background service worker
// Recebe lote de URLs, faz UMA requisição para a API, guarda em cache e bloqueia via DNR.

export { }

const API_ENDPOINT = 'http://localhost:5000/analisar/'; // mudar para a secinbox

type Verdict = 'safe' | 'suspect' | 'malicious';

// Cache em memória (vida do service worker)
const memoryCache = new Map<string, { verdict: Verdict, expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

//Storage persistente
const STORAGE_KEY = 'ap_verdicts_v1';
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type StoredVerdict = { verdict: Verdict; expiresAt: number };
type StoredMap = Record<string, StoredVerdict>;

// Carrega mapa completo do storage (cuidado com tamanho; ok para MVP)
async function loadStore(): Promise<StoredMap> {
  const obj = await chrome.storage.local.get(STORAGE_KEY);
  return (obj?.[STORAGE_KEY] ?? {}) as StoredMap;
}

// Salva/mescla entradas no storage
async function saveToStore(entries: Record<string, StoredVerdict>) {
  const curr = await loadStore();
  Object.assign(curr, entries);
  await chrome.storage.local.set({ [STORAGE_KEY]: curr });
}

// Dado um lote, retorna: conhecidas (vereditos válidos) e desconhecidas
async function splitKnownUnknown(urls: string[]) {
  const unique = Array.from(new Set(urls));
  const known: Record<string, Verdict> = {};
  const unknown: string[] = [];

  // 1) Tenta cache em memória
  const memMiss: string[] = [];
  for (const u of unique) {
    const v = loadFromCache(u);
    if (v) known[u] = v;
    else memMiss.push(u);
  }

  if (memMiss.length === 0) return { known, unknown }; // tudo em memória

  // 2) Tenta storage persistente
  const store = await loadStore();
  const now = Date.now();

  for (const u of memMiss) {
    const rec = store[u];
    if (rec && rec.expiresAt > now) {
      known[u] = rec.verdict;
      // aquece o cache em memória
      saveToCache(u, rec.verdict);
    } else {
      unknown.push(u);
    }
  }
  return { known, unknown };
}

// já existia em memória; mantemos
function saveToCache(url: string, verdict: Verdict, ttl = CACHE_TTL_MS) {
  memoryCache.set(url, { verdict, expiresAt: Date.now() + ttl });
}

// Lê veredito do cache (ou undefined se expirado/ausente)
function loadFromCache(url: string): Verdict | undefined {
  const hit = memoryCache.get(url);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    memoryCache.delete(url);
    return undefined;
  }
  return hit.verdict;
}

// Chama a API em LOTE com todas as URLs
async function requestApiBatch(urls: string[]): Promise<Record<string, Verdict>> {
  const { known, unknown } = await splitKnownUnknown(urls);

  // Se não há desconhecidas, retorna só o known
  if (unknown.length === 0) return known;

  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: unknown })
    });

    const data = await res.json().catch(() => ({}));
    const results = (data?.results ?? {}) as Record<string, Verdict>;

    // Normaliza retorno e aplica TTLs
    const storeBatch: Record<string, StoredVerdict> = {};
    for (const u of unknown) {
      const raw = results[u];
      const verdict: Verdict = (raw === 'suspect' || raw === 'malicious') ? raw : 'safe';

      // memória (10min) + storage (24h)
      saveToCache(u, verdict, CACHE_TTL_MS);
      storeBatch[u] = { verdict, expiresAt: Date.now() + STORAGE_TTL_MS };
    }
    await saveToStore(storeBatch);

    // Merge known + api
    const out: Record<string, Verdict> = { ...known };
    for (const u of unknown) out[u] = storeBatch[u].verdict;

    return out;
  } catch (e) {
    console.warn('[AntiPhishing] batch API failed:', e);

    // Fallback: mantém known; para unknown assume "safe" (ou "suspect" se preferir conservador)
    const out: Record<string, Verdict> = { ...known };
    for (const u of unknown) {
      const verdict: Verdict = 'safe';
      saveToCache(u, verdict, CACHE_TTL_MS);
      // opcional: NÃO salvar no storage num erro de rede (para forçar retry no futuro)
      out[u] = verdict;
    }
    return out;
  }
}

// Aplica regras DNR para bloquear domínios suspeitos/maliciosos
function ruleIdFromHost(host: string) {
  // hash simples (não-criptográfico) só pra caber em número
  let h = 0;
  for (let i = 0; i < host.length; i++) h = ((h << 5) - h) + host.charCodeAt(i) | 0;
  // manter em faixa positiva e deslocar pra área de IDs da extensão
  return 210000 + (Math.abs(h) % 20000);
}

async function applyBlockRulesFor(urlsToBlock: string[]) {
  const rules: chrome.declarativeNetRequest.Rule[] = [];

  for (const raw of urlsToBlock) {
    try {
      const u = new URL(raw);
      const pattern = `${u.protocol}//${u.host}/*`;
      const id = ruleIdFromHost(u.host);
      rules.push({
        id,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: pattern,
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image']
        }
      });
    } catch { }
  }

  // remove os mesmos IDs antes de adicionar (idempotente)
  const ids = rules.map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ids,
    addRules: rules
  });
}

// Listener de mensagens do content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'PAGE_URLS_BATCH') {
      const pageUrls: string[] = Array.isArray(message.urls) ? message.urls : [];
      if (!pageUrls.length) { sendResponse({ ok: true }); return; }

      // Uma chamada em lote
      const verdictMap = await requestApiBatch(pageUrls);

      // Selecione as URLs a bloquear (qualquer coisa que não seja "safe")
      const toBlock = Object.entries(verdictMap)
        .filter(([_, v]) => v !== 'safe')
        .map(([u]) => u);

      if (toBlock.length) await applyBlockRulesFor(toBlock);

      sendResponse({ ok: true, blockedCount: toBlock.length });
      return;
    }

    if (message.type === 'IS_URL_BLOCKED') {
      const singleUrl: string = message.url;
      let verdict = loadFromCache(singleUrl);
      if (!verdict) {
        const map = await requestApiBatch([singleUrl]);
        verdict = map[singleUrl] ?? 'safe';
      }
      const blocked = (verdict !== 'safe') ? [singleUrl] : [];
      sendResponse({ ok: true, blocked });
      return;
    }
  })().catch(err => {
    console.error('[AntiPhishing v2] background error:', err);
    sendResponse({ ok: false, error: String(err) });
  });

  return true;
});
