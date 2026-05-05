import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { getLang, t, type Lang } from '@/lib/i18n';

type SummaryItem = {
  part?: string;
  description?: string;
  is_kanban?: boolean;
  issued_qty?: number;
  lead_time?: number;
  nosea_required_qty?: number;
  open_po_qty?: number;
  open_qty?: number;
  safety_stock?: number;
  sea_required_qty?: number;
  stock_qty?: number;
  total_required_qty?: number;
};

export default function KanbanPartsPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const snap = await get(ref(database, 'production_report/summary/items'));
      const all = Object.values((snap.val() || {}) as Record<string, SummaryItem>);
      setItems(all.filter((item) => Boolean(item.is_kanban)));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => items.filter((item) => {
    const keyword = search.toLowerCase();
    return (item.part || '').toLowerCase().includes(keyword) || (item.description || '').toLowerCase().includes(keyword);
  }), [items, search]);

  if (loading) return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">{t(lang, 'kanbanParts')}</h1><Card><CardHeader><CardTitle>{t(lang, 'search')}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t(lang, 'part')} / ${t(lang, 'description')}`} /></CardContent></Card><Card><CardHeader><CardTitle>{filtered.length}</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">{t(lang, 'part')}</th><th className="p-2">{t(lang, 'description')}</th><th className="p-2">is_kanban</th><th className="p-2">issued_qty</th><th className="p-2">lead_time</th><th className="p-2">nosea_required_qty</th><th className="p-2">open_po_qty</th><th className="p-2">open_qty</th><th className="p-2">safety_stock</th><th className="p-2">sea_required_qty</th><th className="p-2">stock_qty</th><th className="p-2">total_required_qty</th></tr></thead><tbody>{filtered.map((r, i) => <tr key={`${r.part || 'part'}-${i}`} className="border-b"><td className="p-2">{r.part || '-'}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{String(Boolean(r.is_kanban))}</td><td className="p-2">{Number(r.issued_qty || 0)}</td><td className="p-2">{Number(r.lead_time || 0)}</td><td className="p-2">{Number(r.nosea_required_qty || 0)}</td><td className="p-2">{Number(r.open_po_qty || 0)}</td><td className="p-2">{Number(r.open_qty || 0)}</td><td className="p-2">{Number(r.safety_stock || 0)}</td><td className="p-2">{Number(r.sea_required_qty || 0)}</td><td className="p-2">{Number(r.stock_qty || 0)}</td><td className="p-2">{Number(r.total_required_qty || 0)}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
