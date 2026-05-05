import { useEffect, useMemo, useState } from 'react';
import { get, ref, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { FirebaseService } from '@/services/firebase';
import { getLang, t, type Lang } from '@/lib/i18n';

type OpenPoItem = { po_number?: string; part?: string; vendor?: string; purchasinggroup?: string; orderdate?: string; deliverydate?: string; orderqty?: number; receivedqty?: number; openqty?: number; description?: string; };

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
  const [lang, setLang] = useState<Lang>(getLang());

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);
  useEffect(() => {
    Promise.all([
      get(ref(database, 'production_report/open_po/items')),
      get(ref(database, 'production_report/summary/items')),
      get(ref(database, 'app_admin/purchasing_group_mapping')),
      get(ref(database, 'app_admin/cancelled_openpo')),
    ]).then(([openSnap, summarySnap, mapSnap, cancelSnap]) => {
      setItems(Object.values((openSnap.val() || {}) as Record<string, OpenPoItem>));
      const summaryItems = Object.values((summarySnap.val() || {}) as Record<string, { part?: string; stock_qty?: number }>);
      const stockMap = summaryItems.reduce<Record<string, number>>((acc, item) => { const key = String(item.part || '').trim(); if (!key) return acc; acc[key] = Number(item.stock_qty || 0); return acc; }, {});
      setStockByPart(stockMap);
      setMapping((mapSnap.val() || {}) as Record<string, string>);
      setCancelled((cancelSnap.val() || {}) as Record<string, boolean>);
    });
  }, []);

  const filtered = useMemo(() => items.filter((i) => String(i.vendor || '').replace(/^0+/, '').trim() === '3060'), [items]);
  const totalOpenQty = useMemo(() => filtered.reduce((sum, item) => sum + Number(item.openqty || 0), 0), [filtered]);
  const openPoNumber = useMemo(() => new Set(filtered.map((x) => x.po_number).filter(Boolean)).size, [filtered]);
  const displayNumber = (value?: number) => Number(value || 0).toLocaleString();

  const keyOf = (row: OpenPoItem) => `${row.po_number || 'po'}_${row.part || 'part'}`;
  const toggleCancel = async (row: OpenPoItem) => {
    const key = keyOf(row);
    const next = !Boolean(cancelled[key]);
    setCancelled((prev) => ({ ...prev, [key]: next }));
    await update(ref(database, 'app_admin/cancelled_openpo'), { [key]: next });
  };

  const downloadExcel = () => {
    const headers = ['PO Number', 'Australia Purchaser', 'Part', 'Description', 'Order Date', 'Delivery Date', 'Order Qty', 'Received Qty', 'Open Qty', 'Cancelled'];
    const rows = filtered.map((r) => [
      r.po_number || '-',
      mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-',
      r.part || '-',
      r.description || '-',
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

  return <div className="space-y-6"><div className="flex items-center justify-between"><h1 className="text-3xl font-bold text-gray-900">{t(lang, 'openPoVendor3060')}</h1><Button onClick={downloadExcel}>{lang === 'zh' ? '下载Excel' : 'Download Excel'}</Button></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>{t(lang, 'lineCount')}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{openPoNumber}</CardContent></Card><Card><CardHeader><CardTitle>{t(lang, 'totalOpenQty')}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{displayNumber(totalOpenQty)}</CardContent></Card></div><Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">{t(lang, 'poNumber')}</th><th className="p-2">Australia Purchaser</th><th className="p-2">{t(lang, 'part')}</th><th className="p-2">Photo</th><th className="p-2">Stock</th><th className="p-2">{t(lang, 'description')}</th><th className="p-2">{t(lang, 'orderDate')}</th><th className="p-2">{t(lang, 'deliveryDate')}</th><th className="p-2 text-right">{t(lang, 'orderQty')}</th><th className="p-2 text-right">{t(lang, 'receivedQty')}</th><th className="p-2 text-right">{t(lang, 'openQty')}</th><th className="p-2">{lang === 'zh' ? '操作' : 'Action'}</th></tr></thead><tbody>{filtered.map((r, i) => { const cancelledRow = cancelled[keyOf(r)]; return <tr key={i} className={`border-b ${cancelledRow ? 'line-through text-gray-400' : ''}`}><td className="p-2">{r.po_number || '-'}</td><td className="p-2">{mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-'}</td><td className="p-2">{r.part || '-'}</td><td className="p-2"><div className="h-12 w-12 overflow-hidden rounded border"><ImageWithFallback src={FirebaseService.getPartImageUrl(r.part || '')} fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)} alt={r.part || 'part'} className="h-full w-full object-contain" /></div></td><td className="p-2">{displayNumber(stockByPart[String(r.part || '').trim()] || 0)}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{formatDate(r.orderdate)}</td><td className="p-2">{formatDate(r.deliverydate)}</td><td className="p-2 text-right">{displayNumber(r.orderqty)}</td><td className="p-2 text-right">{displayNumber(r.receivedqty)}</td><td className="p-2 text-right">{displayNumber(r.openqty)}</td><td className="p-2"><Button variant="outline" size="sm" onClick={() => toggleCancel(r)}>{cancelledRow ? (lang === 'zh' ? '恢复' : 'Undo') : 'Cancel'}</Button></td></tr>; })}</tbody></table></CardContent></Card></div>;
}
