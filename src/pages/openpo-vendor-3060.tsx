import { useEffect, useMemo, useRef, useState } from 'react';
import { get, ref, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { FirebaseService } from '@/services/firebase';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { getLang, t, type Lang } from '@/lib/i18n';

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
};

type OpenPoExtraFields = {
  chassis?: string;
  shippingMethod?: 'sea freight' | 'air freight';
  category?: '自制件' | '外购件' | '';
  estimatedShipmentDate?: string;
  purchasingManager?: string;
  supplier?: string;
  plannedArrivalDate?: string;
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

const PAGE_SIZE = 30;

const formatDate = (value?: string) => {
  if (!value) return '-';
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function OpenPoVendor3060Page() {
  const [items, setItems] = useState<OpenPoItem[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [cancelled, setCancelled] = useState<Record<string, boolean>>({});
  const [stockByPart, setStockByPart] = useState<Record<string, number>>({});
  const [descByPart, setDescByPart] = useState<Record<string, { en: string; zh: string }>>({});
  const [lang, setLang] = useState<Lang>(getLang());
  const [purchaserFilter, setPurchaserFilter] = useState<PurchaserFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [bulkPoInput, setBulkPoInput] = useState('');
  const [extraByPo, setExtraByPo] = useState<Record<string, OpenPoExtraFields>>({});
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    Promise.all([
      get(ref(database, 'production_report/open_po/items')),
      FirebaseService.getAllParts(),
      get(ref(database, 'app_admin/purchasing_group_mapping')),
      get(ref(database, 'app_admin/cancelled_openpo')),
      get(ref(database, 'app_admin/openpo_vendor_3060_extra')),
    ]).then(([openSnap, allParts, mapSnap, cancelSnap, extraSnap]) => {
      setItems(Object.values((openSnap.val() || {}) as Record<string, OpenPoItem>));
      const stockMap = Object.entries(allParts || {}).reduce<Record<string, number>>((acc, [material, part]) => {
        const key = String(material || '').trim();
        if (!key) return acc;
        const partData = part as { Current_Stock_Qty?: number };
        acc[key] = Number(partData.Current_Stock_Qty || 0);
        return acc;
      }, {});
      const partDescMap = Object.entries(allParts || {}).reduce<Record<string, { en: string; zh: string }>>((acc, [material, part]) => {
        const key = String(material || '').trim();
        if (!key) return acc;
        const partData = part as { SPRAS_EN?: string; SPRAS_ZH?: string };
        acc[key] = {
          en: String(partData.SPRAS_EN || ''),
          zh: String(partData.SPRAS_ZH || ''),
        };
        return acc;
      }, {});
      setStockByPart(stockMap);
      setDescByPart(partDescMap);
      setMapping((mapSnap.val() || {}) as Record<string, string>);
      setCancelled((cancelSnap.val() || {}) as Record<string, boolean>);
      setExtraByPo((extraSnap.val() || {}) as Record<string, OpenPoExtraFields>);
    });
  }, []);

  useEffect(() => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;
    const syncFromTop = () => {
      table.scrollLeft = top.scrollLeft;
    };
    const syncFromTable = () => {
      top.scrollLeft = table.scrollLeft;
    };
    top.addEventListener('scroll', syncFromTop);
    table.addEventListener('scroll', syncFromTable);
    return () => {
      top.removeEventListener('scroll', syncFromTop);
      table.removeEventListener('scroll', syncFromTable);
    };
  }, [pagedRows.length]);


  useEffect(() => {
    const initExtras = async () => {
      const updatesByPo: Record<string, Partial<OpenPoExtraFields>> = {};
      items.forEach((row) => {
        const poNumber = String(row.po_number || '').trim();
        if (!poNumber) return;
        const current = extraByPo[poNumber] || {};
        const next: Partial<OpenPoExtraFields> = {};
        if (!current.shippingMethod) next.shippingMethod = 'sea freight';
        if (!current.chassis && row.chassisnumber) next.chassis = row.chassisnumber;
        if (Object.keys(next).length) updatesByPo[poNumber] = next;
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
        Object.entries(updatesByPo).map(([po, patch]) => update(ref(database, `app_admin/openpo_vendor_3060_extra/${po}`), patch)),
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

  const keyOf = (row: OpenPoItem) => `${row.po_number || 'po'}_${row.part || 'part'}`;
  const activeRows = useMemo(() => filtered.filter((row) => !cancelled[keyOf(row)]), [filtered, cancelled]);
  const cancelledRows = useMemo(() => filtered.filter((row) => cancelled[keyOf(row)]), [filtered, cancelled]);
  const visibleRows = viewTab === 'cancelled' ? cancelledRows : activeRows;

  const totalOpenQty = useMemo(() => visibleRows.reduce((sum, item) => sum + Number(item.openqty || 0), 0), [visibleRows]);
  const openPoNumber = useMemo(() => new Set(visibleRows.map((x) => x.po_number).filter(Boolean)).size, [visibleRows]);
  const displayNumber = (value?: number) => Number(value || 0).toLocaleString();

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleRows.slice(start, start + PAGE_SIZE);
  }, [visibleRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [purchaserFilter, viewTab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toggleCancel = async (row: OpenPoItem) => {
    const key = keyOf(row);
    const next = !cancelled[key];
    setCancelled((prev) => ({ ...prev, [key]: next }));
    await update(ref(database, 'app_admin/cancelled_openpo'), { [key]: next });
  };

  const bulkCancelByPo = async () => {
    const poSet = new Set(
      bulkPoInput
        .split(/[\s,;\n\r\t]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    );
    if (!poSet.size) return;
    const updates: Record<string, boolean> = {};
    filtered.forEach((row) => {
      if (poSet.has(String(row.po_number || '').trim())) {
        updates[keyOf(row)] = true;
      }
    });
    if (!Object.keys(updates).length) return;
    setCancelled((prev) => ({ ...prev, ...updates }));
    await update(ref(database, 'app_admin/cancelled_openpo'), updates);
    setBulkPoInput('');
    setViewTab('cancelled');
  };

  const downloadExcel = () => {
    const headers = ['PO Number', 'Australia Purchaser', 'Part', 'Description EN (PO)', 'Description ZH (By Part)', 'Order Date', 'Delivery Date', 'Order Qty', 'Received Qty', 'Open Qty', 'Cancelled'];
    const rows = filtered.map((r) => [
      r.po_number || '-',
      mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-',
      r.part || '-',
      r.spras_en || r.description || '-',
      descByPart[String(r.part || '').trim()]?.zh || r.spras_zh || '-',
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

  const updateExtraField = async (poNumber: string, field: keyof OpenPoExtraFields, value: string) => {
    if (!poNumber) return;
    setExtraByPo((prev) => ({
      ...prev,
      [poNumber]: {
        ...prev[poNumber],
        [field]: value,
      },
    }));
    await update(ref(database, `app_admin/openpo_vendor_3060_extra/${poNumber}`), {
      [field]: value,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">{t(lang, 'openPoVendor3060')}</h1>
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">{lang === 'zh' ? '批量取消PO' : 'Bulk Cancel PO'}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg space-y-3">
              <h2 className="text-lg font-semibold">{lang === 'zh' ? '上传/粘贴PO号并取消' : 'Upload/Paste PO numbers to cancel'}</h2>
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
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant={viewTab === 'active' ? 'default' : 'outline'} onClick={() => setViewTab('active')}>
          {lang === 'zh' ? '开放订单' : 'Open Orders'}
        </Button>
        <Button variant={viewTab === 'cancelled' ? 'default' : 'outline'} onClick={() => setViewTab('cancelled')}>
          {lang === 'zh' ? '已取消订单' : 'Cancelled Orders'}
        </Button>
      </div>

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

      <div className="flex items-center gap-3">
        {viewTab === 'active' && (
          <Button variant={purchaserFilter === 'all' ? 'default' : 'outline'} onClick={() => setPurchaserFilter('all')}>
            {lang === 'zh' ? '全部' : 'All'}
          </Button>
        )}
        <span className="text-sm text-gray-500">
          {lang === 'zh' ? `第 ${currentPage} / ${totalPages} 页（每页 ${PAGE_SIZE} 条）` : `Page ${currentPage} of ${totalPages} (${PAGE_SIZE} rows/page)`}
        </span>
      </div>

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

      <Card>
        <CardContent className="pt-6">
          <div ref={topScrollRef} className="mb-2 overflow-x-auto overflow-y-hidden">
            <div className="h-1 min-w-[4200px]" />
          </div>
          <div ref={tableScrollRef} className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">{t(lang, 'poNumber')}</th>
                <th className="p-2">{lang === 'zh' ? '采购专员' : 'Australia Purchaser'}</th>
                <th className="p-2">{t(lang, 'part')}</th>
                <th className="p-2">{lang === 'zh' ? '照片' : 'Photo'}</th>
                <th className="p-2">{lang === 'zh' ? '澳洲库存' : 'Australian Stock'}</th>
                <th className="p-2">{lang === 'zh' ? '描述（英文PO / 中文主数据）' : 'Description (EN from PO / ZH from Part Master)'}</th>
                <th className="p-2">{t(lang, 'orderDate')}</th>
                <th className="p-2">{t(lang, 'deliveryDate')}</th>
                <th className="p-2 text-right">{t(lang, 'orderQty')}</th>
                <th className="p-2 text-right">{t(lang, 'receivedQty')}</th>
                <th className="p-2 text-right">{t(lang, 'openQty')}</th>
                <th className="p-2">Chassis</th>
                <th className="p-2">运输方式</th>
                <th className="p-2">分类</th>
                <th className="p-2">预计发运时间</th>
                <th className="p-2">采购经理</th>
                <th className="p-2">供应商</th>
                <th className="p-2">计划到货时间</th>
                <th className="p-2">实发数量</th>
                <th className="p-2">剩余未发数量</th>
                <th className="p-2">海运车架号（集装箱）</th>
                <th className="p-2">位置</th>
                <th className="p-2">集装箱号</th>
                <th className="p-2">空运单号</th>
                <th className="p-2">评价</th>
                <th className="p-2">发货集装箱号/空运单号/车架号</th>
                <th className="p-2">备注</th>
                <th className="p-2">{lang === 'zh' ? '操作' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, i) => {
                const cancelledRow = cancelled[keyOf(r)];
                const poNumber = String(r.po_number || '');
                const extra = extraByPo[poNumber] || {};
                return (
                  <tr key={i} className={`border-b ${cancelledRow ? 'line-through text-gray-400' : ''}`}>
                    <td className="p-2">{r.po_number || '-'}</td>
                    <td className="p-2">{mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-'}</td>
                    <td className="p-2">{r.part || '-'}</td>
                    <td className="p-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="h-12 w-12 overflow-hidden rounded border">
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
                    <td className="p-2">{displayNumber(stockByPart[String(r.part || '').trim()] || 0)}</td>
                    <td className="p-2">
                      <div className="space-y-1">
                        <div><span className="text-xs text-gray-500">EN:</span> {r.spras_en || r.description || '-'}</div>
                        <div><span className="text-xs text-gray-500">ZH:</span> {descByPart[String(r.part || '').trim()]?.zh || r.spras_zh || '-'}</div>
                      </div>
                    </td>
                    <td className="p-2">{formatDate(r.orderdate)}</td>
                    <td className="p-2">{formatDate(r.deliverydate)}</td>
                    <td className="p-2 text-right">{displayNumber(r.orderqty)}</td>
                    <td className="p-2 text-right">{displayNumber(r.receivedqty)}</td>
                    <td className="p-2 text-right">{displayNumber(r.openqty)}</td>
                    <td className="p-2"><input className="w-40 rounded border p-1" value={extra.chassis ?? r.chassisnumber ?? ''} onChange={(e) => updateExtraField(poNumber, 'chassis', e.target.value)} /></td>
                    <td className="p-2"><select className="w-40 rounded border p-1" value={extra.shippingMethod || 'sea freight'} onChange={(e) => updateExtraField(poNumber, 'shippingMethod', e.target.value)}><option value="sea freight">sea freight</option><option value="air freight">air freight</option></select></td>
                    <td className="p-2"><select className="w-32 rounded border p-1" value={extra.category || ''} onChange={(e) => updateExtraField(poNumber, 'category', e.target.value)}><option value=""></option><option value="自制件">自制件</option><option value="外购件">外购件</option></select></td>
                    <td className="p-2"><input type="date" className="w-40 rounded border p-1" value={extra.estimatedShipmentDate || ''} onChange={(e) => updateExtraField(poNumber, 'estimatedShipmentDate', e.target.value)} /></td>
                    <td className="p-2"><input className="w-32 rounded border p-1" value={extra.purchasingManager || ''} onChange={(e) => updateExtraField(poNumber, 'purchasingManager', e.target.value)} /></td>
                    <td className="p-2"><input className="w-32 rounded border p-1" value={extra.supplier || ''} onChange={(e) => updateExtraField(poNumber, 'supplier', e.target.value)} /></td>
                    <td className="p-2"><input type="date" className="w-40 rounded border p-1" value={extra.plannedArrivalDate || ''} onChange={(e) => updateExtraField(poNumber, 'plannedArrivalDate', e.target.value)} /></td>
                    <td className="p-2"><input className="w-28 rounded border p-1" value={extra.actualShippedQty || ''} onChange={(e) => updateExtraField(poNumber, 'actualShippedQty', e.target.value)} /></td>
                    <td className="p-2"><input className="w-28 rounded border p-1" value={extra.remainingUnshippedQty || ''} onChange={(e) => updateExtraField(poNumber, 'remainingUnshippedQty', e.target.value)} /></td>
                    <td className="p-2"><input className="w-44 rounded border p-1" value={extra.seaFreightChassis || ''} onChange={(e) => updateExtraField(poNumber, 'seaFreightChassis', e.target.value)} /></td>
                    <td className="p-2"><input className="w-28 rounded border p-1" value={extra.location || ''} onChange={(e) => updateExtraField(poNumber, 'location', e.target.value)} /></td>
                    <td className="p-2"><input className="w-32 rounded border p-1" value={extra.containerNo || ''} onChange={(e) => updateExtraField(poNumber, 'containerNo', e.target.value)} /></td>
                    <td className="p-2"><input className="w-32 rounded border p-1" value={extra.airWaybillNo || ''} onChange={(e) => updateExtraField(poNumber, 'airWaybillNo', e.target.value)} /></td>
                    <td className="p-2"><input className="w-28 rounded border p-1" value={extra.evaluation || ''} onChange={(e) => updateExtraField(poNumber, 'evaluation', e.target.value)} /></td>
                    <td className="p-2"><input className="w-48 rounded border p-1" value={extra.shippingTrackingMixed || ''} onChange={(e) => updateExtraField(poNumber, 'shippingTrackingMixed', e.target.value)} /></td>
                    <td className="p-2"><input className="w-48 rounded border p-1" value={extra.remarks || ''} onChange={(e) => updateExtraField(poNumber, 'remarks', e.target.value)} /></td>
                    <td className="p-2">
                      <Button variant="outline" size="sm" onClick={() => toggleCancel(r)}>
                        {cancelledRow ? (lang === 'zh' ? '恢复' : 'Undo') : 'Cancel'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </CardContent>
      </Card>

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
