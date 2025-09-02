// Background service worker
// Recebe lote de URLs, faz UMA requisição para a API, guarda em cache e bloqueia via DNR.

export { }

const API_ENDPOINT = 'https://mocki.io/v1/40c6fa30-db54-4ace-a32a-9744fa881d7a'; // mudar para a secinbox

type Verdict = 'safe' | 'suspect' | 'malicious';

// Cache em memória (vida do service worker)
const memoryCache = new Map<string, { verdict: Verdict, expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

// Salva veredito no cache
function saveToCache(url: string, verdict: Verdict) {
  memoryCache.set(url, { verdict, expiresAt: Date.now() + CACHE_TTL_MS });
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
  const unique = Array.from(new Set(urls));
  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ urls: unique })
    });

    // Esperado: { results: { "<url>": "safe"|"suspect"|"malicious" } }
    const data = await res.json().catch(() => ({}));
    const results = (data?.results ?? {}) as Record<string, Verdict>;

    // Salva cada veredito no cache
    for (const [u, v] of Object.entries(results)) {
      const verdict: Verdict = (v === 'suspect' || v === 'malicious') ? v : 'safe';
      saveToCache(u, verdict);
    }
    // URLs não retornadas → assume "safe"
    for (const u of unique) {
      if (!(u in results)) saveToCache(u, 'safe');
    }

    // Retorna mapa completo
    const out: Record<string, Verdict> = {};
    for (const u of unique) out[u] = loadFromCache(u) ?? 'safe';
    return out;
  } catch (e) {
    console.warn('[AntiPhishing] batch API failed:', e);
    const fallback: Record<string, Verdict> = {};
    for (const u of unique) fallback[u] = 'safe';
    return fallback;
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
