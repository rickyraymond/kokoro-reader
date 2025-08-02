/*  background.js  – service-worker for Kokoro TTS extension  */

/**
 * 1.  On install: create a context-menu entry so users can
 *     right–click selected text and “Read with Kokoro”.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "kokoro-read-selection",
    title: "Read selection with Kokoro",
    contexts: ["selection"]
  });
});

/**
 * Helper that grabs the user’s current text selection on the page.
 * Falls back to the page title if nothing is selected.
 */
async function getSelectedOrPageText(tabId, selectionText) {
  if (selectionText && selectionText.trim()) return selectionText.trim();

  // No selection text was passed in (e.g., action-button click) → ask the page.
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.getSelection().toString().trim()
  });
  return result || document.title || "No text found";
}

/**
 * Opens the small player window and hands the chosen text to it
 * via chrome.storage.local (key: "currentText").
 */
async function openPlayerWithText(text, tabId) {
  await chrome.storage.local.set({ currentText: text, sourceTabId: tabId });

  // Small popup window (feel free to tweak dimensions)
  await chrome.windows.create({
    url: chrome.runtime.getURL("player.html"),
    type: "popup",
    width: 420,
    height: 260
  });
}

/* ─────────────────────────────
   Action-button click (toolbar)
   ───────────────────────────── */
chrome.action.onClicked.addListener(async (tab) => {
  const text = await getSelectedOrPageText(tab.id);
  await openPlayerWithText(text, tab.id);
});

/* ─────────────────────────────
   Context-menu click
   ───────────────────────────── */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "kokoro-read-selection") return;

  const text = await getSelectedOrPageText(tab.id, info.selectionText);
  await openPlayerWithText(text, tab.id);
});

/* ─────────────────────────────
   Broadcast “pauseAll” to every
   open player except the sender.
   (player.js listens for this.)
   ───────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action !== "pauseOthers") return;

  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id !== sender.tab?.id) {
        chrome.tabs.sendMessage(t.id, { action: "pauseAll" });
      }
    }
  });
});
