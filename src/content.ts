// Content script
// Lê a página, encontra todos os links e envia em LOTE para o background.
console.log("content script on");


export { }
type BgReply<T = any> = T & { ok?: boolean; error?: string };

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
  //console.log(urlSet)
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
  const allUrls = collectAllUrlsFromPage();
  const pageUrl = location.href;
  console.log(allUrls)
  try {
    const reply = await chrome.runtime.sendMessage({
      type: 'PAGE_URLS_BATCH',
      pageUrl,
      urls: allUrls
    }) as BgReply;

    if (reply?.error) {
      console.warn('[AntiPhishing] batch send error:', reply.error);
    } else if (reply?.ok) {
      //console.log('batch ok', reply);
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
