// js/trash-manager.js - 回收站管理模組

const TRASH_KEY = 'bookmark_trash';

/**
 * 取得回收站所有項目
 */
async function getTrashItems() {
  return new Promise((resolve) => {
    chrome.storage.local.get(TRASH_KEY, (data) => {
      resolve(data[TRASH_KEY] || []);
    });
  });
}

/**
 * 儲存回收站
 */
async function saveTrashItems(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TRASH_KEY]: items }, resolve);
  });
}

/**
 * 將書籤移到回收站（單一或陣列）
 * @param {BookmarkItem | BookmarkItem[]} bookmarks
 * @param {string} type - 來源分類 ('duplicate' | 'dead' | 'unknown')
 */
async function moveToTrash(bookmarks, type = 'unknown') {
  const items = Array.isArray(bookmarks) ? bookmarks : [bookmarks];
  const trash = await getTrashItems();
  const now = Date.now();

  const newItems = items.map(bm => ({
    ...bm,
    deletedAt: now,
    trashType: type,
    trashId: `trash_${now}_${Math.random().toString(36).slice(2)}`
  }));

  // 從 Chrome 書籤中刪除
  for (const bm of items) {
    try {
      await window.BookmarkUtils.removeBookmark(bm.id);
    } catch (e) {
      console.warn(`刪除書籤 ${bm.id} 失敗:`, e);
    }
  }

  // 加入回收站
  const updated = [...newItems, ...trash];
  await saveTrashItems(updated);

  return newItems;
}

/**
 * 從回收站恢復書籤
 * @param {string | string[]} trashIds
 */
async function restoreFromTrash(trashIds) {
  const ids = Array.isArray(trashIds) ? trashIds : [trashIds];
  const trash = await getTrashItems();

  const toRestore = trash.filter(item => ids.includes(item.trashId));
  const remaining = trash.filter(item => !ids.includes(item.trashId));

  const restored = [];
  for (const item of toRestore) {
    try {
      // 嘗試恢復到原位置
      const createDetails = {
        title: item.title,
        url: item.url,
        parentId: item.parentId
      };

      // 檢查原資料夾是否還存在
      try {
        await new Promise((resolve, reject) => {
          chrome.bookmarks.get(item.parentId, (result) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(result);
          });
        });
      } catch {
        // 原資料夾不存在，放到「其他書籤」
        createDetails.parentId = '2'; // Chrome 預設的「其他書籤」資料夾
      }

      const newBm = await window.BookmarkUtils.createBookmark(createDetails);
      restored.push({ ...item, newId: newBm.id });
    } catch (e) {
      console.warn(`恢復書籤失敗:`, e);
    }
  }

  await saveTrashItems(remaining);
  return restored;
}

/**
 * 永久刪除回收站項目
 * @param {string | string[]} trashIds - 傳入 'all' 清空所有
 */
async function permanentDelete(trashIds) {
  if (trashIds === 'all') {
    await saveTrashItems([]);
    return;
  }
  const ids = Array.isArray(trashIds) ? trashIds : [trashIds];
  const trash = await getTrashItems();
  const remaining = trash.filter(item => !ids.includes(item.trashId));
  await saveTrashItems(remaining);
}

/**
 * 清理過期回收站項目（超過指定天數）
 * @param {number} days
 */
async function cleanupExpired(days = 30) {
  const trash = await getTrashItems();
  const cutoff = Date.now() - days * 86400000;
  const remaining = trash.filter(item => item.deletedAt > cutoff);
  await saveTrashItems(remaining);
  return trash.length - remaining.length; // 回傳清理數量
}

/**
 * 取得回收站統計
 */
async function getTrashStats() {
  const trash = await getTrashItems();
  return {
    count: trash.length,
    totalSize: JSON.stringify(trash).length
  };
}

window.TrashManager = {
  getTrashItems,
  moveToTrash,
  restoreFromTrash,
  permanentDelete,
  permanentlyDelete: permanentDelete, // 提供別名相容 pages/trash.js 呼叫
  cleanupExpired,
  getTrashStats
};
