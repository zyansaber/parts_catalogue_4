import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLang, t, type Lang } from '@/lib/i18n';

type OpenPoItem = {
  po_number?: string;
  po_item?: string;
  part?: string;
  vendor?: string;
  vendorname?: string;
  purchasinggroup?: string;
  orderdate?: string;
  deliverydate?: string;
  orderqty?: number;
  receivedqty?: number;
  openqty?: number;
  description?: string;
};

export default function OpenPoVendor3060Page() {
  const [items, setItems] = useState<OpenPoItem[]>([]);
  const [lang, setLang] = useState<Lang>(getLang());
  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);
  useEffect(() => { get(ref(database, 'production_report/open_po/items')).then((snap) => setItems(Object.values((snap.val() || {}) as Record<string, OpenPoItem>))); }, []);
  const filtered = useMemo(() => items.filter((i) => String(i.vendor || '').replace(/^0+/, '').trim() === '3060'), [items]);
  const totalOpenQty = useMemo(() => filtered.reduce((sum, item) => sum + Number(item.openqty || 0), 0), [filtered]);

  const displayNumber = (value?: number) => Number(value || 0).toLocaleString();

  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">{t(lang, 'openPoVendor3060')}</h1><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>{t(lang, 'lineCount')}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{filtered.length}</CardContent></Card><Card><CardHeader><CardTitle>{t(lang, 'totalOpenQty')}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{displayNumber(totalOpenQty)}</CardContent></Card></div><Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">{t(lang, 'vendor')}</th><th className="p-2">{t(lang, 'vendorName')}</th><th className="p-2">{t(lang, 'purchasingGroup')}</th><th className="p-2">{t(lang, 'poNumber')}</th><th className="p-2">{t(lang, 'poItem')}</th><th className="p-2">{t(lang, 'part')}</th><th className="p-2">{t(lang, 'description')}</th><th className="p-2">{t(lang, 'orderDate')}</th><th className="p-2">{t(lang, 'deliveryDate')}</th><th className="p-2 text-right">{t(lang, 'orderQty')}</th><th className="p-2 text-right">{t(lang, 'receivedQty')}</th><th className="p-2 text-right">{t(lang, 'openQty')}</th></tr></thead><tbody>{filtered.map((r,i)=><tr key={i} className="border-b"><td className="p-2">{String(r.vendor||'').replace(/^0+/, '')}</td><td className="p-2">{r.vendorname || '-'}</td><td className="p-2">{r.purchasinggroup || '-'}</td><td className="p-2">{r.po_number || '-'}</td><td className="p-2">{r.po_item || '-'}</td><td className="p-2">{r.part || '-'}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{r.orderdate || '-'}</td><td className="p-2">{r.deliverydate || '-'}</td><td className="p-2 text-right">{displayNumber(r.orderqty)}</td><td className="p-2 text-right">{displayNumber(r.receivedqty)}</td><td className="p-2 text-right">{displayNumber(r.openqty)}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
