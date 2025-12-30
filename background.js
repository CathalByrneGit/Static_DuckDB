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

// Handle API proxy requests from content scripts (bypasses CORS)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "API_REQUEST") {
    handleApiRequest(message.payload)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Make API requests from background script (no CORS restrictions)
async function handleApiRequest(payload) {
  const { endpoint, headers, body } = payload;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  
  return await response.json();
}