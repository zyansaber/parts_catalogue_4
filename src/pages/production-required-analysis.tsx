import { useEffect, useMemo, useState } from 'react';
import { ref, get, update } from 'firebase/database';
import { AlertTriangle, CalendarX2, Download, ShieldAlert, TrendingDown } from 'lucide-react';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { FirebaseService } from '@/services/firebase';
import { getLang, resolvePartDescription, t, type Lang } from '@/lib/i18n';

type SummaryItem = { part?: string; nosea_required_qty?: number; sea_required_qty?: number; issued_qty?: number; stock_qty?: number; description?: string; spras_en?: string; spras_zh?: string; is_kanban?: boolean };
type OpenPoItem = { po_number?: string; po_item?: string; part?: string; orderdate?: string; deliverydate?: string; openqty?: number };
type ShortageChassisItem = { status?: string; is_sea?: boolean };
type ShortageItem = { part?: string; chassis_count?: number; chassis?: Record<string, ShortageChassisItem> };
type Mode = 'sea' | 'nosea';
type NoteItem = { part: string; note_eta: string; updated_at: string };

type Row = SummaryItem & {
  effSea: number; effNoSea: number; shortageSea: number; shortageNoSea: number; openPos: OpenPoItem[]; normPart: string; openPoQtyTotal: number; chassisDetails: Array<{ chassisNo: string; status: string; isSea: boolean }>;
};

const normalizePart = (part?: string) => (part || '').trim().replace(/[_-]?KANBAN.*$/i, '').replace(/[_-]\d+$/, '');
const parseDate = (value?: string) => { if (!value) return null; const s = String(value).trim(); if (/^\d{8}$/.test(s)) return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))); const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };
const isBeforeToday = (value?: string) => { const d = parseDate(value); if (!d) return false; const t = new Date(); t.setHours(0, 0, 0, 0); return d < t; };
const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function ProductionRequiredAnalysisPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('nosea');
  const [notes, setNotes] = useState<Record<string, NoteItem>>({});

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, o, sh, n] = await Promise.all([
        get(ref(database, 'production_report/summary/items')),
        get(ref(database, 'production_report/open_po/items')),
        get(ref(database, 'production_report/shortages/items')),
        get(ref(database, 'production_report/notes_by_part')),
      ]);
      const summary = Object.values((s.val() || {}) as Record<string, SummaryItem>).filter((it) => !it.is_kanban);
      const open = Object.values((o.val() || {}) as Record<string, OpenPoItem>);
      const shortages = Object.values((sh.val() || {}) as Record<string, ShortageItem>);
      setNotes((n.val() || {}) as Record<string, NoteItem>);

      const byPart = open.reduce<Record<string, OpenPoItem[]>>((acc, item) => { const part = normalizePart(item.part); if (!part) return acc; (acc[part] ||= []).push(item); return acc; }, {});
      const shortageByPart = shortages.reduce<Record<string, ShortageItem>>((acc, item) => { const part = normalizePart(item.part); if (part) acc[part] = item; return acc; }, {});
      const grouped: Record<string, SummaryItem> = {};

      summary.forEach((item) => {
        const part = normalizePart(item.part);
        if (!part) return;
        if (!grouped[part]) grouped[part] = { part, description: resolvePartDescription(lang, { SPRAS_EN: item.spras_en || item.description, SPRAS_ZH: item.spras_zh }), spras_en: item.spras_en, spras_zh: item.spras_zh };
        grouped[part].nosea_required_qty = (grouped[part].nosea_required_qty || 0) + Number(item.nosea_required_qty || 0);
        grouped[part].sea_required_qty = (grouped[part].sea_required_qty || 0) + Number(item.sea_required_qty || 0);
        grouped[part].issued_qty = (grouped[part].issued_qty || 0) + Number(item.issued_qty || 0);
        grouped[part].stock_qty = Number(item.stock_qty || 0);
      });

      setRows(Object.values(grouped).map((item) => {
        const issued = Number(item.issued_qty || 0); const stock = Number(item.stock_qty || 0);
        const seaTotalRequired = Number(item.sea_required_qty || 0) + Number(item.nosea_required_qty || 0);
        const effSea = seaTotalRequired - issued;
        const effNoSea = Number(item.nosea_required_qty || 0) - issued;
        const part = normalizePart(item.part);
        const openPos = byPart[part] || [];
        const shortageInfo = shortageByPart[part];
        const chassisDetails = Object.entries(shortageInfo?.chassis || {}).map(([chassisNo, chassis]) => ({ chassisNo, status: chassis?.status || '-', isSea: Boolean(chassis?.is_sea) }));
        return { ...item, effSea, effNoSea, shortageSea: stock - effSea, shortageNoSea: stock - effNoSea, normPart: part, openPos, openPoQtyTotal: openPos.reduce((sum, po) => sum + Number(po.openqty || 0), 0), chassisDetails };
      }));
      setLoading(false);
    })();
  }, [lang]);

  const filtered = useMemo(() => rows.filter((r) => (r.part || '').toLowerCase().includes(search.toLowerCase())).sort((a, b) => (mode === 'sea' ? a.shortageSea - b.shortageSea : a.shortageNoSea - b.shortageNoSea)), [rows, search, mode]);
  const cards = useMemo(() => ({ criticalCount: rows.filter((r) => r.shortageNoSea < 0).length, potentialCount: rows.filter((r) => r.shortageSea < 0).length, overduePoCount: rows.reduce((sum, r) => sum + r.openPos.filter((po) => isBeforeToday(po.deliverydate)).length, 0) }), [rows]);

  const saveNote = async (part: string, noteEta: string) => {
    await update(ref(database, `production_report/notes_by_part/${part}`), {
      part,
      note_eta: noteEta,
      updated_at: new Date().toISOString(),
    });
  };

  const downloadCsv = () => {
    const mainHeaders = ['Part', 'Description', 'Required', 'Issued', 'Still Required', 'Inventory', 'Shortage Type', 'Shortage Qty'];
    const mainRows = filtered.map((r) => {
      const shortage = mode === 'sea' ? r.shortageSea : r.shortageNoSea;
      return [r.part || '', r.description || '', mode === 'sea' ? Number(r.sea_required_qty || 0) + Number(r.nosea_required_qty || 0) : Number(r.nosea_required_qty || 0), Number(r.issued_qty || 0), mode === 'sea' ? r.effSea : r.effNoSea, Number(r.stock_qty || 0), shortage < 0 ? (mode === 'sea' ? 'Potential Shortage' : 'Critical Shortage') : 'Healthy', shortage];
    });
    const notesHeaders = ['Part', 'NOTE/ETA', 'Updated At'];
    const notesRows = Object.values(notes).map((n) => [n.part, n.note_eta || '', n.updated_at || '']);

    const files = [
      { name: `production-required-${mode}.csv`, content: [mainHeaders, ...mainRows].map((r) => r.map(csvCell).join(',')).join('\n') },
      { name: 'production-notes.csv', content: [notesHeaders, ...notesRows].map((r) => r.map(csvCell).join(',')).join('\n') },
    ];
    files.forEach((file) => {
      const blob = new Blob([`\uFEFF${file.content}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url);
    });
  };

  if (loading) return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;

  return <div className="space-y-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold md:text-3xl">{mode === 'sea' ? (lang === 'zh' ? '潜在短缺零件' : 'Potential Shortage') : (lang === 'zh' ? '关键短缺零件' : 'Critical Shortage')}</h1>
      <Button onClick={downloadCsv} className="gap-2"><Download className="h-4 w-4" />{lang === 'zh' ? '下载Excel(CSV)' : 'Download Excel (CSV)'}</Button>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? 'Critical Shortage 零件数' : 'Critical Shortage'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-red-700"><ShieldAlert className="h-5 w-5" />{cards.criticalCount}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? 'Potential Shortage 零件数' : 'Potential Shortage'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-amber-700"><AlertTriangle className="h-5 w-5" />{cards.potentialCount}</CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{lang === 'zh' ? '交期延误PO数量' : 'Delayed PO Count'}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-2xl font-semibold text-orange-700"><CalendarX2 className="h-5 w-5" />{cards.overduePoCount}</CardContent></Card>
    </div>

    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}><TabsList className="h-auto flex-wrap"><TabsTrigger value="sea">{lang === 'zh' ? '房车门店 + 海运需求零件' : 'Parts for caravan store and sea'}</TabsTrigger><TabsTrigger value="nosea">{lang === 'zh' ? '房车门店需求零件' : 'Parts for caravan store'}</TabsTrigger></TabsList></Tabs>
    <Card><CardHeader><CardTitle>{t(lang, 'search')}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t(lang, 'part')} / ${t(lang, 'description')}`} /></CardContent></Card>

    <Card><CardContent className="overflow-auto pt-6"><table className="min-w-[1400px] w-full table-fixed text-xs md:text-sm"><thead><tr className="border-b text-left"><th className="w-[100px] p-2">Part</th><th className="w-[72px] p-2">Photo</th><th className="p-2">{t(lang, 'description')}</th><th className="w-[84px] p-2">Required</th><th className="w-[72px] p-2">Issued</th><th className="w-[100px] p-2">Still Required</th><th className="w-[84px] p-2">Inventory</th><th className="w-[220px] p-2">Status</th><th className="w-[96px] p-2">Chassis</th><th className="w-[120px] p-2">OpenPO</th><th className="w-[240px] p-2">NOTE/ETA</th></tr></thead><tbody>{filtered.map((r) => { const shortage = mode === 'sea' ? r.shortageSea : r.shortageNoSea; const v = notes[r.normPart] || { part: r.normPart, note_eta: '', updated_at: '' }; const visibleChassisDetails = mode === 'sea' ? r.chassisDetails : r.chassisDetails.filter((item) => !item.isSea); return <tr key={r.normPart} className="border-b align-top"><td className="p-2 break-all">{r.part}</td><td className="p-2"><Dialog><DialogTrigger asChild><button className="h-12 w-12 overflow-hidden rounded border"><ImageWithFallback src={FirebaseService.getPartImageUrl(r.part || '')} fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)} alt={r.part || 'part'} className="h-full w-full object-contain" /></button></DialogTrigger><DialogContent className="max-w-xl"><div className="h-[60vh] overflow-hidden rounded"><ImageWithFallback src={FirebaseService.getPartImageUrl(r.part || '')} fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)} alt={r.part || 'part'} className="h-full w-full object-contain" /></div></DialogContent></Dialog></td><td className="p-2 break-words">{r.description || '-'}</td><td className="p-2">{mode === 'sea' ? Number(r.sea_required_qty || 0) + Number(r.nosea_required_qty || 0) : Number(r.nosea_required_qty || 0)}</td><td className="p-2">{Number(r.issued_qty || 0)}</td><td className="p-2">{mode === 'sea' ? r.effSea : r.effNoSea}</td><td className="p-2">{Number(r.stock_qty || 0)}</td><td className="p-2">{r.shortageNoSea < 0 ? <div className="inline-flex items-center gap-2 rounded-md bg-red-50 px-2 py-1 text-red-700"><AlertTriangle className="h-4 w-4" /><span>Critical Shortage</span><span className="font-semibold">{r.shortageNoSea}</span></div> : r.shortageSea < 0 ? <div className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-amber-700"><AlertTriangle className="h-4 w-4" /><span>Potential Shortage</span><span className="font-semibold">{r.shortageSea}</span></div> : <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700"><TrendingDown className="h-4 w-4" /><span>{lang === 'zh' ? '健康' : 'Healthy'}</span><span className="font-semibold">+{mode === 'sea' ? r.shortageSea : r.shortageNoSea}</span></div>}</td><td className="p-2">{visibleChassisDetails.length === 0 ? "-" : <Dialog><DialogTrigger asChild><Button variant="outline" size="sm">chassis ({visibleChassisDetails.length})</Button></DialogTrigger><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{r.part} - Chassis</DialogTitle></DialogHeader><div className="space-y-3"><div className="text-sm font-medium">{lang === "zh" ? `受影响车架数量: ${visibleChassisDetails.length}` : `Affected chassis count: ${visibleChassisDetails.length}`}</div><div className="max-h-[60vh] overflow-auto rounded border"><table className="min-w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-2 text-left">Chassis No.</th><th className="p-2 text-left">{lang === "zh" ? "状态" : "Status"}</th></tr></thead><tbody>{visibleChassisDetails.map((item) => <tr key={item.chassisNo} className="border-t"><td className="p-2">{item.chassisNo}</td><td className="p-2">{item.status}</td></tr>)}</tbody></table></div></div></DialogContent></Dialog>}</td><td className="p-2">{r.openPos.length === 0 ? "-" : <Dialog><DialogTrigger asChild><Button variant="outline" size="sm">{lang === "zh" ? `查看详情 (${r.openPos.length} / ${r.openPoQtyTotal})` : `View details (${r.openPos.length} / ${r.openPoQtyTotal})`}</Button></DialogTrigger><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{r.part} - {lang === "zh" ? "OpenPO明细" : "OpenPO Details"}</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-auto rounded border"><table className="min-w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-2 text-left">PO</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">{t(lang, "orderDate")}</th><th className="p-2 text-left">{t(lang, "deliveryDate")}</th><th className="p-2 text-left">{lang === "zh" ? "未交数量" : "openqty"}</th><th className="p-2 text-left">{lang === "zh" ? "状态" : "Status"}</th></tr></thead><tbody>{r.openPos.map((po, i) => { const delayed = isBeforeToday(po.deliverydate); return <tr key={`${po.po_number}-${po.po_item}-${i}`} className={`border-t ${delayed ? "bg-orange-100" : ""}`}><td className="p-2">{po.po_number || "-"}</td><td className="p-2">{po.po_item || "-"}</td><td className="p-2">{po.orderdate || "-"}</td><td className="p-2">{po.deliverydate || "-"}</td><td className="p-2">{Number(po.openqty || 0)}</td><td className="p-2">{delayed ? <span className="rounded bg-orange-200 px-2 py-0.5 text-xs font-medium text-orange-900">{lang === "zh" ? "延误" : "Delay"}</span> : "-"}</td></tr>; })}</tbody></table></div></DialogContent></Dialog>}</td><td className="p-2"><Input value={v.note_eta} onChange={(e) => { const next = e.target.value; setNotes((prev) => ({ ...prev, [r.normPart]: { ...v, note_eta: next, part: r.normPart } })); void saveNote(r.normPart, next); }} placeholder="NOTE/ETA" className="min-w-[220px]" /></td></tr>;})}</tbody></table></CardContent></Card>
  </div>;
}
