
// === Toggle de verificação no content script ===
let __AP_scanningEnabled = true;

function applyScanningState(enabled: boolean) {
  __AP_scanningEnabled = !!enabled;
  document.documentElement.toggleAttribute('data-ap-scan-disabled', !__AP_scanningEnabled);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SCANNING_STATE') {
    applyScanningState(msg.enabled);
  }
});

(async () => {
  try {
    const origin = location.origin;
    const resp = await chrome.runtime.sendMessage({ type: 'IS_SCANNING_ENABLED', origin });
    applyScanningState(resp?.enabled !== false);
  } catch (e) { /* ignore */ }
})();

// Se existir uma função global de varredura, encapsula para respeitar o toggle
(function wrapScanIfPresent() {
  const anyWin = window as any;
  const fn = anyWin.scanAndSendBatch;
  if (typeof fn === 'function' && !fn.__wrappedByToggle) {
    const original = fn.bind(anyWin);
    const wrapped = async function (...args: any[]) {
      if (!__AP_scanningEnabled) return; // não envia nada quando desativado
      return await original(...args);
    };
    wrapped.__wrappedByToggle = true;
    anyWin.scanAndSendBatch = wrapped;
  }
})();
// === Fim toggle ===

// Content script
// Lê a página, encontra todos os links e envia em LOTE para o background.
export { }
type BgReply<T = any> = T & { ok?: boolean; error?: string };


const seenUrls = new Set<string>();

function normalizeUrl(u: string): string {
  try {
    const x = new URL(u, location.href);
    x.hash = '';               // ignora fragmento para evitar duplicatas
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

// Coleta todas as URLs possíveis da página
function collectAllUrlsFromPage(root: ParentNode = document): string[] {
  const urlSet = new Set<string>();

  // <a> e <area> com href
  root.querySelectorAll<HTMLAnchorElement>('a[href], area[href]').forEach(linkEl => {
    if (linkEl.href) urlSet.add(linkEl.href);
  });

  // Qualquer elemento com src/href
  root.querySelectorAll<HTMLElement>('[src], [href]').forEach(el => {
    const raw = (el as any).src || (el as any).href;
    if (raw) urlSet.add(raw.toString());
  });

  // CSS url() em estilos computados
  root.querySelectorAll<HTMLElement>('*').forEach(el => {
    const style = getComputedStyle(el);
    const props = ['backgroundImage', 'listStyleImage', 'content'] as const;
    for (const prop of props) {
      const value = (style as any)[prop] as string | undefined;
      if (!value) continue;
      const matches = value.match(/url\(["']?([^"')]+)["']?\)/g);
      if (matches) {
        for (const group of matches) {
          const pick = group.match(/url\(["']?([^"')]+)["']?\)/);
          const found = pick?.[1];
          if (found) {
            try {
              const abs = new URL(found, location.href).toString();
              urlSet.add(abs);
            } catch { }
          }
        }
      }
    }
  });

  // Meta refresh
  document.querySelectorAll<HTMLMetaElement>('meta[http-equiv="refresh"]').forEach(metaEl => {
    const content = metaEl.content || "";
    const parts = content.split('=');
    const maybeUrl = parts[1]?.trim();
    if (maybeUrl) {
      try {
        urlSet.add(new URL(maybeUrl, location.href).toString());
      } catch { }
    }
  });
  return [...urlSet];
}

// Debounce simples para evitar chamadas repetidas
function debounce<T extends (...args: any) => void>(fn: T, ms: number) {
  let timerId: number | undefined;
  return (...args: any[]) => {
    if (timerId) clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), ms);
  };
}

// Envia todas as URLs encontradas em uma requisição
async function scanAndSendBatch() {
  const allUrls = collectAllUrlsFromPage().map(normalizeUrl);
  const fresh = diffNew(allUrls);   // só as novas
  if (fresh.length === 0) return;   // nada novo? não envia

  const pageUrl = location.href;

  try {
    const reply = await chrome.runtime.sendMessage({
      type: 'PAGE_URLS_BATCH',
      pageUrl,
      urls: fresh
    }) as BgReply;

    if (reply?.error) {
      console.warn('[AntiPhishing] batch send error:', reply.error);
    }
  } catch (err) {
    console.warn('[AntiPhishing] sendMessage failed:', err);
  }
}

// Execução inicial
scanAndSendBatch();

// Observa mudanças no DOM (SPAs etc.)
const domObserver = new MutationObserver(debounce(() => scanAndSendBatch(), 500));
domObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['href', 'src', 'style'] // reduz ruído
});

// Impede clique em link bloqueado (consulta ao background)
document.addEventListener('click', async (event) => {
  const path = event.composedPath() as HTMLElement[];
  const anchorEl = path.find(el => el instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
  if (!anchorEl || !anchorEl.href) return;

  const response = await chrome.runtime.sendMessage({ type: 'IS_URL_BLOCKED', url: anchorEl.href }) as BgReply<{ blocked?: string[] }>;
  const blockedList = response?.blocked ?? [];
  const isBlocked = blockedList.includes(anchorEl.href) || blockedList.some(prefix => anchorEl.href.startsWith(prefix));

  if (isBlocked) {
    event.preventDefault();
    event.stopPropagation();
    alert('Link bloqueado por suspeita de phishing.');
  }
}, true);


// Garante que qualquer bloqueio de clique respeite o toggle
addEventListener('click', (ev) => {
  if (!__AP_scanningEnabled) {
    // Impede que outros listeners do nosso script bloqueiem o clique
    // (não chamamos preventDefault; apenas deixamos passar)
  }
}, true);
