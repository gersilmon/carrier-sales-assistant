if (!document.getElementById('carrier-assistant-widget')) {
  const widget = document.createElement('div');
  widget.id = 'carrier-assistant-widget';
  widget.innerHTML = `
    <div style="position: fixed; bottom: 20px; right: 20px; width: 350px; background: #ffffff; border: 2px solid #1e3a8a; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999999; font-family: sans-serif; padding: 12px;">
      <h3 style="margin: 0 0 6px 0; font-size: 14px; color: #1e3a8a; display: flex; justify-content: space-between; align-items: center;">
        🚚 Carrier Sales Assistant
        <span id="shift-mode" style="font-size: 10px; background: #16a34a; color: white; padding: 2px 6px; border-radius: 4px;">1st Half Shift</span>
      </h3>

      <textarea id="email-text-input" placeholder="Paste email text here (or highlight text on screen & click scan)..." style="width: 100%; height: 55px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; margin-bottom: 6px; box-sizing: border-box; resize: vertical;"></textarea>
      
      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <button id="btn-scan-email" style="flex: 1; background: #2563eb; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">⚡ 1-Click Auto-Scan & Check Aljex</button>
        <button id="btn-clear-text" style="background: #e2e8f0; color: #334155; border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">Clear</button>
      </div>
      
      <div id="assistant-output" style="font-size: 12px; color: #334155; white-space: pre-wrap; background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; border-radius: 4px; max-height: 180px; overflow-y: auto;">Paste text above or highlight email text and click Scan.</div>

      <div id="dynamic-action-container" style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;"></div>
    </div>
  `;

  document.body.appendChild(widget);

  let responseData = {};

  function queryAljexTabDirect(cleanMc) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex did not respond in time.' }), 12000);

      chrome.tabs.query({ url: '*://rtcy.aljex.com/*' }, (tabs) => {
        const activeTab = (tabs || []).find((tab) => tab.active) || (tabs || [])[0];
        if (!activeTab || typeof activeTab.id !== 'number') {
          clearTimeout(timer);
          resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: no Aljex tab was open.' });
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { action: 'QUERY_ALJEX_TAB', mc: cleanMc }, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex did not respond in time.' });
            return;
          }
          if (!response) {
            resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex did not respond in time.' });
            return;
          }
          resolve(response);
        });
      });
    });
  }

  function queryAljexBackground(cleanMc) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'QUERY_ALJEX_VIA_BG', mc: cleanMc }, (response) => {
        if (chrome.runtime.lastError || !response) {
          queryAljexTabDirect(cleanMc).then(resolve);
          return;
        }

        if (response.status === 'CARRIER_PAGE_WAITING' || response.status === 'LOGIN_PENDING' || response.status === 'PAGE_NOT_READY' || response.status === 'PAGE_BLOCKED') {
          queryAljexTabDirect(cleanMc).then((directRes) => {
            resolve(directRes && directRes.status ? directRes : response);
          });
          return;
        }

        resolve(response);
      });
    });
  }

  async function queryOpenAljexTab(cleanMc) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex did not respond in time.' }), 1500);

      chrome.tabs.query({ url: '*://rtcy.aljex.com/*' }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          clearTimeout(timer);
          resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: no Aljex tab was open.' });
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, { action: 'QUERY_ALJEX_TAB', mc: cleanMc }, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex did not respond in time.' });
            return;
          }
          if (!response) {
            resolve({ status: 'CARRIER_PAGE_WAITING', ytd: 0, message: 'Awaiting carrier page: Aljex did not respond in time.' });
            return;
          }
          resolve(response);
        });
      });
    });
  }

  function getAljexTabForKind(kind) {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: '*://rtcy.aljex.com/*' }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          resolve(null);
          return;
        }

        const checks = tabs.map((tab) => new Promise((done) => {
          chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_KIND' }, (response) => {
            if (chrome.runtime.lastError) {
              done({ tabId: tab.id, kind: 'UNKNOWN' });
              return;
            }
            if (!response) {
              done({ tabId: tab.id, kind: 'UNKNOWN' });
              return;
            }

            done({ tabId: tab.id, kind: response.page_kind || 'UNKNOWN' });
          });
        }));

        Promise.all(checks).then((results) => {
          const preferred = results.find((entry) => entry.kind === kind)
            || results.find((entry) => entry.kind !== 'UNKNOWN')
            || { tabId: (tabs.find((tab) => tab.active) || tabs[0]).id };

          resolve(preferred ? { id: preferred.tabId } : null);
        });
      });
    });
  }

  function queryAljexOpenLoads() {
    return new Promise((resolve) => {
      getAljexTabForKind('OPEN_LOADS').then((tab) => {
        if (!tab || typeof tab.id !== 'number') {
          resolve([]);
          return;
        }

        chrome.tabs.sendMessage(tab.id, { action: 'GET_OPEN_LOADS' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          if (!response) {
            resolve([]);
            return;
          }

          resolve(response.open_loads || []);
        });
      });
    });
  }

  function formatCarrierRowSummary(carrierRow) {
    if (!carrierRow) return '';

    const row = carrierRow;
    const fields = [
      ['Carrier', row.carrier || ''],
      ['DOT', row.dot || ''],
      ['MC', row.mc || ''],
      ['City', row.city || ''],
      ['St', row.state || row.st || ''],
      ['Phone', row.phone || ''],
      ['Contact', row.contact || ''],
      ['Status', row.status || ''],
      ['YTD', row.ytd_loads || row.ytd || '']
    ].filter(([, value]) => value !== '' && value !== null && value !== undefined);

    if (!fields.length) return '';

    const tableRows = fields
      .map(([label, value]) => `<tr><td style="padding: 1px 8px 1px 0; color:#475569; font-weight:bold;">${label}:</td><td style="padding: 1px 0; color:#0f172a;">${value}</td></tr>`)
      .join('');

    return `
      <br><br>
      <div style="border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; padding:6px 8px;">
        <div style="font-weight:bold; color:#1e3a8a; margin-bottom:4px;">Exact Aljex Match</div>
        <table style="border-collapse: collapse; font-size: 11px; line-height: 1.4;">
          ${tableRows}
        </table>
      </div>
    `;
  }

  function getCurrentPageEmailText() {
    const subjectEls = Array.from(document.querySelectorAll('h1, h2, h3, .subject, .title, [role="heading"], [data-testid*="subject"], [class*="subject"], [id*="subject"]'));
    const subjectText = subjectEls
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean)
      .join('\n');

    const bodyText = (document.body ? document.body.innerText : '').trim();
    const selectionText = (window.getSelection ? window.getSelection().toString() : '').trim();

    return [subjectText, bodyText, selectionText].filter(Boolean).join('\n\n').trim();
  }

  function renderCarrierStatusBanner(status, ytd, note = '') {
    const normalized = String(status || 'NO_RECORD').toUpperCase();
    const statusColors = {
      Y: { bg: '#dcfce7', border: '#16a34a', text: '#166534', label: 'Qualified' },
      N: { bg: '#fee2e2', border: '#dc2626', text: '#991b1b', label: 'Not usable' },
      NO_RECORD: { bg: '#dbeafe', border: '#2563eb', text: '#1d4ed8', label: 'No record' },
      CHECKING: { bg: '#fef3c7', border: '#d97706', text: '#92400e', label: 'Checking...' },
      LOGIN_PENDING: { bg: '#fff7ed', border: '#f59e0b', text: '#9a5b00', label: 'Login pending' },
      PAGE_NOT_READY: { bg: '#fef3c7', border: '#d97706', text: '#92400e', label: 'Awaiting carrier page' },
      CARRIER_PAGE_WAITING: { bg: '#fef3c7', border: '#d97706', text: '#92400e', label: 'Awaiting carrier page' },
      READY_FOR_SEARCH: { bg: '#dcfce7', border: '#16a34a', text: '#166534', label: 'Ready to search MC' }
    };
    const color = statusColors[normalized] || statusColors.NO_RECORD;

    const html = `
      <div style="border:1px solid ${color.border}; background:${color.bg}; color:${color.text}; border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:12px; font-weight:bold;">
        Carrier Status: ${color.label}${ytd !== undefined && ytd !== null && ytd !== '' ? ` • YTD: ${ytd}` : ''}${note ? `<br><span style="font-weight:normal;">${note}</span>` : ''}
      </div>
    `;

    return html;
  }

  async function postEmailToBackend(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'POST_EMAIL_TO_BACKEND', payload }, (response) => {
        if (chrome.runtime.lastError || !response) {
          reject(new Error('Backend unavailable'));
          return;
        }

        if (response.status === 'BACKEND_OFFLINE') {
          reject(new Error(response.message || 'Backend unavailable'));
          return;
        }

        resolve(response);
      });
    });
  }

  document.getElementById('btn-scan-email').addEventListener('click', async () => {
    const inputArea = document.getElementById('email-text-input');
    const outputDiv = document.getElementById('assistant-output');
    const actionContainer = document.getElementById('dynamic-action-container');
    const scanRequestId = Date.now() + Math.random();

    const renderOnlyCurrent = (html) => {
      if (window.__carrierAssistantLastScanId !== scanRequestId) {
        return false;
      }
      outputDiv.innerHTML = html;
      return true;
    };

    window.__carrierAssistantLastScanId = scanRequestId;

    let emailText = inputArea.value.trim();
    if (!emailText) {
      emailText = getCurrentPageEmailText();
    }
    if (!emailText) {
      emailText = window.getSelection().toString().trim();
    }

    if (!emailText) {
      if (window.__carrierAssistantLastScanId === scanRequestId) {
        outputDiv.innerHTML = '<b style="color:#d97706;">⚠️ Please paste or highlight the email text first!</b>';
      }
      return;
    }

    if (window.__carrierAssistantLastScanId === scanRequestId) {
      outputDiv.innerHTML = renderCarrierStatusBanner('CHECKING', 0, 'extracting MC and checking Aljex in the background');
    }
    actionContainer.innerHTML = '';

    const mcMatch = emailText.match(/(?:MC|MC#|MC\s*#?|MC\s*IS)\s*:?\s*(\d{5,7})\b/i) || emailText.match(/\b(\d{6,7})\b/);
    const mcDigitsOnly = mcMatch ? (mcMatch[1] || mcMatch[0]).replace(/\D/g, '') : null;

    if (!mcDigitsOnly) {
      if (window.__carrierAssistantLastScanId === scanRequestId) {
        outputDiv.innerHTML = '<b style="color:#d97706;">⚠️ No valid 6/7 digit MC # found in email text.</b>';
      }
      return;
    }

    const aljexLookupPromise = queryAljexBackground(mcDigitsOnly)
      .then((res) => {
        const safeRes = res || { status: 'NO_RECORD', ytd: 0 };
        if (window.__carrierAssistantLastScanId !== scanRequestId) {
          return safeRes;
        }
        outputDiv.innerHTML = renderCarrierStatusBanner(
          safeRes.status || 'NO_RECORD',
          safeRes.ytd || 0,
          safeRes.message ? safeRes.message : 'Aljex result loaded'
        );
        return safeRes;
      })
      .catch(() => ({ status: 'NO_RECORD', ytd: 0, message: 'Aljex lookup failed' }));

    let aljexRes = { status: 'NO_RECORD', ytd: 0, message: 'Checking...' };
    let liveOpenLoads = [];

    try {
      const [aljexResult, openLoadsResult] = await Promise.all([
        aljexLookupPromise,
        queryAljexOpenLoads()
      ]);
      aljexRes = aljexResult || aljexRes;
      liveOpenLoads = openLoadsResult || [];
    } catch (err) {
      aljexRes = { status: 'NO_RECORD', ytd: 0, message: 'Aljex lookup failed' };
      liveOpenLoads = [];
    }

    const aljexStatus = aljexRes ? aljexRes.status : 'NO_RECORD';
    const ytdLoads = aljexRes ? aljexRes.ytd : 0;
    const carrierRowSummary = formatCarrierRowSummary(aljexRes && aljexRes.carrier_row ? aljexRes.carrier_row : null);
    const baseStatusHtml = renderCarrierStatusBanner(aljexStatus, ytdLoads, aljexRes.message || 'carrier status refreshed');

    if (aljexStatus === 'PAGE_BLOCKED') {
      if (window.__carrierAssistantLastScanId === scanRequestId) {
        outputDiv.innerHTML = `
          <div style="border:2px solid #d97706; background:#fef3c7; color:#92400e; border-radius:8px; padding:10px 12px; margin-bottom:8px; font-size:13px; font-weight:900; line-height:1.5;">
            ⚠️ Aljex is blocked/403, log in and reload the page
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            The Aljex carrier lookup page is blank or blocked.<br>
            Log in to Aljex and reload the carrier page before trying the MC search again.<br>
            If the page remains blank, it is still returning a 403/login challenge, not a searchable form.
          </div>
        `;
      }
      return;
    }

    if (window.__carrierAssistantLastScanId === scanRequestId) {
      outputDiv.innerHTML = baseStatusHtml + '<div style="font-size:12px; color:#334155; white-space:pre-wrap;">';
    }

    try {
      const data = await postEmailToBackend({
        subject: 'Email',
        body: emailText,
        aljex_status: aljexStatus,
        ytd_loads: ytdLoads,
        live_loads: liveOpenLoads
      });

      responseData = data;
      outputDiv.innerHTML = baseStatusHtml + '<div style="font-size:12px; color:#334155; white-space:pre-wrap;">';

      if (data.status === 'MISSING_MC') {
        if (window.__carrierAssistantLastScanId === scanRequestId) {
          outputDiv.innerHTML = `<b style="color:#d97706;">⚠️ Missing MC/DOT</b><br>${data.message}`;
        }
      } else if (data.status === 'QUALIFIED') {
        if (window.__carrierAssistantLastScanId === scanRequestId) {
          const customerRequirementText = (data.reason && data.reason.includes('customer')) ? data.reason : 'Customer requirement met';
          outputDiv.innerHTML = `
            <div style="border:1px solid #16a34a; background:#dcfce7; color:#166534; border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:12px; font-weight:bold;">
              ✅ Qualified for this lane
            </div>
            <div style="font-size:12px; color:#334155; line-height:1.6;">
              Load details ready to copy<br>
              Status ${aljexStatus} • YTD ${ytdLoads} • ${customerRequirementText}<br>
              ${data.message}${carrierRowSummary}
            </div>
          `;
        }
      } else if (data.status === 'NO_LIVE_LOADS' || data.status === 'MISSING_LANE') {
        const laneMessage = data.status === 'NO_LIVE_LOADS'
          ? 'MC found, but there is no active live-load lane available on the current board.'
          : data.message;
        if (window.__carrierAssistantLastScanId === scanRequestId) {
          outputDiv.innerHTML = `<b style="color:#2563eb;">ℹ️ MC #${mcDigitsOnly} Found</b><br>Aljex Status: <b>${aljexStatus}</b> | YTD: <b>${ytdLoads}</b><br>${laneMessage}${carrierRowSummary}`;
        }
      } else if (data.status === 'UNQUALIFIED_SETUP' || data.status === 'UNQUALIFIED_RULE') {
        if (window.__carrierAssistantLastScanId === scanRequestId) {
          outputDiv.innerHTML = `<b style="color:#dc2626;">${data.reason}</b><br><br><b>Status:</b> ${aljexStatus} • <b>YTD:</b> ${ytdLoads} • <b>Customer requirement not met</b><br>Customer: <b>${data.load.customer}</b><br>Pro #${data.load.pro} (${data.load.pu} → ${data.load.del})${carrierRowSummary}`;
        }

        actionContainer.innerHTML = `
          <button id="btn-reply-rejection" style="width: 100%; background: #dc2626; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">🔴 Copy Rejection Email Response</button>
        `;

        document.getElementById('btn-reply-rejection').addEventListener('click', () => {
          navigator.clipboard.writeText(data.auto_reply);
          alert('Copied Polite Rejection Response to clipboard!');
        });
      } else if (data.status === 'MATCH_FOUND') {
        let optionsSummary = `<div style="border:1px solid #16a34a; background:#dcfce7; color:#166534; border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:12px; font-weight:bold;">✅ Qualified for this lane</div><div style="font-size:12px; color:#334155; line-height:1.6;">Load details ready to copy<br>Status ${aljexStatus} • YTD ${ytdLoads} • Customer requirement met${carrierRowSummary}<br>`;

        data.options.forEach((opt) => {
          optionsSummary += `<br><b>Option ${opt.option_index} (Pro #${opt.load.pro}):</b> ${opt.load.customer}<br>Rates: Initial <b>${opt.load.carrier_rate}</b> | Mid <b style="color:#d97706;">${opt.load.mid_rate}</b> | Max <b style="color:#dc2626;">${opt.load.max_rate}</b><br>Pick: ${opt.load.pu}<br>Del: ${opt.load.del}<br>`;
        });

        if (window.__carrierAssistantLastScanId === scanRequestId) {
          outputDiv.innerHTML = optionsSummary;
        }

        let buttonsHTML = '';

        if (data.total_options > 1) {
          buttonsHTML += `<button id="btn-copy-all-options" style="background: #2563eb; color: white; border: none; padding: 7px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">📋 Copy ALL ${data.total_options} Load Options Together</button>`;
        }

        data.options.forEach((opt) => {
          buttonsHTML += `
            <div style="border-top: 1px solid #cbd5e1; margin-top: 4px; padding-top: 4px;">
              <div style="font-size: 10px; font-weight: bold; color: #1e3a8a; margin-bottom: 2px;">Option ${opt.option_index} (Pro #${opt.load.pro}):</div>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button class="btn-opt-initial" data-idx="${opt.option_index - 1}" style="flex:1 1 30%; background: #16a34a; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">Copy Initial</button>
                <button class="btn-opt-smart" data-idx="${opt.option_index - 1}" style="flex:1 1 30%; background: #0ea5e9; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">Copy Smart</button>
                <button class="btn-opt-mid" data-idx="${opt.option_index - 1}" style="flex:1 1 30%; background: #d97706; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">Copy Mid</button>
                <button class="btn-opt-max" data-idx="${opt.option_index - 1}" style="flex:1 1 30%; background: #dc2626; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">Copy Max</button>
              </div>
            </div>
          `;
        });

        actionContainer.innerHTML = buttonsHTML;

        if (data.total_options > 1) {
          document.getElementById('btn-copy-all-options').addEventListener('click', () => {
            navigator.clipboard.writeText(data.combined_all_options);
            alert(`Copied ALL ${data.total_options} Load Options to clipboard!`);
          });
        }

        document.querySelectorAll('.btn-opt-initial').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            const opt = responseData.options[idx];
            const text = `Pick: ${opt.load.pu}\nDel: ${opt.load.del}\nMiles: ${opt.load.miles}\nWeight: ${opt.load.weight} lbs\nFreight: ${opt.load.freight}\nEquipment: ${opt.load.equipment}\nRate: ${opt.load.carrier_rate}`;
            navigator.clipboard.writeText(text);
            alert(`Copied load details for Option ${idx + 1}!`);
          });
        });

        document.querySelectorAll('.btn-opt-smart').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            navigator.clipboard.writeText(responseData.options[idx].smart_reply);
            alert(`Copied Option ${idx + 1} Smart Reply / Counter draft to clipboard!`);
          });
        });

        document.querySelectorAll('.btn-opt-mid').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            navigator.clipboard.writeText(responseData.options[idx].reply_mid);
            alert(`Copied Option ${idx + 1} Midpoint Offer (${responseData.options[idx].load.mid_rate}) to clipboard!`);
          });
        });

        document.querySelectorAll('.btn-opt-max').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            navigator.clipboard.writeText(responseData.options[idx].reply_max);
            alert(`Copied Option ${idx + 1} Final Offer (${responseData.options[idx].load.max_rate}) to clipboard!`);
          });
        });
      } else {
        if (window.__carrierAssistantLastScanId === scanRequestId) {
          outputDiv.innerHTML = `<b style="color:#dc2626;">⚠️ Unrecognized backend result</b><br>${JSON.stringify(data)}`;
        }
      }
    } catch (err) {
      if (window.__carrierAssistantLastScanId === scanRequestId) {
        const offlineStatusHtml = `
          <div style="border:1px solid #d97706; background:#fef3c7; color:#92400e; border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:12px; font-weight:bold;">
            ⚠️ Status loaded from Aljex • Lane qualification offline
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.5;">
            The live carrier record is available in Aljex, and the widget has loaded:<br>
            <b>Aljex Status:</b> ${aljexStatus} | <b>YTD:</b> ${ytdLoads}<br>
            <b>Note:</b> the lane qualification backend is temporarily unavailable.<br>
            <b>Fix:</b> restart the app on 127.0.0.1:8000 and reload the extension in Chrome.<br>
            ${carrierRowSummary || ''}
          </div>
        `;
        outputDiv.innerHTML = baseStatusHtml + offlineStatusHtml;
      }
    }
  });

  document.getElementById('btn-clear-text').addEventListener('click', () => {
    document.getElementById('email-text-input').value = '';
    document.getElementById('assistant-output').innerText = 'Paste text above or highlight email text and click Scan.';
    document.getElementById('dynamic-action-container').innerHTML = '';
  });

  if (!window.__carrierAssistantAutoScanned) {
    window.__carrierAssistantAutoScanned = true;
    setTimeout(() => {
      const inputArea = document.getElementById('email-text-input');
      const autoText = getCurrentPageEmailText();
      if (autoText && autoText.length > 20 && !inputArea.value.trim()) {
        inputArea.value = autoText;
        document.getElementById('btn-scan-email').click();
      }
    }, 1500);
  }
}