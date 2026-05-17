// popup.js - 主彈出視窗邏輯

/**
 * 打開功能頁面（新分頁）
 */
function openPage(pageName) {
  chrome.runtime.sendMessage({ action: 'openPage', page: `pages/${pageName}` });
  window.close();
}

/**
 * 載入並顯示統計資訊
 */
async function loadStats() {
  try {
    const tree = await window.BookmarkUtils.getBookmarkTree();
    const all = window.BookmarkUtils.getAllBookmarks(tree);

    document.getElementById('stat-total').textContent = all.length;

    // 計算重複數（快速用 URL 比對）
    const dupeGroups = window.DuplicateChecker.findDuplicates(all, 'url');
    const dupeCount = dupeGroups.reduce((s, g) => s + g.items.length - 1, 0);
    document.getElementById('stat-dupes').textContent = dupeCount;

    // 回收站數量
    const trash = await window.TrashManager.getTrashItems();
    document.getElementById('stat-trash').textContent = trash.length;

    // 垃圾桶 badge
    if (trash.length > 0) {
      const badge = document.getElementById('trash-badge');
      badge.textContent = trash.length;
      badge.style.display = 'inline-block';
    }

    // 失效連結：從快取讀取（不實時掃描）
    const cached = await new Promise(resolve => {
      chrome.storage.local.get('lastDeadCount', d => resolve(d.lastDeadCount));
    });
    document.getElementById('stat-dead').textContent = cached !== undefined ? cached : '—';

    document.getElementById('footer-status').textContent =
      `書籤總計 ${all.length} 個，${dupeCount > 0 ? '有 ' + dupeCount + ' 個重複' : '無重複'}`;
  } catch (e) {
    document.getElementById('footer-status').textContent = '載入中...';
  }
}

/**
 * 快速掃描重複書籤
 */
async function quickScan() {
  // 顯示掃描覆蓋層
  const overlay = document.createElement('div');
  overlay.className = 'scan-result';
  overlay.innerHTML = `
    <div class="scan-spinner"></div>
    <div class="scan-label">正在掃描重複書籤...</div>
  `;
  document.body.appendChild(overlay);

  try {
    const tree = await window.BookmarkUtils.getBookmarkTree();
    const all = window.BookmarkUtils.getAllBookmarks(tree);
    const groups = window.DuplicateChecker.findDuplicates(all, 'url');
    const { totalGroups, totalDuplicates } = window.DuplicateChecker.getDuplicateStats(groups);

    overlay.innerHTML = '';

    if (totalGroups === 0) {
      const container = document.createElement('div');
      container.style.textAlign = 'center';
      container.innerHTML = `
        <div style="font-size:3rem">✅</div>
        <div style="font-size:1rem;font-weight:700;color:var(--success)">沒有重複書籤！</div>
        <div style="font-size:0.875rem;color:var(--text-secondary);text-align:center;margin-bottom:16px">
          共掃描 ${all.length} 個書籤，全部正常。
        </div>
      `;
      
      const actions = document.createElement('div');
      actions.className = 'scan-actions';
      
      const btnClose = document.createElement('button');
      btnClose.className = 'scan-btn scan-btn-ghost';
      btnClose.textContent = '關閉';
      btnClose.onclick = () => overlay.remove();
      
      const btnDead = document.createElement('button');
      btnDead.className = 'scan-btn scan-btn-primary';
      btnDead.textContent = '掃描失效連結';
      btnDead.onclick = () => openPage('deadlinks.html');
      
      actions.appendChild(btnClose);
      actions.appendChild(btnDead);
      container.appendChild(actions);
      overlay.appendChild(container);
    } else {
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.alignItems = 'center';
      
      // 顯示前3個重複群組
      const previewItems = groups.slice(0, 3).map(g => `
        <div class="scan-result-item">
          <div style="flex:1;min-width:0">
            <div style="font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(g.items[0]?.title || g.key)}
            </div>
            <div style="font-size:0.7rem;color:var(--text-muted)">${g.items.length} 個重複</div>
          </div>
          <span style="color:var(--danger-light);font-size:0.75rem;flex-shrink:0">可刪 ${g.items.length - 1} 個</span>
        </div>
      `).join('');

      container.innerHTML = `
        <div style="font-size:2rem">🔍</div>
        <div style="font-weight:700;font-size:0.95rem">發現 ${totalGroups} 組重複書籤</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);text-align:center;margin-bottom:12px">
          共 ${totalDuplicates} 個書籤可以清理
        </div>
        <div class="scan-results-list" style="width:100%;margin-bottom:16px">${previewItems}${groups.length > 3 ? `
          <div class="scan-result-item" style="justify-content:center;color:var(--text-muted);font-size:0.78rem">
            還有 ${groups.length - 3} 個群組...
          </div>` : ''}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'scan-actions';
      actions.style.width = '100%';
      
      const btnClose = document.createElement('button');
      btnClose.className = 'scan-btn scan-btn-ghost';
      btnClose.textContent = '關閉';
      btnClose.onclick = () => overlay.remove();
      
      const btnGo = document.createElement('button');
      btnGo.className = 'scan-btn scan-btn-primary';
      btnGo.textContent = '前往清理';
      btnGo.onclick = () => openPage('duplicates.html');
      
      actions.appendChild(btnClose);
      actions.appendChild(btnGo);
      container.appendChild(actions);
      overlay.appendChild(container);
    }
  } catch (e) {
    overlay.innerHTML = `
      <div style="font-size:2rem">❌</div>
      <div style="color:var(--danger-light)">掃描失敗</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px">${e.message}</div>
    `;
    const btnClose = document.createElement('button');
    btnClose.className = 'scan-btn scan-btn-ghost';
    btnClose.textContent = '關閉';
    btnClose.onclick = () => overlay.remove();
    overlay.appendChild(btnClose);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', () => {
  // 載入統計
  loadStats();

  // 功能卡片事件
  document.getElementById('btn-duplicates').addEventListener('click', () => openPage('duplicates.html'));
  document.getElementById('btn-deadlinks').addEventListener('click', () => openPage('deadlinks.html'));
  document.getElementById('btn-trash').addEventListener('click', () => openPage('trash.html'));
  document.getElementById('btn-import-export').addEventListener('click', () => openPage('import-export.html'));
  document.getElementById('btn-settings').addEventListener('click', () => openPage('settings.html'));
  document.getElementById('btn-quick-scan').addEventListener('click', quickScan);
});
