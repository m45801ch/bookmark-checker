// js/bookmark-utils.js - 書籤工具函式庫

/**
 * 遞迴取得所有書籤（排除資料夾）
 * @param {BookmarkTreeNode[]} nodes
 * @returns {BookmarkItem[]}
 */
function getAllBookmarks(nodes) {
  const bookmarks = [];

  function traverse(node, path = []) {
    if (node.url) {
      // 是書籤
      bookmarks.push({
        id: node.id,
        title: node.title || '（無標題）',
        url: node.url,
        dateAdded: node.dateAdded,
        path: path.join(' › '),
        parentId: node.parentId
      });
    } else if (node.children) {
      // 是資料夾
      const folderName = node.title || '（根目錄）';
      for (const child of node.children) {
        traverse(child, [...path, folderName]);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return bookmarks;
}

/**
 * 取得資料夾樹狀結構
 * @param {BookmarkTreeNode[]} nodes
 * @returns {FolderNode[]}
 */
function getFolderTree(nodes) {
  const folders = [];

  function traverse(node, depth = 0) {
    if (!node.url && node.children) {
      folders.push({
        id: node.id,
        title: node.title || '（根目錄）',
        depth,
        childCount: countBookmarks(node)
      });
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return folders;
}

/**
 * 計算資料夾下的書籤數量（遞迴）
 */
function countBookmarks(node) {
  if (node.url) return 1;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + countBookmarks(child), 0);
}

/**
 * 標準化 URL（移除尾端斜線、hash、追蹤參數等）
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // 移除尾端斜線
    let pathname = u.pathname.replace(/\/$/, '') || '/';
    // 移除常見追蹤參數
    const removeParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','ref'];
    removeParams.forEach(p => u.searchParams.delete(p));
    const search = u.searchParams.toString();
    return `${u.protocol}//${u.host}${pathname}${search ? '?' + search : ''}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * 取得網域（含子網域）
 */
function getDomain(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * 取得根網域（e.g. sub.example.com → example.com）
 */
function getRootDomain(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    const parts = host.split('.');
    if (parts.length <= 2) return host;
    return parts.slice(-2).join('.');
  } catch {
    return url.toLowerCase();
  }
}

/**
 * 格式化日期
 */
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * 格式化時間距離（幾天前）
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  if (days < 365) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/**
 * 截斷文字
 */
function truncate(str, maxLen = 60) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/**
 * 取得網站 favicon URL
 */
function getFaviconUrl(url) {
  try {
    const { protocol, host } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${host}&sz=16`;
  } catch {
    return '';
  }
}

/**
 * 取得書籤樹（Promise 包裝）
 */
function getBookmarkTree() {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((tree) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(tree);
      }
    });
  });
}

/**
 * 刪除書籤（Promise 包裝）
 */
function removeBookmark(id) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.remove(id, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * 建立書籤（Promise 包裝）
 */
function createBookmark(details) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(details, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * 取得設定
 */
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('settings', (data) => {
      resolve(data.settings || getDefaultSettings());
    });
  });
}

/**
 * 預設設定
 */
function getDefaultSettings() {
  return {
    concurrent: 5,
    timeout: 10000,
    duplicateMode: 'url',   // 'url' | 'domain' | 'rootdomain'
    trashRetentionDays: 30,
    importDuplicateAction: 'skip', // 'skip' | 'overwrite' | 'ask'
    showFavicons: true,
    autoCheckOnOpen: false
  };
}

/**
 * 儲存設定
 */
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, resolve);
  });
}

/**
 * 更新書籤（Promise 包裝）
 */
function updateBookmark(id, details) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.update(id, details, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

// 匯出（在 Chrome 擴充套件中使用 window 掛載）
window.BookmarkUtils = {
  getAllBookmarks,
  getFolderTree,
  normalizeUrl,
  getDomain,
  getRootDomain,
  formatDate,
  formatRelativeTime,
  truncate,
  getFaviconUrl,
  getBookmarkTree,
  removeBookmark,
  createBookmark,
  updateBookmark,
  getSettings,
  getDefaultSettings,
  saveSettings
};
