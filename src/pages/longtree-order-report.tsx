import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLang, t, type Lang } from '@/lib/i18n';

type OpenPoItem = {
  po_number?: string;
  po_item?: string;
  part?: string;
  orderdate?: string;
  openqty?: number;
};

type OpenPoExtraFields = {
  actualShipmentDate?: string;
};

const daysBetween = (orderDate?: string) => {
  if (!orderDate) return 0;
  const raw = String(orderDate).trim();
  let parsed = raw;
  if (/^\d{8}$/.test(raw)) {
    parsed = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  const time = new Date(parsed).getTime();
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24)));
};

const makeKey = (po: string, poItem: string, part: string) => `${po}__${poItem}__${part}`;

export default function LongtreeOrderReportPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [items, setItems] = useState<OpenPoItem[]>([]);
  const [extraByKey, setExtraByKey] = useState<Record<string, OpenPoExtraFields>>({});
  const [mapping, setMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    Promise.all([
      get(ref(database, 'app_admin/openpo_vendor_3060_upload/items')),
      get(ref(database, 'app_admin/openpo_vendor_3060_extra')),
      get(ref(database, 'app_admin/purchasing_group_mapping')),
    ]).then(([uploadSnap, extraSnap, mapSnap]) => {
      const uploaded = Object.values((uploadSnap.val() || {}) as Record<string, OpenPoItem>);
      setItems(uploaded);
      setExtraByKey((extraSnap.val() || {}) as Record<string, OpenPoExtraFields>);
      setMapping((mapSnap.val() || {}) as Record<string, string>);
    });
  }, []);

  const longtreeRows = useMemo(() => items.filter((row: any) => {
    const purchaser = mapping[String(row.purchasinggroup || '')] || row.purchasinggroup || '';
    return purchaser === 'Karen A.';
  }), [items, mapping]);

  const notShippedRows = useMemo(() => longtreeRows.filter((row) => {
    const key = makeKey(String(row.po_number || ''), String(row.po_item || ''), String(row.part || ''));
    return !extraByKey[key]?.actualShipmentDate;
  }), [longtreeRows, extraByKey]);

  const inTransitRows = useMemo(() => longtreeRows.filter((row) => {
    const key = makeKey(String(row.po_number || ''), String(row.po_item || ''), String(row.part || ''));
    return !!extraByKey[key]?.actualShipmentDate;
  }), [longtreeRows, extraByKey]);

  const notShippedPoCount = useMemo(() => new Set(notShippedRows.map((r) => r.po_number).filter(Boolean)).size, [notShippedRows]);
  const agingTotalQty = useMemo(() => notShippedRows.reduce((sum, r) => sum + Number(r.openqty || 0), 0), [notShippedRows]);
  const inTransitQty = useMemo(() => inTransitRows.reduce((sum, r) => sum + Number(r.openqty || 0), 0), [inTransitRows]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">{lang === 'zh' ? 'Longtree 订单 Report' : 'Longtree Order Report'}</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader><CardTitle>{lang === 'zh' ? '未发货 OpenPO 数量' : 'Not Shipped OpenPO Count'}</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-amber-700">{notShippedPoCount}</CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50/40">
          <CardHeader><CardTitle>{lang === 'zh' ? 'Aging 零件总数量' : 'Aging Parts Total Qty'}</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-rose-700">{agingTotalQty.toLocaleString()}</CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader><CardTitle>{lang === 'zh' ? '在途数量' : 'In Transit Qty'}</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-emerald-700">{inTransitQty.toLocaleString()}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{lang === 'zh' ? '未发货 Aging 明细' : 'Not Shipped Aging Details'}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">{t(lang, 'poNumber')}</th>
                  <th className="px-3 py-2">{t(lang, 'poItem')}</th>
                  <th className="px-3 py-2">{t(lang, 'part')}</th>
                  <th className="px-3 py-2">{t(lang, 'orderDate')}</th>
                  <th className="px-3 py-2 text-right">Aging (Days)</th>
                  <th className="px-3 py-2 text-right">{t(lang, 'openQty')}</th>
                </tr>
              </thead>
              <tbody>
                {notShippedRows
                  .slice()
                  .sort((a, b) => daysBetween(b.orderdate) - daysBetween(a.orderdate))
                  .map((row) => (
                    <tr key={makeKey(String(row.po_number || ''), String(row.po_item || ''), String(row.part || ''))} className="border-b">
                      <td className="px-3 py-2 font-mono">{row.po_number || '-'}</td>
                      <td className="px-3 py-2 font-mono">{row.po_item || '-'}</td>
                      <td className="px-3 py-2 font-mono">{row.part || '-'}</td>
                      <td className="px-3 py-2">{row.orderdate || '-'}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-700">{daysBetween(row.orderdate)}</td>
                      <td className="px-3 py-2 text-right">{Number(row.openqty || 0).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
