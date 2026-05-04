export type Lang = 'zh' | 'en';

export const labels: Record<string, { zh: string; en: string }> = {
  partsCatalogue: { zh: '零件目录', en: 'Parts Catalogue' },
  partsSummary: { zh: '零件汇总', en: 'Parts Summary' },
  bomReference: { zh: 'BOM 参考', en: 'BoM Reference' },
  partApplication: { zh: '零件申请', en: 'Part Application' },
  takePhoto: { zh: '拍照上传', en: 'Take Photo' },
  adminPanel: { zh: '管理后台', en: 'Admin Panel' },
  language: { zh: '语言', en: 'Language' },
};

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'zh';
  const val = window.localStorage.getItem('app_lang');
  return val === 'en' ? 'en' : 'zh';
}

export function setLang(lang: Lang) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('app_lang', lang);
    window.dispatchEvent(new Event('language-change'));
  }
}

export function t(lang: Lang, key: keyof typeof labels): string {
  const item = labels[key];
  return `${item.zh} / ${item.en}`;
}
