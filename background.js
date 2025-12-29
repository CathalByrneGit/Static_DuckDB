// Create the context menu item when the extension is installed
browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: "send-to-duckdb",
    title: "Analyze '%s' in PXStat Workbench",
    contexts: ["selection"]
  });
});

// Listen for the click on the context menu
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-duckdb") {
    const selectedCode = info.selectionText.trim().toUpperCase();

    // 1. Store the code temporarily so the sidebar can grab it
    browser.storage.local.set({ pendingTableCode: selectedCode });

    // 2. Open the sidebar
    browser.sidebarAction.open();
    
    // 3. Optional: Notify the sidebar if it's already open
    browser.runtime.sendMessage({ 
      type: "LOAD_FROM_CONTEXT", 
      code: selectedCode 
    }).catch(() => { /* Sidebar might be closed, that's fine */ });
  }
});