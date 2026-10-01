// Listener injected into EVERY frame in Aljex.
function getSavedAljexCredentials() {
  const defaults = { username: '', password: '' };

  try {
    const raw = window.localStorage.getItem('aljexCredentials');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.username) defaults.username = String(parsed.username);
      if (parsed.password) defaults.password = String(parsed.password);
    }
  } catch (_) {}

  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['aljexUsername', 'aljexPassword'], (items) => {
        resolve({
          username: items.aljexUsername || defaults.username,
          password: items.aljexPassword || defaults.password
        });
      });
    } catch (_) {
      resolve(defaults);
    }
  });
}

function findVisibleInputByMatch(matchFn) {
  const all = Array.from(document.querySelectorAll('input, textarea'));
  return all.find((el) => {
    if (!el || !el.offsetParent && el.getClientRects().length === 0) {
      return false;
    }

    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const value = (el.value || '').toLowerCase();

    return matchFn({ name, id, placeholder, aria, title, value });
  }) || null;
}

function findSearchButton() {
  const candidates = Array.from(document.querySelectorAll('button, input'));

  for (const el of candidates) {
    const text = (el.textContent || '').trim();
    const value = (el.value || '').trim();
    const aria = (el.getAttribute('aria-label') || '').trim();
    const title = (el.getAttribute('title') || '').trim();

    const isSearchButton = /search/i.test(text) || /search/i.test(value) || /search/i.test(aria) || /search/i.test(title);
    const isSubmit = el.type === 'submit' || el.tagName === 'BUTTON';

    if (isSearchButton || isSubmit) {
      return el;
    }
  }

  return null;
}

function normalizeOpenLoadKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function isLikelyOpenLoadsBoard() {
  const href = (location.href || '').toLowerCase();
  const pageText = (document.body ? document.body.innerText : '').toLowerCase();

  const hasCarrierSearchForm = /carriers search|search view profile crm|mc\s+name\s+city\s+state/i.test(pageText)
    && Array.from(document.querySelectorAll('input, textarea')).some((el) => {
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      return /mcnumb|mc/i.test(name) || /mcnumb|mc/i.test(id);
    });

  if (hasCarrierSearchForm) return false;

  if (/route\.php/i.test(href) && /search view profile crm|carriers search/i.test(pageText)) {
    return false;
  }

  if (/open loads|load board|loads shown/i.test(pageText)) return true;

  const hasRouteTableSignals = /pu city|del appt|pro#|pickup|delivery/i.test(pageText) && /status|customer/i.test(pageText);
  if (hasRouteTableSignals) return true;

  return false;
}

function findCarrierSearchControls() {
  const mcInput = findVisibleInputByMatch(({ name, id, placeholder, aria, title }) => {
    return /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(name)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(id)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(placeholder)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(aria)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(title);
  }) || document.querySelector('input[name*="mc" i], input[id*="mc" i], textarea[name*="mc" i], input[placeholder*="mc" i], input[aria-label*="mc" i]');

  const form = mcInput ? mcInput.form : null;
  const formButton = form ? Array.from(form.querySelectorAll('button, input[type="submit"], input[type="button"]')).find((el) => {
    const text = (el.textContent || '').trim();
    const value = (el.value || '').trim();
    const aria = (el.getAttribute('aria-label') || '').trim();
    const title = (el.getAttribute('title') || '').trim();
    const html = (el.className || '').toString();
    return /(search|find|lookup)/i.test(text)
      || /(search|find|lookup)/i.test(value)
      || /(search|find|lookup)/i.test(aria)
      || /(search|find|lookup)/i.test(title)
      || /(search|find|lookup)/i.test(html);
  }) : null;

  const pageButton = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).find((el) => {
    const text = (el.textContent || '').trim();
    const value = (el.value || '').trim();
    const aria = (el.getAttribute('aria-label') || '').trim();
    const title = (el.getAttribute('title') || '').trim();
    const html = (el.className || '').toString();
    const rowText = (el.closest('tr')?.textContent || '').replace(/\s+/g, ' ').trim();
    return /(search|find|lookup)/i.test(text)
      || /(search|find|lookup)/i.test(value)
      || /(search|find|lookup)/i.test(aria)
      || /(search|find|lookup)/i.test(title)
      || /(search|find|lookup)/i.test(html)
      || (/(search|find|lookup)/i.test(rowText) && /mc|carrier/i.test(rowText));
  });

  const searchBtn = formButton || pageButton || findSearchButton();
  return { mcInput, searchBtn, form };
}

function isCarrierLookupPage() {
  if (isLikelyOpenLoadsBoard()) return false;

  const pageText = (document.body ? document.body.innerText : '');
  const hasCarrierLayout = /carriers search|search view profile crm|carrier lookup|lookup carriers|mc name|mc #|mc number|city state/i.test(pageText);
  const hasMcField = !!findVisibleInputByMatch(({ name, id, placeholder, aria, title }) => {
    return /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(name)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(id)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(placeholder)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(aria)
      || /(?:^|[_-])mc(?:$|[_-])|^mc$|motor carrier|carrier mc/i.test(title);
  });
  const hasHeaderMatch = Array.from(document.querySelectorAll('th, td')).some((cell) => {
    const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
    return /mc/i.test(text) && /(city|state|status|name)/i.test(text);
  });

  return (hasCarrierLayout || (hasMcField && hasHeaderMatch)) && !!findCarrierSearchControls().mcInput;
}

function waitForCarrierSearchReady(onReady, onTimeout, timeoutMs = 10000, intervalMs = 500) {
  const started = Date.now();

  const check = () => {
    const { mcInput, searchBtn } = findCarrierSearchControls();
    const ready = !!mcInput && !!searchBtn && isCarrierLookupPage();

    if (ready) {
      onReady({ mcInput, searchBtn });
      return;
    }

    const fallbackInput = findVisibleInputByMatch(({ name, id, placeholder, aria, title }) => {
      return /(?:^|[_-])mc(?:$|[_-])|^mc$|carrier/i.test(name)
        || /(?:^|[_-])mc(?:$|[_-])|^mc$|carrier/i.test(id)
        || /(?:^|[_-])mc(?:$|[_-])|^mc$|carrier/i.test(placeholder)
        || /(?:^|[_-])mc(?:$|[_-])|^mc$|carrier/i.test(aria)
        || /(?:^|[_-])mc(?:$|[_-])|^mc$|carrier/i.test(title);
    });

    if (fallbackInput && fallbackInput.form) {
      const fallbackBtn = fallbackInput.form.querySelector('button[type="submit"], input[type="submit"], button, input[type="button"]');
      if (fallbackBtn) {
        onReady({ mcInput: fallbackInput, searchBtn: fallbackBtn });
        return;
      }
    }

    if (Date.now() - started >= timeoutMs) {
      onTimeout();
      return;
    }

    setTimeout(check, intervalMs);
  };

  check();
}

function parseOpenLoadRowsFromPage() {
  const rows = [];
  const tables = Array.from(document.querySelectorAll('table'));

  let matchedHeader = null;
  for (const table of tables) {
    const headerRow = Array.from(table.querySelectorAll('tr'))
      .find((row) => {
        const texts = Array.from(row.querySelectorAll('th, td')).map((cell) => (cell.textContent || '').trim().toLowerCase());
        return texts.some((text) => /pro/.test(text) && (/pu/.test(text) || /customer/.test(text) || /appt/.test(text)));
      });

    if (headerRow) {
      matchedHeader = headerRow;
      break;
    }
  }

  if (!matchedHeader) {
    return rows;
  }

  const headerCells = Array.from(matchedHeader.querySelectorAll('th, td')).map((cell) => (cell.textContent || '').trim());
  const headerKeys = headerCells.map((cell) => normalizeOpenLoadKey(cell));

  const dataRows = matchedHeader.parentElement ? Array.from(matchedHeader.parentElement.querySelectorAll('tr')) : [];
  const matchingRows = dataRows.slice(dataRows.indexOf(matchedHeader) + 1);

  matchingRows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td, th'));
    if (cells.length < 3) return;
    const data = {};
    cells.forEach((cell, idx) => {
      const key = headerKeys[idx] || `col_${idx + 1}`;
      data[key] = (cell.textContent || '').trim();
    });

    const pro = data.pro || data.pro_ || data['pro#'] || '';
    const customer = data.customer || data.customer_name || data.company || '';
    const puCity = data.pu_city || data.origin_city || '';
    const puSt = data.pu_st || data.origin_st || '';
    const puDate = data.pu_appt_dt || data.pu_date || data.pickup_date || '';
    const puTime = data.pu_appt_tm || data.pickup_time || '';
    const consCity = data.cons_city || data.destination_city || '';
    const consSt = data.cons_st || data.destination_st || '';
    const delDate = data.del_appt_dt || data.delivery_date || '';

    if (!pro && !customer && !puCity && !consCity) return;

    rows.push({
      Pro: pro,
      'Customer Name': customer,
      'PU City': puCity,
      'PU St': puSt,
      'PU Appt Dt': puDate,
      'PU Appt Tm': puTime,
      'Cons City': consCity,
      'Cons St': consSt,
      'Del Appt Dt': delDate,
      'Status': data.status || '',
      'Carrier Rate': data.carrier_rate || data.rate || '',
      'Max Truck Rate': data.max_truck_rate || data.max_rate || ''
    });
  });

  return rows;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_PAGE_KIND') {
    sendResponse({
      page_kind: isLikelyOpenLoadsBoard() ? 'OPEN_LOADS' : (isCarrierLookupPage() ? 'CARRIER_SEARCH' : 'UNKNOWN')
    });
    return false;
  }

  if (request.action === 'GET_OPEN_LOADS') {
    sendResponse({ open_loads: parseOpenLoadRowsFromPage() });
    return false;
  }

  if (request.action !== 'QUERY_ALJEX_TAB') {
    return false;
  }

  const cleanMc = String(request.mc || '').replace(/\D/g, '');

  if (!cleanMc) {
    sendResponse({ status: 'NO_RECORD', ytd: 0 });
    return false;
  }

  if (/rtcy\.aljex\.com/i.test(location.href) && document.body && !document.body.innerText.trim()) {
    sendResponse({
      status: 'PAGE_BLOCKED',
      ytd: 0,
      carrier_row: null,
      message: 'Aljex page is blank or blocked (403/login required). Log in to Aljex and reload the page before running the MC search.'
    });
    return false;
  }

  function runCarrierLookupStep() {
    const performLookup = ({ mcInput, searchBtn }) => {
      if (!mcInput || !searchBtn) {
        sendResponse({
          status: 'CARRIER_PAGE_WAITING',
          ytd: 0,
          carrier_row: null,
          message: 'Awaiting carrier page: Aljex is not ready for MC search yet.'
        });
        return;
      }

      mcInput.value = cleanMc;
      if (mcInput.dispatchEvent) {
        mcInput.dispatchEvent(new Event('input', { bubbles: true }));
        mcInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (searchBtn.click) {
        searchBtn.click();
      } else if (searchBtn.form && searchBtn.form.requestSubmit) {
        searchBtn.form.requestSubmit();
      }

      setTimeout(() => {
        sendResponse(scrapeAljexTable());
      }, 1000);
    };

    const { mcInput, searchBtn } = findCarrierSearchControls();
    if (mcInput && searchBtn) {
      performLookup({ mcInput, searchBtn });
      return true;
    }

    waitForCarrierSearchReady(
      (controls) => {
        performLookup(controls);
      },
      () => {
        sendResponse({
          status: 'CARRIER_PAGE_WAITING',
          ytd: 0,
          carrier_row: null,
          message: 'Awaiting carrier page: Aljex is not ready for MC search yet.'
        });
      }
    );
    return true;

    function scrapeAljexTable() {
      const bodyHtml = document.body.innerHTML;
      const bodyText = document.body.innerText;

      if (bodyText.includes('No Carriers Found')) {
        return { status: 'NO_RECORD', ytd: 0, carrier_row: null };
      }

      const normalizeCell = (cell) => {
        const text = (cell?.innerText || cell?.textContent || '').replace(/\s+/g, ' ').trim();
        return text;
      };

      const parseDigits = (value) => {
        const match = String(value || '').match(/-?\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };

      const extractYtdCellValue = (cells, headerIndexMap) => {
        const idx = headerIndexMap.ytd_loads;
        if (typeof idx === 'number' && idx >= 0 && idx < cells.length) {
          const raw = String(cells[idx] || '').trim();
          if (/\d/.test(raw)) {
            return parseDigits(raw);
          }
        }
        return 0;
      };

      const rows = Array.from(document.querySelectorAll('tr'));
      const headerRow = rows.find((row) => {
        const texts = Array.from(row.querySelectorAll('th, td')).map(normalizeCell);
        const joined = texts.join(' | ').toLowerCase();
        return /ytd loads/i.test(joined) && /status/i.test(joined);
      });

      const headerCells = headerRow ? Array.from(headerRow.querySelectorAll('th, td')).map(normalizeCell) : [];
      const headerIndexMap = {};

      headerCells.forEach((cell, idx) => {
        if (!cell) return;
        const text = cell.toLowerCase();
        if (/carrier/i.test(text)) headerIndexMap.carrier = idx;
        if (/^dot$/i.test(cell)) headerIndexMap.dot = idx;
        if (/mc/i.test(text) && !/miles|mc /i.test(text) && !/carrier/i.test(text)) headerIndexMap.mc = idx;
        if (/city/i.test(text)) headerIndexMap.city = idx;
        if (/st\b|state/i.test(text)) headerIndexMap.state = idx;
        if (/phone/i.test(text)) headerIndexMap.phone = idx;
        if (/contact/i.test(text)) headerIndexMap.contact = idx;
        if (/assigned\s*disp/i.test(text)) headerIndexMap.assigned_disp = idx;
        if (/last\s*load/i.test(text)) headerIndexMap.last_load = idx;
        if (/last\s*call/i.test(text)) headerIndexMap.last_call = idx;
        if (/next\s*call/i.test(text)) headerIndexMap.next_call = idx;
        if (/ytd\s*loads/i.test(text)) headerIndexMap.ytd_loads = idx;
        if (/ytd\s*cancel/i.test(text)) headerIndexMap.ytd_cancel = idx;
        if (/ytd\s*pay/i.test(text)) headerIndexMap.ytd_pay = idx;
        if (/status/i.test(text) && !/expired|required|ins/i.test(text)) headerIndexMap.status = idx;
        if (/super\s*hold/i.test(text)) headerIndexMap.super_hold = idx;
        if (/safety\s*rating/i.test(text)) headerIndexMap.safety_rating = idx;
      });

      let matchedCarrierRow = null;
      let matchedCarrierStatus = 'NO_RECORD';
      let matchedCarrierYtd = 0;
      let foundStatus = 'NO_RECORD';
      let foundYtd = 0;
      let bestScore = 0;

      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map(normalizeCell);
        if (cells.length < 10) return;

        const rowText = cells.join(' | ');
        const statusIndex = cells.findIndex((cell) => /^Y$|^N$/.test((cell || '').trim().toUpperCase()));
        const statusColumn = headerIndexMap.status !== undefined ? cells[headerIndexMap.status] : undefined;
        const statusValue = /^Y$|^N$/.test((statusColumn || '').trim().toUpperCase()) ? statusColumn.trim().toUpperCase() : undefined;
        const ytdValue = extractYtdCellValue(cells, headerIndexMap);

        let status = statusValue || (statusIndex >= 0 ? cells[statusIndex].trim().toUpperCase() : 'NO_RECORD');
        let ytd = ytdValue || 0;

        if (!ytd && statusIndex >= 0 && statusIndex > 0) {
          const leftCell = cells.slice(Math.max(0, statusIndex - 3), statusIndex).reverse().find((cell) => /\d+/.test(cell));
          ytd = parseDigits(leftCell || '');
        }

        if (!ytd && headerIndexMap.ytd_loads === undefined) {
          const numericValues = cells.map(parseDigits).filter((num) => num > 0);
          if (numericValues.length) ytd = numericValues[0];
        }

        if (status !== 'Y' && status !== 'N') {
          if (bodyText.includes('>Y<')) status = 'Y';
          else if (bodyText.includes('>N<')) status = 'N';
        }

        const score = (
          (status === 'Y' || status === 'N' ? 10 : 0) +
          (ytd > 0 ? 5 : 0) +
          (/ytd loads/i.test(rowText) ? 4 : 0) +
          (/status/i.test(rowText) ? 2 : 0)
        );

        if (score > bestScore) {
          bestScore = score;
          foundStatus = status === 'Y' || status === 'N' ? status : 'NO_RECORD';
          foundYtd = ytd;
        }

        const mcCellIndex = headerIndexMap.mc !== undefined ? headerIndexMap.mc : cells.findIndex((cell) => /\b\d{5,7}\b/.test(cell));
        if (mcCellIndex >= 0 && cells[mcCellIndex]) {
          const cellMc = String(cells[mcCellIndex]).replace(/\D/g, '');
          const exactMatch = cellMc === cleanMc || cellMc.includes(cleanMc) || cleanMc.includes(cellMc);
          if (exactMatch) {
            const rowObj = {};
            Object.entries(headerIndexMap).forEach(([key, idx]) => {
              rowObj[key] = idx < cells.length ? cells[idx] : '';
            });
            rowObj.raw = cells;
            rowObj.status = status;
            rowObj.ytd_loads = extractYtdCellValue(cells, headerIndexMap) || ytd;
            matchedCarrierRow = rowObj;
            matchedCarrierStatus = status === 'Y' || status === 'N' ? status : 'NO_RECORD';
            matchedCarrierYtd = rowObj.ytd_loads;
          }
        }
      });

      if (matchedCarrierRow) {
        foundStatus = matchedCarrierStatus;
        foundYtd = matchedCarrierYtd;
      }

      if (foundStatus === 'NO_RECORD') {
        if (bodyText.includes('>Y<')) foundStatus = 'Y';
        else if (bodyText.includes('>N<')) foundStatus = 'N';
      }

      if (!foundYtd) {
        const ytdMatch = bodyHtml.match(/<td[^>]*>\s*(\d+)\s*<\/td>\s*(?:<td[^>]*>\s*\d*\s*<\/td>\s*){0,3}<td[^>]*>\s*USD/i);
        if (ytdMatch) {
          foundYtd = parseInt(ytdMatch[1], 10) || 0;
        }
      }

      return {
        status: foundStatus,
        ytd: foundYtd,
        carrier_row: matchedCarrierRow,
        matched_mc: matchedCarrierRow && matchedCarrierRow.mc ? matchedCarrierRow.mc : null
      };
    }

    mcInput.value = cleanMc;
    if (mcInput.dispatchEvent) {
      mcInput.dispatchEvent(new Event('input', { bubbles: true }));
      mcInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (searchBtn.click) {
      searchBtn.click();
    } else if (searchBtn.form && searchBtn.form.requestSubmit) {
      searchBtn.form.requestSubmit();
    }

    setTimeout(() => {
      sendResponse(scrapeAljexTable());
    }, 1000);

    return true;
  }

  const loginSelectors = {
    username: 'input[aria-label="Username input"], input[id*="UserName" i], input[name*="userName" i], input[name*="user_name" i], input[name*="login" i], input[type="email"], input[name*="email" i]',
    next: 'input[aria-label="Next button"], input[id*="UsernameNext" i], input[value="Next" i], button[aria-label="Next button"], button[type="submit"]',
    password: 'input[aria-label="Password input"], input[type="password"], input[id*="Password" i], input[name*="password" i], input[name*="pass" i]',
    signIn: 'input[aria-label="Sign In button"], input[id*="Submit" i], input[value="Sign In" i], button[aria-label="Sign In button"], button[type="submit"]'
  };

  const usernameInput = document.querySelector(loginSelectors.username);
  const passwordInput = document.querySelector(loginSelectors.password);
  const nextButton = document.querySelector(loginSelectors.next);
  const signInButton = document.querySelector(loginSelectors.signIn);

  if (usernameInput && nextButton && !passwordInput) {
    getSavedAljexCredentials().then(({ username }) => {
      if (username) {
        usernameInput.value = username;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (nextButton.click) {
        nextButton.click();
      }
    });

    waitForCarrierSearchReady(
      () => {
        runCarrierLookupStep();
      },
      () => {
        sendResponse({ status: 'LOGIN_PENDING', ytd: 0, carrier_row: null, message: 'Login pending: waiting for the Aljex username step to finish.' });
      },
      15000,
      700
    );

    return true;
  }

  if (passwordInput && signInButton && usernameInput) {
    getSavedAljexCredentials().then(({ password }) => {
      if (password) {
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (signInButton.click) {
        signInButton.click();
      }
    });

    waitForCarrierSearchReady(
      () => {
        runCarrierLookupStep();
      },
      () => {
        sendResponse({ status: 'LOGIN_PENDING', ytd: 0, carrier_row: null, message: 'Login pending: waiting for the Aljex password step to finish.' });
      },
      15000,
      700
    );

    return true;
  }

  runCarrierLookupStep();
  return true;
});