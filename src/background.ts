// === Toggle de verificação por origem/aba ===
// Armazena por ORIGIN (https://site.com) e permite sobrepor por aba em tempo de vida.
const scanningState = new Map<number, boolean>(); // por tabId (runtime)

// Chave/funcões de estado GLOBAL
const GLOBAL_KEY = 'scanEnabled:__global__' as const;

async function getGlobalEnabled(): Promise<boolean> {
  const stored = await chrome.storage.local.get(GLOBAL_KEY);
  // padrão: true (ligado)
  return stored[GLOBAL_KEY] !== false;
}
async function setGlobalEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [GLOBAL_KEY]: enabled });
}

async function getEnabled(origin: string, tabId?: number): Promise<boolean> {
  // Se global estiver OFF, força false
  const globalOn = await getGlobalEnabled();
  if (!globalOn) return false;

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

// Propaga estado para todas as abas (usado ao alternar o global)
async function broadcastEffectiveToAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    try {
      const origin = new URL(tab.url).origin;
      const enabled = await getEnabled(origin, tab.id);
      chrome.tabs.sendMessage(tab.id, { type: 'SCANNING_STATE', enabled });
    } catch { /* aba sem URL válida */ }
  }
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
      const enabled = await getEnabled(
        msg.origin ?? (sender.tab?.url ? new URL(sender.tab.url).origin : ''),
        sender.tab?.id
      );
      sendResponse({ enabled });

      // suportes ao GLOBAL (consulta e toggle)
    } else if (msg?.type === 'GET_GLOBAL_STATE') {
      const enabled = await getGlobalEnabled();
      sendResponse({ enabled });

    } else if (msg?.type === 'TOGGLE_GLOBAL') {
      const curr = await getGlobalEnabled();
      const next = !curr;
      await setGlobalEnabled(next);
      
      // Se desabilitando globalmente, remove todas as regras DNR
      if (!next) {
        await clearAllBlockRules();
      }
      
      await broadcastEffectiveToAllTabs(); // refletir imediatamente
      sendResponse({ enabled: next });
    }

    // retorna uma lista de ORIGINS que foram explicitamente desativados (scanEnabled:<origin> === false)
    else if (msg?.type === 'GET_DISABLED_SITES') {
      const all = await chrome.storage.local.get();
      const disabled = [];
      for (const k of Object.keys(all)) {
        if (k === GLOBAL_KEY) continue;
        if (!k.startsWith('scanEnabled:')) continue;

        if (all[k] === false) {
          disabled.push(k.replace('scanEnabled:', ''));
        }
      }
      sendResponse({ sites: disabled });
    }

    // seta explicitamente enabled/disabled para um origin (usado pelo modal)
    else if (msg?.type === 'SET_SITE_ENABLED') {
      const { origin, enabled } = msg;
      await setEnabled(origin, !!enabled);
      await broadcastEffectiveToAllTabs(); // garante sincronização global

      const tabs = await chrome.tabs.query({});

      for (const t of tabs) {
        try {
          if (!t.id || !t.url) continue;
          const o = new URL(t.url).origin;
          if (o === origin) {
            chrome.tabs.sendMessage(t.id, { type: 'SCANNING_STATE', enabled: !!enabled });
          }
        } catch { }
      }
      sendResponse({ ok: true });
    }
  })();
  return true; // async
});

chrome.tabs.onRemoved.addListener((tabId) => scanningState.delete(tabId));
// === Fim toggle ===

// Background service worker
// Recebe lote de URLs, faz UMA requisição para a API, guarda em cache e bloqueia via DNR.

import { WHITELIST_SET } from './whitelist';

export { }

const API_ENDPOINT = 'https://secinbox.onrender.com/analisar/'; // mudar para a secinbox

type Verdict = 'safe' | 'suspect' | 'malicious';

// Cache em memória (vida do service worker)
const memoryCache = new Map<string, { verdict: Verdict, expiresAt: number, reason?: string }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

//Storage persistente
const STORAGE_KEY = 'ap_verdicts_v1';
const STORAGE_TTL_MS = 72 * 60 * 60 * 1000; // 72h (3 dias)

type StoredVerdict = { verdict: Verdict; expiresAt: number; reason?: string };
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

type VerdictWithReason = { verdict: Verdict; reason?: string };

// Dado um lote, retorna: conhecidas (vereditos válidos) e desconhecidas
async function splitKnownUnknown(urls: string[]) {
  const unique = Array.from(new Set(urls));
  const known: Record<string, VerdictWithReason> = {};
  const unknown: string[] = [];

  // 1) Tenta cache em memória
  const memMiss: string[] = [];
  for (const u of unique) {
    const cached = loadFromCache(u);
    if (cached) {
      known[u] = { verdict: cached.verdict, reason: cached.reason };
    } else {
      memMiss.push(u);
    }
  }

  if (memMiss.length === 0) return { known, unknown }; // tudo em memória

  // 2) Tenta storage persistente
  const store = await loadStore();
  const now = Date.now();

  for (const u of memMiss) {
    const rec = store[u];
    if (rec && rec.expiresAt > now) {
      known[u] = { verdict: rec.verdict, reason: rec.reason };
      // aquece o cache em memória
      saveToCache(u, rec.verdict, CACHE_TTL_MS, rec.reason);
    } else {
      unknown.push(u);
    }
  }
  return { known, unknown };
}

// já existia em memória; mantemos
function saveToCache(url: string, verdict: Verdict, ttl = CACHE_TTL_MS, reason?: string) {
  memoryCache.set(url, { verdict, expiresAt: Date.now() + ttl, reason });
}

// Lê veredito do cache (ou undefined se expirado/ausente)
function loadFromCache(url: string): { verdict: Verdict; reason?: string } | undefined {
  const hit = memoryCache.get(url);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    memoryCache.delete(url);
    return undefined;
  }
  return { verdict: hit.verdict, reason: hit.reason };
}

// Verifica se uma URL está na whitelist (verifica domínio e subdomínios)
function isWhitelisted(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Verifica domínio exato
    if (WHITELIST_SET.has(hostname)) {
      return true;
    }
    
    // Verifica domínios pais (subdomínios)
    // Ex: mail.google.com -> verifica google.com
    const parts = hostname.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentDomain = parts.slice(i).join('.');
      if (WHITELIST_SET.has(parentDomain)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return false;
  }
}

// Chama a API em LOTE com todas as URLs
async function requestApiBatch(urls: string[]): Promise<Record<string, VerdictWithReason>> {
  // Primeiro, separa URLs whitelisted das não-whitelisted
  const whitelisted: Record<string, VerdictWithReason> = {};
  const toCheck: string[] = [];
  
  for (const url of urls) {
    if (isWhitelisted(url)) {
      // URLs whitelisted retornam 'safe' imediatamente
      whitelisted[url] = { verdict: 'safe' };
    } else {
      toCheck.push(url);
    }
  }
  
  // Se todas estão na whitelist, encerra o processo
  if (toCheck.length === 0) return whitelisted;
  
  // Para URLs fora da whitelist, seguem o fluxo normalmente
  const { known, unknown } = await splitKnownUnknown(toCheck);

  // Se não há desconhecidas
  if (unknown.length === 0) return { ...whitelisted, ...known };

  try {
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo_geral: 'url',
        lista_itens: unknown
      })
    });

    const data = await res.json().catch(() => []);
    // A API retorna um array na mesma ordem das URLs enviadas
    const apiResults = Array.isArray(data) ? data : [];

    // Normaliza retorno e aplica TTLs
    const storeBatch: Record<string, StoredVerdict> = {};
    for (let i = 0; i < unknown.length; i++) {
      const u = unknown[i];
      if (!u) continue; // Pula se URL não existir (não deveria acontecer)
      
      const apiItem = apiResults[i];
      
      // Converte suspicious: true -> 'suspect', suspicious: false -> 'safe'
      const verdict: Verdict = (apiItem?.suspicious === true) ? 'suspect' : 'safe';
      const reason = apiItem?.reason;

      // memória (10min) + storage (72h - 3 dias)
      saveToCache(u, verdict, CACHE_TTL_MS, reason);
      storeBatch[u] = { verdict, expiresAt: Date.now() + STORAGE_TTL_MS, reason };
    }
    await saveToStore(storeBatch);

    // Merge whitelisted + known + api
    const merged: Record<string, VerdictWithReason> = { ...whitelisted, ...known };
    for (const u of unknown) {
      const rec = storeBatch[u];
      if (rec) merged[u] = { verdict: rec.verdict, reason: rec.reason };
    }
    return merged;

  } catch (e) {
    console.warn('[AntiPhishing] batch API failed:', e);

    // Fallback: mantém whitelisted + known; para unknown assume "safe"
    const out: Record<string, VerdictWithReason> = { ...whitelisted, ...known };
    for (const u of unknown) {
      const verdict: Verdict = 'safe';
      saveToCache(u, verdict, CACHE_TTL_MS);
      // opcional: NÃO salvar no storage num erro de rede (para forçar retry no futuro)
      out[u] = { verdict };
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

// Remove todas as regras DNR aplicadas pela extensão
async function clearAllBlockRules() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    // Filtra apenas as regras da extensão (IDs entre 210000 e 229999)
    const ourRuleIds = existingRules
      .filter(rule => rule.id >= 210000 && rule.id < 230000)
      .map(rule => rule.id);
    
    if (ourRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ourRuleIds
      });
      console.log('[AntiPhishing] Removidas', ourRuleIds.length, 'regras DNR');
    }
  } catch (e) {
    console.warn('[AntiPhishing] Erro ao limpar regras DNR:', e);
  }
}

// Inicialização: verifica se o global está desabilitado e limpa regras DNR se necessário
(async () => {
  const globalEnabled = await getGlobalEnabled();
  if (!globalEnabled) {
    await clearAllBlockRules();
  }
})();

async function applyBlockRulesFor(urlsToBlock: string[]) {
  const rules: chrome.declarativeNetRequest.Rule[] = [];

  for (const raw of urlsToBlock) {
    try {
      const u = new URL(raw);
      const pattern = `${u.protocol}//${u.host}/*`;
      const id = ruleIdFromHost(u.host);
      const RT = chrome.declarativeNetRequest.ResourceType;
      const RA = chrome.declarativeNetRequest.RuleActionType;

      rules.push({
        id,
        priority: 1,
        action: { type: RA.BLOCK },
        condition: {
          urlFilter: pattern,
          resourceTypes: [RT.MAIN_FRAME, RT.SUB_FRAME, RT.XMLHTTPREQUEST, RT.SCRIPT, RT.IMAGE],
        },
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

      // Verifica se o scanning está habilitado (global ou local)
      const origin = _sender.tab?.url ? new URL(_sender.tab.url).origin : '';
      const scanningEnabled = await getEnabled(origin, _sender.tab?.id);
      
      if (!scanningEnabled) {
        // Scanning desabilitado - retorna tudo como safe e não bloqueia
        const safeMap: Record<string, VerdictWithReason> = {};
        for (const url of pageUrls) {
          safeMap[url] = { verdict: 'safe' };
        }
        sendResponse({ ok: true, blockedCount: 0, verdictMap: safeMap });
        return;
      }

      // Uma chamada em lote
      const verdictMap = await requestApiBatch(pageUrls);

      // Selecione as URLs a bloquear (qualquer coisa que não seja "safe")
      const toBlock = Object.entries(verdictMap)
        .filter(([_, v]) => v.verdict !== 'safe')
        .map(([u]) => u);

      if (toBlock.length) await applyBlockRulesFor(toBlock);

      // Retorna o verdictMap para o content script atualizar seu cache local
      sendResponse({ ok: true, blockedCount: toBlock.length, verdictMap });
      return;
    }

    if (message.type === 'IS_URL_BLOCKED') {
      const singleUrl: string = message.url;
      
      // Verifica se o scanning está habilitado (global ou local)
      const origin = _sender.tab?.url ? new URL(_sender.tab.url).origin : '';
      const scanningEnabled = await getEnabled(origin, _sender.tab?.id);
      
      if (!scanningEnabled) {
        // Scanning desabilitado - retorna como não bloqueado e não faz requisições
        sendResponse({ ok: true, blocked: [], reason: undefined });
        return;
      }
      
      // Verifica whitelist primeiro
      if (isWhitelisted(singleUrl)) {
        sendResponse({ ok: true, blocked: [], reason: undefined });
        return;
      }
      
      // Verifica cache em memória
      let verdictInfo = loadFromCache(singleUrl);
      
      if (!verdictInfo) {
        // Verifica storage persistente
        const store = await loadStore();
        const now = Date.now();
        const rec = store[singleUrl];
        if (rec && rec.expiresAt > now) {
          verdictInfo = { verdict: rec.verdict, reason: rec.reason };
          saveToCache(singleUrl, rec.verdict, CACHE_TTL_MS, rec.reason);
        } else {
          // Se não está em lugar nenhum, faz nova verificação
          const map = await requestApiBatch([singleUrl]);
          const result = map[singleUrl];
          verdictInfo = result ? { verdict: result.verdict, reason: result.reason } : { verdict: 'safe' };
        }
      }
      
      const blocked = (verdictInfo.verdict !== 'safe') ? [singleUrl] : [];
      sendResponse({ ok: true, blocked, reason: verdictInfo.reason });
      return;
    }
  })().catch(err => {
    console.error('[AntiPhishing v2] background error:', err);
    sendResponse({ ok: false, error: String(err) });
  });

  return true;
});
