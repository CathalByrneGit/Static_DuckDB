// Create the context menu item
browser.runtime.onInstalled.addListener(() => {
  browser.menus.create({
    id: "send-to-duckdb",
    title: "Analyze '%s' in PXStat Workbench",
    contexts: ["selection"]
  });
});

// Handle context menu clicks - open in new tab
browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-duckdb") {
    const selectedCode = info.selectionText.trim().toUpperCase();
    
    // Store the code
    browser.storage.local.set({ pendingTableCode: selectedCode });
    
    // Open in new tab
    browser.tabs.create({
      url: browser.runtime.getURL("dist/pages/index.html")
    });
  }
});

// Handle toolbar button clicks
browser.action.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL("dist/pages/index.html")
  });
});

// Handle keyboard shortcut
browser.commands.onCommand.addListener((command) => {
  if (command === "open-workbench") {
    browser.tabs.create({
      url: browser.runtime.getURL("dist/pages/index.html")
    });
  }
});