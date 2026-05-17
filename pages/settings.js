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
      <a class="nav-item ${item.page === 'settings.html' ? 'active' : ''}"
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

function updateTrashDaysLabel(val) {
  const v = parseInt(val);
  document.getElementById('v-trash-days').textContent = v === 0 ? '不清理' : v + '天';
}

async function init() {
  buildSidebar();
  window.UIUtils.bindThemeToggle();

  const settings = await window.BookmarkUtils.getSettings();
  applySettings(settings);

  // 監聽並發數量 slider
  document.getElementById('s-concurrent').addEventListener('input', (e) => {
    document.getElementById('v-concurrent').textContent = e.target.value;
    markUnsaved();
  });

  // 監聽超時時間 slider
  document.getElementById('s-timeout').addEventListener('input', (e) => {
    document.getElementById('v-timeout').textContent = e.target.value + 's';
    markUnsaved();
  });

  // 監聽回收站天數 slider
  document.getElementById('s-trash-days').addEventListener('input', (e) => {
    updateTrashDaysLabel(e.target.value);
    markUnsaved();
  });

  // 監聽其他輸入
  document.querySelectorAll('input, select').forEach(el => {
    if (el.type !== 'range') {
      el.addEventListener('change', markUnsaved);
    }
  });

  document.getElementById('btn-save').addEventListener('click', saveSettings);
  document.getElementById('btn-reset').addEventListener('click', resetSettings);
  document.getElementById('btn-clear-storage').addEventListener('click', clearAllStorage);
  document.getElementById('btn-export-settings').addEventListener('click', exportSettings);
}

function markUnsaved() {
  document.getElementById('save-status').textContent = '* 有未儲存的變更';
}

function applySettings(s) {
  document.getElementById('s-concurrent').value = s.concurrent || 5;
  document.getElementById('v-concurrent').textContent = s.concurrent || 5;
  document.getElementById('s-timeout').value = (s.timeout || 10000) / 1000;
  document.getElementById('v-timeout').textContent = ((s.timeout || 10000) / 1000) + 's';
  document.getElementById('s-dup-mode').value = s.duplicateMode || 'url';
  document.getElementById('s-trash-days').value = s.trashRetentionDays !== undefined ? s.trashRetentionDays : 30;
  updateTrashDaysLabel(s.trashRetentionDays !== undefined ? s.trashRetentionDays : 30);
  document.getElementById('s-favicons').checked = s.showFavicons !== false;
}

async function saveSettings() {
  const settings = {
    concurrent: parseInt(document.getElementById('s-concurrent').value) || 5,
    timeout: (parseInt(document.getElementById('s-timeout').value) || 10) * 1000,
    duplicateMode: document.getElementById('s-dup-mode').value,
    trashRetentionDays: parseInt(document.getElementById('s-trash-days').value),
    importDuplicateAction: document.getElementById('s-import-dup') ? document.getElementById('s-import-dup').value : 'skip',
    showFavicons: document.getElementById('s-favicons').checked
  };

  try {
    await window.BookmarkUtils.saveSettings(settings);
    document.getElementById('save-status').textContent = '✅ 設定已儲存';
    window.UIUtils.showToast('設定已儲存', 'success');
    setTimeout(() => {
      document.getElementById('save-status').textContent = '';
    }, 3000);
  } catch (e) {
    window.UIUtils.showToast('儲存失敗：' + e.message, 'error');
  }
}

function resetSettings() {
  const defaults = window.BookmarkUtils.getDefaultSettings();
  applySettings(defaults);
  document.getElementById('save-status').textContent = '* 已重設為預設值（未儲存）';
}

async function clearAllStorage() {
  const confirmed = await window.UIUtils.showConfirm(
    '清除所有儲存資料',
    '這將清除回收站和所有設定，確定要繼續嗎？',
    '清除所有',
    'danger'
  );
  if (!confirmed) return;

  chrome.storage.local.clear(() => {
    window.UIUtils.showToast('已清除所有資料', 'info');
    applySettings(window.BookmarkUtils.getDefaultSettings());
  });
}

function exportSettings() {
  window.BookmarkUtils.getSettings().then(settings => {
    window.UIUtils.downloadFile(
      JSON.stringify(settings, null, 2),
      'bookmark-checker-settings.json',
      'application/json'
    );
  });
}

init();
