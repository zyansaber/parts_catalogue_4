import { useEffect, useMemo, useState } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SummaryItem = { part?: string; nosea_required_qty?: number; sea_required_qty?: number; stock_qty?: number; description?: string; spras_en?: string; };
type OpenPoItem = { po_number?: string; po_item?: string; part?: string; vendor?: string; orderdate?: string; deliverydate?: string; openqty?: number; };

const normalizePart = (part?: string) => (part || '').trim().replace(/[_-]?KANBAN.*$/i, '').replace(/[_-]\d+$/,'');
const normalizeVendor = (v?: string) => String(v || '').replace(/^0+/, '');

export default function ProductionRequiredAnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<SummaryItem & { gap: number; openPos: OpenPoItem[]; normPart: string }>>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'sea' | 'nosea'>('sea');

  useEffect(() => { (async () => {
      setLoading(true);
      const [summarySnap, openPoSnap] = await Promise.all([get(ref(database, 'production_report/summary/items')), get(ref(database, 'production_report/open_po/items'))]);
      const summaryItems = Object.values((summarySnap.val() || {}) as Record<string, SummaryItem>);
      const openPoItems = Object.values((openPoSnap.val() || {}) as Record<string, OpenPoItem>).map((x) => ({ ...x, vendor: normalizeVendor(x.vendor) }));
      const openPoByPart = openPoItems.reduce<Record<string, OpenPoItem[]>>((acc, po) => { const p = normalizePart(po.part); if (!p) return acc; (acc[p] ||= []).push(po); return acc; }, {});

      const grouped: Record<string, SummaryItem> = {};
      summaryItems.forEach((item) => {
        const p = normalizePart(item.part);
        if (!p) return;
        if (!grouped[p]) grouped[p] = { part: p, description: item.description || item.spras_en || '' };
        grouped[p].nosea_required_qty = (grouped[p].nosea_required_qty || 0) + Number(item.nosea_required_qty || 0);
        grouped[p].sea_required_qty = (grouped[p].sea_required_qty || 0) + Number(item.sea_required_qty || 0);
        grouped[p].stock_qty = (grouped[p].stock_qty || 0) + Number(item.stock_qty || 0);
      });

      setRows(Object.values(grouped).map((item) => {
        const required = mode === 'sea' ? Number(item.sea_required_qty || 0) : Number(item.nosea_required_qty || 0);
        const gap = Number(item.stock_qty || 0) - required;
        const normPart = normalizePart(item.part);
        return { ...item, gap, openPos: gap < 0 ? (openPoByPart[normPart] || []) : [], normPart };
      }));
      setLoading(false);
  })(); }, [mode]);

  const filtered = useMemo(() => rows.filter((r) => (r.part || '').toLowerCase().includes(search.toLowerCase())).sort((a,b) => a.gap - b.gap), [rows, search]);
  if (loading) return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return <div className="space-y-6"><div><h1 className="text-3xl font-bold text-gray-900">生产需求 / Production Required</h1></div>
    <Tabs value={mode} onValueChange={(v) => setMode(v as 'sea'|'nosea')}><TabsList><TabsTrigger value="sea">Sea</TabsTrigger><TabsTrigger value="nosea">NoSea</TabsTrigger></TabsList></Tabs>
    <Card><CardHeader><CardTitle>搜索 / Search</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Part" /></CardContent></Card>
    <Card><CardHeader><CardTitle>{mode.toUpperCase()} Required 对比库存</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Part</th><th className="p-2">Description</th><th className="p-2">NoSea Required</th><th className="p-2">Sea Required</th><th className="p-2">Stock</th><th className="p-2">Stock-Required</th><th className="p-2">OpenPO</th></tr></thead><tbody>{filtered.map((r)=><tr key={r.normPart} className="border-b align-top"><td className="p-2">{r.part}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{r.nosea_required_qty||0}</td><td className="p-2">{r.sea_required_qty||0}</td><td className="p-2">{r.stock_qty||0}</td><td className={`p-2 font-semibold ${r.gap<0?'text-red-600':'text-green-600'}`}>{r.gap}</td><td className="p-2">{r.openPos.slice(0,5).map((po,i)=><div key={i}>PO {po.po_number}/{po.po_item} | {po.orderdate||'-'} → {po.deliverydate||'-'} | Vendor {po.vendor}</div>)}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
