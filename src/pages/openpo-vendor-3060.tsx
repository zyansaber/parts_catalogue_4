import { useEffect, useMemo, useRef, useState } from 'react';
import { get, ref, set, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { FirebaseService } from '@/services/firebase';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { getLang, t, type Lang } from '@/lib/i18n';
import { ChevronDown, ChevronRight } from 'lucide-react';

type OpenPoItem = {
  po_number?: string;
  part?: string;
  vendor?: string;
  purchasinggroup?: string;
  orderdate?: string;
  deliverydate?: string;
  orderqty?: number;
  receivedqty?: number;
  openqty?: number;
  description?: string;
  spras_en?: string;
  spras_zh?: string;
  chassisnumber?: string;
  cancelled?: boolean;
};

type OpenPoExtraFields = {
  part?: string;
  chassis?: string;
  shippingMethod?: 'sea freight' | 'air freight';
  category?: '自制件' | '外购件' | '';
  estimatedShipmentDate?: string;
  purchasingManager?: string;
  supplier?: string;
  plannedArrivalDate?: string;
  actualShipmentDate?: string;
  actualShippedQty?: string;
  remainingUnshippedQty?: string;
  seaFreightChassis?: string;
  location?: string;
  containerNo?: string;
  airWaybillNo?: string;
  evaluation?: string;
  shippingTrackingMixed?: string;
  remarks?: string;
};

type PurchaserFilter = 'all' | 'productionLongtreeOrders' | 'sparePartsOrders';
type ViewTab = 'active' | 'cancelled';
type ShippingStatusFilter = 'all' | 'intransit' | 'notshipped';

const PAGE_SIZE = 30;
const TEMPLATE_PK_HEADER = 'po_number+part';
const BASE_UPLOAD_HEADERS_ZH = [
  TEMPLATE_PK_HEADER,
  'po_number',
  'part',
  'vendor',
  'purchasinggroup',
  'orderdate',
  'deliverydate',
  'orderqty',
  'receivedqty',
  'openqty',
  'spras_en',
  'spras_zh',
  'chassisnumber',
  'cancelled_openpo',
];
const UPLOAD_TEMPLATE_HEADERS_ZH = [...BASE_UPLOAD_HEADERS_ZH, ...[
  'chassis',
  'shippingMethod',
  'category',
  'estimatedShipmentDate',
  'purchasingManager',
  'supplier',
  'plannedArrivalDate',
  'actualShipmentDate',
  'actualShippedQty',
  'remainingUnshippedQty',
  'seaFreightChassis',
  'location',
  'containerNo',
  'airWaybillNo',
  'evaluation',
  'shippingTrackingMixed',
  'remarks',
]];
const HEADER_TO_FIELD: Record<string, keyof OpenPoExtraFields> = {
  车架号: 'chassis',
  运输方式: 'shippingMethod',
  分类: 'category',
  预计发运时间: 'estimatedShipmentDate',
  采购经理: 'purchasingManager',
  供应商: 'supplier',
  计划到货时间: 'plannedArrivalDate',
  实际发货时间: 'actualShipmentDate',
  实发数量: 'actualShippedQty',
  剩余未发数量: 'remainingUnshippedQty',
  '海运车架号（集装箱）': 'seaFreightChassis',
  位置: 'location',
  集装箱号: 'containerNo',
  空运单号: 'airWaybillNo',
  评价: 'evaluation',
  '发货集装箱号/空运单号/车架号': 'shippingTrackingMixed',
  备注: 'remarks',
  shippingmethod: 'shippingMethod',
  category: 'category',
  shippingeta: 'estimatedShipmentDate',
  estimatedshipmentdate: 'estimatedShipmentDate',
  shippingdate: 'actualShipmentDate',
  actualshipmentdate: 'actualShipmentDate',
  actualshippedqty: 'actualShippedQty',
  remainingunshippedqty: 'remainingUnshippedQty',
  seafreightchassis: 'seaFreightChassis',
  location: 'location',
  containerno: 'containerNo',
  airwaybillno: 'airWaybillNo',
  evaluation: 'evaluation',
  shippingtrackingmixed: 'shippingTrackingMixed',
  remarks: 'remarks',
};
const BASE_HEADER_ALIASES: Record<string, keyof OpenPoItem> = {
  po_number: 'po_number',
  part: 'part',
  vendor: 'vendor',
  purchasinggroup: 'purchasinggroup',
  orderdate: 'orderdate',
  deliverydate: 'deliverydate',
  orderqty: 'orderqty',
  receivedqty: 'receivedqty',
  openqty: 'openqty',
  spras_en: 'spras_en',
  spras_zh: 'spras_zh',
  chassisnumber: 'chassisnumber',
};
const sanitizeDbKey = (value: string) => value.replace(/[.#$/[\]]/g, '_');
const normalizeHeader = (value: string) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
const normalizeDateForInput = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
};
const makeExtraKey = (poNumber: string, part: string) =>
  `${sanitizeDbKey(String(poNumber || '').trim())}__${sanitizeDbKey(String(part || '').trim())}`;

const formatDate = (value?: string) => {
  if (!value) return '-';
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// ─── Extra fields panel ───────────────────────────────────────────────────────

function ExtraFieldsPanel({
  poNumber,
  part,
  extra,
  chassisFallback,
  updateExtraField,
}: {
  poNumber: string;
  part: string;
  extra: OpenPoExtraFields;
  chassisFallback: string;
  updateExtraField: (po: string, part: string, field: keyof OpenPoExtraFields, value: string) => void;
}) {
  const field = (
    label: string,
    key: keyof OpenPoExtraFields,
    node: React.ReactNode,
  ) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</label>
      {node}
    </div>
  );

  const inp = (key: keyof OpenPoExtraFields, placeholder?: string) => (
    <input
      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
      placeholder={placeholder ?? '—'}
      value={(extra[key] as string) || ''}
      onChange={(e) => updateExtraField(poNumber, part, key, e.target.value)}
    />
  );

  const dateInp = (key: keyof OpenPoExtraFields) => (
    <input
      type="date"
      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
      value={(extra[key] as string) || ''}
      onChange={(e) => updateExtraField(poNumber, part, key, e.target.value)}
    />
  );

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-gray-50 px-6 py-4 sm:grid-cols-4">
      {field(
        'Chassis',
        'chassis',
        <input
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          placeholder="—"
          value={extra.chassis ?? chassisFallback}
          onChange={(e) => updateExtraField(poNumber, part, 'chassis', e.target.value)}
        />,
      )}
      {field(
        '运输方式',
        'shippingMethod',
        <select
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          value={extra.shippingMethod || 'sea freight'}
          onChange={(e) => updateExtraField(poNumber, part, 'shippingMethod', e.target.value)}
        >
          <option value="sea freight">Sea Freight</option>
          <option value="air freight">Air Freight</option>
        </select>,
      )}
      {field(
        '分类',
        'category',
        <select
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          value={extra.category || ''}
          onChange={(e) => updateExtraField(poNumber, part, 'category', e.target.value)}
        >
          <option value=""></option>
          <option value="自制件">自制件</option>
          <option value="外购件">外购件</option>
        </select>,
      )}
      {field('预计发运时间', 'estimatedShipmentDate', dateInp('estimatedShipmentDate'))}
      {field('采购经理', 'purchasingManager', inp('purchasingManager'))}
      {field('供应商', 'supplier', inp('supplier'))}
      {field('计划到货时间', 'plannedArrivalDate', dateInp('plannedArrivalDate'))}
      {field('实际发货时间', 'actualShipmentDate', dateInp('actualShipmentDate'))}
      {field('实发数量', 'actualShippedQty', inp('actualShippedQty'))}
      {field('剩余未发数量', 'remainingUnshippedQty', inp('remainingUnshippedQty'))}
      {field('海运车架号（集装箱）', 'seaFreightChassis', inp('seaFreightChassis'))}
      {field('位置', 'location', inp('location'))}
      {field('集装箱号', 'containerNo', inp('containerNo'))}
      {field('空运单号', 'airWaybillNo', inp('airWaybillNo'))}
      {field('评价', 'evaluation', inp('evaluation'))}
      {field('发货集装箱号/空运单号/车架号', 'shippingTrackingMixed', inp('shippingTrackingMixed'))}
      {field('备注', 'remarks', inp('remarks'))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OpenPoVendor3060Page() {
  const [items, setItems] = useState<OpenPoItem[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [cancelled, setCancelled] = useState<Record<string, boolean>>({});
  const [stockByPart, setStockByPart] = useState<Record<string, number>>({});
  const [lang, setLang] = useState<Lang>(getLang());
  const [purchaserFilter, setPurchaserFilter] = useState<PurchaserFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [shippingStatusFilter, setShippingStatusFilter] = useState<ShippingStatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [bulkPoInput, setBulkPoInput] = useState('');
  const [extraByPo, setExtraByPo] = useState<Record<string, OpenPoExtraFields>>({});
  // Set of expanded row keys
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mergeWithOpenPo = (
    uploaded: Record<string, OpenPoItem>,
    openPoRaw: Record<string, OpenPoItem>,
  ) => {
    const openPoByKey = Object.values(openPoRaw || {}).reduce<Record<string, OpenPoItem>>((acc, item) => {
      const po = String(item.po_number || '').trim();
      const part = String(item.part || '').trim();
      if (!po || !part) return acc;
      acc[makeExtraKey(po, part)] = item;
      return acc;
    }, {});
    return Object.values(uploaded || {}).map((row) => {
      const po = String(row.po_number || '').trim();
      const part = String(row.part || '').trim();
      const matched = openPoByKey[makeExtraKey(po, part)] || {};
      return {
        ...matched,
        ...row,
        // uploaded PO / part are authoritative
        po_number: po,
        part,
        // business fields优先来自 production_report/open_po
        vendor: matched.vendor || row.vendor,
        purchasinggroup: matched.purchasinggroup || row.purchasinggroup,
        orderdate: matched.orderdate || row.orderdate,
        deliverydate: matched.deliverydate || row.deliverydate,
        orderqty: matched.orderqty ?? row.orderqty,
        receivedqty: matched.receivedqty ?? row.receivedqty,
        openqty: matched.openqty ?? row.openqty,
        spras_en: matched.spras_en || matched.description || row.spras_en || row.description,
        spras_zh: matched.spras_zh || row.spras_zh,
        chassisnumber: matched.chassisnumber || row.chassisnumber,
      } as OpenPoItem;
    });
  };

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    Promise.all([
      get(ref(database, 'app_admin/openpo_vendor_3060_upload/items')),
      get(ref(database, 'production_report/open_po/items')),
      FirebaseService.getAllParts(),
      get(ref(database, 'app_admin/purchasing_group_mapping')),
      get(ref(database, 'app_admin/cancelled_openpo')),
      get(ref(database, 'app_admin/openpo_vendor_3060_extra')),
    ]).then(([uploadSnap, prodOpenSnap, allParts, mapSnap, cancelSnap, extraSnap]) => {
      const uploaded = (uploadSnap.val() || {}) as Record<string, OpenPoItem>;
      const prodOpen = (prodOpenSnap.val() || {}) as Record<string, OpenPoItem>;
      setItems(mergeWithOpenPo(uploaded, prodOpen));
      const stockMap = Object.entries(allParts || {}).reduce<Record<string, number>>((acc, [material, part]) => {
        const key = String(material || '').trim();
        if (!key) return acc;
        const partData = part as { Current_Stock_Qty?: number };
        acc[key] = Number(partData.Current_Stock_Qty || 0);
        return acc;
      }, {});
      setStockByPart(stockMap);
      setMapping((mapSnap.val() || {}) as Record<string, string>);
      setCancelled((cancelSnap.val() || {}) as Record<string, boolean>);
      setExtraByPo((extraSnap.val() || {}) as Record<string, OpenPoExtraFields>);
    });
  }, []);

  useEffect(() => {
    const initExtras = async () => {
      const updatesByPo: Record<string, Partial<OpenPoExtraFields>> = {};
      items.forEach((row) => {
        const poNumber = String(row.po_number || '').trim();
        if (!poNumber) return;
        const current = extraByPo[makeExtraKey(poNumber, row.part || '')] || extraByPo[poNumber] || {};
        const next: Partial<OpenPoExtraFields> = {};
        if (!current.shippingMethod) next.shippingMethod = 'sea freight';
        if (!current.chassis && row.chassisnumber) next.chassis = row.chassisnumber;
        if (Object.keys(next).length) updatesByPo[makeExtraKey(poNumber, row.part || '')] = { ...next, part: row.part || '' };
      });

      if (!Object.keys(updatesByPo).length) return;

      setExtraByPo((prev) => {
        const merged = { ...prev };
        Object.entries(updatesByPo).forEach(([po, patch]) => {
          merged[po] = { ...merged[po], ...patch };
        });
        return merged;
      });

      await Promise.all(
        Object.entries(updatesByPo).map(([po, patch]) =>
          update(ref(database, `app_admin/openpo_vendor_3060_extra/${po}`), patch),
        ),
      );
    };

    void initExtras();
  }, [items, extraByPo]);

  const vendorFiltered = useMemo(
    () => items.filter((i) => String(i.vendor || '').replace(/^0+/, '').trim() === '3060'),
    [items],
  );

  const filtered = useMemo(() => {
    if (purchaserFilter === 'all') return vendorFiltered;
    return vendorFiltered.filter((row) => {
      const purchaser = mapping[String(row.purchasinggroup || '')] || row.purchasinggroup || '';
      if (purchaserFilter === 'productionLongtreeOrders') return purchaser === 'Karen A.';
      if (purchaserFilter === 'sparePartsOrders') return purchaser === 'Nishi A.';
      return true;
    });
  }, [vendorFiltered, purchaserFilter, mapping]);
  const searchedRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return filtered;
    return vendorFiltered.filter((row) => {
      const po = String(row.po_number || '').toLowerCase();
      const part = String(row.part || '').toLowerCase();
      return po.includes(keyword) || part.includes(keyword);
    });
  }, [filtered, searchKeyword, vendorFiltered]);

  const keyOf = (row: OpenPoItem) => `${row.po_number || 'po'}_${row.part || 'part'}`;
  const shippingStatusOf = (row: OpenPoItem): Exclude<ShippingStatusFilter, 'all'> => {
    const poNumber = String(row.po_number || '');
    const extra = extraByPo[makeExtraKey(poNumber, row.part || '')] || extraByPo[poNumber] || {};
    return extra.actualShipmentDate ? 'intransit' : 'notshipped';
  };
  const statusFilteredRows = useMemo(() => {
    if (searchKeyword.trim()) return searchedRows;
    if (shippingStatusFilter === 'all') return searchedRows;
    return searchedRows.filter((row) => shippingStatusOf(row) === shippingStatusFilter);
  }, [searchedRows, shippingStatusFilter, extraByPo, searchKeyword]);
  const activeRows = useMemo(() => statusFilteredRows.filter((row) => !cancelled[keyOf(row)]), [statusFilteredRows, cancelled]);
  const cancelledRows = useMemo(() => statusFilteredRows.filter((row) => cancelled[keyOf(row)]), [statusFilteredRows, cancelled]);
  const visibleRows = searchKeyword.trim() ? statusFilteredRows : (viewTab === 'cancelled' ? cancelledRows : activeRows);

  const totalOpenQty = useMemo(() => visibleRows.reduce((sum, item) => sum + Number(item.openqty || 0), 0), [visibleRows]);
  const openPoNumber = useMemo(() => new Set(visibleRows.map((x) => x.po_number).filter(Boolean)).size, [visibleRows]);
  const displayNumber = (value?: number) => Number(value || 0).toLocaleString();

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [visibleRows, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [purchaserFilter, viewTab, shippingStatusFilter, searchKeyword]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const toggleCancel = async (row: OpenPoItem) => {
    const key = keyOf(row);
    const next = !cancelled[key];
    setCancelled((prev) => ({ ...prev, [key]: next }));
    await update(ref(database, 'app_admin/cancelled_openpo'), { [key]: next });
  };

  const reportWrongCode = async (row: OpenPoItem) => {
    const poNumber = String(row.po_number || '').trim();
    const part = String(row.part || '').trim();
    const reason = window.prompt(
      lang === 'zh' ? '请输入错误说明（可选）' : 'Please enter issue details (optional).',
      '',
    );
    const payload = {
      po_number: poNumber,
      part,
      reason: String(reason || '').trim(),
      reportedAt: new Date().toISOString(),
    };
    await set(
      ref(database, `app_admin/openpo_vendor_3060_wrong_code_reports/${makeExtraKey(poNumber, part)}_${Date.now()}`),
      payload,
    );
    window.alert(lang === 'zh' ? '已提交 Wrong Code 报告' : 'Wrong code report submitted.');
  };

  const bulkCancelByPo = async () => {
    const poSet = new Set(
      bulkPoInput.split(/[\s,;\n\r\t]+/).map((x) => x.trim()).filter(Boolean),
    );
    if (!poSet.size) return;
    const updates: Record<string, boolean> = {};
    filtered.forEach((row) => {
      if (poSet.has(String(row.po_number || '').trim())) updates[keyOf(row)] = true;
    });
    if (!Object.keys(updates).length) return;
    setCancelled((prev) => ({ ...prev, ...updates }));
    await update(ref(database, 'app_admin/cancelled_openpo'), updates);
    setBulkPoInput('');
    setViewTab('cancelled');
  };

  const downloadExcel = () => {
    const headers = [
      'PO Number', 'Australia Purchaser', 'Part', 'Description EN (PO)',
      'Description ZH (By Part)', 'Order Date', 'Delivery Date', 'Order Qty',
      'Received Qty', 'Open Qty', 'Cancelled',
    ];
    const rows = filtered.map((r) => [
      r.po_number || '-',
      mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-',
      r.part || '-',
      r.spras_en || r.description || '-',
      r.spras_zh || '-',
      formatDate(r.orderdate),
      formatDate(r.deliverydate),
      String(r.orderqty || 0),
      String(r.receivedqty || 0),
      String(r.openqty || 0),
      cancelled[keyOf(r)] ? 'YES' : 'NO',
    ]);
    const table = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${String(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const blob = new Blob([table], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'longtree-order-track.xls';
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateExtraField = async (poNumber: string, part: string, field: keyof OpenPoExtraFields, value: string) => {
    if (!poNumber) return;
    const extraKey = makeExtraKey(poNumber, part);
    setExtraByPo((prev) => ({
      ...prev,
      [extraKey]: { ...prev[extraKey], part, [field]: value },
    }));
    await update(ref(database, `app_admin/openpo_vendor_3060_extra/${extraKey}`), { part, [field]: value });
  };

  const downloadUploadTemplate = () => {
      const rows = filtered.map((row) => {
        const poNumber = String(row.po_number || '').trim();
        const part = String(row.part || '').trim();
        const extra = extraByPo[makeExtraKey(poNumber, part)] || extraByPo[poNumber] || {};
        return [
        `${poNumber}+${part}`,
        poNumber,
        part,
        row.vendor || '',
        row.purchasinggroup || '',
        row.orderdate || '',
        row.deliverydate || '',
        row.orderqty || '',
        row.receivedqty || '',
        row.openqty || '',
        row.spras_en || row.description || '',
        row.spras_zh || '',
        row.chassisnumber || '',
        cancelled[keyOf(row)] ? 'YES' : 'NO',
        extra.chassis || '',
        extra.shippingMethod || '',
        extra.category || '',
        extra.estimatedShipmentDate || '',
        extra.purchasingManager || '',
        extra.supplier || '',
        extra.plannedArrivalDate || '',
        extra.actualShipmentDate || '',
        extra.actualShippedQty || '',
        extra.remainingUnshippedQty || '',
        extra.seaFreightChassis || '',
        extra.location || '',
        extra.containerNo || '',
        extra.airWaybillNo || '',
        extra.evaluation || '',
        extra.shippingTrackingMixed || '',
        extra.remarks || '',
      ];
    });
    const template = [UPLOAD_TEMPLATE_HEADERS_ZH.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF', template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openpo-vendor-3060-upload-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const [headerLine, ...dataLines] = text.split(/\r?\n/).filter((line) => line.trim());
      if (!headerLine) return;
      const parseCsvLine = (line: string) => {
        const out: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          const next = line[i + 1];
          if (ch === '"' && inQuotes && next === '"') {
            cur += '"';
            i += 1;
            continue;
          }
          if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
          }
          if (ch === ',' && !inQuotes) {
            out.push(cur.trim());
            cur = '';
            continue;
          }
          cur += ch;
        }
        out.push(cur.trim());
        return out;
      };
      const normalizePoValue = (value: string) => {
        const v = String(value || '').trim();
        if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(v)) {
          const n = Number(v);
          if (!Number.isNaN(n)) return Math.round(n).toString();
        }
        return v;
      };
      const headers = parseCsvLine(headerLine);
      const keyIdx = headers.indexOf(TEMPLATE_PK_HEADER);
      const poIdx = headers.findIndex((h) => BASE_HEADER_ALIASES[normalizeHeader(h)] === 'po_number');
      const partIdx = headers.findIndex((h) => BASE_HEADER_ALIASES[normalizeHeader(h)] === 'part');
      if (keyIdx === -1 && (poIdx === -1 || partIdx === -1)) {
        alert(
          lang === 'zh'
            ? '上传文件缺少“po_number+part”列（或“po_number”和“part”列）'
            : 'Missing composite key column (or PO number and part columns).',
        );
        return;
      }

      const prevItemsByKey = items.reduce<Record<string, OpenPoItem>>((acc, row) => {
        const po = String(row.po_number || '').trim();
        const part = String(row.part || '').trim();
        if (!po || !part) return acc;
        acc[makeExtraKey(po, part)] = row;
        return acc;
      }, {});
      const rowMap: Record<string, OpenPoItem> = { ...prevItemsByKey };
      const updatedLocal: Record<string, OpenPoExtraFields> = {};
      const cancelledUpdates: Record<string, boolean> = {};
      const dbPromises: Promise<void>[] = [];

      dataLines.forEach((line) => {
        const cells = parseCsvLine(line);
        let poNumber = normalizePoValue(String(cells[poIdx] || '').trim());
        let part = String(cells[partIdx] || '').trim();
        if ((!poNumber || !part) && keyIdx !== -1) {
          const composite = String(cells[keyIdx] || '').trim();
          const sep = composite.indexOf('+');
          if (sep > -1) {
            poNumber = normalizePoValue(composite.slice(0, sep).trim());
            part = composite.slice(sep + 1).trim();
          }
        }
        if (!poNumber || !part) return;
        const extraKey = makeExtraKey(poNumber, part);
        const yesNo = (v: string) => ['yes', 'y', 'true', '1'].includes(String(v || '').trim().toLowerCase());
        const current = prevItemsByKey[extraKey] || {};
        const rowItem: OpenPoItem = { ...current, po_number: poNumber, part };
        headers.forEach((header, idx) => {
          const baseField = BASE_HEADER_ALIASES[normalizeHeader(header)];
          if (!baseField || baseField === 'po_number' || baseField === 'part') return;
          const raw = String(cells[idx] ?? '').trim();
          if (raw === '') return;
          if (baseField === 'orderqty' || baseField === 'receivedqty' || baseField === 'openqty') {
            const num = Number(raw);
            if (!Number.isNaN(num)) (rowItem[baseField] as number) = num;
            return;
          }
          (rowItem[baseField] as string) = raw;
        });
        rowMap[extraKey] = rowItem;
        const cancelledIdx = headers.findIndex((h) => normalizeHeader(h) === 'cancelled_openpo');
        if (cancelledIdx !== -1 && yesNo(String(cells[cancelledIdx] || ''))) {
          cancelledUpdates[keyOf(rowItem)] = true;
        }
        const patch: Partial<OpenPoExtraFields> = {};
        headers.forEach((header, idx) => {
          const field = HEADER_TO_FIELD[header] || HEADER_TO_FIELD[normalizeHeader(header)];
          if (!field) return;
          let value = String(cells[idx] ?? '');
          if (field === 'estimatedShipmentDate' || field === 'plannedArrivalDate' || field === 'actualShipmentDate') {
            value = normalizeDateForInput(value);
          }
          (patch as Record<string, string>)[field] = value;
        });
        if (patch.actualShipmentDate && !patch.estimatedShipmentDate && String(cells[headers.indexOf('shippingeta')] || '').trim()) {
          patch.estimatedShipmentDate = String(cells[headers.indexOf('shippingeta')] || '').trim();
        }
        if (!Object.keys(patch).length) return;
        updatedLocal[extraKey] = { ...(extraByPo[extraKey] || {}), part, ...patch };
        dbPromises.push(update(ref(database, `app_admin/openpo_vendor_3060_extra/${extraKey}`), { part, ...patch }));
      });

      if (Object.keys(rowMap).length) {
        await set(ref(database, 'app_admin/openpo_vendor_3060_upload/items'), rowMap);
        const prodOpenSnap = await get(ref(database, 'production_report/open_po/items'));
        const prodOpen = (prodOpenSnap.val() || {}) as Record<string, OpenPoItem>;
        if (Object.keys(cancelledUpdates).length) {
          await update(ref(database, 'app_admin/cancelled_openpo'), cancelledUpdates);
          setCancelled((prev) => ({ ...prev, ...cancelledUpdates }));
        }
        if (dbPromises.length) await Promise.all(dbPromises);
        setItems(mergeWithOpenPo(rowMap, prodOpen));
        setExtraByPo((prev) => ({ ...prev, ...updatedLocal }));
      }
      alert(
        lang === 'zh'
          ? `上传完成，共更新 ${dbPromises.length} 条记录。`
          : `Upload complete. Updated ${dbPromises.length} records.`,
      );
    } catch (error) {
      console.error(error);
      alert(lang === 'zh' ? '上传失败，请检查 CSV 格式。' : 'Upload failed. Please check CSV format.');
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // ─── Extra fields summary badge (shows how many fields are filled) ───────────
  const filledCount = (extra: OpenPoExtraFields) =>
    Object.values(extra).filter((v) => v !== undefined && v !== '' && v !== 'sea freight').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t(lang, 'openPoVendor3060')}</h1>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">{lang === 'zh' ? '批量取消PO' : 'Bulk Cancel PO'}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg space-y-3">
              <h2 className="text-lg font-semibold">
                {lang === 'zh' ? '上传/粘贴PO号并取消' : 'Upload/Paste PO numbers to cancel'}
              </h2>
              <textarea
                className="min-h-56 w-full rounded border p-3 text-sm"
                placeholder={lang === 'zh' ? '每行一个PO号，或使用逗号/空格分隔' : 'One PO per line, or comma/space separated'}
                value={bulkPoInput}
                onChange={(e) => setBulkPoInput(e.target.value)}
              />
              <Button onClick={bulkCancelByPo}>{lang === 'zh' ? '确认取消' : 'Confirm Cancel'}</Button>
            </DialogContent>
          </Dialog>
          <Button onClick={downloadExcel}>{lang === 'zh' ? '下载Excel' : 'Download Excel'}</Button>
          <Button variant="outline" onClick={downloadUploadTemplate}>
            {lang === 'zh' ? '下载上传模板' : 'Download Upload Template'}
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleUploadFile}
          />
          <Button
            variant="outline"
            disabled={uploading}
            onClick={() => uploadInputRef.current?.click()}
          >
            {uploading
              ? (lang === 'zh' ? '上传中...' : 'Uploading...')
              : (lang === 'zh' ? '上传数据' : 'Upload Data')}
          </Button>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-2">
        <Button variant={viewTab === 'active' ? 'default' : 'outline'} onClick={() => setViewTab('active')}>
          {lang === 'zh' ? '开放订单' : 'Open Orders'}
        </Button>
        <Button variant={viewTab === 'cancelled' ? 'default' : 'outline'} onClick={() => setViewTab('cancelled')}>
          {lang === 'zh' ? '已取消订单' : 'Cancelled Orders'}
        </Button>
      </div>

      {/* Purchaser filter */}
      {viewTab === 'active' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Button
            className="h-14 text-base"
            variant={purchaserFilter === 'productionLongtreeOrders' ? 'default' : 'outline'}
            onClick={() => setPurchaserFilter('productionLongtreeOrders')}
          >
            {lang === 'zh' ? '生产 Longtree 订单（Karen A.）' : 'Production Longtree Orders (Karen A.)'}
          </Button>
          <Button
            className="h-14 text-base"
            variant={purchaserFilter === 'sparePartsOrders' ? 'default' : 'outline'}
            onClick={() => setPurchaserFilter('sparePartsOrders')}
          >
            {lang === 'zh' ? '备件订单（Nishi A.）' : 'Spare Parts Orders (Nishi A.)'}
          </Button>
        </div>
      )}
      {viewTab === 'active' && (
        <div className="flex items-center gap-2">
          <Button variant={shippingStatusFilter === 'all' ? 'default' : 'outline'} onClick={() => setShippingStatusFilter('all')}>
            {lang === 'zh' ? '发货状态：全部' : 'Shipping: All'}
          </Button>
          <Button variant={shippingStatusFilter === 'intransit' ? 'default' : 'outline'} onClick={() => setShippingStatusFilter('intransit')}>
            {lang === 'zh' ? '在途 (In Transit)' : 'In Transit'}
          </Button>
          <Button variant={shippingStatusFilter === 'notshipped' ? 'default' : 'outline'} onClick={() => setShippingStatusFilter('notshipped')}>
            {lang === 'zh' ? '未发货 (Not Shipped)' : 'Not Shipped'}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm md:w-80"
          placeholder={lang === 'zh' ? '搜索 PO号 或 物料号码' : 'Search PO No. or Part No.'}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSearchKeyword(searchInput.trim());
          }}
        />
        <Button onClick={() => setSearchKeyword(searchInput.trim())}>
          {lang === 'zh' ? '搜索' : 'Search'}
        </Button>
        {searchKeyword && (
          <Button variant="outline" onClick={() => { setSearchInput(''); setSearchKeyword(''); }}>
            {lang === 'zh' ? '清除' : 'Clear'}
          </Button>
        )}
      </div>

      {/* Pagination info */}
      <div className="flex items-center gap-3">
        {viewTab === 'active' && (
          <Button variant={purchaserFilter === 'all' ? 'default' : 'outline'} onClick={() => setPurchaserFilter('all')}>
            {lang === 'zh' ? '全部' : 'All'}
          </Button>
        )}
        <span className="text-sm text-gray-500">
          {lang === 'zh'
            ? `第 ${currentPage} / ${totalPages} 页（每页 ${PAGE_SIZE} 条）`
            : `Page ${currentPage} of ${totalPages} (${PAGE_SIZE} rows/page)`}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t(lang, 'lineCount')}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{openPoNumber}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t(lang, 'totalOpenQty')}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{displayNumber(totalOpenQty)}</CardContent>
        </Card>
      </div>

      {/* ── Main table ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {/* Expand toggle */}
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 w-8" />
                  {/* Sticky cols */}
                  <th className="sticky left-8 z-10 bg-gray-50 px-3 py-3 whitespace-nowrap">
                    {t(lang, 'poNumber')}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">
                    {lang === 'zh' ? '采购专员' : 'Purchaser'}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">{t(lang, 'part')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{lang === 'zh' ? '照片' : 'Photo'}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{lang === 'zh' ? '澳洲库存' : 'AU Stock'}</th>
                  <th className="px-3 py-3 min-w-[200px]">
                    {lang === 'zh' ? '描述' : 'Description'}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">{t(lang, 'orderDate')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t(lang, 'deliveryDate')}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">{t(lang, 'orderQty')}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">{t(lang, 'receivedQty')}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">{t(lang, 'openQty')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">
                    {lang === 'zh' ? '发货信息' : 'Shipping Info'}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">
                    {lang === 'zh' ? '状态' : 'Status'}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">
                    {lang === 'zh' ? '操作' : 'Action'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedRows.map((r, i) => {
                  const cancelledRow = cancelled[keyOf(r)];
                  const rowKey = keyOf(r);
                  const poNumber = String(r.po_number || '');
                  const extra = extraByPo[makeExtraKey(poNumber, r.part || '')] || extraByPo[poNumber] || {};
                  const shippingStatus = shippingStatusOf(r);
                  const isExpanded = expandedRows.has(rowKey);
                  const filled = filledCount(extra);

                  return (
                    <>
                      {/* Main row */}
                      <tr
                        key={rowKey}
                        className={`transition-colors ${shippingStatus === 'intransit' ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'bg-amber-50/30 hover:bg-amber-50/50'} ${cancelledRow ? 'opacity-40' : ''} ${isExpanded ? 'ring-1 ring-blue-200' : ''}`}
                      >
                        {/* Expand toggle */}
                        <td className="sticky left-0 z-10 bg-inherit px-2 py-2 w-8">
                          <button
                            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                            onClick={() => toggleExpand(rowKey)}
                            title={isExpanded ? 'Collapse' : 'Expand shipping details'}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />
                            }
                          </button>
                        </td>

                        {/* PO Number – sticky */}
                        <td className="sticky left-8 z-10 bg-inherit px-3 py-2 font-mono text-xs font-medium">
                          {cancelledRow
                            ? <span className="line-through text-gray-400">{r.po_number || '-'}</span>
                            : r.po_number || '-'
                          }
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                          {mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-'}
                        </td>

                        <td className="px-3 py-2 font-mono text-xs">{r.part || '-'}</td>

                        {/* Photo */}
                        <td className="px-3 py-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <button className="h-10 w-10 overflow-hidden rounded border hover:border-blue-400 transition-colors">
                                <ImageWithFallback
                                  src={FirebaseService.getPartImageUrl(r.part || '')}
                                  fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)}
                                  alt={r.part || 'part'}
                                  className="h-full w-full object-contain"
                                />
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-w-xl">
                              <div className="h-[60vh] overflow-hidden rounded">
                                <ImageWithFallback
                                  src={FirebaseService.getPartImageUrl(r.part || '')}
                                  fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)}
                                  alt={r.part || 'part'}
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            </DialogContent>
                          </Dialog>
                        </td>

                        {/* AU Stock */}
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {displayNumber(stockByPart[String(r.part || '').trim()] || 0)}
                        </td>

                        {/* Description */}
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="space-y-0.5">
                            <div className="text-xs leading-snug text-gray-800 line-clamp-2">
                              {r.spras_en || r.description || '-'}
                            </div>
                            <div className="text-[10px] leading-snug text-gray-400">
                              {r.spras_zh || ''}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{formatDate(r.orderdate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{formatDate(r.deliverydate)}</td>

                        <td className="px-3 py-2 text-right tabular-nums text-xs">{displayNumber(r.orderqty)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">{displayNumber(r.receivedqty)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold text-blue-700">{displayNumber(r.openqty)}</td>

                        {/* Shipping info summary */}
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {extra.shippingMethod && (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${extra.shippingMethod === 'air freight' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                                {extra.shippingMethod === 'air freight' ? '✈ Air' : '🚢 Sea'}
                              </span>
                            )}
                            {extra.category && (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                {extra.category}
                              </span>
                            )}
                            {extra.chassis && (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] text-gray-600">
                                {extra.chassis}
                              </span>
                            )}
                            {filled === 0 && (
                              <button
                                className="text-[10px] text-gray-400 hover:text-blue-500 underline"
                                onClick={() => toggleExpand(rowKey)}
                              >
                                + add details
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${shippingStatus === 'intransit' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {shippingStatus === 'intransit' ? 'In Transit' : 'Not Shipped'}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleCancel(r)}>
                              {cancelledRow
                                ? (lang === 'zh' ? '恢复' : 'Undo')
                                : 'Cancel'}
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => reportWrongCode(r)}>
                              {lang === 'zh' ? 'Wrong Code（错误料号）' : 'Wrong Code'}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded extra fields row */}
                      {isExpanded && (
                        <tr key={`${rowKey}_extra`} className="bg-gray-50/80">
                          <td colSpan={15} className="p-0">
                            <div className="border-l-4 border-blue-400">
                              <ExtraFieldsPanel
                                poNumber={poNumber}
                                part={r.part || ''}
                                extra={extra}
                                chassisFallback={r.chassisnumber ?? ''}
                                updateExtraField={updateExtraField}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
          {lang === 'zh' ? '上一页' : 'Previous'}
        </Button>
        <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
          {lang === 'zh' ? '下一页' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
