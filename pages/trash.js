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
      <a class="nav-item ${item.page === 'trash.html' ? 'active' : ''}"
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

let trashItems = [];
let selectedIds = new Set();
let currentFilter = 'all';

async function init() {
  buildSidebar();
  window.UIUtils.bindThemeToggle();
  
  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    selectedIds.clear();
    const selectAllCb = document.getElementById('select-all');
    if (selectAllCb) selectAllCb.checked = false;
    updateToolbar();
    renderTrash();
  });
  
  document.getElementById('select-all').addEventListener('change', toggleSelectAll);
  document.getElementById('btn-restore-selected').addEventListener('click', restoreSelected);
  document.getElementById('btn-clear-selected').addEventListener('click', clearSelected);
  document.getElementById('btn-clear-all').addEventListener('click', clearAll);
  document.getElementById('search-input').addEventListener('input', window.UIUtils.debounce(renderTrash, 300));
  
  document.getElementById('trash-list').addEventListener('click', handleTrashClick);
  document.getElementById('trash-list').addEventListener('change', handleTrashChange);

  await loadTrash();
}

async function loadTrash() {
  try {
    trashItems = await window.TrashManager.getTrashItems();
    renderTrash();
  } catch (e) {
    window.UIUtils.showToast('載入失敗', 'error');
  }
}

function getFilteredTrashItems() {
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  let filtered = trashItems;

  if (currentFilter !== 'all') {
    filtered = filtered.filter(item => {
      const type = item.trashType || 'unknown';
      return type === currentFilter;
    });
  }

  if (searchVal) {
    filtered = filtered.filter(item => 
      item.title.toLowerCase().includes(searchVal) || 
      item.url.toLowerCase().includes(searchVal)
    );
  }
  return filtered;
}

function updateSelectAllState() {
  const selectAll = document.getElementById('select-all');
  if (!selectAll) return;

  const filtered = getFilteredTrashItems();
  if (filtered.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }

  const allChecked = filtered.every(item => selectedIds.has(item.trashId));
  const someChecked = filtered.some(item => selectedIds.has(item.trashId));

  selectAll.checked = allChecked;
  selectAll.indeterminate = someChecked && !allChecked;
}

function renderTrash() {
  const filtered = getFilteredTrashItems();
  const list = document.getElementById('trash-list');
  const empty = document.getElementById('empty-state');
  const toolbar = document.getElementById('trash-toolbar');

  if (filtered.length === 0) {
    empty.style.display = 'block';
    toolbar.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  toolbar.style.display = 'flex';

  // 按照目錄分組
  const groups = {};
  filtered.forEach(item => {
    const path = item.path || '根目錄';
    if (!groups[path]) {
      groups[path] = [];
    }
    groups[path].push(item);
  });

  list.innerHTML = Object.entries(groups).map(([path, items]) => {
    const allChecked = items.every(item => selectedIds.has(item.trashId));
    const someChecked = items.some(item => selectedIds.has(item.trashId));
    const isIndeterminate = someChecked && !allChecked;

    return `
      <div class="trash-dir-group" data-dir="${escapeHtml(path)}">
        <div class="trash-dir-header">
          <label class="checkbox-custom" style="margin-right: 0;" onclick="event.stopPropagation();">
            <input type="checkbox" class="dir-check" data-dir="${escapeHtml(path)}" ${allChecked ? 'checked' : ''} ${isIndeterminate ? 'data-indeterminate="true"' : ''}>
            <span></span>
          </label>
          <div class="trash-dir-title-wrap">
            <span class="trash-dir-name">📁 ${escapeHtml(path)}</span>
            <span class="trash-dir-count">${items.length}</span>
          </div>
          <span class="trash-dir-toggle">▼</span>
        </div>
        <div class="trash-dir-items">
          ${items.map(item => `
            <div class="trash-item">
              <label class="checkbox-custom">
                <input type="checkbox" class="item-check" data-id="${item.trashId}" data-dir="${escapeHtml(path)}" ${selectedIds.has(item.trashId) ? 'checked' : ''}>
                <span></span>
              </label>
              <img src="https://www.google.com/s2/favicons?domain=${getDomain(item.url)}&sz=16" width="16" height="16" onerror="this.style.display='none'">
              <div class="trash-info">
                <div class="trash-title">${escapeHtml(item.title)}</div>
                <div class="trash-url">${escapeHtml(item.url)}</div>
                <div class="trash-meta">
                  <span>📅 ${window.BookmarkUtils.formatDate(item.deletedAt)}</span>
                  ${item.trashType === 'duplicate' 
                    ? `<span class="badge badge-warning" style="font-size:0.65rem">🔍 重複書籤</span>` 
                    : item.trashType === 'dead' 
                      ? `<span class="badge badge-danger" style="font-size:0.65rem">💀 失效連結</span>` 
                      : `<span class="badge badge-muted" style="font-size:0.65rem">❓ 其他</span>`
                  }
                </div>
              </div>
              <div class="trash-actions">
                <button class="btn btn-ghost btn-sm btn-open-url" data-url="${escapeHtml(item.url)}" title="開啟連結">↗</button>
                <button class="btn btn-ghost btn-sm btn-restore" data-id="${item.trashId}" title="恢復">🔄</button>
                <button class="btn btn-ghost btn-sm btn-clear" data-id="${item.trashId}" title="永久刪除">🗑️</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // 動態為 indeterminate 狀態的目錄核取方塊賦值
  document.querySelectorAll('.dir-check[data-indeterminate="true"]').forEach(el => {
    el.indeterminate = true;
  });

  // 自動同步頂部的全選核取方塊狀態！
  updateSelectAllState();
}

function getDomain(url) { try { return new URL(url).host; } catch { return ''; } }
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function handleTrashClick(e) {
  // 1. 處理目錄標題列摺疊/展開
  const dirHeader = e.target.closest('.trash-dir-header');
  if (dirHeader && !e.target.closest('.checkbox-custom')) {
    const group = dirHeader.closest('.trash-dir-group');
    group.classList.toggle('collapsed');
    
    const toggle = dirHeader.querySelector('.trash-dir-toggle');
    if (toggle) {
      toggle.textContent = group.classList.contains('collapsed') ? '▶' : '▼';
    }
    return;
  }

  const btnOpen = e.target.closest('.btn-open-url');
  if (btnOpen) {
    chrome.tabs.create({ url: btnOpen.dataset.url });
    return;
  }
  const btnRestore = e.target.closest('.btn-restore');
  if (btnRestore) {
    restoreSingle(btnRestore.dataset.id);
    return;
  }
  const btnClear = e.target.closest('.btn-clear');
  if (btnClear) {
    clearSingle(btnClear.dataset.id);
    return;
  }
}

function handleTrashChange(e) {
  // 1. 目錄級別 Checkbox 連動
  if (e.target.classList.contains('dir-check')) {
    const dirPath = e.target.dataset.dir;
    const checked = e.target.checked;
    const filtered = getFilteredTrashItems();
    const dirItems = filtered.filter(item => (item.path || '根目錄') === dirPath);

    dirItems.forEach(item => {
      if (checked) selectedIds.add(item.trashId);
      else selectedIds.delete(item.trashId);
    });

    updateToolbar();
    renderTrash();
    updateSelectAllState();
    return;
  }

  // 2. 單一書籤 Checkbox 連動
  if (e.target.classList.contains('item-check')) {
    const id = e.target.dataset.id;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);

    updateToolbar();
    renderTrash();
    updateSelectAllState();
  }
}

function toggleSelectAll(e) {
  const checked = e.target.checked;
  const filtered = getFilteredTrashItems();
  filtered.forEach(item => {
    if (checked) selectedIds.add(item.trashId);
    else selectedIds.delete(item.trashId);
  });
  updateToolbar();
  renderTrash();
}

function updateToolbar() {
  const count = selectedIds.size;
  document.getElementById('sel-count').textContent = count > 0 ? `已選取 ${count}` : '';
  document.getElementById('btn-restore-selected').disabled = count === 0;
  document.getElementById('btn-clear-selected').disabled = count === 0;
}

async function restoreSingle(id) {
  try {
    await window.TrashManager.restoreFromTrash(id);
    window.UIUtils.showToast('書籤已恢復', 'success');
    selectedIds.delete(id);
    await loadTrash();
    updateToolbar();
  } catch (e) {
    window.UIUtils.showToast('恢復失敗', 'error');
  }
}

async function clearSingle(id) {
  const confirmed = await window.UIUtils.showConfirm('永久刪除', '確定要永久刪除此書籤嗎？此操作無法復原。', '永久刪除', 'danger');
  if (!confirmed) return;

  try {
    await window.TrashManager.permanentDelete([id]);
    window.UIUtils.showToast('已永久刪除', 'info');
    selectedIds.delete(id);
    await loadTrash();
    updateToolbar();
  } catch (e) {
    window.UIUtils.showToast('刪除失敗：' + e.message, 'error');
  }
}

async function restoreSelected() {
  const ids = Array.from(selectedIds);
  try {
    for (const id of ids) {
      await window.TrashManager.restoreFromTrash(id);
    }
    window.UIUtils.showToast(`已恢復 ${ids.length} 個書籤`, 'success');
    selectedIds.clear();
    await loadTrash();
    updateToolbar();
  } catch (e) {
    window.UIUtils.showToast('部分恢復失敗', 'error');
  }
}

async function clearSelected() {
  const ids = Array.from(selectedIds);
  const confirmed = await window.UIUtils.showConfirm('永久刪除', `確定要永久刪除選取的 ${ids.length} 個項目嗎？`, '永久刪除', 'danger');
  if (!confirmed) return;

  try {
    await window.TrashManager.permanentDelete(ids);
    window.UIUtils.showToast('已永久刪除', 'info');
    selectedIds.clear();
    await loadTrash();
    updateToolbar();
  } catch (e) {
    window.UIUtils.showToast('刪除失敗：' + e.message, 'error');
  }
}

async function clearAll() {
  if (trashItems.length === 0) return;
  const confirmed = await window.UIUtils.showConfirm('清空回收站', '確定要清空所有回收站內容嗎？', '清空所有', 'danger');
  if (!confirmed) return;

  try {
    await window.TrashManager.clearTrash();
    window.UIUtils.showToast('回收站已清空', 'info');
    selectedIds.clear();
    await loadTrash();
    updateToolbar();
  } catch (e) {
    window.UIUtils.showToast('清空失敗', 'error');
  }
}

init();
