export type Lang = 'zh' | 'en';

export const labels: Record<string, { zh: string; en: string }> = {
  // Navigation & Main Labels
  partsCatalogue: { zh: '零件目录', en: 'Parts Catalogue' },
  partsSummary: { zh: '零件汇总', en: 'Parts Summary' },
  bomReference: { zh: 'BOM 参考', en: 'BoM Reference' },
  partApplication: { zh: '零件申请', en: 'Part Application' },
  takePhoto: { zh: '拍照上传', en: 'Take Photo' },
  adminPanel: { zh: '管理后台', en: 'Admin Panel' },
  language: { zh: '语言', en: 'Language' },

  // Other pages
  productionRequired: { zh: '澳洲BoM件库存分析', en: 'Production Required' },
  kanbanParts: { zh: 'Kanban 零件', en: 'Kanban Parts' },
  openPoVendor3060: { zh: 'Longtree 订单追踪', en: 'Longtree Order Track' },
  appAdmin: { zh: '应用管理', en: 'App Admin' },
  partsRequestsApi: { zh: '生产零件汇总', en: 'Parts Requests API' },
  partsDelivery: { zh: '售后零件汇总', en: 'Parts Delivery' },
  longtreeOrderReport: { zh: 'Longtree 订单 Report', en: 'Longtree Order Report' },
  openPoAll: { zh: '全部 OpenPO', en: 'All OpenPO' },

  // Parts Catalogue specific
  partsFound: { zh: '件零件已找到', en: 'parts found' },
  page: { zh: '第', en: 'Page' },
  of: { zh: '之', en: 'of' },
  searchAndFilters: { zh: '搜索 & 过滤', en: 'Search & Filters' },
  searchParts: { zh: '搜索零件', en: 'Search Parts' },
  searchPlaceholder: { zh: '按零件编号、描述或供应商搜索...', en: 'Search by part code, description, or supplier...' },
  supplier: { zh: '供应商', en: 'Supplier' },
  allSuppliers: { zh: '全部供应商', en: 'All Suppliers' },
  sortBy: { zh: '排序方式', en: 'Sort By' },
  sortMaterial: { zh: '零件号', en: 'Material Code' },
  sortPrice: { zh: '价格', en: 'Price' },
  sortStock: { zh: '库存', en: 'Stock' },
  sortSupplier: { zh: '供应商', en: 'Supplier' },
  inStockOnly: { zh: '仅显示有货', en: 'In Stock Only' },
  showDetails: { zh: '查看详情', en: 'Show Details' },
  partCode: { zh: '零件号', en: 'Part Code' },
  partCodeValue: { zh: '零件号:', en: 'Part Code:' },
  description: { zh: '描述', en: 'Description' },
  supplier: { zh: '供应商', en: 'Supplier' },
  notes: { zh: '备注', en: 'Notes' },
  year: { zh: '年份', en: 'Year' },
  obsoletedDate: { zh: '停产日期', en: 'Obsoleted Date' },
  standardPrice: { zh: '标准价格', en: 'Standard Price' },
  dealerPrice: { zh: '经销商价格', en: 'Dealer Price' },
  customerPrice: { zh: '客户价格', en: 'Customer Price' },
  inventory: { zh: '库存', en: 'Inventory' },
  units: { zh: '件', en: 'units' },
  availability: { zh: '可用性', en: 'Availability' },
  inStock: { zh: '有货', en: 'In Stock' },
  outOfStock: { zh: '缺货', en: 'Out of Stock' },
  dealer: { zh: '经销商:', en: 'Dealer:' },
  customer: { zh: '客户:', en: 'Customer:' },
  stock: { zh: '库存:', en: 'Stock:' },
  noDescription: { zh: '无描述', en: 'No description' },
  noPartsFound: { zh: '未找到零件', en: 'No parts found' },
  tryAdjustingSearch: { zh: '请尝试调整搜索条件或过滤器', en: 'Try adjusting your search criteria or filters' },

  // Common
  search: { zh: '搜索', en: 'Search' },
  filter: { zh: '过滤', en: 'Filter' },
  vendor: { zh: '供应商', en: 'Vendor' },
  orderDate: { zh: '下单日期', en: 'Order Date' },
  deliveryDate: { zh: '交付日期', en: 'Delivery Date' },
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
