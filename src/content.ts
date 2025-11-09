
// === Toggle de verificação no content script ===
let __AP_scanningEnabled = true;

function applyScanningState(enabled: boolean) {
  __AP_scanningEnabled = !!enabled;
  document.documentElement.toggleAttribute('data-ap-scan-disabled', !__AP_scanningEnabled);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "SCANNING_STATE") {
    applyScanningState(msg.enabled);
  }
});

(async () => {
  try {
    const origin = location.origin;
    const resp = await chrome.runtime.sendMessage({ type: "IS_SCANNING_ENABLED", origin });
    applyScanningState(resp?.enabled !== false);
  } catch {
    /* ignore */
  }
})();

// Se existir uma função global de varredura, encapsula para respeitar o toggle
(function wrapScanIfPresent() {
  const anyWin = window as any;
  const fn = anyWin.scanAndSendBatch;
  if (typeof fn === "function" && !fn.__wrappedByToggle) {
    const original = fn.bind(anyWin);
    const wrapped = async function (...args: any[]) {
      if (!__AP_scanningEnabled) return;
      return await original(...args);
    };
    wrapped.__wrappedByToggle = true;
    anyWin.scanAndSendBatch = wrapped;
  }
})();
// === Fim toggle ===

import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export { };
type BgReply<T = any> = T & { ok?: boolean; error?: string };

// Detecta se o navegador está em tema escuro
function isDarkMode(): boolean {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// estilos CSS para tema escuro/claro do SweetAlert2
function injectSwalThemeStyles() {
  const styleId = 'secinbox-swal-theme-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Tema escuro */
    @media (prefers-color-scheme: dark) {
      .swal2-popup {
        background: #2d2d2d !important;
        color: #e0e0e0 !important;
      }
      .swal2-title {
        color: #ffffff !important;
      }
      .swal2-html-container {
        color: #e0e0e0 !important;
      }
      .swal2-icon.swal2-warning {
        border-color: #ffc107 !important;
        color: #ffc107 !important;
      }
      .swal2-icon.swal2-warning .swal2-icon-content {
        color: #ffc107 !important;
      }
    }
    
    /* Tema claro */
    @media (prefers-color-scheme: light) {
      .swal2-popup {
        background: #ffffff !important;
        color: #5f6368 !important;
      }
      .swal2-title {
        color: #1a1a1a !important;
      }
      .swal2-html-container {
        color: #5f6368 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// Inicializa estilos ao carregar
injectSwalThemeStyles();

// Retorna a configuração do SweetAlert2 com tema adaptativo
function getSwalConfig(message: string, title: string = 'SecInbox') {
  const darkMode = isDarkMode();
  
  return {
    title: title,
    text: message,
    icon: 'warning' as const,
    confirmButtonText: 'OK',
    confirmButtonColor: '#0d6efd',
    color: darkMode ? '#e0e0e0' : '#5f6368',
    background: darkMode ? '#2d2d2d' : '#ffffff',
    backdrop: darkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)'
  };
}

const ENABLE_IMAGE_MAPS = false;

const seenUrls = new Set<string>();

// Cache local de URLs bloqueadas (atualizado com retorno do background)
const blockedUrlsCache = new Set<string>();
const safeUrlsCache = new Set<string>();

function normalizeUrl(u: string): string {
  try {
    const x = new URL(u, location.href);
    x.hash = "";
    return x.toString();
  } catch {
    return u;
  }
}

function diffNew(urls: string[]): string[] {
  const fresh: string[] = [];
  for (const raw of urls) {
    const u = normalizeUrl(raw);
    if (!seenUrls.has(u)) {
      seenUrls.add(u);
      fresh.push(u);
    }
  }
  return fresh;
}

function hasUsableHref(a: HTMLAnchorElement): boolean {
  const raw = a.getAttribute("href");
  if (!raw) return false;
  const href = raw.trim();
  if (!href || href === "#" || href.toLowerCase().startsWith("javascript:")) return false;
  return true;
}

function isProbablyVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.getClientRects().length === 0) return false;

  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;

  if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth)
    return false;

  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility !== "visible" || cs.pointerEvents === "none") return false;
  if (cs.opacity === "0") return false;

  return true;
}

// Verifica se é clicável
function isProbablyClickable(a: HTMLAnchorElement): boolean {
  const r = a.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;

  const cx = Math.max(0, Math.min(window.innerWidth - 1, r.left + r.width / 2));
  const cy = Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2));

  if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return false;

  const topEl = document.elementFromPoint(cx, cy);
  if (!topEl) return false;

  const topAnchor = (topEl as Element).closest<HTMLAnchorElement>("a[href]");
  return topAnchor !== null && topAnchor === a;
}

function acceptAnchor(a: HTMLAnchorElement): boolean {
  return hasUsableHref(a) && (isProbablyVisible(a) || isProbablyClickable(a));
}

function collectAnchorUrlsFast(root: ParentNode = document): string[] {
  const urls: string[] = [];
  const anchors = root.querySelectorAll<HTMLAnchorElement>("a[href]");

  anchors.forEach((a) => {
    if (!acceptAnchor(a)) return;
    const href = a.getAttribute("href");
    if (!href) return;
    try {
      urls.push(new URL(href, location.href).href);
    } catch {
      /* href inválido */
    }
  });

  return urls;
}

function collectAreaUrlsFast(root: ParentNode = document): string[] {
  if (!ENABLE_IMAGE_MAPS) return [];
  const urls: string[] = [];
  const areas = root.querySelectorAll<HTMLAreaElement>("area[href]");

  areas.forEach((area) => {
    const raw = area.getAttribute("href");
    if (!raw) return;
    try {
      urls.push(new URL(raw, location.href).href);
    } catch {
      /* ignore */
    }
  });

  return urls;
}

function collectAllUrlsFast(root: ParentNode = document): string[] {
  const aLinks = collectAnchorUrlsFast(root);
  if (!ENABLE_IMAGE_MAPS) return aLinks;

  const areaLinks = collectAreaUrlsFast(root);
  if (areaLinks.length === 0) return aLinks;

  const set = new Set<string>(aLinks);
  areaLinks.forEach((url) => set.add(url));
  return Array.from(set);
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let timerId: number | undefined;
  return (...args: Parameters<T>) => {
    if (timerId !== undefined) clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), ms);
  };
}

async function scanAndSendBatch() {
  const allUrls = collectAllUrlsFast();
  const fresh = diffNew(allUrls);
  if (fresh.length === 0) return;

  const pageUrl = location.href;

  try {
    const reply = (await chrome.runtime.sendMessage({
      type: "PAGE_URLS_BATCH",
      pageUrl,
      urls: fresh,
    })) as BgReply<{ verdictMap?: Record<string, string> }>;

    if (reply?.error) {
      console.warn("[AntiPhishing] batch send error:", reply.error);
    }
    
    // Atualiza cache local com os vereditos recebidos
    if (reply?.verdictMap) {
      for (const [url, verdict] of Object.entries(reply.verdictMap)) {
        if (verdict === 'safe') {
          safeUrlsCache.add(url);
          blockedUrlsCache.delete(url);
        } else {
          blockedUrlsCache.add(url);
          safeUrlsCache.delete(url);
        }
      }
    }
  } catch (err) {
    console.warn("[AntiPhishing] sendMessage failed:", err);
  }
}

scanAndSendBatch();

// Observa mudanças no DOM (SPAs etc.)
if (__AP_scanningEnabled) {
  const domObserver = new MutationObserver(
    debounce(() => {
      if (__AP_scanningEnabled) scanAndSendBatch();
    }, 500)
  );
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "src", "style"],
  });
}

// Função para verificar se URL está bloqueada (síncrona primeiro, assíncrona se necessário)
function isUrlBlockedSync(url: string): boolean | null {
  // Verifica cache local primeiro (síncrono)
  if (blockedUrlsCache.has(url)) return true;
  if (safeUrlsCache.has(url)) return false;
  return null; // Não está no cache, precisa verificar assincronamente
}

// Bloqueia link bloqueado ANTES do clique (mousedown acontece antes de click)
document.addEventListener(
  "mousedown",
  async (event) => {
    // Só processa botão esquerdo
    if (event.button !== 0) return;

    const path = event.composedPath();
    let anchorEl: HTMLAnchorElement | null = null;

    for (const t of path) {
      if (t instanceof Element) {
        const a = t.closest<HTMLAnchorElement>("a[href]");
        if (a) {
          anchorEl = a;
          break;
        }
      }
    }

    if (!anchorEl) return;

    const hrefStr = anchorEl.href;
    if (!hrefStr) return;

    // Verifica cache local primeiro (síncrono)
    const cachedResult = isUrlBlockedSync(hrefStr);
    if (cachedResult === true) {
      // Bloqueado no cache - bloqueia imediatamente
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      console.log('[AntiPhishing] Link bloqueado (cache):', hrefStr);
      Swal.fire(getSwalConfig('Link bloqueado por suspeita de phishing.', 'SecInbox'));
      return false;
    }
    
    if (cachedResult === false) {
      // Está no cache como seguro então permite
      return;
    }

    // Não está no cache - verifica assincronamente
    // Mas bloqueia até ter a resposta
    event.preventDefault();
    event.stopPropagation();
    
    console.log('[AntiPhishing] Verificando link (não está no cache):', hrefStr);
    
    const response = (await chrome.runtime.sendMessage({
      type: "IS_URL_BLOCKED",
      url: hrefStr,
    })) as BgReply<{ blocked?: string[] }>;

    const blockedList = response?.blocked ?? [];
    const isBlocked = blockedList.includes(hrefStr) || blockedList.some((prefix) => hrefStr.startsWith(prefix));

    // Atualiza cache local
    if (isBlocked) {
      blockedUrlsCache.add(hrefStr);
      safeUrlsCache.delete(hrefStr);
      console.log('[AntiPhishing] Link bloqueado:', hrefStr);
      Swal.fire(getSwalConfig('Link bloqueado por suspeita de phishing.', 'SecInbox'));
    } else {
      safeUrlsCache.add(hrefStr);
      blockedUrlsCache.delete(hrefStr);

      anchorEl.click();
    }
  },
  true // captura - executa antes de outros handlers
);

addEventListener(
  "click",
  () => { },
  true
);
