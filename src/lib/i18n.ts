export type Lang = 'zh' | 'en';

export const labels: Record<string, { zh: string; en: string }> = {
  partsCatalogue: { zh: '零件目录', en: 'Parts Catalogue' },
  partsSummary: { zh: '零件汇总', en: 'Parts Summary' },
  bomReference: { zh: 'BOM 参考', en: 'BoM Reference' },
  partApplication: { zh: '零件申请', en: 'Part Application' },
  takePhoto: { zh: '拍照上传', en: 'Take Photo' },
  adminPanel: { zh: '管理后台', en: 'Admin Panel' },
  language: { zh: '语言', en: 'Language' },

  productionRequired: { zh: '生产需求分析', en: 'Production Required' },
  kanbanParts: { zh: 'Kanban 零件', en: 'Kanban Parts' },
  openPoVendor3060: { zh: 'Longtree 订单追踪', en: 'Longtree Order Track' },
  appAdmin: { zh: '应用管理', en: 'App Admin' },
  partsRequestsApi: { zh: '零件申请API', en: 'Parts Requests API' },
  partsDelivery: { zh: '零件发运汇总', en: 'Parts Delivery' },
  openPoAll: { zh: '全部 OpenPO', en: 'All OpenPO' },
  search: { zh: '搜索', en: 'Search' },
  filter: { zh: '过滤', en: 'Filter' },
  vendor: { zh: '供应商', en: 'Vendor' },
  orderDate: { zh: '下单日期', en: 'Order Date' },
  deliveryDate: { zh: '交付日期', en: 'Delivery Date' },
  description: { zh: '描述', en: 'Description' },
  vendorName: { zh: '供应商名称', en: 'Vendor Name' },
  purchasingGroup: { zh: '采购组', en: 'Purchasing Group' },
  orderQty: { zh: '下单数量', en: 'Order Qty' },
  receivedQty: { zh: '已收货数量', en: 'Received Qty' },
  openQty: { zh: '未交数量', en: 'Open Qty' },
  part: { zh: '零件号', en: 'Part' },
  poNumber: { zh: '采购订单号', en: 'PO Number' },
  poItem: { zh: '行项目', en: 'PO Item' },
  totalOpenQty: { zh: 'Open 零件总数量', en: 'Total Open Parts Qty' },
  lineCount: { zh: 'Open PO 数量', en: 'Open PO Number' },

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
  return lang === 'zh' ? item.zh : item.en;
}

export function resolvePartDescription(
  lang: Lang,
  descriptions: { SPRAS_EN?: string; SPRAS_ZH?: string }
): string {
  if (lang === 'zh') return descriptions.SPRAS_ZH || descriptions.SPRAS_EN || '';
  return descriptions.SPRAS_EN || '';
}
