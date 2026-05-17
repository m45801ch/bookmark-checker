// js/duplicate-checker.js - 重複書籤檢測模組

/**
 * 執行重複書籤檢測
 * @param {BookmarkItem[]} bookmarks - 所有書籤
 * @param {'url'|'domain'|'rootdomain'} mode - 比對模式
 * @returns {DuplicateGroup[]} - 分組的重複書籤
 */
function findDuplicates(bookmarks, mode = 'url') {
  const groups = new Map();

  for (const bm of bookmarks) {
    let key;
    switch (mode) {
      case 'domain':
        key = window.BookmarkUtils.getDomain(bm.url);
        break;
      case 'rootdomain':
        key = window.BookmarkUtils.getRootDomain(bm.url);
        break;
      default: // 'url'
        key = window.BookmarkUtils.normalizeUrl(bm.url);
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(bm);
  }

  // 只保留有重複的群組（>=2個）
  const result = [];
  for (const [key, items] of groups) {
    if (items.length >= 2) {
      result.push({
        key,
        items: items.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0)) // 最新的排前面
      });
    }
  }

  // 依重複數量排序（多的在前）
  return result.sort((a, b) => b.items.length - a.items.length);
}

/**
 * 取得要刪除的建議（保留最新，刪除其他）
 * @param {DuplicateGroup} group
 * @returns {BookmarkItem[]} 建議刪除的書籤
 */
function getSuggestedDeletes(group) {
  return group.items.slice(1); // 保留第一個（最新），刪除其他
}

/**
 * 取得要刪除的建議（保留最舊，刪除其他）
 * @param {DuplicateGroup} group
 * @returns {BookmarkItem[]} 建議刪除的書籤
 */
function getSuggestedDeletesKeepOldest(group) {
  const sorted = [...group.items].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
  return sorted.slice(1); // 保留第一個（最舊），刪除其他
}

/**
 * 統計重複書籤摘要
 */
function getDuplicateStats(duplicateGroups) {
  const totalGroups = duplicateGroups.length;
  const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.items.length - 1, 0);
  const totalBookmarks = duplicateGroups.reduce((sum, g) => sum + g.items.length, 0);

  return { totalGroups, totalDuplicates, totalBookmarks };
}

window.DuplicateChecker = {
  findDuplicates,
  getSuggestedDeletes,
  getSuggestedDeletesKeepOldest,
  getDuplicateStats
};
