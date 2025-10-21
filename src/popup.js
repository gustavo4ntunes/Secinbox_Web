// --- util ---
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
function byId(id) { return document.getElementById(id); }

// --- elementos UI ---
const swGlobal = byId('switch-global');
const swPage   = byId('switch-page');
const txtGlobal = byId('status-global');
const txtPage   = byId('status');

// --- estado atual ---
let currentTabId = null;
let currentOrigin = null;

// Lê estado do background
async function readStates() {
  const globalResp = await chrome.runtime.sendMessage({ type: 'GET_GLOBAL_STATE' });
  const globalEnabled = !!globalResp?.enabled;

  let pageEnabled = false;
  if (currentOrigin) {
    const pageResp = await chrome.runtime.sendMessage({
      type: 'IS_SCANNING_ENABLED',
      origin: currentOrigin,
      tabId: currentTabId
    });
    pageEnabled = !!pageResp?.enabled;
  }

  return { globalEnabled, pageEnabled };
}

function applyUI({ globalEnabled, pageEnabled }) {
  // Global
  swGlobal.checked = !!globalEnabled;
  txtGlobal.textContent = globalEnabled ? 'Verificação global ATIVADA' : 'Verificação global DESATIVADA';

  // Página
  const pageSwitchShouldBeEnabled = !!globalEnabled;
  swPage.disabled = !pageSwitchShouldBeEnabled;
  swPage.checked = pageSwitchShouldBeEnabled ? !!pageEnabled : false;
  txtPage.textContent = pageSwitchShouldBeEnabled
    ? (pageEnabled ? 'Verificação ATIVADA nesta página' : 'Verificação DESATIVADA nesta página')
    : 'Global OFF: verificação desabilitada em todos os sites';
}

async function refreshUI() {
  try {
    const states = await readStates();
    applyUI(states);
  } catch (e) {
    console.warn('[popup] refreshUI error:', e);
  }
}

// --- eventos dos switches ---
swGlobal.addEventListener('change', async () => {
  // alterna estado global
  const resp = await chrome.runtime.sendMessage({ type: 'TOGGLE_GLOBAL' });
  // após alternar global, ressincroniza tudo
  await refreshUI();
});

swPage.addEventListener('change', async () => {
  if (!currentOrigin) return;
  // alterna estado desta origem/aba
  const resp = await chrome.runtime.sendMessage({
    type: 'TOGGLE_SCANNING',
    origin: currentOrigin,
    tabId: currentTabId
  });
  await refreshUI();
});

// --- boot ---
(async function init() {
  try {
    const tab = await getActiveTab();
    currentTabId = tab?.id ?? null;
    try { currentOrigin = tab?.url ? new URL(tab.url).origin : null; } catch { currentOrigin = null; }

    txtGlobal.textContent = 'Carregando estado global…';
    txtPage.textContent = 'Carregando estado desta página…';

    await refreshUI();
  } catch (e) {
    console.error('[popup] init failed:', e);
  }
})();

// =========================
//  Código do modal
// =========================
const btnOpen = document.getElementById("btn-open-disabled");
const modal = document.getElementById("disabled-modal");
const modalOverlay = document.getElementById("disabled-modal-overlay");
const modalClose = document.getElementById("disabled-modal-close");
const modalList = document.getElementById("disabled-list");
const modalRefresh = document.getElementById("disabled-modal-refresh");
const modalClear = document.getElementById("disabled-modal-clear");

async function fetchDisabledSites() {
  const resp = await chrome.runtime.sendMessage({ type: "GET_DISABLED_SITES" });
  return resp?.sites ?? [];
}
function renderDisabledList(sites) {
  modalList.innerHTML = "";
  if (!sites.length) {
    modalList.innerHTML = '<div class="text-slate-400">Nenhum site desativado individualmente.</div>';
    return;
  }
  for (const origin of sites) {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3 p-2 rounded hover:bg-slate-700/50";

    const left = document.createElement("div");
    left.className = "flex items-center gap-3";
    const fav = document.createElement("div");
    fav.className = "w-6 h-6 rounded bg-slate-700 flex items-center justify-center text-xs";
    fav.textContent = origin[0]?.toUpperCase() ?? "•";
    const title = document.createElement("div");
    title.className = "text-sm";
    title.textContent = origin;
    left.appendChild(fav);
    left.appendChild(title);

    const right = document.createElement("div");
    right.className = "flex items-center gap-2";
    const btnEnable = document.createElement("button");
    btnEnable.className = "px-2 py-1 text-xs rounded bg-lime-600 hover:bg-lime-500 text-white font-medium";
    btnEnable.textContent = "Reativar";
    btnEnable.addEventListener("click", async () => {
      btnEnable.disabled = true;
      await chrome.runtime.sendMessage({ type: "SET_SITE_ENABLED", origin, enabled: true });
      await loadAndRender();
      await refreshUI();
    });
    right.appendChild(btnEnable);

    row.appendChild(left);
    row.appendChild(right);
    modalList.appendChild(row);
  }
}
async function loadAndRender() {
  modalList.innerHTML = '<div class="text-slate-400">Carregando…</div>';
  const sites = await fetchDisabledSites();
  renderDisabledList(sites);
}

btnOpen.addEventListener("click", async () => {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  await loadAndRender();
});
modalClose.addEventListener("click", () => {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
});
modalOverlay.addEventListener("click", () => {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
});
modalRefresh.addEventListener("click", loadAndRender);
modalClear.addEventListener("click", async () => {
  const sites = await fetchDisabledSites();
  for (const origin of sites) {
    await chrome.runtime.sendMessage({ type: "SET_SITE_ENABLED", origin, enabled: true });
  }
  await loadAndRender();
  await refreshUI();
});
