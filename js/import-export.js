// js/import-export.js - 匯入匯出模組

/**
 * 將書籤樹匯出為 JSON
 * @param {BookmarkTreeNode[]} tree
 * @returns {string} JSON 字串
 */
function exportToJSON(tree) {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    source: '書籤檢查小幫手',
    bookmarks: tree
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * 將書籤樹匯出為 Netscape HTML 格式
 * @param {BookmarkTreeNode[]} nodes
 * @returns {string} HTML 字串
 */
function exportToHTML(nodes) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ];

  function renderNode(node, depth = 0) {
    const indent = '    '.repeat(depth + 1);
    if (node.url) {
      const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : '';
      const title = escapeHtml(node.title || '');
      lines.push(`${indent}<DT><A HREF="${escapeHtml(node.url)}" ADD_DATE="${addDate}">${title}</A>`);
    } else if (node.children) {
      const title = escapeHtml(node.title || '');
      lines.push(`${indent}<DT><H3>${title}</H3>`);
      lines.push(`${indent}<DL><p>`);
      for (const child of node.children) {
        renderNode(child, depth + 1);
      }
      lines.push(`${indent}</DL><p>`);
    }
  }

  for (const node of nodes) {
    renderNode(node);
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

/**
 * 從 JSON 匯入書籤
 * @param {string} jsonStr - JSON 字串
 * @param {object} options
 * @param {'skip'|'overwrite'} options.duplicateAction
 * @param {string} options.targetFolderId - 目標資料夾 ID
 * @returns {Promise<ImportResult>}
 */
async function importFromJSON(jsonStr, options = {}) {
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON 格式錯誤：' + e.message);
  }

  // 支援兩種格式：直接的書籤陣列，或包裝過的格式
  const nodes = data.bookmarks || (Array.isArray(data) ? data : [data]);

  return importNodes(nodes, options);
}

/**
 * 從 HTML 匯入書籤（Netscape 格式）
 * @param {string} htmlStr
 * @param {object} options
 */
async function importFromHTML(htmlStr, options = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, 'text/html');

  // 解析 Netscape 書籤格式
  function parseList(dl, parentTitle = '') {
    const nodes = [];
    const dts = dl.querySelectorAll(':scope > dt');

    for (const dt of dts) {
      const a = dt.querySelector('a');
      const h3 = dt.querySelector('h3');
      const subDl = dt.querySelector('dl');

      if (a) {
        nodes.push({
          title: a.textContent.trim(),
          url: a.href,
          dateAdded: a.getAttribute('add_date')
            ? parseInt(a.getAttribute('add_date')) * 1000
            : Date.now()
        });
      } else if (h3 && subDl) {
        nodes.push({
          title: h3.textContent.trim(),
          children: parseList(subDl, h3.textContent.trim())
        });
      }
    }

    return nodes;
  }

  const rootDl = doc.querySelector('dl');
  if (!rootDl) throw new Error('找不到書籤資料（無 <DL> 標籤）');

  const nodes = parseList(rootDl);
  return importNodes(nodes, options);
}

/**
 * 遞迴匯入節點到 Chrome 書籤
 */
async function importNodes(nodes, options = {}) {
  const { duplicateAction = 'skip', targetFolderId = '2' } = options;

  // 取得現有書籤用於重複檢測
  const existingTree = await window.BookmarkUtils.getBookmarkTree();
  const existingBookmarks = window.BookmarkUtils.getAllBookmarks(existingTree);
  const existingUrls = new Set(existingBookmarks.map(b =>
    window.BookmarkUtils.normalizeUrl(b.url)
  ));

  const stats = { imported: 0, skipped: 0, failed: 0, folders: 0 };

  async function processNodes(nodeList, parentId) {
    for (const node of nodeList) {
      if (node.url) {
        // 是書籤
        const normalizedUrl = window.BookmarkUtils.normalizeUrl(node.url);
        const isDuplicate = existingUrls.has(normalizedUrl);

        if (isDuplicate && duplicateAction === 'skip') {
          stats.skipped++;
          continue;
        }

        try {
          await window.BookmarkUtils.createBookmark({
            parentId,
            title: node.title,
            url: node.url
          });
          existingUrls.add(normalizedUrl);
          stats.imported++;
        } catch (e) {
          console.warn('匯入書籤失敗:', node.url, e);
          stats.failed++;
        }
      } else if (node.children) {
        // 是資料夾
        try {
          const folder = await window.BookmarkUtils.createBookmark({
            parentId,
            title: node.title
          });
          stats.folders++;
          await processNodes(node.children, folder.id);
        } catch (e) {
          console.warn('建立資料夾失敗:', node.title, e);
          stats.failed++;
        }
      }
    }
  }

  await processNodes(nodes, targetFolderId);
  return stats;
}

/**
 * 逸出 HTML 特殊字元
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 取得匯出統計（總書籤數、資料夾數）
 */
function getExportStats(nodes) {
  let bookmarks = 0;
  let folders = 0;

  function count(nodeList) {
    for (const node of nodeList) {
      if (node.url) bookmarks++;
      else if (node.children) {
        folders++;
        count(node.children);
      }
    }
  }

  count(nodes);
  return { bookmarks, folders };
}

window.ImportExport = {
  exportToJSON,
  exportToHTML,
  generateJSON: exportToJSON, // 提供別名以符合 UI 呼叫
  generateHTML: exportToHTML, // 提供別名以符合 UI 呼叫
  importFromJSON,
  importFromHTML,
  getExportStats
};
