import { useEffect, useMemo, useState } from 'react';
import { ref, get } from 'firebase/database';
import { AlertTriangle, CalendarX2, ShieldAlert, TrendingDown } from 'lucide-react';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getLang, t, type Lang } from '@/lib/i18n';

type SummaryItem = {
  part?: string;
  nosea_required_qty?: number;
  sea_required_qty?: number;
  issued_qty?: number;
  stock_qty?: number;
  description?: string;
  spras_en?: string;
  is_kanban?: boolean;
};

type OpenPoItem = {
  po_number?: string;
  po_item?: string;
  part?: string;
  orderdate?: string;
  deliverydate?: string;
  openqty?: number;
};

type Mode = 'sea' | 'nosea';

const normalizePart = (part?: string) => (part || '').trim().replace(/[_-]?KANBAN.*$/i, '').replace(/[_-]\d+$/,'');

const parseDate = (value?: string) => {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) {
    const y = Number(text.slice(0, 4));
    const m = Number(text.slice(4, 6)) - 1;
    const d = Number(text.slice(6, 8));
    return new Date(y, m, d);
  }
  const dt = new Date(text);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const isBeforeToday = (value?: string) => {
  const d = parseDate(value);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

export default function ProductionRequiredAnalysisPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<SummaryItem & { effectiveRequired: number; shortage: number; openPos: OpenPoItem[]; normPart: string; openPoQtyTotal: number }>>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('sea');

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, o] = await Promise.all([
        get(ref(database, 'production_report/summary/items')),
        get(ref(database, 'production_report/open_po/items')),
      ]);

      const summary = Object.values((s.val() || {}) as Record<string, SummaryItem>).filter((it) => !Boolean(it.is_kanban));
      const open = Object.values((o.val() || {}) as Record<string, OpenPoItem>);

      const byPart = open.reduce<Record<string, OpenPoItem[]>>((acc, item) => {
        const part = normalizePart(item.part);
        if (!part) return acc;
        (acc[part] ||= []).push(item);
        return acc;
      }, {});

      const grouped: Record<string, SummaryItem> = {};
      summary.forEach((item) => {
        const part = normalizePart(item.part);
        if (!part) return;
        if (!grouped[part]) grouped[part] = { part, description: item.description || item.spras_en || '' };
        grouped[part].nosea_required_qty = (grouped[part].nosea_required_qty || 0) + Number(item.nosea_required_qty || 0);
        grouped[part].sea_required_qty = (grouped[part].sea_required_qty || 0) + Number(item.sea_required_qty || 0);
        grouped[part].issued_qty = (grouped[part].issued_qty || 0) + Number(item.issued_qty || 0);
        grouped[part].stock_qty = Number(item.stock_qty || 0);
      });

      const mapped = Object.values(grouped).map((item) => {
        const selectedRequired = mode === 'sea' ? Number(item.sea_required_qty || 0) : Number(item.nosea_required_qty || 0);
        const issuedQty = Number(item.issued_qty || 0);
        const effectiveRequired = selectedRequired - issuedQty;
        const stockQty = Number(item.stock_qty || 0);
        const shortage = stockQty - effectiveRequired;
        const part = normalizePart(item.part);
        const openPos = shortage < 0 ? (byPart[part] || []) : [];
        const openPoQtyTotal = openPos.reduce((sum, po) => sum + Number(po.openqty || 0), 0);

        return { ...item, effectiveRequired, shortage, normPart: part, openPos, openPoQtyTotal };
      });

      setRows(mapped);
      setLoading(false);
    })();
  }, [mode]);

  const filtered = useMemo(
    () => rows
      .filter((r) => (r.part || '').toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.shortage - b.shortage),
    [rows, search],
  );

  const cards = useMemo(() => {
    const criticalCount = filtered.filter((r) => r.shortage < 0 && mode === 'sea').length;
    const potentialCount = filtered.filter((r) => r.shortage < 0 && mode === 'nosea').length;
    const overduePoCount = filtered.reduce((sum, r) => sum + r.openPos.filter((po) => isBeforeToday(po.deliverydate)).length, 0);
    return { criticalCount, potentialCount, overduePoCount };
  }, [filtered, mode]);

  const shortageLabel = mode === 'sea' ? (lang === 'zh' ? '关键缺件' : 'Critical Shortage') : (lang === 'zh' ? '潜在缺件' : 'Potential Shortage');
  const pageTitle = mode === 'sea'
    ? (lang === 'zh' ? '房车门店 + 海上项目零件' : 'Parts for caravan store and sea')
    : (lang === 'zh' ? '房车门店零件' : 'Parts for caravan store');

  if (loading) return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold">{pageTitle}</h1>
      <Badge variant="secondary" className="text-sm">{filtered.length} {lang === 'zh' ? '个零件' : 'parts'}</Badge>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? 'Critical Shortage 零件数' : 'Critical Shortage Parts'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-red-700"><ShieldAlert className="h-5 w-5" />{cards.criticalCount}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? 'Potential Shortage 零件数' : 'Potential Shortage Parts'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-amber-700"><AlertTriangle className="h-5 w-5" />{cards.potentialCount}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? '交期早于今天的PO数' : 'POs with Delivery Date < Today'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-orange-700"><CalendarX2 className="h-5 w-5" />{cards.overduePoCount}</CardContent></Card>
    </div>

    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
      <TabsList>
        <TabsTrigger value="sea">{lang === 'zh' ? '房车门店 + 海上项目' : 'Parts for caravan store and sea'}</TabsTrigger>
        <TabsTrigger value="nosea">{lang === 'zh' ? '房车门店' : 'Parts for caravan store'}</TabsTrigger>
      </TabsList>
    </Tabs>

    <Card><CardHeader><CardTitle>{t(lang, 'search')}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t(lang, 'part')} / ${t(lang, 'description')}`} /></CardContent></Card>

    <Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Part</th><th className="p-2">{t(lang, 'description')}</th><th className="p-2">{mode === 'sea' ? 'sea_required_qty' : 'nosea_required_qty'}</th><th className="p-2">issued_qty</th><th className="p-2">effective_required</th><th className="p-2">stock_qty</th><th className="p-2">Status</th><th className="p-2">OpenPO</th></tr></thead><tbody>{filtered.map((r) => {const isShortage = r.shortage < 0; return <tr key={r.normPart} className="border-b align-top"><td className="p-2 font-medium">{r.part}</td><td className="p-2">{r.description || '-'}</td><td className="p-2">{mode === 'sea' ? Number(r.sea_required_qty || 0) : Number(r.nosea_required_qty || 0)}</td><td className="p-2">{Number(r.issued_qty || 0)}</td><td className="p-2">{r.effectiveRequired}</td><td className="p-2">{Number(r.stock_qty || 0)}</td><td className="p-2">{isShortage ? <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-red-700">{mode === 'sea' ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}<span>{shortageLabel}</span><span className="font-semibold">{r.shortage}</span></div> : <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700"><TrendingDown className="h-4 w-4" /><span>{lang === 'zh' ? '健康' : 'Healthy'}</span><span className="font-semibold">+{r.shortage}</span></div>}</td><td className="p-2">{r.openPos.length === 0 ? '-' : <details><summary className="cursor-pointer text-blue-600">{lang === 'zh' ? `PO数量: ${r.openPos.length}, OpenQty总计: ${r.openPoQtyTotal}` : `PO count: ${r.openPos.length}, Total OpenQty: ${r.openPoQtyTotal}`}</summary><div className="mt-2 rounded border"><table className="min-w-full text-xs"><thead><tr className="bg-gray-50"><th className="p-2 text-left">PO</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">{t(lang, 'orderDate')}</th><th className="p-2 text-left">{t(lang, 'deliveryDate')}</th><th className="p-2 text-left">openqty</th></tr></thead><tbody>{r.openPos.map((po, i) => <tr key={`${po.po_number}-${po.po_item}-${i}`} className={`border-t ${isBeforeToday(po.deliverydate) ? 'bg-orange-100' : ''}`}><td className="p-2">{po.po_number || '-'}</td><td className="p-2">{po.po_item || '-'}</td><td className="p-2">{po.orderdate || '-'}</td><td className="p-2">{po.deliverydate || '-'}</td><td className="p-2">{Number(po.openqty || 0)}</td></tr>)}</tbody></table></div></details>}</td></tr>;})}</tbody></table></CardContent></Card>
  </div>;
}
