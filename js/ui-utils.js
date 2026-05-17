// js/ui-utils.js - UI 工具函式

/**
 * 顯示 Toast 通知
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration
 */
function showToast(message, type = 'info', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * 顯示確認對話框
 * @param {string} title
 * @param {string} message
 * @param {string} confirmText
 * @param {'danger'|'primary'} confirmType
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message, confirmText = '確認', confirmType = 'danger') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${message}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">取消</button>
          <button class="btn btn-${confirmType}" id="modal-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    overlay.querySelector('#modal-confirm').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

/**
 * 彈出刪除書籤的專屬確認對話框，可選擇移至回收站或永久刪除
 * @param {string} title - 對話框標題
 * @param {string} message - 對話框內容文字
 * @returns {Promise<'trash' | 'permanent' | 'cancel'>}
 */
function showDeleteConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-body" style="margin-bottom: var(--space-lg); line-height: 1.6;">${message}</div>
        
        <!-- 新增帶有單選按鈕的刪除模式選項 -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-md); margin-bottom: var(--space-lg); text-align: left;">
          <label style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; cursor: pointer;">
            <input type="radio" name="delete-mode" value="trash" checked style="accent-color: var(--primary); margin-top: 3px;">
            <div>
              <div style="font-size: 0.875rem; font-weight: 600; color: var(--text);">🗑️ 移至回收站</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">安全刪除，日後可在回收站中復原與還原。</div>
            </div>
          </label>
          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
            <input type="radio" name="delete-mode" value="permanent" style="accent-color: var(--danger); margin-top: 3px;">
            <div>
              <div style="font-size: 0.875rem; font-weight: 600; color: var(--danger-light);">🔥 永久直接刪除</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">徹底從 Chrome 本地抹除此書籤，不可復原。</div>
            </div>
          </label>
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">取消</button>
          <button class="btn btn-primary" id="modal-confirm">確定刪除</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve('cancel');
    });

    overlay.querySelector('#modal-confirm').addEventListener('click', () => {
      const mode = overlay.querySelector('input[name="delete-mode"]:checked').value;
      overlay.remove();
      resolve(mode);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve('cancel');
      }
    });
  });
}

/**
 * 建立 favicon 圖片元素
 */
function createFavicon(url, size = 16) {
  const img = document.createElement('img');
  img.width = size;
  img.height = size;
  img.style.borderRadius = '3px';
  img.style.flexShrink = '0';

  try {
    const domain = new URL(url).host;
    img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    img.src = '';
  }

  img.onerror = () => {
    img.style.display = 'none';
  };

  return img;
}

/**
 * 更新進度條
 */
function updateProgress(barId, textId, current, total) {
  const bar = document.getElementById(barId);
  const text = document.getElementById(textId);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  if (bar) {
    bar.querySelector('.progress-fill').style.width = `${pct}%`;
  }
  if (text) {
    text.textContent = `${current} / ${total} (${pct}%)`;
  }
}

/**
 * 複製文字到剪貼簿
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已複製到剪貼簿', 'success');
  } catch {
    showToast('複製失敗', 'error');
  }
}

/**
 * 格式化檔案大小
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 設定側邊欄當前選中的頁面
 */
function setActiveNav(pageKey) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageKey);
  });
}

/**
 * 渲染分頁選取器（1~N頁）
 */
function renderPagination(container, currentPage, totalPages, onPageChange) {
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const createBtn = (label, page, disabled = false) => {
    const btn = document.createElement('button');
    btn.className = `btn btn-ghost btn-sm ${page === currentPage ? 'active' : ''}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) btn.addEventListener('click', () => onPageChange(page));
    return btn;
  };

  container.appendChild(createBtn('‹', currentPage - 1, currentPage <= 1));

  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 || i === totalPages ||
      Math.abs(i - currentPage) <= 2
    ) {
      container.appendChild(createBtn(i, i));
    } else if (Math.abs(i - currentPage) === 3) {
      const span = document.createElement('span');
      span.textContent = '…';
      span.style.cssText = 'padding:0 6px;color:var(--text-muted)';
      container.appendChild(span);
    }
  }

  container.appendChild(createBtn('›', currentPage + 1, currentPage >= totalPages));
}

/**
 * 防抖函式
 */
function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 下載檔案
 */
function downloadFile(content, filename, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 建立載入中動畫
 */
function createSpinner(size = 20) {
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border: 2px solid rgba(108,99,255,0.2);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  `;
  if (!document.getElementById('spin-style')) {
    const style = document.createElement('style');
    style.id = 'spin-style';
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  return spinner;
}

/**
 * 初始化與同步主題
 */
async function initTheme() {
  try {
    const settings = await chrome.storage.local.get('theme');
    const theme = settings.theme || 'dark';
    if (theme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  } catch (e) {
    console.error('Failed to initialize theme:', e);
  }
}

// 立即執行主題初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// 跨分頁的主題同步監聽
chrome.storage.onChanged.addListener((changes) => {
  if (changes.theme) {
    const newTheme = changes.theme.newValue;
    if (newTheme === 'light') {
      document.body.classList.add('theme-light');
    } else {
      document.body.classList.remove('theme-light');
    }
  }
});

/**
 * 綁定主題切換按鈕的事件
 */
function bindThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const settings = await chrome.storage.local.get('theme');
    const currentTheme = settings.theme || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    await chrome.storage.local.set({ theme: newTheme });
  });

  const updateToggleUI = (theme) => {
    const icon = document.getElementById('theme-toggle-icon');
    const text = document.getElementById('theme-toggle-text');
    if (theme === 'light') {
      if (icon) icon.textContent = '🌙';
      if (text) text.textContent = '深色主題';
    } else {
      if (icon) icon.textContent = '☀️';
      if (text) text.textContent = '淺色主題';
    }
  };

  // 初始化按鈕文字
  chrome.storage.local.get('theme').then((settings) => {
    updateToggleUI(settings.theme || 'dark');
  });

  // 隨時監聽儲存變更並更新按鈕文字
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      updateToggleUI(changes.theme.newValue);
    }
  });
}

/**
 * 顯示編輯書籤對話框
 * @param {string} currentTitle
 * @param {string} currentUrl
 * @returns {Promise<{title: string, url: string} | null>}
 */
function showEditBookmarkModal(currentTitle, currentUrl) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 500px;">
        <div class="modal-title">✏️ 編輯書籤</div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-md); margin-top: var(--space-md);">
          <div class="config-item">
            <label style="display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px;">名稱</label>
            <input type="text" class="input" id="edit-bm-title" value="${currentTitle.replace(/"/g, '&quot;')}" required>
          </div>
          <div class="config-item">
            <label style="display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 6px;">網址</label>
            <input type="text" class="input" id="edit-bm-url" value="${currentUrl.replace(/"/g, '&quot;')}" required>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: var(--space-lg);">
          <button class="btn btn-ghost" id="modal-cancel">取消</button>
          <button class="btn btn-primary" id="modal-confirm">儲存</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    overlay.querySelector('#modal-confirm').addEventListener('click', () => {
      const title = document.getElementById('edit-bm-title').value.trim();
      const url = document.getElementById('edit-bm-url').value.trim();
      if (!title || !url) {
        showToast('名稱和網址不能為空！', 'error');
        return;
      }
      overlay.remove();
      resolve({ title, url });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });
  });
}

/**
 * 🎵 播放高質感雙音和弦（叮咚）成功提示音效
 * 使用 Web Audio API 即時合成純淨正弦波，無需任何外置音訊檔，安全、輕量且支援 CSP
 */
function playSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // 第一聲: C5 (523.25 Hz)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35); // 0.35 秒漸弱
    
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.35);
    
    // 第二聲: E5 (659.25 Hz)，於 0.12 秒後響起，形成叮咚和弦
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.12, audioCtx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55); // 0.55 秒漸弱
    
    osc2.start(audioCtx.currentTime + 0.12);
    osc2.stop(audioCtx.currentTime + 0.55);
  } catch (e) {
    console.warn('播放提示音失敗：', e);
  }
}

window.UIUtils = {
  showToast,
  showConfirm,
  showDeleteConfirm,
  createFavicon,
  updateProgress,
  copyToClipboard,
  formatBytes,
  setActiveNav,
  renderPagination,
  debounce,
  downloadFile,
  createSpinner,
  bindThemeToggle,
  showEditBookmarkModal,
  playSuccessSound
};
