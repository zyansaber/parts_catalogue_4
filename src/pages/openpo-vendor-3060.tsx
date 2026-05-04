import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [lang, setLang] = useState<Lang>(getLang());
  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);
  useEffect(() => { Promise.all([get(ref(database, 'production_report/open_po/items')), get(ref(database, 'app_admin/purchasing_group_mapping'))]).then(([openSnap, mapSnap]) => { setItems(Object.values((openSnap.val() || {}) as Record<string, OpenPoItem>)); setMapping((mapSnap.val() || {}) as Record<string, string>); }); }, []);
  const filtered = useMemo(() => items.filter((i) => String(i.vendor || '').replace(/^0+/, '').trim() === '3060'), [items]);
  const totalOpenQty = useMemo(() => filtered.reduce((sum, item) => sum + Number(item.openqty || 0), 0), [filtered]);
  const openPoNumber = useMemo(() => new Set(filtered.map((x) => x.po_number).filter(Boolean)).size, [filtered]);
  const displayNumber = (value?: number) => Number(value || 0).toLocaleString();

  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">{t(lang, 'openPoVendor3060')}</h1><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>{t(lang, 'lineCount')}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{openPoNumber}</CardContent></Card><Card><CardHeader><CardTitle>{t(lang, 'totalOpenQty')}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{displayNumber(totalOpenQty)}</CardContent></Card></div><Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">{t(lang, 'poNumber')}</th><th className="p-2">Australia Purchaser</th><th className="p-2">{t(lang, 'part')}</th><th className="p-2">{t(lang, 'description')}</th><th className="p-2">{t(lang, 'orderDate')}</th><th className="p-2">{t(lang, 'deliveryDate')}</th><th className="p-2 text-right">{t(lang, 'orderQty')}</th><th className="p-2 text-right">{t(lang, 'receivedQty')}</th><th className="p-2 text-right">{t(lang, 'openQty')}</th></tr></thead><tbody>{filtered.map((r, i) => <tr key={i} className="border-b"><td className="p-2">{r.po_number || '-'}</td><td className="p-2">{mapping[String(r.purchasinggroup || '')] || r.purchasinggroup || '-'}</td><td className="p-2">{r.part || '-'}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{formatDate(r.orderdate)}</td><td className="p-2">{formatDate(r.deliverydate)}</td><td className="p-2 text-right">{displayNumber(r.orderqty)}</td><td className="p-2 text-right">{displayNumber(r.receivedqty)}</td><td className="p-2 text-right">{displayNumber(r.openqty)}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
