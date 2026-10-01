// Background Service Worker that keeps the Aljex search flow out of the page UI and
// handles the tab/login state without freezing the extension.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'POST_EMAIL_TO_BACKEND') {
    const payload = request.payload || {};
    const urls = ['http://127.0.0.1:8000/process-email', 'http://localhost:8000/process-email'];

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      sendResponse(result);
    };

    (async () => {
      let lastError = null;

      for (const url of urls) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timer);

          if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
          }

          finish(await response.json());
          return;
        } catch (error) {
          lastError = error;
        }
      }

      finish({
        status: 'BACKEND_OFFLINE',
        message: 'Backend Offline / Extension Stale',
        error: String(lastError || 'Backend unavailable')
      });
    })();

    return true;
  }

  if (request.action !== 'QUERY_ALJEX_VIA_BG') {
    return false;
  }

  const cleanMc = String(request.mc || '').replace(/\D/g, '');
  const waitingPayload = {
    status: 'CARRIER_PAGE_WAITING',
    ytd: 0,
    message: 'Awaiting carrier page: Aljex search is still loading and has not returned a result yet.'
  };

  let hasResponded = false;
  let timeoutId = null;

  const finish = (payload) => {
    if (hasResponded) return;
    hasResponded = true;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    sendResponse(payload);
  };

  chrome.tabs.query({ url: '*://rtcy.aljex.com/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      chrome.tabs.create({ url: 'https://rtcy.aljex.com/', active: false }, () => {
        finish({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: no Aljex tab was open yet.' });
      });
      return;
    }

    const activeTab = tabs.find((tab) => tab.active) || tabs[0];
    const activeTabId = activeTab && activeTab.id;
    if (typeof activeTabId !== 'number') {
      finish({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: no valid Aljex tab was available.' });
      return;
    }

    chrome.webNavigation.getAllFrames({ tabId: activeTabId }, (frames) => {
      if (!frames || frames.length === 0) {
        finish({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex is still loading.' });
        return;
      }

      let pendingFrames = frames.length;

      frames.forEach((frame) => {
        chrome.tabs.sendMessage(
          activeTabId,
          { action: 'QUERY_ALJEX_TAB', mc: cleanMc },
          { frameId: frame.frameId },
          (res) => {
            if (chrome.runtime.lastError) {
              if (pendingFrames > 0) {
                pendingFrames -= 1;
              }
              if (!hasResponded && pendingFrames === 0) {
                finish({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex is not ready for MC search yet.' });
              }
              return;
            }

            pendingFrames -= 1;

            if (!hasResponded && res) {
              finish(res);
              return;
            }

            if (!hasResponded && pendingFrames === 0) {
              finish({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex is not ready for MC search yet.' });
            }
          }
        );
      });
    });

    timeoutId = setTimeout(() => {
      if (!hasResponded) {
        finish(waitingPayload);
      }
    }, 15000);
  });

  return true;
});