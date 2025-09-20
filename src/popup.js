async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshUI() {
  const tab = await getActiveTab();
  const { enabled } = await chrome.runtime.sendMessage({ type: "GET_SCANNING_STATE", tabId: tab.id, origin: new URL(tab.url || "", "https://x/").origin });
  const toggle = document.getElementById("toggle");
  const status = document.getElementById("status");
  if (!toggle || !status) return;
  toggle.dataset.enabled = String(enabled);
  toggle.textContent = enabled ? "Desativar nesta página" : "Reativar nesta página";
  status.textContent = enabled ? "A verificação está ATIVA." : "A verificação está DESATIVADA.";
}

document.getElementById("toggle")?.addEventListener("click", async () => {
  const tab = await getActiveTab();
  const origin = new URL(tab.url || "", "https://x/").origin;
  const { enabled } = await chrome.runtime.sendMessage({ type: "TOGGLE_SCANNING", tabId: tab.id, origin });
  await refreshUI();
  // Notifica content script do tab atual
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "SCANNING_STATE", enabled });
  }
});

refreshUI();
