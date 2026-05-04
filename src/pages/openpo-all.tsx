import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getLang, t, type Lang } from '@/lib/i18n';

type OpenPoItem = { po_number?: string; po_item?: string; part?: string; description?: string; vendor?: string; orderdate?: string; deliverydate?: string; openqty?: number; };

export default function OpenPoAllPage() {
  const [items, setItems] = useState<OpenPoItem[]>([]);
  const [vendor, setVendor] = useState('');
  const [part, setPart] = useState('');
  const [lang, setLang] = useState<Lang>(getLang());
  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);
  useEffect(() => { get(ref(database, 'production_report/open_po/items')).then((snap) => setItems(Object.values((snap.val() || {}) as Record<string, OpenPoItem>))); }, []);
  const filtered = useMemo(() => items.filter((i) => (!vendor || String(i.vendor||'').replace(/^0+/,'').includes(vendor.replace(/^0+/,''))) && (!part || String(i.part||'').toLowerCase().includes(part.toLowerCase()))), [items,vendor,part]);
  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">{t(lang, 'openPoAll')}</h1><Card><CardHeader><CardTitle>{t(lang, 'filter')}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Input placeholder={t(lang, 'vendor')} value={vendor} onChange={(e)=>setVendor(e.target.value)} /><Input placeholder="Part" value={part} onChange={(e)=>setPart(e.target.value)} /></CardContent></Card><Card><CardHeader><CardTitle>{filtered.length}</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">{t(lang, 'vendor')}</th><th className="p-2">PO</th><th className="p-2">Item</th><th className="p-2">Part</th><th className="p-2">{t(lang, 'description')}</th></tr></thead><tbody>{filtered.map((r,i)=><tr key={i} className="border-b"><td className="p-2">{String(r.vendor||'').replace(/^0+/, '')}</td><td className="p-2">{r.po_number}</td><td className="p-2">{r.po_item}</td><td className="p-2">{r.part}</td><td className="p-2">{r.description||'-'}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
