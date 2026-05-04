import { useEffect, useMemo, useState } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getLang, t, type Lang } from '@/lib/i18n';

type SummaryItem = { part?: string; nosea_required_qty?: number; sea_required_qty?: number; stock_qty?: number; description?: string; spras_en?: string; is_kanban?: boolean; };
type OpenPoItem = { po_number?: string; po_item?: string; part?: string; vendor?: string; orderdate?: string; deliverydate?: string; };
const normalizePart = (part?: string) => (part || '').trim().replace(/[_-]?KANBAN.*$/i, '').replace(/[_-]\d+$/,'');

export default function ProductionRequiredAnalysisPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [loading, setLoading] = useState(true); const [rows, setRows] = useState<Array<SummaryItem & { gap: number; openPos: OpenPoItem[]; normPart: string }>>([]);
  const [search, setSearch] = useState(''); const [mode, setMode] = useState<'sea'|'nosea'>('sea');
  useEffect(()=>{ const fn=()=>setLang(getLang()); window.addEventListener('language-change', fn); return ()=>window.removeEventListener('language-change', fn);},[]);
  useEffect(()=>{(async()=>{setLoading(true); const [s,o]=await Promise.all([get(ref(database,'production_report/summary/items')),get(ref(database,'production_report/open_po/items'))]);
    const summary=Object.values((s.val()||{}) as Record<string, SummaryItem>).filter((it)=>!Boolean(it.is_kanban)); const open=Object.values((o.val()||{}) as Record<string, OpenPoItem>);
    const byPart=open.reduce<Record<string,OpenPoItem[]>>((a,x)=>{const p=normalizePart(x.part); if(!p)return a; (a[p] ||= []).push(x); return a;},{});
    const g:Record<string,SummaryItem>={}; summary.forEach((it)=>{const p=normalizePart(it.part); if(!p)return; if(!g[p]) g[p]={part:p,description:it.description||it.spras_en||''}; g[p].nosea_required_qty=(g[p].nosea_required_qty||0)+Number(it.nosea_required_qty||0); g[p].sea_required_qty=(g[p].sea_required_qty||0)+Number(it.sea_required_qty||0); g[p].stock_qty=Number(it.stock_qty||0)});
    setRows(Object.values(g).map((it)=>{const req=mode==='sea'?Number(it.sea_required_qty||0):Number(it.nosea_required_qty||0); const gap=Number(it.stock_qty||0)-req; const p=normalizePart(it.part); return {...it,gap,normPart:p,openPos:gap<0?(byPart[p]||[]):[]};})); setLoading(false);
  })();},[mode]);
  const filtered = useMemo(()=>rows.filter(r=>(r.part||'').toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.gap-b.gap),[rows,search]);
  if(loading) return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;
  return <div className="space-y-6"><h1 className="text-3xl font-bold">{t(lang,'productionRequired')}</h1>
    <Tabs value={mode} onValueChange={(v)=>setMode(v as 'sea'|'nosea')}><TabsList><TabsTrigger value="sea">Sea</TabsTrigger><TabsTrigger value="nosea">NoSea</TabsTrigger></TabsList></Tabs>
    <Card><CardHeader><CardTitle>{t(lang,'search')}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e)=>setSearch(e.target.value)} /></CardContent></Card>
    <Card><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="p-2">Part</th><th className="p-2">{t(lang,'description')}</th><th className="p-2">NoSea</th><th className="p-2">Sea</th><th className="p-2">Stock</th><th className="p-2">Gap</th><th className="p-2">OpenPO</th></tr></thead><tbody>{filtered.map((r)=><tr key={r.normPart} className="border-b align-top"><td className="p-2">{r.part}</td><td className="p-2">{r.description||'-'}</td><td className="p-2">{r.nosea_required_qty||0}</td><td className="p-2">{r.sea_required_qty||0}</td><td className="p-2">{r.stock_qty||0}</td><td className={`p-2 ${r.gap<0?'text-red-600':'text-green-600'}`}>{r.gap}</td><td className="p-2">{r.openPos.map((po,i)=><div key={i}>PO {po.po_number}/{po.po_item} | {t(lang,'orderDate')}: {po.orderdate||'-'} | {t(lang,'deliveryDate')}: {po.deliverydate||'-'}</div>)}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
