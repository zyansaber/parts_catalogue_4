import { useEffect, useMemo, useState } from 'react';
import { ref, get } from 'firebase/database';
import { AlertTriangle, CalendarX2, ShieldAlert, TrendingDown } from 'lucide-react';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getLang, t, type Lang } from '@/lib/i18n';

type SummaryItem = { part?: string; nosea_required_qty?: number; sea_required_qty?: number; issued_qty?: number; stock_qty?: number; description?: string; spras_en?: string; is_kanban?: boolean; };
type OpenPoItem = { po_number?: string; po_item?: string; part?: string; orderdate?: string; deliverydate?: string; openqty?: number; };
type Mode = 'sea' | 'nosea';

const normalizePart = (part?: string) => (part || '').trim().replace(/[_-]?KANBAN.*$/i, '').replace(/[_-]\d+$/,'');
const parseDate = (value?: string) => { if (!value) return null; const s = String(value).trim(); if (/^\d{8}$/.test(s)) return new Date(Number(s.slice(0,4)), Number(s.slice(4,6))-1, Number(s.slice(6,8))); const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };
const isBeforeToday = (value?: string) => { const d = parseDate(value); if (!d) return false; const t = new Date(); t.setHours(0,0,0,0); return d < t; };

export default function ProductionRequiredAnalysisPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<SummaryItem & { effSea: number; effNoSea: number; shortageSea: number; shortageNoSea: number; openPos: OpenPoItem[]; normPart: string; openPoQtyTotal: number }>>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('nosea');

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, o] = await Promise.all([get(ref(database, 'production_report/summary/items')), get(ref(database, 'production_report/open_po/items'))]);
      const summary = Object.values((s.val() || {}) as Record<string, SummaryItem>).filter((it) => !Boolean(it.is_kanban));
      const open = Object.values((o.val() || {}) as Record<string, OpenPoItem>);
      const byPart = open.reduce<Record<string, OpenPoItem[]>>((acc, item) => { const part = normalizePart(item.part); if (!part) return acc; (acc[part] ||= []).push(item); return acc; }, {});

      const grouped: Record<string, SummaryItem> = {};
      summary.forEach((item) => {
        const part = normalizePart(item.part); if (!part) return;
        if (!grouped[part]) grouped[part] = { part, description: item.description || item.spras_en || '' };
        grouped[part].nosea_required_qty = (grouped[part].nosea_required_qty || 0) + Number(item.nosea_required_qty || 0);
        grouped[part].sea_required_qty = (grouped[part].sea_required_qty || 0) + Number(item.sea_required_qty || 0);
        grouped[part].issued_qty = (grouped[part].issued_qty || 0) + Number(item.issued_qty || 0);
        grouped[part].stock_qty = Number(item.stock_qty || 0);
      });

      setRows(Object.values(grouped).map((item) => {
        const issued = Number(item.issued_qty || 0); const stock = Number(item.stock_qty || 0);
        const effSea = Number(item.sea_required_qty || 0) - issued;
        const effNoSea = Number(item.nosea_required_qty || 0) - issued;
        const shortageSea = stock - effSea;
        const shortageNoSea = stock - effNoSea;
        const part = normalizePart(item.part);
        const openPos = byPart[part] || [];
        return { ...item, effSea, effNoSea, shortageSea, shortageNoSea, normPart: part, openPos, openPoQtyTotal: openPos.reduce((s1, po) => s1 + Number(po.openqty || 0), 0) };
      }));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => (r.part || '').toLowerCase().includes(search.toLowerCase())).sort((a,b) => (mode==='sea' ? a.shortageSea-b.shortageSea : a.shortageNoSea-b.shortageNoSea)), [rows, search, mode]);

  const cards = useMemo(() => {
    const criticalCount = rows.filter((r) => r.shortageNoSea < 0).length;
    const potentialCount = rows.filter((r) => r.shortageSea < 0).length;
    const overduePoCount = rows.reduce((sum, r) => sum + r.openPos.filter((po) => isBeforeToday(po.deliverydate)).length, 0);
    return { criticalCount, potentialCount, overduePoCount };
  }, [rows]);

  if (loading) return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return <div className="space-y-6">
    <h1 className="text-3xl font-bold">{mode === 'sea' ? (lang === 'zh' ? 'Potential Shortage Parts' : 'Potential Shortage Parts') : (lang === 'zh' ? 'Critical Shortage Parts' : 'Critical Shortage Parts')}</h1>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? 'Critical Shortage 零件数' : 'Critical Shortage Parts'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-red-700"><ShieldAlert className="h-5 w-5" />{cards.criticalCount}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? 'Potential Shortage 零件数' : 'Potential Shortage Parts'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-amber-700"><AlertTriangle className="h-5 w-5" />{cards.potentialCount}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? '交期延误PO数量' : 'Delayed PO Count'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-orange-700"><CalendarX2 className="h-5 w-5" />{cards.overduePoCount}</CardContent></Card>
    </div>

    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}><TabsList><TabsTrigger value="sea">Parts for caravan store and sea</TabsTrigger><TabsTrigger value="nosea">Parts for caravan store</TabsTrigger></TabsList></Tabs>
    <Card><CardHeader><CardTitle>{t(lang, 'search')}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t(lang, 'part')} / ${t(lang, 'description')}`} /></CardContent></Card>

    <Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Part</th><th className="p-2">{t(lang, 'description')}</th><th className="p-2">{mode === 'sea' ? 'on the Sea + warehouse requirement' : 'warehouse requirement'}</th><th className="p-2">Production Issued</th><th className="p-2">Still Required</th><th className="p-2">Production Inventory</th><th className="p-2">Status</th><th className="p-2">OpenPO（PO number/ Qty in delay)</th></tr></thead><tbody>{filtered.map((r) => { const shortage = mode === 'sea' ? r.shortageSea : r.shortageNoSea; return <tr key={r.normPart} className="border-b"><td className="p-2 font-medium">{r.part}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{mode === 'sea' ? Number(r.sea_required_qty || 0) : Number(r.nosea_required_qty || 0)}</td><td className="p-2">{Number(r.issued_qty || 0)}</td><td className="p-2">{mode === 'sea' ? r.effSea : r.effNoSea}</td><td className="p-2">{Number(r.stock_qty || 0)}</td><td className="p-2">{shortage < 0 ? <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-red-700"><AlertTriangle className="h-4 w-4" /><span>{mode === 'sea' ? 'Potential Shortage' : 'Critical Shortage'}</span><span className="font-semibold">{shortage}</span></div> : <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700"><TrendingDown className="h-4 w-4" /><span>{lang === 'zh' ? '健康' : 'Healthy'}</span><span className="font-semibold">+{shortage}</span></div>}</td><td className="p-2">{r.openPos.length === 0 ? '-' : <Dialog><DialogTrigger asChild><Button variant="outline" size="sm">{lang === 'zh' ? `查看详情 (${r.openPos.length} / ${r.openPoQtyTotal})` : `View details (${r.openPos.length} / ${r.openPoQtyTotal})`}</Button></DialogTrigger><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{r.part} - OpenPO Details</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-auto rounded border"><table className="min-w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-2 text-left">PO</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">{t(lang, 'orderDate')}</th><th className="p-2 text-left">{t(lang, 'deliveryDate')}</th><th className="p-2 text-left">openqty</th><th className="p-2 text-left">Status</th></tr></thead><tbody>{r.openPos.map((po, i) => { const delayed = isBeforeToday(po.deliverydate); return <tr key={`${po.po_number}-${po.po_item}-${i}`} className={`border-t ${delayed ? 'bg-orange-100' : ''}`}><td className="p-2">{po.po_number || '-'}</td><td className="p-2">{po.po_item || '-'}</td><td className="p-2">{po.orderdate || '-'}</td><td className="p-2">{po.deliverydate || '-'}</td><td className="p-2">{Number(po.openqty || 0)}</td><td className="p-2">{delayed ? <span className="rounded bg-orange-200 px-2 py-0.5 text-xs font-medium text-orange-900">Delay</span> : '-'}</td></tr>; })}</tbody></table></div></DialogContent></Dialog>}</td></tr>;})}</tbody></table></CardContent></Card>
  </div>;
}
