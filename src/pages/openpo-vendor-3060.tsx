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
  sapMatched?: boolean;
  po_number?: string;
  po_item?: string;
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
type ViewTab = 'active' | 'new7days' | 'cancelled' | 'dashboard';
type ShippingStatusFilter = 'all' | 'intransit' | 'notshipped';
type ShippingMethodFilter = 'all' | 'air freight' | 'sea freight';

const PAGE_SIZE = 30;
const TEMPLATE_PK_HEADER = 'po_number+po_item+part';
const LEGACY_TEMPLATE_PK_HEADER = 'po_number+part';
const BASE_UPLOAD_HEADERS_ZH = [
  TEMPLATE_PK_HEADER,
  'po_number',
  'po_item',
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
  po_item: 'po_item',
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
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return raw;
};
const ymdNumber = (value?: string) => {
  const normalized = normalizeDateForInput(String(value || ''));
  if (!normalized) return null;
  const digits = normalized.replace(/-/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  return Number(digits);
};
const isOnOrAfter = (value: string | undefined, thresholdYmd: number) => {
  const num = ymdNumber(value);
  return num !== null && num >= thresholdYmd;
};
const makeExtraKey = (poNumber: string, poItem: string, part: string) =>
  `${sanitizeDbKey(String(poNumber || '').trim())}__${sanitizeDbKey(String(poItem || '').trim())}__${sanitizeDbKey(String(part || '').trim())}`;

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
  poItem,
  part,
  extra,
  chassisFallback,
  updateExtraField,
}: {
  poNumber: string;
  poItem: string;
  part: string;
  extra: OpenPoExtraFields;
  chassisFallback: string;
  updateExtraField: (po: string, poItem: string, part: string, field: keyof OpenPoExtraFields, value: string) => void;
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
      onChange={(e) => updateExtraField(poNumber, poItem, part, key, e.target.value)}
    />
  );

  const dateInp = (key: keyof OpenPoExtraFields) => (
    <input
      type="date"
      className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
      value={(extra[key] as string) || ''}
      onChange={(e) => updateExtraField(poNumber, poItem, part, key, e.target.value)}
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
          onChange={(e) => updateExtraField(poNumber, poItem, part, 'chassis', e.target.value)}
        />,
      )}
      {field(
        '运输方式',
        'shippingMethod',
        <select
          className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          value={extra.shippingMethod || 'sea freight'}
          onChange={(e) => updateExtraField(poNumber, poItem, part, 'shippingMethod', e.target.value)}
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
          onChange={(e) => updateExtraField(poNumber, poItem, part, 'category', e.target.value)}
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
  const [shippingMethodFilter, setShippingMethodFilter] = useState<ShippingMethodFilter>('all');
  const [dashAirExpanded, setDashAirExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [bulkPoInput, setBulkPoInput] = useState('');
  const [extraByPo, setExtraByPo] = useState<Record<string, OpenPoExtraFields>>({});
  // Set of expanded row keys
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [wrongCodeNotes, setWrongCodeNotes] = useState<Record<string, string>>({});
  const [wrongCodeOnly, setWrongCodeOnly] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const mergeWithOpenPo = (
    uploaded: Record<string, OpenPoItem>,
    openPoRaw: Record<string, OpenPoItem>,
    openPoHashRaw: Record<string, OpenPoItem>,
  ) => {
    const openPoByKey = Object.values(openPoRaw || {}).reduce<Record<string, OpenPoItem>>((acc, item) => {
      const po = String(item.po_number || '').trim();
      const poItem = String(item.po_item || '').trim();
      const part = String(item.part || '').trim();
      if (!po || !part) return acc;
      acc[makeExtraKey(po, poItem, part)] = item;
      return acc;
    }, {});
    const mergedInput: OpenPoItem[] = [];
    Object.values(uploaded || {}).forEach((row) => {
      if (!isOnOrAfter(row.orderdate, 20260507)) mergedInput.push(row);
    });
    Object.values(openPoHashRaw || {}).forEach((row) => {
      if (isOnOrAfter(row.orderdate, 20260507)) mergedInput.push(row);
    });
    return mergedInput.map((row) => {
      const po = String(row.po_number || '').trim();
      const part = String(row.part || '').trim();
      const poItem = String(row.po_item || '').trim();
      const matched = openPoByKey[makeExtraKey(po, poItem, part)] || {};
      const sapMatched = Boolean(Object.keys(matched).length);
      return {
        ...matched,
        ...row,
        // uploaded PO / part are authoritative
        po_number: po,
        po_item: poItem,
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
        sapMatched,
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
      get(ref(database, 'production_report/open_po/hash/items')),
      FirebaseService.getAllParts(),
      get(ref(database, 'app_admin/purchasing_group_mapping')),
      get(ref(database, 'app_admin/cancelled_openpo')),
      get(ref(database, 'app_admin/openpo_vendor_3060_extra')),
      get(ref(database, 'app_admin/openpo_vendor_3060_wrong_code_notes')),
    ]).then(([uploadSnap, prodOpenSnap, prodOpenHashSnap, allParts, mapSnap, cancelSnap, extraSnap, wrongSnap]) => {
      const uploaded = (uploadSnap.val() || {}) as Record<string, OpenPoItem>;
      const prodOpen = (prodOpenSnap.val() || {}) as Record<string, OpenPoItem>;
      const prodOpenHash = (prodOpenHashSnap.val() || {}) as Record<string, OpenPoItem>;
      setItems(mergeWithOpenPo(uploaded, prodOpen, prodOpenHash));
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
      setWrongCodeNotes((wrongSnap.val() || {}) as Record<string, string>);
    });
  }, []);

  useEffect(() => {
    const initExtras = async () => {
      const updatesByPo: Record<string, Partial<OpenPoExtraFields>> = {};
      items.forEach((row) => {
        const poNumber = String(row.po_number || '').trim();
        if (!poNumber) return;
        const current = extraByPo[makeExtraKey(poNumber, String(row.po_item || ''), row.part || '')] || extraByPo[poNumber] || {};
        const next: Partial<OpenPoExtraFields> = {};
        if (!current.shippingMethod) next.shippingMethod = 'sea freight';
        if (!current.chassis && row.chassisnumber) next.chassis = row.chassisnumber;
        if (Object.keys(next).length) updatesByPo[makeExtraKey(poNumber, String(row.po_item || ''), row.part || '')] = { ...next, part: row.part || '' };
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

  const vendorFiltered = useMemo(() => items, [items]);

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

  const keyOf = (row: OpenPoItem) => `${row.po_number || 'po'}_${row.po_item || 'item'}_${row.part || 'part'}`;
  const shippingStatusOf = (row: OpenPoItem): Exclude<ShippingStatusFilter, 'all'> => {
    const poNumber = String(row.po_number || '');
    const extra = extraByPo[makeExtraKey(poNumber, String(row.po_item || ''), row.part || '')] || extraByPo[poNumber] || {};
    return extra.actualShipmentDate ? 'intransit' : 'notshipped';
  };
  const statusFilteredRows = useMemo(() => {
    if (searchKeyword.trim()) return searchedRows;
    if (shippingStatusFilter === 'all') return searchedRows;
    return searchedRows.filter((row) => shippingStatusOf(row) === shippingStatusFilter);
  }, [searchedRows, shippingStatusFilter, extraByPo, searchKeyword]);
  const wrongFilteredRows = useMemo(() => {
    if (!wrongCodeOnly) return statusFilteredRows;
    return statusFilteredRows.filter((row) => !!wrongCodeNotes[makeExtraKey(String(row.po_number || ''), String(row.po_item || ''), String(row.part || ''))]);
  }, [statusFilteredRows, wrongCodeOnly, wrongCodeNotes]);

  const methodFilteredRows = useMemo(() => {
    if (shippingMethodFilter === 'all') return wrongFilteredRows;
    return wrongFilteredRows.filter((row) => {
      const po = String(row.po_number || '');
      const extra = extraByPo[makeExtraKey(po, String(row.po_item || ''), row.part || '')] || extraByPo[po] || {};
      return (extra.shippingMethod || 'sea freight') === shippingMethodFilter;
    });
  }, [wrongFilteredRows, shippingMethodFilter, extraByPo]);

  const activeRows = useMemo(() => methodFilteredRows.filter((row) => !cancelled[keyOf(row)]), [methodFilteredRows, cancelled]);
  const cancelledRows = useMemo(() => methodFilteredRows.filter((row) => cancelled[keyOf(row)]), [methodFilteredRows, cancelled]);
  const new7DaysRows = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return activeRows.filter((row) => {
      const normalized = normalizeDateForInput(String(row.orderdate || ''));
      if (!normalized) return false;
      const d = new Date(`${normalized}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d >= sevenDaysAgo;
    });
  }, [activeRows]);

  // Dashboard rows: completely independent of all filters — just non-cancelled items
  const allActiveItems = useMemo(
    () => items.filter((row) => !cancelled[keyOf(row)]),
    [items, cancelled],
  );
  const visibleRows = searchKeyword.trim()
    ? methodFilteredRows
    : (viewTab === 'cancelled' ? cancelledRows : (viewTab === 'new7days' ? new7DaysRows : activeRows));

  const totalOpenQty = useMemo(() => visibleRows.reduce((sum, item) => sum + Number(item.openqty || 0), 0), [visibleRows]);
  const openPoNumber = useMemo(() => new Set(visibleRows.map((x) => x.po_number).filter(Boolean)).size, [visibleRows]);
  const unshippedItemCount = useMemo(
    () => visibleRows.filter((row) => shippingStatusOf(row) === 'notshipped').length,
    [visibleRows, extraByPo],
  );
  const displayNumber = (value?: number) => Number(value || 0).toLocaleString();
  const parseDate = (value?: string) => {
    const normalized = normalizeDateForInput(value || '');
    if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const d = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const daysSince = (value?: string) => {
    const d = parseDate(value);
    if (!d) return null;
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
  };
  const unshippedRowsForAging = useMemo(() => allActiveItems.filter((row) => shippingStatusOf(row) === 'notshipped'), [allActiveItems, extraByPo]);
  const inTransitRowsForAging = useMemo(() => allActiveItems.filter((row) => shippingStatusOf(row) === 'intransit'), [allActiveItems, extraByPo]);
  const dashAirRows = useMemo(() => allActiveItems.filter((row) => {
    const po = String(row.po_number || '');
    const extra = extraByPo[makeExtraKey(po, String(row.po_item || ''), row.part || '')] || extraByPo[po] || {};
    return (extra.shippingMethod || 'sea freight') === 'air freight';
  }).map((row) => {
    const po = String(row.po_number || '');
    const extra = extraByPo[makeExtraKey(po, String(row.po_item || ''), row.part || '')] || extraByPo[po] || {};
    const status = shippingStatusOf(row);
    const agingDays = status === 'intransit'
      ? (daysSince(extra.actualShipmentDate) ?? daysSince(row.orderdate) ?? 0)
      : (daysSince(row.orderdate) ?? 0);
    return { row, extra, status, agingDays };
  }).sort((a, b) => b.agingDays - a.agingDays), [allActiveItems, extraByPo]);
  const unshippedAvgAgingDays = useMemo(() => {
    const arr = unshippedRowsForAging.map((r) => daysSince(r.orderdate)).filter((v): v is number => v !== null);
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }, [unshippedRowsForAging]);
  const inTransitAvgAgingDays = useMemo(() => {
    const arr = inTransitRowsForAging.map((r) => {
      const po = String(r.po_number || '');
      const extra = extraByPo[makeExtraKey(po, String(r.po_item || ''), r.part || '')] || extraByPo[po] || {};
      return daysSince(extra.actualShipmentDate);
    }).filter((v): v is number => v !== null);
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }, [inTransitRowsForAging, extraByPo]);

  const ageingBuckets = useMemo(() => {
    const buckets = [
      { label: '0–30d', min: 0, max: 30, notShipped: 0, inTransit: 0 },
      { label: '31–60d', min: 31, max: 60, notShipped: 0, inTransit: 0 },
      { label: '61–90d', min: 61, max: 90, notShipped: 0, inTransit: 0 },
      { label: '91–120d', min: 91, max: 120, notShipped: 0, inTransit: 0 },
      { label: '120d+', min: 121, max: Infinity, notShipped: 0, inTransit: 0 },
    ];
    unshippedRowsForAging.forEach((r) => {
      const days = daysSince(r.orderdate);
      if (days === null) return;
      const b = buckets.find((bk) => days >= bk.min && days <= bk.max);
      if (b) b.notShipped += 1;
    });
    inTransitRowsForAging.forEach((r) => {
      const po = String(r.po_number || '');
      const extra = extraByPo[makeExtraKey(po, String(r.po_item || ''), r.part || '')] || extraByPo[po] || {};
      const days = daysSince(extra.actualShipmentDate);
      if (days === null) return;
      const b = buckets.find((bk) => days >= bk.min && days <= bk.max);
      if (b) b.inTransit += 1;
    });
    return buckets;
  }, [unshippedRowsForAging, inTransitRowsForAging, extraByPo]);


  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [visibleRows, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [purchaserFilter, viewTab, shippingStatusFilter, shippingMethodFilter, searchKeyword, wrongCodeOnly]);

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
    const noteKey = makeExtraKey(poNumber, String(row.po_item || ''), part);
    const current = wrongCodeNotes[noteKey] || '';
    const reason = window.prompt(
      lang === 'zh' ? '请输入错误料号批注（留空可清除）' : 'Please enter wrong-code note (leave empty to clear).',
      current,
    );
    if (reason === null) return;
    const note = String(reason || '').trim();
    await set(ref(database, `app_admin/openpo_vendor_3060_wrong_code_notes/${noteKey}`), note);
    setWrongCodeNotes((prev) => ({ ...prev, [noteKey]: note }));
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
    const rows = visibleRows.map((r) => [
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

  const updateExtraField = async (poNumber: string, poItem: string, part: string, field: keyof OpenPoExtraFields, value: string) => {
    if (!poNumber) return;
    const extraKey = makeExtraKey(poNumber, poItem, part);
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
        const extra = extraByPo[makeExtraKey(poNumber, String(row.po_item || ''), part)] || extraByPo[poNumber] || {};
        return [
        `${poNumber}+${row.po_item || ''}+${part}`,
        poNumber,
        row.po_item || '',
        part,
        row.vendor || '',
        row.purchasinggroup || '',
        normalizeDateForInput(row.orderdate || ''),
        normalizeDateForInput(row.deliverydate || ''),
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
        normalizeDateForInput(extra.estimatedShipmentDate || ''),
        extra.purchasingManager || '',
        extra.supplier || '',
        normalizeDateForInput(extra.plannedArrivalDate || ''),
        normalizeDateForInput(extra.actualShipmentDate || ''),
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
      const keyIdx = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(TEMPLATE_PK_HEADER));
      const legacyKeyIdx = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(LEGACY_TEMPLATE_PK_HEADER));
      const compositeKeyIdx = keyIdx !== -1 ? keyIdx : legacyKeyIdx;
      const poIdx = headers.findIndex((h) => BASE_HEADER_ALIASES[normalizeHeader(h)] === 'po_number');
      const poItemIdx = headers.findIndex((h) => BASE_HEADER_ALIASES[normalizeHeader(h)] === 'po_item');
      const partIdx = headers.findIndex((h) => BASE_HEADER_ALIASES[normalizeHeader(h)] === 'part');
      if (compositeKeyIdx === -1 && (poIdx === -1 || partIdx === -1)) {
        alert(
          lang === 'zh'
            ? '上传文件缺少“po_number+po_item+part”（兼容“po_number+part”）列（或“po_number”和“part”列）'
            : 'Missing composite key column “po_number+po_item+part” (legacy “po_number+part” is supported), or PO/Part columns.',
        );
        return;
      }

      const prevItemsByKey = items.reduce<Record<string, OpenPoItem>>((acc, row) => {
        const po = String(row.po_number || '').trim();
        const poItem = String(row.po_item || '').trim();
        const part = String(row.part || '').trim();
        if (!po || !part) return acc;
        acc[makeExtraKey(po, poItem, part)] = row;
        return acc;
      }, {});
      const rowMap: Record<string, OpenPoItem> = { ...prevItemsByKey };
      const updatedLocal: Record<string, OpenPoExtraFields> = {};
      const cancelledUpdates: Record<string, boolean> = {};
      const dbPromises: Promise<void>[] = [];

      dataLines.forEach((line) => {
        const cells = parseCsvLine(line);
        let poNumber = normalizePoValue(String(cells[poIdx] || '').trim());
        let poItem = String(cells[poItemIdx] || '').trim();
        let part = String(cells[partIdx] || '').trim();
        if (compositeKeyIdx !== -1) {
          const composite = String(cells[compositeKeyIdx] || '').trim();
          const parts = composite.split('+').map((x) => x.trim());
          if (parts.length >= 3) {
            poNumber = normalizePoValue(parts[0]);
            poItem = parts[1];
            part = parts.slice(2).join('+');
          } else if ((!poNumber || !part) && parts.length === 2) {
            poNumber = normalizePoValue(parts[0]);
            part = parts[1];
          }
        }
        if (!poNumber || !part) return;
        const extraKey = makeExtraKey(poNumber, poItem, part);
        const yesNo = (v: string) => ['yes', 'y', 'true', '1'].includes(String(v || '').trim().toLowerCase());
        const current = prevItemsByKey[extraKey] || {};
        const rowItem: OpenPoItem = { ...current, po_number: poNumber, po_item: poItem, part };
        headers.forEach((header, idx) => {
          const baseField = BASE_HEADER_ALIASES[normalizeHeader(header)];
          if (!baseField || baseField === 'po_number' || baseField === 'po_item' || baseField === 'part') return;
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
          let value = String(cells[idx] ?? '').trim();
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
        const [prodOpenSnap, prodOpenHashSnap] = await Promise.all([
          get(ref(database, 'production_report/open_po/items')),
          get(ref(database, 'production_report/open_po/hash/items')),
        ]);
        const prodOpen = (prodOpenSnap.val() || {}) as Record<string, OpenPoItem>;
        const prodOpenHash = (prodOpenHashSnap.val() || {}) as Record<string, OpenPoItem>;
        if (Object.keys(cancelledUpdates).length) {
          await update(ref(database, 'app_admin/cancelled_openpo'), cancelledUpdates);
          setCancelled((prev) => ({ ...prev, ...cancelledUpdates }));
        }
        if (dbPromises.length) await Promise.all(dbPromises);
        setItems(mergeWithOpenPo(rowMap, prodOpen, prodOpenHash));
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t(lang, 'openPoVendor3060')}</h1>
          <p className="mt-0.5 text-xs text-gray-400">{lang === 'zh' ? '采购订单跟踪 · Vendor 3060' : 'Purchase Order Tracking · Vendor 3060'}</p>
        </div>
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
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 p-1 w-fit">
        <Button
          className="h-8 rounded-md px-4 text-sm"
          variant={viewTab === 'active' ? 'default' : 'ghost'}
          onClick={() => setViewTab('active')}
        >
          {lang === 'zh' ? '开放订单' : 'Open Orders'}
        </Button>
        <Button
          className="h-8 rounded-md px-4 text-sm"
          variant={viewTab === 'new7days' ? 'default' : 'ghost'}
          onClick={() => setViewTab('new7days')}
        >
          {lang === 'zh' ? '新订单（7天）' : 'New Orders (7d)'}
        </Button>
        <Button
          className="h-8 rounded-md px-4 text-sm"
          variant={viewTab === 'cancelled' ? 'default' : 'ghost'}
          onClick={() => setViewTab('cancelled')}
        >
          {lang === 'zh' ? '已取消订单' : 'Cancelled Orders'}
        </Button>
        <Button
          className="h-8 rounded-md px-4 text-sm"
          variant={viewTab === 'dashboard' ? 'default' : 'ghost'}
          onClick={() => setViewTab('dashboard')}
        >
          {lang === 'zh' ? '看板' : 'Dashboard'}
        </Button>
      </div>

      {/* Purchaser filter */}
      {(viewTab === 'active' || viewTab === 'new7days') && (
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
      {(viewTab === 'active' || viewTab === 'new7days') && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={wrongCodeOnly ? 'default' : 'outline'} onClick={() => setWrongCodeOnly((v) => !v)}>
            {lang === 'zh' ? '仅错误料号' : 'Wrong Code Only'}
          </Button>
          <span className="h-5 w-px bg-gray-200" />
          <Button variant={shippingStatusFilter === 'all' ? 'default' : 'outline'} onClick={() => setShippingStatusFilter('all')}>
            {lang === 'zh' ? '发货状态：全部' : 'Status: All'}
          </Button>
          <Button variant={shippingStatusFilter === 'intransit' ? 'default' : 'outline'} onClick={() => setShippingStatusFilter('intransit')}>
            {lang === 'zh' ? '在途' : 'In Transit'}
          </Button>
          <Button variant={shippingStatusFilter === 'notshipped' ? 'default' : 'outline'} onClick={() => setShippingStatusFilter('notshipped')}>
            {lang === 'zh' ? '未发货' : 'Not Shipped'}
          </Button>
          <span className="h-5 w-px bg-gray-200" />
          <Button variant={shippingMethodFilter === 'all' ? 'default' : 'outline'} onClick={() => setShippingMethodFilter('all')}>
            {lang === 'zh' ? '运输方式：全部' : 'Method: All'}
          </Button>
          <Button
            className={shippingMethodFilter === 'air freight' ? '' : ''}
            variant={shippingMethodFilter === 'air freight' ? 'default' : 'outline'}
            onClick={() => setShippingMethodFilter('air freight')}
          >
            ✈ {lang === 'zh' ? '空运' : 'Air Freight'}
          </Button>
          <Button
            variant={shippingMethodFilter === 'sea freight' ? 'default' : 'outline'}
            onClick={() => setShippingMethodFilter('sea freight')}
          >
            🚢 {lang === 'zh' ? '海运' : 'Sea Freight'}
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
      {viewTab !== 'dashboard' && (
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
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card className="border-0 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-blue-600">{t(lang, 'lineCount')}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1">
            <div className="text-3xl font-bold tabular-nums text-blue-700">{openPoNumber.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-violet-50 to-purple-50 shadow-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-violet-600">{t(lang, 'totalOpenQty')}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1">
            <div className="text-3xl font-bold tabular-nums text-violet-700">{displayNumber(totalOpenQty)}</div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-rose-50 to-pink-50 shadow-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-rose-600">{lang === 'zh' ? '错误料号条数' : 'Wrong Code Rows'}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1">
            <div className="text-3xl font-bold tabular-nums text-rose-600">{Object.values(wrongCodeNotes).filter(Boolean).length.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-amber-600">{lang === 'zh' ? 'Item 未发数量' : 'Unshipped Items'}</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 pt-1">
            <div className="text-3xl font-bold tabular-nums text-amber-600">{unshippedItemCount.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {viewTab === 'dashboard' ? (
        <div className="space-y-5">
          {/* Disclaimer — independent of filters */}
          <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-2 text-xs text-blue-600">
            <span className="font-semibold">ⓘ</span>
            <span>{lang === 'zh' ? '看板数据不受上方筛选条件影响，显示所有未取消订单。' : 'Dashboard data is independent of all filters above — shows all non-cancelled orders.'}</span>
          </div>

          {/* KPI row — 4 cards matching main tab layout */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="border-0 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                  {lang === 'zh' ? '未发货' : 'Not Shipped'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-1">
                <div className="text-3xl font-bold tabular-nums text-amber-600">{unshippedRowsForAging.length.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-amber-500">
                  {lang === 'zh' ? `均 ${unshippedAvgAgingDays}d` : `avg ${unshippedAvgAgingDays}d`}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {lang === 'zh' ? '在途' : 'In Transit'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-1">
                <div className="text-3xl font-bold tabular-nums text-emerald-600">{inTransitRowsForAging.length.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-emerald-500">
                  {lang === 'zh' ? `均 ${inTransitAvgAgingDays}d` : `avg ${inTransitAvgAgingDays}d`}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gradient-to-br from-purple-50 to-violet-50 shadow-sm">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                  ✈ {lang === 'zh' ? '空运订单' : 'Air Freight'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-1">
                <div className="text-3xl font-bold tabular-nums text-purple-600">{dashAirRows.length.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-purple-500">
                  {lang === 'zh' ? '点击下方查看详情' : 'See detail below'}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 bg-gradient-to-br from-sky-50 to-blue-50 shadow-sm">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-sky-600">
                  🚢 {lang === 'zh' ? '海运订单' : 'Sea Freight'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-1">
                <div className="text-3xl font-bold tabular-nums text-sky-600">
                  {(allActiveItems.length - dashAirRows.length).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ageing bar chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                {lang === 'zh' ? 'Ageing 分布（天数区间）' : 'Ageing Distribution by Day Range'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const maxVal = Math.max(1, ...ageingBuckets.map((b) => Math.max(b.notShipped, b.inTransit)));
                const chartH = 160;
                const barW = 40;
                const gap = 16;
                const groupW = barW * 2 + 8;
                const totalW = ageingBuckets.length * (groupW + gap) - gap;
                const padL = 40;
                const padT = 16;
                const yTicks = [0, Math.round(maxVal * 0.25), Math.round(maxVal * 0.5), Math.round(maxVal * 0.75), maxVal];
                return (
                  <div className="overflow-x-auto">
                    <svg viewBox={`0 0 ${totalW + padL + 16} ${chartH + 56}`} className="w-full max-w-2xl" style={{ minWidth: 320 }}>
                      {yTicks.map((tick) => {
                        const y = padT + chartH - (tick / maxVal) * chartH;
                        return (
                          <g key={tick}>
                            <line x1={padL} y1={y} x2={padL + totalW} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{tick}</text>
                          </g>
                        );
                      })}
                      {ageingBuckets.map((bucket, i) => {
                        const x = padL + i * (groupW + gap);
                        const nsH = (bucket.notShipped / maxVal) * chartH;
                        const itH = (bucket.inTransit / maxVal) * chartH;
                        const nsY = padT + chartH - nsH;
                        const itY = padT + chartH - itH;
                        return (
                          <g key={bucket.label}>
                            <rect x={x} y={nsY} width={barW} height={nsH} rx="3" fill="#f59e0b" opacity="0.85" />
                            {bucket.notShipped > 0 && <text x={x + barW / 2} y={nsY - 4} textAnchor="middle" fontSize="10" fill="#92400e" fontWeight="600">{bucket.notShipped}</text>}
                            <rect x={x + barW + 8} y={itY} width={barW} height={itH} rx="3" fill="#10b981" opacity="0.85" />
                            {bucket.inTransit > 0 && <text x={x + barW + 8 + barW / 2} y={itY - 4} textAnchor="middle" fontSize="10" fill="#064e3b" fontWeight="600">{bucket.inTransit}</text>}
                            <text x={x + groupW / 2} y={padT + chartH + 14} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="500">{bucket.label}</text>
                          </g>
                        );
                      })}
                      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#d1d5db" strokeWidth="1" />
                      <line x1={padL} y1={padT + chartH} x2={padL + totalW} y2={padT + chartH} stroke="#d1d5db" strokeWidth="1" />
                    </svg>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /><span className="text-gray-600">{lang === 'zh' ? '未发货' : 'Not Shipped'}</span></div>
                      <div className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /><span className="text-gray-600">{lang === 'zh' ? '在途' : 'In Transit'}</span></div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Air Freight Detail Table */}
          <Card className="border-purple-100">
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setDashAirExpanded((v) => !v)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                  <span>✈</span>
                  <span>{lang === 'zh' ? `空运订单 Ageing 明细（${dashAirRows.length} 条）` : `Air Freight Ageing Detail (${dashAirRows.length} items)`}</span>
                </CardTitle>
                <span className="text-xs text-purple-400">{dashAirExpanded ? '▲' : '▼'} {lang === 'zh' ? (dashAirExpanded ? '收起' : '展开') : (dashAirExpanded ? 'Collapse' : 'Expand')}</span>
              </div>
              <p className="mt-1 text-[11px] text-purple-400">
                {lang === 'zh' ? '按 Ageing 天数降序排列（最旧在前）' : 'Sorted by ageing days descending (oldest first)'}
              </p>
            </CardHeader>
            {dashAirExpanded && (
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-xs">
                    <thead>
                      <tr className="border-b border-purple-100 bg-purple-50/60 text-[10px] font-semibold uppercase tracking-wider text-purple-600">
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? 'PO号' : 'PO'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? '零件号' : 'Part'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? '车架号' : 'Chassis'}</th>
                        <th className="px-3 py-2 min-w-[160px] text-left">{lang === 'zh' ? '描述' : 'Description'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? '下单日期' : 'Order Date'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{lang === 'zh' ? '开放数量' : 'Open Qty'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{lang === 'zh' ? 'Ageing 天数' : 'Ageing Days'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? '预计发运' : 'Est. Ship'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? '实际发货' : 'Actual Ship'}</th>
                        <th className="px-3 py-2 whitespace-nowrap text-left">{lang === 'zh' ? '状态' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {dashAirRows.length === 0 ? (
                        <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">{lang === 'zh' ? '暂无空运订单' : 'No air freight orders'}</td></tr>
                      ) : dashAirRows.map(({ row, extra, status, agingDays }) => {
                        const ageColor = agingDays >= 14 ? 'text-rose-600 font-bold' : agingDays >= 7 ? 'text-amber-600 font-semibold' : 'text-gray-700';
                        const ch = extra.chassis || row.chassisnumber;
                        return (
                          <tr key={keyOf(row)} className="hover:bg-purple-50/40 transition-colors">
                            <td className="px-3 py-2 font-mono">{row.po_number || '-'}</td>
                            <td className="px-3 py-2 font-mono">{row.part || '-'}</td>
                            <td className="px-3 py-2 font-mono">
                              {ch ? <span className="rounded bg-gray-100 px-1.5 py-0.5">{ch}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 max-w-[200px]">
                              <div className="line-clamp-2 leading-snug text-gray-800">{row.spras_en || row.description || '—'}</div>
                              {row.spras_zh && <div className="text-[10px] text-gray-400">{row.spras_zh}</div>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(row.orderdate)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{(row.openqty ?? 0).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${agingDays >= 14 ? 'bg-rose-100 text-rose-700' : agingDays >= 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                {agingDays}d
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(extra.estimatedShipmentDate) || '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(extra.actualShipmentDate) || '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === 'intransit' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${status === 'intransit' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                {status === 'intransit' ? 'In Transit' : 'Not Shipped'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      ) : (
      /* ── Main table ─────────────────────────────────────────────────────────── */
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  {/* Expand toggle */}
                  <th className="sticky left-0 z-10 bg-gray-50/80 px-3 py-3 w-8" />
                  {/* Sticky cols */}
                  <th className="sticky left-8 z-10 bg-gray-50/80 px-3 py-3 whitespace-nowrap">
                    {t(lang, 'poNumber')}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">
                    {lang === 'zh' ? '采购专员' : 'Purchaser'}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">PO Item</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t(lang, 'part')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{lang === 'zh' ? '车架号' : 'Chassis'}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{lang === 'zh' ? '照片' : 'Photo'}</th>
                  <th className="px-3 py-3 min-w-[200px]">
                    {lang === 'zh' ? '描述' : 'Description'}
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">{t(lang, 'orderDate')}</th>
                  <th className="px-3 py-3 whitespace-nowrap">{t(lang, 'deliveryDate')}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{t(lang, 'orderQty')}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{t(lang, 'receivedQty')}</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{t(lang, 'openQty')}</th>
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
                  const extra = extraByPo[makeExtraKey(poNumber, String(r.po_item || ''), r.part || '')] || extraByPo[poNumber] || {};
                  const shippingStatus = shippingStatusOf(r);
                  const isExpanded = expandedRows.has(rowKey);
                  const filled = filledCount(extra);
                  const wrongCodeNote = wrongCodeNotes[makeExtraKey(poNumber, String(r.po_item || ''), r.part || '')] || '';
                  const sapMissing = r.sapMatched === false;

                  return (
                    <>
                      {/* Main row */}
                      <tr
                        key={rowKey}
                        className={`transition-colors ${sapMissing ? 'bg-rose-50/50 hover:bg-rose-50/80' : (shippingStatus === 'intransit' ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'hover:bg-gray-50/80')} ${cancelledRow ? 'opacity-40' : ''} ${isExpanded ? 'ring-1 ring-inset ring-blue-200' : ''}`}
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

                        <td className="px-3 py-2 font-mono text-xs">{r.po_item || '-'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.part || '-'}</td>

                        {/* Chassis */}
                        <td className="px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">
                          {(() => {
                            const ch = extra.chassis || r.chassisnumber;
                            return ch ? <span className="rounded bg-gray-100 px-1.5 py-0.5">{ch}</span> : <span className="text-gray-300">—</span>;
                          })()}
                        </td>

                        {/* Photo */}
                        <td className="px-3 py-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <button className="h-10 w-10 overflow-hidden rounded border hover:border-blue-400 transition-colors">
                                <ImageWithFallback
                                  src={FirebaseService.getPartImageUrl(r.part || '')}
                                  fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)}
                                  alt={r.part || 'part'}
                                  hideFallbackText
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
                                  hideFallbackText
                                  className="h-full w-full object-contain"
                                />
                              </div>
                            </DialogContent>
                          </Dialog>
                        </td>

                        {/* Description */}
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="space-y-0.5">
                            <div className="text-xs leading-snug text-gray-800 line-clamp-2">
                              {sapMissing ? (lang === 'zh' ? '无相应SAP Data' : 'No matching SAP Data') : (r.spras_en || r.description || '-')}
                            </div>
                            <div className="text-[10px] leading-snug text-gray-400">
                              {sapMissing ? '' : (r.spras_zh || '')}
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
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${shippingStatus === 'intransit' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${shippingStatus === 'intransit' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
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
                            <Button variant="outline" size="sm" className={`h-7 text-xs ${wrongCodeNote ? 'border-rose-300 text-rose-600' : ''}`} onClick={() => reportWrongCode(r)}>
                              {wrongCodeNote || (lang === 'zh' ? 'Wrong Code（错误料号）' : 'Wrong Code')}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded extra fields row */}
                      {isExpanded && (
                        <tr key={`${rowKey}_extra`} className="bg-gray-50/80">
                          <td colSpan={16} className="p-0">
                            <div className="border-l-4 border-blue-400">
                              <ExtraFieldsPanel
                                poNumber={poNumber}
                                poItem={String(r.po_item || '')}
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
      )}

      {/* Pagination */}
      {viewTab !== 'dashboard' && (
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
          {lang === 'zh' ? '上一页' : 'Previous'}
        </Button>
        <Button variant="outline" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
          {lang === 'zh' ? '下一页' : 'Next'}
        </Button>
      </div>
      )}
    </div>
  );
}
