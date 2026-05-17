// js/link-checker.js - 失效連結檢查模組（頁面端）

let isChecking = false;
let isPaused = false;
let checkResults = [];
let progressCallback = null;
let completeCallback = null;

/**
 * 開始檢查連結
 * @param {string[]} urls - 要檢查的 URL 陣列
 * @param {object} options
 * @param {number} options.concurrent - 並發數
 * @param {number} options.timeout - 超時毫秒
 * @param {Function} options.onProgress - 進度回調
 * @param {Function} options.onComplete - 完成回調
 */
function startCheck(urls, options = {}) {
  if (isChecking) return;

  isChecking = true;
  isPaused = false;
  checkResults = [];
  progressCallback = options.onProgress;
  completeCallback = options.onComplete;

  // 監聽 background 的進度訊息
  chrome.runtime.onMessage.addListener(handleMessage);

  // 發送給 background 開始檢查
  chrome.runtime.sendMessage({
    action: 'checkLinks',
    urls,
    concurrent: options.concurrent || 5,
    timeout: options.timeout || 10000
  });
}

/**
 * 停止檢查
 */
function stopCheck() {
  isChecking = false;
  isPaused = false;
  chrome.runtime.onMessage.removeListener(handleMessage);
}

/**
 * 單一 URL 快速檢查
 */
async function checkSingle(url, timeout = 10000) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'checkLink', url, timeout },
      (response) => {
        resolve(response || { url, status: 0, ok: false, error: 'no_response' });
      }
    );
  });
}

/**
 * 處理來自 background 的訊息
 */
function handleMessage(msg) {
  if (msg.action === 'checkProgress') {
    checkResults.push(msg.latest);
    if (progressCallback) {
      progressCallback({
        completed: msg.completed,
        total: msg.total,
        latest: msg.latest,
        results: [...checkResults]
      });
    }
  }

  if (msg.action === 'checkComplete') {
    isChecking = false;
    chrome.runtime.onMessage.removeListener(handleMessage);
    if (completeCallback) {
      completeCallback(msg.results);
    }
  }
}

/**
 * 取得狀態描述
 */
function getStatusLabel(result) {
  if (!result) return { label: '未知', type: 'muted' };

  if (result.error === 'timeout') return { label: '逾時', type: 'timeout' };
  if (result.error) return { label: '錯誤', type: 'error' };
  if (!result.status) return { label: '無法連線', type: 'error' };

  const s = result.status;
  if (s >= 200 && s < 300) return { label: `正常 ${s}`, type: 'ok' };
  if (s >= 300 && s < 400) return { label: `重新導向 ${s}`, type: 'redirect' };
  if (s === 404) return { label: '404 找不到', type: 'error' };
  if (s === 403) return { label: '403 禁止存取', type: 'error' };
  if (s === 410) return { label: '410 永久刪除', type: 'error' };
  if (s >= 400 && s < 500) return { label: `用戶端錯誤 ${s}`, type: 'error' };
  if (s >= 500) return { label: `伺服器錯誤 ${s}`, type: 'error' };

  return { label: `狀態 ${s}`, type: 'muted' };
}

/**
 * 判斷是否為失效連結
 */
function isDeadLink(result) {
  if (!result) return false;
  if (result.error === 'timeout') return true;
  if (result.error && result.error !== 'timeout') return true;
  if (result.status === 404 || result.status === 410) return true;
  if (result.status >= 500) return true;
  return false;
}

/**
 * 篩選結果
 */
function filterResults(results, filter = 'all') {
  switch (filter) {
    case 'dead': return results.filter(r => isDeadLink(r));
    case 'ok': return results.filter(r => r.ok && !isDeadLink(r));
    case 'redirect': return results.filter(r => r.status >= 300 && r.status < 400);
    case 'timeout': return results.filter(r => r.error === 'timeout');
    default: return results;
  }
}

/**
 * 取得結果統計
 */
function getResultStats(results) {
  return {
    total: results.length,
    ok: results.filter(r => r.ok).length,
    dead: results.filter(r => isDeadLink(r)).length,
    redirect: results.filter(r => r.status >= 300 && r.status < 400).length,
    timeout: results.filter(r => r.error === 'timeout').length,
    error: results.filter(r => r.error && r.error !== 'timeout').length
  };
}

window.LinkChecker = {
  startCheck,
  stopCheck,
  checkSingle,
  getStatusLabel,
  isDeadLink,
  filterResults,
  getResultStats,
  get isChecking() { return isChecking; }
};
