const NAV_ITEMS = [
  { page: 'duplicates.html', icon: '🔍', label: '重複書籤' },
  { page: 'deadlinks.html', icon: '💀', label: '失效連結' },
  { page: 'trash.html', icon: '🗑️', label: '回收站' },
  { page: 'import-export.html', icon: '📦', label: '匯入匯出' },
  { page: 'settings.html', icon: '⚙️', label: '設定' }
];

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon">🔖</div>
      <h1>書籤檢查<br>小幫手</h1>
    </div>
    ${NAV_ITEMS.map(item => `
      <a class="nav-item ${item.page === 'deadlinks.html' ? 'active' : ''}"
         href="${item.page}" data-page="${item.page}">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
      </a>
    `).join('')}
    <div style="margin-top: auto; padding: var(--space-md); border-top: 1px solid var(--border);">
      <button class="btn btn-ghost btn-sm" id="btn-theme-toggle" style="width: 100%; justify-content: center; gap: 8px;">
        <span id="theme-toggle-icon">☀️</span>
        <span id="theme-toggle-text">淺色主題</span>
      </button>
    </div>
  `;
}

let allResults = [];
let bookmarkMap = {};
let currentFilter = 'all';
let selectedItems = new Set();

async function init() {
  buildSidebar();
  window.UIUtils.bindThemeToggle();
  await loadFolders();

  const settings = await window.BookmarkUtils.getSettings();
  document.getElementById('concurrent').value = settings.concurrent || 5;
  document.getElementById('timeout').value = (settings.timeout || 10000) / 1000;

  document.getElementById('btn-start').addEventListener('click', startCheck);
  document.getElementById('btn-stop').addEventListener('click', stopCheck);
  document.getElementById('select-all').addEventListener('change', toggleSelectAll);
  document.getElementById('btn-del-selected').addEventListener('click', deleteSelected);
  
  const btnRecheckSel = document.getElementById('btn-recheck-selected');
  if (btnRecheckSel) btnRecheckSel.addEventListener('click', recheckSelected);
  
  const btnRecheckAll = document.getElementById('btn-recheck-all');
  if (btnRecheckAll) btnRecheckAll.addEventListener('click', recheckAll);

  document.getElementById('search-input').addEventListener('input', window.UIUtils.debounce(renderList, 300));

  document.getElementById('stats-grid').addEventListener('click', (e) => {
    const tab = e.target.closest('.mini-stat');
    if (tab) {
      currentFilter = tab.dataset.filter;
      document.querySelectorAll('.mini-stat').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedItems.clear();
      renderList();
      updateSelCount();
    }
  });

  document.getElementById('list-body').addEventListener('click', handleListClick);
  document.getElementById('list-body').addEventListener('change', handleListChange);

  // 載入上次檢查的快取結果，保留檢查狀態！
  await loadCache();
}

async function loadFolders() {
  try {
    const tree = await window.BookmarkUtils.getBookmarkTree();
    const folders = window.BookmarkUtils.getFolderTree(tree);
    const select = document.getElementById('folder-filter');
    folders.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = '　'.repeat(f.depth) + f.title + ` (${f.childCount})`;
      select.appendChild(opt);
    });
  } catch (e) {}
}

async function startCheck() {
  const concurrent = parseInt(document.getElementById('concurrent').value) || 5;
  const timeout = (parseInt(document.getElementById('timeout').value) || 10) * 1000;

  allResults = [];
  selectedItems.clear();
  bookmarkMap = {};

  // 開始檢查時重設篩選為「全部」
  currentFilter = 'all';
  document.querySelectorAll('.mini-stat').forEach(t => t.classList.remove('active'));
  const allStat = document.querySelector('.mini-stat[data-filter="all"]');
  if (allStat) allStat.classList.add('active');

  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  document.getElementById('check-status').textContent = '正在載入書籤...';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('progress-section').classList.add('visible');
  document.getElementById('stats-grid').style.display = 'none';
  document.getElementById('results-list').style.display = 'none';

  try {
    const tree = await window.BookmarkUtils.getBookmarkTree();
    let bookmarks = window.BookmarkUtils.getAllBookmarks(tree);

    const folderId = document.getElementById('folder-filter').value;
    if (folderId) {
      const folderTitle = document.querySelector(`#folder-filter option[value="${folderId}"]`)?.textContent?.trim();
      if (folderTitle) {
        bookmarks = bookmarks.filter(bm => bm.path.includes(folderTitle.replace(/\s*\(\d+\)$/, '').trim()));
      }
    }

    bookmarks.forEach(bm => { bookmarkMap[bm.url] = bm; });

    const urls = bookmarks.map(bm => bm.url);
    document.getElementById('check-status').textContent = `共 ${urls.length} 個書籤`;

    window.LinkChecker.startCheck(urls, {
      concurrent,
      timeout,
      onProgress: (progress) => {
        const pct = Math.round((progress.completed / progress.total) * 100);
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('progress-text').textContent = `${progress.completed} / ${progress.total} (${pct}%)`;
        document.getElementById('checking-url').textContent = '正在檢查：' + (progress.latest?.url || '');

        allResults = progress.results;
        updateStats(allResults);
        renderList();
      },
      onComplete: (results) => {
        allResults = results;
        document.getElementById('btn-start').disabled = false;
        document.getElementById('btn-stop').disabled = true;
        document.getElementById('check-status').textContent = `✅ 檢查完成（${results.length} 個）`;
        document.getElementById('checking-url').textContent = '檢查完成！';

        // 檢查完成時自動切換至「失效」統計按鈕卡片
        currentFilter = 'dead';
        document.querySelectorAll('.mini-stat').forEach(t => t.classList.remove('active'));
        const deadStat = document.querySelector('.mini-stat[data-filter="dead"]');
        if (deadStat) deadStat.classList.add('active');

        updateStats(results);
        renderList();

        document.getElementById('stats-grid').style.display = 'grid';
        document.getElementById('results-list').style.display = 'block';

        const dead = window.LinkChecker.getResultStats(results).dead;
        window.UIUtils.showToast(`檢查完成，發現 ${dead} 個失效連結`, dead > 0 ? 'warning' : 'success');

        // 🎵 播放檢測成功音效
        window.UIUtils.playSuccessSound();
        saveCache();
      }
    });

  } catch (e) {
    window.UIUtils.showToast('啟動失敗：' + e.message, 'error');
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-stop').disabled = true;
  }
}

function stopCheck() {
  window.LinkChecker.stopCheck();
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;
  document.getElementById('check-status').textContent = '已停止';
  window.UIUtils.showToast('已停止檢查', 'info');
  saveCache();
}

function updateStats(results) {
  const s = window.LinkChecker.getResultStats(results);
  document.getElementById('s-total').textContent = s.total;
  document.getElementById('s-ok').textContent = s.ok;
  document.getElementById('s-dead').textContent = s.dead;
  document.getElementById('s-redirect').textContent = s.redirect;
  document.getElementById('s-timeout').textContent = s.timeout;
}

function renderList() {
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  let filtered = window.LinkChecker.filterResults(allResults, currentFilter);

  if (searchVal) {
    filtered = filtered.filter(r => {
      const bm = bookmarkMap[r.url];
      return r.url.toLowerCase().includes(searchVal) ||
        (bm && bm.title.toLowerCase().includes(searchVal));
    });
  }

  const body = document.getElementById('list-body');
  if (filtered.length === 0) {
    body.innerHTML = `<div class="empty-state" style="padding:40px 20px">
      <div class="empty-icon">🎉</div>
      <div class="empty-title">${currentFilter === 'dead' ? '沒有失效連結！' : '沒有符合條件的結果'}</div>
    </div>`;
    return;
  }

  body.innerHTML = filtered.slice(0, 500).map(r => {
    const bm = bookmarkMap[r.url] || { title: r.url, path: '' };
    const { label, type } = window.LinkChecker.getStatusLabel(r);
    const chipClass = {ok:'chip-ok',error:'chip-error',redirect:'chip-redirect',timeout:'chip-timeout'}[type] || 'chip-timeout';

    return `
      <div class="link-item">
        <label class="checkbox-custom">
          <input type="checkbox" class="item-check" data-url="${escapeHtml(r.url)}" ${selectedItems.has(r.url) ? 'checked' : ''}>
          <span></span>
        </label>
        <img src="https://www.google.com/s2/favicons?domain=${getDomain(r.url)}&sz=16"
             width="16" height="16" style="border-radius:3px;flex-shrink:0"
             onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.9rem">
            ${escapeHtml(bm.title)}
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escapeHtml(r.url)}
          </div>
          ${bm.path ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">📁 ${escapeHtml(bm.path)}</div>` : ''}
          ${r.redirected ? `<div style="font-size:0.72rem;color:var(--warning)">↪ 重新導向至：${escapeHtml(r.finalUrl || '')}</div>` : ''}
        </div>
        <span class="status-chip ${chipClass}">${label}</span>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm btn-open" data-url="${escapeHtml(r.url)}" title="開啟">↗</button>
          <button class="btn btn-ghost btn-sm btn-edit-bookmark" data-bm-id="${bm.id}" title="編輯">✏️</button>
          <button class="btn btn-ghost btn-sm btn-recheck" data-url="${escapeHtml(r.url)}" title="重新檢查">🔄</button>
          ${bm.id ? `<button class="btn btn-danger btn-sm btn-delete" data-id="${bm.id}" data-url="${escapeHtml(r.url)}" title="刪除">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  if (filtered.length > 500) {
    body.innerHTML += `<div style="text-align:center;padding:16px;color:var(--text-muted)">顯示前 500 筆（共 ${filtered.length} 筆）</div>`;
  }

  // 更新「重新檢查全部」按鈕的啟用狀態
  const btnRecheckAll = document.getElementById('btn-recheck-all');
  if (btnRecheckAll) btnRecheckAll.disabled = allResults.length === 0;
}

function getDomain(url) { try { return new URL(url).host; } catch { return ''; } }
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function handleListClick(e) {
  const btnOpen = e.target.closest('.btn-open');
  if (btnOpen) {
    window.open(btnOpen.dataset.url);
    return;
  }
  const btnEdit = e.target.closest('.btn-edit-bookmark');
  if (btnEdit) {
    editBookmark(btnEdit.dataset.bmId);
    return;
  }
  const btnRecheck = e.target.closest('.btn-recheck');
  if (btnRecheck) {
    recheckUrl(btnRecheck.dataset.url, btnRecheck);
    return;
  }
  const btnDelete = e.target.closest('.btn-delete');
  if (btnDelete) {
    deleteSingle(btnDelete.dataset.id, btnDelete.dataset.url);
    return;
  }
}

function handleListChange(e) {
  if (e.target.classList.contains('item-check')) {
    const url = e.target.dataset.url;
    if (selectedItems.has(url)) selectedItems.delete(url);
    else selectedItems.add(url);
    updateSelCount();
  }
}

function toggleSelectAll(e) {
  document.querySelectorAll('.item-check').forEach(cb => {
    cb.checked = e.target.checked;
    if (e.target.checked) selectedItems.add(cb.dataset.url);
    else selectedItems.delete(cb.dataset.url);
  });
  updateSelCount();
}

function updateSelCount() {
  const count = selectedItems.size;
  document.getElementById('sel-count').textContent = count > 0 ? `已選取 ${count}` : '';
  document.getElementById('btn-del-selected').disabled = count === 0;

  const btnRecheckSel = document.getElementById('btn-recheck-selected');
  if (btnRecheckSel) btnRecheckSel.disabled = count === 0;
}

async function recheckSelected() {
  if (selectedItems.size === 0) return;
  const urls = Array.from(selectedItems);
  await performBatchRecheck(urls);
}

async function recheckAll() {
  if (allResults.length === 0) return;
  // 智慧過濾：只篩選出目前狀態為失效、錯誤、逾時的連結進行重新檢查
  const deadResults = allResults.filter(r => window.LinkChecker.isDeadLink(r));
  if (deadResults.length === 0) {
    window.UIUtils.showToast('目前沒有任何失效或出錯的連結需要重新檢查！', 'info');
    return;
  }
  const urls = deadResults.map(r => r.url);
  await performBatchRecheck(urls);
}

async function performBatchRecheck(urls) {
  if (urls.length === 0) return;

  const concurrent = parseInt(document.getElementById('concurrent').value) || 5;
  const timeout = (parseInt(document.getElementById('timeout').value) || 10) * 1000;

  // 停用所有按鈕以防重複點擊
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;
  document.getElementById('btn-recheck-selected').disabled = true;
  document.getElementById('btn-recheck-all').disabled = true;
  document.getElementById('btn-del-selected').disabled = true;

  // 1. 顯示檢查中與進度，並在重檢期間隱藏列表，使用戶聚焦於進度且消除渲染損耗
  document.getElementById('check-status').textContent = `正在重新檢查 ${urls.length} 個連結...`;
  document.getElementById('progress-section').classList.add('visible');
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-text').textContent = `0 / ${urls.length}`;
  document.getElementById('checking-url').textContent = '正在準備重檢任務...';

  // 隱藏舊面板
  document.getElementById('stats-grid').style.display = 'none';
  document.getElementById('results-list').style.display = 'none';

  window.LinkChecker.startCheck(urls, {
    concurrent,
    timeout,
    onProgress: (progress) => {
      const pct = Math.round((progress.completed / progress.total) * 100);
      document.getElementById('progress-fill').style.width = pct + '%';
      document.getElementById('progress-text').textContent = `${progress.completed} / ${progress.total} (${pct}%)`;
      document.getElementById('checking-url').textContent = '正在重新檢查：' + (progress.latest?.url || '');

      // 將這一批最新的檢測結果，merge/更新到全域 of allResults 中！
      progress.results.forEach(res => {
        const idx = allResults.findIndex(r => r.url === res.url);
        if (idx !== -1) {
          allResults[idx] = res;
        }
      });
      
      // 注意：此處我們不在 progress 每次回調時調用 renderList()，因為 results-list 是隱藏的，
      // 這大幅度提升了大批量重檢時的並發效能！
    },
    onComplete: async (results) => {
      // 合併最後結果
      results.forEach(res => {
        const idx = allResults.findIndex(r => r.url === res.url);
        if (idx !== -1) {
          allResults[idx] = res;
        }
      });

      document.getElementById('btn-start').disabled = false;
      document.getElementById('btn-stop').disabled = true;
      document.getElementById('btn-recheck-all').disabled = false;

      document.getElementById('check-status').textContent = `✅ 重新檢查完成（${results.length} 個）`;
      document.getElementById('checking-url').textContent = '重新檢查完成！';

      selectedItems.clear();

      // 2. 重新檢查完成，隱藏進度條，高階展現重新繪製後的統計與列表！
      document.getElementById('progress-section').classList.remove('visible');
      document.getElementById('stats-grid').style.display = 'grid';
      document.getElementById('results-list').style.display = 'block';

      updateStats(allResults);
      renderList();
      updateSelCount();

      window.UIUtils.showToast(`批量重新檢查完成！`, 'success');
      window.UIUtils.playSuccessSound();
      await saveCache(); // 儲存快取！
    }
  });
}

async function deleteSelected() {
  if (selectedItems.size === 0) return;

  const deleteMode = await window.UIUtils.showDeleteConfirm(
    '批量刪除失效書籤',
    `確定要刪除選取的 <strong>${selectedItems.size}</strong> 個失效書籤嗎？`
  );
  if (deleteMode === 'cancel') return;

  const toDelete = [];
  selectedItems.forEach(url => {
    const bm = bookmarkMap[url];
    if (bm) toDelete.push(bm);
  });

  try {
    if (deleteMode === 'trash') {
      await window.TrashManager.moveToTrash(toDelete, 'dead');
      window.UIUtils.showToast(`已將 ${toDelete.length} 個書籤移到回收站`, 'success');
    } else {
      // 永久直接刪除
      for (const bm of toDelete) {
        try {
          await window.BookmarkUtils.removeBookmark(bm.id);
        } catch (e) {
          console.warn(`刪除書籤 ${bm.id} 失敗:`, e);
        }
      }
      window.UIUtils.showToast(`🔥 已永久刪除 ${toDelete.length} 個書籤`, 'info');
    }

    selectedItems.clear();
    const deletedUrls = new Set(toDelete.map(b => b.url));
    allResults = allResults.filter(r => !deletedUrls.has(r.url));
    toDelete.forEach(b => delete bookmarkMap[b.url]);
    renderList();
    updateStats(allResults);
    await saveCache(); // 儲存快取！
  } catch (e) {
    window.UIUtils.showToast('刪除失敗：' + e.message, 'error');
  }
}

async function deleteSingle(id, url) {
  const bm = bookmarkMap[url];
  if (!bm) return;

  const deleteMode = await window.UIUtils.showDeleteConfirm(
    '刪除書籤',
    `確定要刪除「${escapeHtml(bm.title)}」嗎？`
  );
  if (deleteMode === 'cancel') return;

  try {
    if (deleteMode === 'trash') {
      await window.TrashManager.moveToTrash(bm, 'dead');
      window.UIUtils.showToast('已移到回收站', 'success');
    } else {
      // 永久直接刪除
      await window.BookmarkUtils.removeBookmark(bm.id);
      window.UIUtils.showToast('書籤已永久直接刪除', 'info');
    }
    allResults = allResults.filter(r => r.url !== url);
    delete bookmarkMap[url];
    renderList();
    updateStats(allResults);
    await saveCache(); // 儲存快取！
  } catch (e) {
    window.UIUtils.showToast('刪除失敗：' + e.message, 'error');
  }
}

async function editBookmark(bmId) {
  const bm = Object.values(bookmarkMap).find(b => b.id === bmId);
  if (!bm) return;

  const result = await window.UIUtils.showEditBookmarkModal(bm.title, bm.url);
  if (!result) return;

  try {
    await window.BookmarkUtils.updateBookmark(bmId, { title: result.title, url: result.url });
    window.UIUtils.showToast('書籤已更新', 'success');

    const oldUrl = bm.url;
    const newUrl = result.url;

    bm.title = result.title;
    bm.url = newUrl;

    if (oldUrl !== newUrl) {
      delete bookmarkMap[oldUrl];
      bookmarkMap[newUrl] = bm;

      const idx = allResults.findIndex(r => r.url === oldUrl);
      if (idx !== -1) {
        allResults[idx].url = newUrl;
        allResults[idx].redirected = false;
        allResults[idx].finalUrl = '';
      }
    }

    await recheckUrl(newUrl);
  } catch (e) {
    window.UIUtils.showToast('更新失敗', 'error');
  }
}

async function recheckUrl(url, btn) {
  let originalHtml = '';
  if (btn) {
    originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = window.UIUtils.createSpinner(12).outerHTML;
  }

  window.UIUtils.showToast('重新檢查中...', 'info', 1000);
  const timeoutVal = parseInt(document.getElementById('timeout').value) * 1000 || 10000;

  try {
    const result = await window.LinkChecker.checkSingle(url, timeoutVal);

    const idx = allResults.findIndex(r => r.url === url);
    if (idx !== -1) {
      allResults[idx] = result;
      renderList();
      updateStats(allResults);
      // 重新檢查成功播放提示音
      window.UIUtils.playSuccessSound();
      await saveCache(); // 儲存快取！
    }

    // 精準狀態 Toast 反饋
    let statusText = '';
    let toastType = 'success';
    if (result.status === 'ok') {
      statusText = '連結正常！✅';
      toastType = 'success';
    } else if (result.status === 'dead') {
      statusText = '連結依然失效！❌';
      toastType = 'error';
    } else if (result.status === 'redirect') {
      statusText = '連結已重新導向！↪️';
      toastType = 'info';
    } else if (result.status === 'timeout') {
      statusText = '連結連線逾時！⏱️';
      toastType = 'warning';
    }
    window.UIUtils.showToast(`重新檢查完畢：${statusText}`, toastType);
  } catch (e) {
    window.UIUtils.showToast('重新檢查失敗：' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function saveCache() {
  try {
    await chrome.storage.local.set({ 'cache_deadlink_results': allResults });
  } catch (e) {
    console.warn('儲存失效連結快取失敗：', e);
  }
}

async function loadCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cache_deadlink_results'], async (data) => {
      if (data.cache_deadlink_results && data.cache_deadlink_results.length > 0) {
        allResults = data.cache_deadlink_results;
        
        try {
          // 重建 bookmarkMap
          const tree = await window.BookmarkUtils.getBookmarkTree();
          const bookmarks = window.BookmarkUtils.getAllBookmarks(tree);
          bookmarkMap = {};
          bookmarks.forEach(bm => { bookmarkMap[bm.url] = bm; });
          
          // 過濾掉不存在於實體書籤中的網址，以保持完美一致性！
          const existingUrls = new Set(bookmarks.map(b => b.url));
          allResults = allResults.filter(r => existingUrls.has(r.url));
          
          if (allResults.length > 0) {
            // 顯示上次檢查結果的視圖
            document.getElementById('progress-section').classList.remove('visible');
            document.getElementById('stats-grid').style.display = 'grid';
            document.getElementById('results-list').style.display = 'block';
            
            // 預設切換至 'dead' 分類，方便使用者點選直接看結果
            currentFilter = 'dead';
            document.querySelectorAll('.mini-stat').forEach(t => t.classList.remove('active'));
            const deadStat = document.querySelector('.mini-stat[data-filter="dead"]');
            if (deadStat) deadStat.classList.add('active');
            
            updateStats(allResults);
            renderList();
            
            document.getElementById('check-status').textContent = `📅 載入上次檢查的結果（${allResults.length} 個）`;
          }
        } catch (e) {
          console.warn('重建書籤地圖失敗：', e);
        }
      }
      resolve();
    });
  });
}

init();
