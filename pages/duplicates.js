// ---- 側邊欄 ----
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
      <a class="nav-item ${item.page === 'duplicates.html' ? 'active' : ''}"
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

// ---- 狀態 ----
let duplicateGroups = [];
let selectedItems = new Set(); // 格式: `${groupIndex}-${itemIndex}`
let allBookmarks = [];
let currentMode = 'url';
let selectedFolderFilter = '';

// ---- 初始化 ----
async function init() {
  buildSidebar();
  window.UIUtils.bindThemeToggle();
  await loadFolders();

  const settings = await window.BookmarkUtils.getSettings();
  document.getElementById('mode-select').value = settings.duplicateMode || 'url';

  document.getElementById('btn-check').addEventListener('click', runCheck);
  document.getElementById('select-all').addEventListener('change', toggleSelectAll);
  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);
  document.getElementById('btn-keep-newest').addEventListener('click', () => autoSelect('newest'));
  document.getElementById('btn-keep-oldest').addEventListener('click', () => autoSelect('oldest'));

  // 🎨 客製化資料夾分類選取監聽器 (支援紅色數量字體)
  const trigger = document.getElementById('select-by-folder-trigger');
  const dropdown = document.getElementById('select-by-folder-dropdown');

  if (trigger && dropdown) {
    // 點擊 trigger 切換展開/收合
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== 'none';
      dropdown.style.display = isOpen ? 'none' : 'flex';
      trigger.classList.toggle('active', !isOpen);
    });

    // 阻止下拉選單內部的點擊事件冒泡
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 點擊外部關閉
    document.addEventListener('click', () => {
      dropdown.style.display = 'none';
      trigger.classList.remove('active');
    });

    // 選項點擊事件委派
    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.select-item');
      if (item) {
        const val = item.dataset.value;
        handleFolderSelectChange(val);
        dropdown.style.display = 'none';
        trigger.classList.remove('active');
      }
    });
  }

  // 事件委派處理動態生成的元素
  document.getElementById('results-container').addEventListener('click', handleResultsClick);
  document.getElementById('results-container').addEventListener('change', handleResultsChange);

  // 載入上次檢測的快取結果，保留檢查狀態！
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
  } catch (e) {
    console.error('載入資料夾失敗', e);
  }
}

async function runCheck() {
  const btn = document.getElementById('btn-check');
  btn.disabled = true;
  btn.innerHTML = window.UIUtils.createSpinner(14).outerHTML + ' 檢測中...';

  selectedItems.clear();
  selectedFolderFilter = ''; // 重置選取的資料夾篩選器
  const selectAllCb = document.getElementById('select-all');
  if (selectAllCb) selectAllCb.checked = false;
  updateDeleteButton();

  try {
    const tree = await window.BookmarkUtils.getBookmarkTree();
    allBookmarks = window.BookmarkUtils.getAllBookmarks(tree);

    // 資料夾篩選
    const folderId = document.getElementById('folder-filter').value;
    let filtered = allBookmarks;
    if (folderId) {
      filtered = allBookmarks.filter(bm => {
        return isInFolder(bm, folderId, tree);
      });
    }

    currentMode = document.getElementById('mode-select').value;
    duplicateGroups = window.DuplicateChecker.findDuplicates(filtered, currentMode);

    renderResults();
    updateStats();

    // 🎵 播放檢測成功音效
    window.UIUtils.playSuccessSound();
    await saveCache(); // 儲存快取！

  } catch (e) {
    window.UIUtils.showToast('檢測失敗：' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🔍</span> 開始檢測';
  }
}

function isInFolder(bookmark, folderId, tree) {
  function findPath(nodes, targetId, path = []) {
    for (const node of nodes) {
      if (node.id === targetId) return path;
      if (node.children) {
        const found = findPath(node.children, targetId, [...path, node.id]);
        if (found) return found;
      }
    }
    return null;
  }

  const folderPath = findPath(tree, folderId, []);
  if (!folderPath) return false;

  function bookmarkInSubtree(nodes, bmId) {
    for (const node of nodes) {
      if (node.id === bmId) return true;
      if (node.children && bookmarkInSubtree(node.children, bmId)) return true;
    }
    return false;
  }

  function getSubtree(nodes, fId) {
    for (const node of nodes) {
      if (node.id === fId) return node;
      if (node.children) {
        const found = getSubtree(node.children, fId);
        if (found) return found;
      }
    }
    return null;
  }

  const subtree = getSubtree(tree, folderId);
  return subtree ? bookmarkInSubtree([subtree], bookmark.id) : false;
}

function updateStats() {
  const { totalGroups, totalDuplicates, totalBookmarks } = window.DuplicateChecker.getDuplicateStats(duplicateGroups);

  document.getElementById('stat-groups').textContent = totalGroups;
  document.getElementById('stat-dupes').textContent = totalDuplicates;
  document.getElementById('stat-total').textContent = totalBookmarks;

  document.getElementById('stats-row').style.display = totalGroups > 0 ? 'grid' : 'none';
  document.getElementById('toolbar-row').style.display = totalGroups > 0 ? 'block' : 'none';
}

function renderResults() {
  const container = document.getElementById('results-container');

  if (duplicateGroups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">沒有找到重複書籤</div>
        <div class="empty-desc">您的書籤庫整理得非常整齊！</div>
      </div>
    `;
    return;
  }

  container.innerHTML = duplicateGroups.map((group, gi) => {
    let visibleCount = 0;
    const itemsHtml = group.items.map((item, ii) => {
      const itemPath = item.path || '根目錄';
      const isMatch = !selectedFolderFilter || 
                      (itemPath === selectedFolderFilter) || 
                      (selectedFolderFilter !== '根目錄' && itemPath.startsWith(selectedFolderFilter + ' › '));
      if (isMatch) visibleCount++;
      return renderDupItem(item, gi, ii, isMatch);
    }).join('');

    return `
      <div class="group-card" id="group-${gi}" style="${visibleCount > 0 ? '' : 'display:none !important;'}">
        <div class="group-header" data-gi="${gi}">
          <span class="collapse-arrow" id="arrow-${gi}">▶</span>
          <span class="group-key">${escapeHtml(group.key)}</span>
          <span class="badge badge-danger">${group.items.length} 個重複</span>
          <span class="group-count">可刪 ${group.items.length - 1} 個</span>
        </div>
        <div class="group-body" id="body-${gi}">
          ${itemsHtml}
        </div>
      </div>
    `;
  }).join('');

  updateFolderSelect();
}

function renderDupItem(item, gi, ii, isVisible = true) {
  const isFirst = ii === 0;
  const key = `${gi}-${ii}`;
  const isSelected = selectedItems.has(key);
  const addedDate = window.BookmarkUtils.formatDate(item.dateAdded);
  const relTime = window.BookmarkUtils.formatRelativeTime(item.dateAdded);

  return `
    <div class="dup-item ${isFirst ? 'keep' : ''}" id="item-${gi}-${ii}" style="${isVisible ? '' : 'display:none !important;'}">
      <label class="checkbox-custom">
        <input type="checkbox" class="item-check" data-key="${key}"
          ${isFirst ? 'disabled title="預設保留最新版"' : ''}
          ${isSelected ? 'checked' : ''}>
        <span></span>
      </label>
      <img src="https://www.google.com/s2/favicons?domain=${getDomain(item.url)}&sz=16"
           width="16" height="16" style="border-radius:3px;flex-shrink:0"
           onerror="this.style.display='none'">
      <div class="dup-info">
        <div class="dup-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="dup-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
        <div class="dup-meta">
          <span class="badge badge-muted" style="font-size:0.7rem">${item.path || '根目錄'}</span>
          <span style="color:var(--text-muted);font-size:0.75rem">${addedDate} ${relTime ? '（' + relTime + '）' : ''}</span>
          ${isFirst ? '<span class="badge badge-success">保留</span>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm btn-open-url" data-url="${escapeHtml(item.url)}" title="開啟連結">↗</button>
        <button class="btn btn-ghost btn-sm btn-edit-bookmark" data-bm-id="${item.id}" data-gi="${gi}" data-ii="${ii}" title="編輯">✏️</button>
        ${!isFirst ? `<button class="btn btn-danger btn-sm btn-delete-single" data-bm-id="${item.id}" data-gi="${gi}" data-ii="${ii}" title="刪除">🗑️</button>` : ''}
      </div>
    </div>
  `;
}

function getDomain(url) {
  try { return new URL(url).host; } catch { return ''; }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function handleResultsClick(e) {
  const header = e.target.closest('.group-header');
  if (header) {
    toggleGroup(parseInt(header.dataset.gi));
    return;
  }

  const btnOpen = e.target.closest('.btn-open-url');
  if (btnOpen) {
    openUrl(btnOpen.dataset.url);
    return;
  }

  const btnDel = e.target.closest('.btn-delete-single');
  if (btnDel) {
    deleteSingle(btnDel.dataset.bmId, parseInt(btnDel.dataset.gi), parseInt(btnDel.dataset.ii));
    return;
  }

  const btnEdit = e.target.closest('.btn-edit-bookmark');
  if (btnEdit) {
    editBookmark(btnEdit.dataset.bmId, parseInt(btnEdit.dataset.gi), parseInt(btnEdit.dataset.ii));
    return;
  }
}

function handleResultsChange(e) {
  if (e.target.classList.contains('item-check')) {
    toggleItem(e.target.dataset.key);
  }
}

function toggleGroup(gi) {
  const body = document.getElementById(`body-${gi}`);
  const arrow = document.getElementById(`arrow-${gi}`);
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  arrow.textContent = isOpen ? '▶' : '▼';
}

function toggleItem(key) {
  if (selectedItems.has(key)) {
    selectedItems.delete(key);
  } else {
    selectedItems.add(key);
  }
  updateDeleteButton();
}

function toggleSelectAll(e) {
  const checked = e.target.checked;
  document.querySelectorAll('.item-check:not(:disabled)').forEach(cb => {
    const dupItem = cb.closest('.dup-item');
    if (dupItem && (dupItem.style.display === 'none' || dupItem.style.display.includes('none'))) {
      return;
    }
    const key = cb.dataset.key;
    if (checked) {
      selectedItems.add(key);
      cb.checked = true;
    } else {
      selectedItems.delete(key);
      cb.checked = false;
    }
  });
  updateDeleteButton();
}

function autoSelect(mode) {
  selectedItems.clear();
  document.querySelectorAll('.item-check').forEach(cb => cb.checked = false);

  duplicateGroups.forEach((group, gi) => {
    let toDelete;
    if (mode === 'newest') {
      const sorted = group.items.map((item, ii) => ({ item, ii }))
        .sort((a, b) => (b.item.dateAdded || 0) - (a.item.dateAdded || 0));
      toDelete = sorted.slice(1).map(x => x.ii);
    } else {
      const sorted = group.items.map((item, ii) => ({ item, ii }))
        .sort((a, b) => (a.item.dateAdded || 0) - (b.item.dateAdded || 0));
      toDelete = sorted.slice(1).map(x => x.ii);
    }

    toDelete.forEach(ii => {
      const key = `${gi}-${ii}`;
      selectedItems.add(key);
      const cb = document.querySelector(`.item-check[data-key="${key}"]`);
      if (cb) cb.checked = true;
    });
  });

  updateDeleteButton();
  window.UIUtils.showToast(`已選取 ${selectedItems.size} 個建議刪除項目`, 'info');
}

function updateDeleteButton() {
  const count = selectedItems.size;
  document.getElementById('delete-count').textContent = count;
  document.getElementById('btn-delete-selected').disabled = count === 0;
  document.getElementById('selected-count').textContent =
    count > 0 ? `已選取 ${count} 項` : '';
}

async function deleteSelected() {
  if (selectedItems.size === 0) return;

  const deleteMode = await window.UIUtils.showDeleteConfirm(
    '刪除選取的書籤',
    `確定要刪除選取的 <strong>${selectedItems.size}</strong> 個重複書籤嗎？`
  );

  if (deleteMode === 'cancel') return;

  const toDelete = [];
  selectedItems.forEach(key => {
    const [gi, ii] = key.split('-').map(Number);
    if (duplicateGroups[gi] && duplicateGroups[gi].items[ii]) {
      toDelete.push(duplicateGroups[gi].items[ii]);
    }
  });

  try {
    if (deleteMode === 'trash') {
      await window.TrashManager.moveToTrash(toDelete, 'duplicate');
      window.UIUtils.showToast(`✅ 已將 ${toDelete.length} 個書籤移到回收站`, 'success');
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
    await runCheck();
  } catch (e) {
    window.UIUtils.showToast('刪除失敗：' + e.message, 'error');
  }
}

async function deleteSingle(bookmarkId, gi, ii) {
  const item = duplicateGroups[gi]?.items[ii];
  if (!item) return;

  const deleteMode = await window.UIUtils.showDeleteConfirm(
    '刪除書籤',
    `確定要刪除「${escapeHtml(item.title)}」嗎？`
  );

  if (deleteMode === 'cancel') return;

  try {
    if (deleteMode === 'trash') {
      await window.TrashManager.moveToTrash(item, 'duplicate');
      window.UIUtils.showToast('已移到回收站', 'success');
    } else {
      // 永久直接刪除
      await window.BookmarkUtils.removeBookmark(item.id);
      window.UIUtils.showToast('書籤已永久直接刪除', 'info');
    }
    await runCheck();
  } catch (e) {
    window.UIUtils.showToast('刪除失敗：' + e.message, 'error');
  }
}

function openUrl(url) {
  chrome.tabs.create({ url });
}

async function editBookmark(id, gi, ii) {
  const item = duplicateGroups[gi]?.items[ii];
  if (!item) return;

  const result = await window.UIUtils.showEditBookmarkModal(item.title, item.url);
  if (!result) return;

  try {
    await window.BookmarkUtils.updateBookmark(id, {
      title: result.title,
      url: result.url
    });

    window.UIUtils.showToast('書籤已更新', 'success');
    await runCheck();
  } catch (e) {
    window.UIUtils.showToast('更新失敗：' + e.message, 'error');
  }
}

async function saveCache() {
  try {
    await chrome.storage.local.set({ 'cache_duplicate_results': duplicateGroups });
  } catch (e) {
    console.warn('儲存重複書籤快取失敗：', e);
  }
}

async function loadCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['cache_duplicate_results'], async (data) => {
      if (data.cache_duplicate_results && data.cache_duplicate_results.length > 0) {
        duplicateGroups = data.cache_duplicate_results;
        
        try {
          // 重新獲取實體書籤樹，進行快取對齊過濾
          const tree = await window.BookmarkUtils.getBookmarkTree();
          const bookmarks = window.BookmarkUtils.getAllBookmarks(tree);
          const existingIds = new Set(bookmarks.map(b => b.id));
          
          // 過濾掉實體中已不存在的書籤項目
          duplicateGroups = duplicateGroups.map(group => {
            group.items = group.items.filter(item => existingIds.has(item.id));
            return group;
          }).filter(group => group.items.length > 1);
          
          if (duplicateGroups.length > 0) {
            renderResults();
            updateStats();
            document.getElementById('check-status').textContent = `📅 載入上次檢測的結果（發現 ${duplicateGroups.length} 組重複）`;
          }
        } catch (e) {
          console.warn('載入重複書籤快取對齊失敗：', e);
        }
      }
      resolve();
    });
  });
}

function updateFolderSelect() {
  const triggerText = document.getElementById('select-by-folder-text');
  const dropdown = document.getElementById('select-by-folder-dropdown');
  if (!dropdown) return;

  const pathCounts = new Map();
  duplicateGroups.forEach(group => {
    group.items.forEach((item, ii) => {
      // 收集非首項（非保留項）的所有重複書籤所屬資料夾並計數
      if (ii > 0) {
        const path = item.path || '根目錄';
        pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
      }
    });
  });

  const sortedPaths = Array.from(pathCounts.keys()).sort();

  let html = `
    <div class="select-item ${selectedFolderFilter === '' ? 'selected' : ''}" data-value="">
      <span>📂 顯示全部資料夾</span>
    </div>
  `;

  sortedPaths.forEach(p => {
    const count = pathCounts.get(p);
    const isSelected = p === selectedFolderFilter;
    html += `
      <div class="select-item ${isSelected ? 'selected' : ''}" data-value="${escapeHtml(p)}">
        <span class="item-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; margin-right: 8px;" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
        <span class="item-count" style="color: var(--danger); font-weight: bold; font-size: 0.75rem; flex-shrink: 0;">(${count})</span>
      </div>
    `;
  });

  dropdown.innerHTML = html;

  if (triggerText) {
    if (selectedFolderFilter) {
      triggerText.textContent = `📂 ${selectedFolderFilter}`;
    } else {
      triggerText.textContent = '📂 按資料夾選取...';
    }
  }
}

function handleFolderSelectChange(folderVal) {
  selectedFolderFilter = folderVal;
  
  // 清空當前選取，因為切換了篩選資料夾
  selectedItems.clear();
  const selectAllCb = document.getElementById('select-all');
  if (selectAllCb) selectAllCb.checked = false;
  updateDeleteButton();

  // 重新渲染以套用 CSS 隱藏過濾
  renderResults();
  
  // 重新生成選單以對齊選中狀態
  updateFolderSelect();
}

init();
