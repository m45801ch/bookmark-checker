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
      <a class="nav-item ${item.page === 'import-export.html' ? 'active' : ''}"
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

let importedData = null;

async function init() {
  buildSidebar();
  window.UIUtils.bindThemeToggle();

  document.getElementById('file-input').addEventListener('change', (e) => handleFiles(e.target.files));
  document.getElementById('drop-zone').addEventListener('click', () => document.getElementById('file-input').click());
  
  document.getElementById('drop-zone').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  });
  document.getElementById('drop-zone').addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
  });
  document.getElementById('drop-zone').addEventListener('drop', (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  document.getElementById('btn-export-json').addEventListener('click', () => exportBookmarks('json'));
  document.getElementById('btn-export-html').addEventListener('click', () => exportBookmarks('html'));
  document.getElementById('btn-import-confirm').addEventListener('click', confirmImport);
  document.getElementById('btn-import-cancel').addEventListener('click', cancelImport);
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  
  const status = document.getElementById('import-status');
  status.textContent = `正在讀取 ${file.name}...`;
  
  try {
    const data = await window.ImportExport.parseFile(file);
    importedData = data;
    showPreview(data);
  } catch (e) {
    window.UIUtils.showToast('讀取失敗：' + e.message, 'error');
    status.textContent = '讀取失敗';
  }
}

function showPreview(data) {
  document.getElementById('preview-section').style.display = 'block';
  document.getElementById('import-status').textContent = `成功讀取 ${data.bookmarks.length} 個書籤`;
  
  document.getElementById('p-count').textContent = data.bookmarks.length;
  document.getElementById('p-folders').textContent = data.folders.length;
  document.getElementById('p-format').textContent = data.format.toUpperCase();

  const list = document.getElementById('preview-list');
  list.innerHTML = data.bookmarks.slice(0, 50).map(bm => `
    <div class="preview-item">
      <div style="font-weight:500;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(bm.title)}</div>
      <div style="font-size:0.7rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(bm.url)}</div>
    </div>
  `).join('');
  
  if (data.bookmarks.length > 50) {
    list.innerHTML += `<div style="text-align:center;padding:8px;font-size:0.75rem;color:var(--text-muted)">以及其餘 ${data.bookmarks.length - 50} 個項目...</div>`;
  }
}

function cancelImport() {
  importedData = null;
  document.getElementById('preview-section').style.display = 'none';
  document.getElementById('import-status').textContent = '準備就緒';
  document.getElementById('file-input').value = '';
}

async function confirmImport() {
  if (!importedData) return;
  
  const btn = document.getElementById('btn-import-confirm');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = window.UIUtils.createSpinner(14).outerHTML + ' 匯入中...';

  try {
    const result = await window.ImportExport.importData(importedData, {
      duplicateAction: document.getElementById('import-dup-action').value
    });
    
    window.UIUtils.showToast(`✅ 匯入完成！新增 ${result.added} 個書籤，跳過 ${result.skipped} 個重複。`, 'success');
    cancelImport();
  } catch (e) {
    window.UIUtils.showToast('匯入失敗：' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function exportBookmarks(format) {
  const btn = document.getElementById(format === 'json' ? 'btn-export-json' : 'btn-export-html');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = window.UIUtils.createSpinner(14).outerHTML + ' 處理中...';

  try {
    const tree = await window.BookmarkUtils.getBookmarkTree();
    const content = format === 'json' 
      ? await window.ImportExport.generateJSON(tree)
      : await window.ImportExport.generateHTML(tree);
      
    const filename = `bookmarks_backup_${new Date().toISOString().slice(0,10)}.${format}`;
    window.UIUtils.downloadFile(content, filename, format === 'json' ? 'application/json' : 'text/html');
    window.UIUtils.showToast('備份已下載', 'success');
  } catch (e) {
    window.UIUtils.showToast('匯出失敗：' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
