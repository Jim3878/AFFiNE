/**
 * NineDay: BlockSuite has no translations, so pick the label from the app
 * language, which AFFiNE writes to `<html lang>`.
 */
export function newDocLabel() {
  const lang = document.documentElement.lang;
  if (lang === 'zh-Hant') return '新增頁面';
  if (lang.startsWith('zh')) return '新增页面';
  return 'New doc';
}
