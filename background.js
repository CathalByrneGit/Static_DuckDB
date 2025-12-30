browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: "send-to-duckdb",
    title: "Analyze '%s' in PXStat Workbench",
    contexts: ["selection"]
  });
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-duckdb") {
    const selectedCode = info.selectionText.trim().toUpperCase();
    browser.storage.local.set({ pendingTableCode: selectedCode });
    browser.sidebarAction.open();
    browser.runtime.sendMessage({ 
      type: "LOAD_FROM_CONTEXT", 
      code: selectedCode 
    }).catch(() => {});
  }
});

// Open full tab when toolbar button is clicked
browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL("dist/pages/index.html")
  });
});