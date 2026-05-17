// background.js - Service Worker for 書籤檢查小幫手
// 負責處理跨來源的失效連結檢查請求

const CHECK_TIMEOUT_DEFAULT = 10000; // 10秒
const CONCURRENT_DEFAULT = 5;

// ============================================================
// 底層網路錯誤捕捉系統 (webRequest-based)
// ============================================================
// Chrome 的 fetch API 在遇到 SSL 憑證問題時只會拋出籠統的 TypeError，
// 完全隱藏了底層真實的網路錯誤代碼。透過 webRequest.onErrorOccurred，
// 我們能攔截如 ERR_CERT_AUTHORITY_INVALID 等底層錯誤，
// 從而判定伺服器實際上是存活的（只是憑證有問題）。
// ============================================================
const recentNetworkErrors = new Map();

if (chrome.webRequest && chrome.webRequest.onErrorOccurred) {
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      recentNetworkErrors.set(details.url, details.error);
      setTimeout(() => {
        if (recentNetworkErrors.get(details.url) === details.error) {
          recentNetworkErrors.delete(details.url);
        }
      }, 10000);
    },
    { urls: ['<all_urls>'] }
  );
}

// 監聽來自 popup/pages 的訊息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkLink') {
    checkSingleLink(request.url, request.timeout || CHECK_TIMEOUT_DEFAULT)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  if (request.action === 'checkLinks') {
    checkLinksWithConcurrency(
      request.urls,
      request.concurrent || CONCURRENT_DEFAULT,
      request.timeout || CHECK_TIMEOUT_DEFAULT,
      sender.tab?.id
    );
    sendResponse({ started: true });
    return true;
  }

  if (request.action === 'openPage') {
    chrome.tabs.create({ url: chrome.runtime.getURL(request.page) });
    sendResponse({ ok: true });
    return true;
  }
});

/**
 * 檢查單一連結是否有效
 * 五層智慧降級防禦：
 *   1. HEAD (follow)
 *   2. GET (follow)
 *   3. HTTPS GET (follow) - 僅 http:// 網址
 *   4. GET (manual redirect)
 *   5. webRequest 底層憑證錯誤偵測 (帶等待)
 */
async function checkSingleLink(url, timeout) {
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  async function doFetch(targetUrl, method, redirectMode) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(targetUrl, {
        method: method,
        headers: headers,
        signal: controller.signal,
        redirect: redirectMode || 'follow',
        cache: 'no-cache'
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // --- 第一層：HEAD ---
  try {
    const res = await doFetch(url, 'HEAD', 'follow');
    if (res.ok) {
      return { url: url, status: res.status, ok: true, redirected: res.redirected, finalUrl: res.url };
    }
    throw new Error('HEAD ' + res.status);
  } catch (e1) {
    if (e1.name === 'AbortError') return { url: url, status: 0, ok: false, error: 'timeout' };
  }

  // --- 第二層：GET ---
  try {
    const res = await doFetch(url, 'GET', 'follow');
    return { url: url, status: res.status, ok: res.ok, redirected: res.redirected, finalUrl: res.url };
  } catch (e2) {
    if (e2.name === 'AbortError') return { url: url, status: 0, ok: false, error: 'timeout' };
  }

  // --- 第三層：HTTPS GET（僅 http:// 網址）---
  if (url.startsWith('http://')) {
    const httpsUrl = url.replace('http://', 'https://');
    try {
      const res = await doFetch(httpsUrl, 'GET', 'follow');
      return { url: url, status: res.status, ok: res.ok, redirected: res.redirected, finalUrl: res.url };
    } catch (e3) {
      if (e3.name === 'AbortError') return { url: url, status: 0, ok: false, error: 'timeout' };
    }
  }

  // --- 第四層：手動 redirect 攔截 ---
  try {
    const res = await doFetch(url, 'GET', 'manual');
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { url: url, status: res.status || 301, ok: true, redirected: true, finalUrl: url };
    }
    if (res.ok) {
      return { url: url, status: res.status, ok: true, redirected: false, finalUrl: res.url };
    }
  } catch (e4) {
    // 繼續第五層
  }

  // --- 第五層：webRequest 底層憑證錯誤偵測（帶等待）---
  // 等待 500ms，讓 webRequest.onErrorOccurred 事件有充足時間觸發
  await new Promise(resolve => setTimeout(resolve, 500));

  // 建構所有可能的 URL 變體進行比對
  const base = url.replace(/\/+$/, '');
  const candidates = [
    url,
    base,
    base + '/',
    url.replace('http://', 'https://'),
    base.replace('http://', 'https://'),
    base.replace('http://', 'https://') + '/'
  ];

  for (const candidate of candidates) {
    const netErr = recentNetworkErrors.get(candidate);
    if (netErr && (
      netErr.includes('ERR_CERT_') ||
      netErr.includes('ERR_SSL_') ||
      netErr.includes('ERR_INSECURE_RESPONSE')
    )) {
      // 底層捕獲到憑證錯誤 = 伺服器存活，只是 SSL 憑證有問題
      return { url: url, status: 200, ok: true, redirected: false, finalUrl: candidate };
    }
  }

  return { url: url, status: 0, ok: false, error: 'Failed to fetch' };
}

/**
 * 以並發方式批量檢查連結，並回報進度
 */
async function checkLinksWithConcurrency(urls, concurrent, timeout, tabId) {
  let index = 0;
  let completed = 0;
  const total = urls.length;
  const results = [];

  async function worker() {
    while (index < total) {
      const currentIndex = index++;
      const currentUrl = urls[currentIndex];

      try {
        const result = await checkSingleLink(currentUrl, timeout);
        results.push(result);
      } catch (e) {
        results.push({ url: currentUrl, status: 0, ok: false, error: e.message });
      }

      completed++;

      chrome.runtime.sendMessage({
        action: 'checkProgress',
        completed: completed,
        total: total,
        latest: results[results.length - 1]
      }).catch(() => {});
    }
  }

  const workers = Array(Math.min(concurrent, total)).fill(null).map(() => worker());
  await Promise.all(workers);

  chrome.runtime.sendMessage({
    action: 'checkComplete',
    results: results
  }).catch(() => {});
}
