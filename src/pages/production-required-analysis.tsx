import { useEffect, useMemo, useState } from 'react';
import { ref, get, update } from 'firebase/database';
import { AlertTriangle, CalendarX2, Download, ShieldAlert, TrendingDown, X, Search } from 'lucide-react';
import { database } from '@/lib/firebase';
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
type CardFilter = 'critical' | 'potential' | 'overdue' | null;
type NoteItem = { part: string; note_eta: string; updated_at: string };

type Row = SummaryItem & {
  effSea: number;
  effNoSea: number;
  shortageSea: number;
  shortageNoSea: number;
  openPos: OpenPoItem[];
  normPart: string;
  openPoQtyTotal: number;
  chassisDetails: Array<{ chassisNo: string; status: string; isSea: boolean }>;
};

const normalizePart = (part?: string) => (part || '').trim().replace(/[_-]?KANBAN.*$/i, '').replace(/[_-]\d+$/, '');
const parseDate = (value?: string) => {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isBeforeToday = (value?: string) => {
  const d = parseDate(value);
  if (!d) return false;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return d < t;
};
const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const getRequiredQty = (row: SummaryItem, mode: Mode) =>
  mode === 'sea'
    ? Number(row.sea_required_qty || 0) + Number(row.nosea_required_qty || 0)
    : Number(row.nosea_required_qty || 0);
const getStillRequiredQty = (row: Row, mode: Mode) => (mode === 'sea' ? row.effSea : row.effNoSea);
const getExcessQty = (row: Row, mode: Mode) => Number(row.stock_qty || 0) + row.openPoQtyTotal - getStillRequiredQty(row, mode);

export default function ProductionRequiredAnalysisPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('nosea');
  const [cardFilter, setCardFilter] = useState<CardFilter>(null);
  const [notes, setNotes] = useState<Record<string, NoteItem>>({});

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

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

      const byPart = open.reduce<Record<string, OpenPoItem[]>>((acc, item) => {
        const part = normalizePart(item.part);
        if (!part) return acc;
        (acc[part] ||= []).push(item);
        return acc;
      }, {});
      const shortageByPart = shortages.reduce<Record<string, ShortageItem>>((acc, item) => {
        const part = normalizePart(item.part);
        if (part) acc[part] = item;
        return acc;
      }, {});
      const grouped: Record<string, SummaryItem> = {};

      summary.forEach((item) => {
        const part = normalizePart(item.part);
        if (!part) return;
        if (!grouped[part]) {
          grouped[part] = {
            part,
            description: resolvePartDescription(lang, { SPRAS_EN: item.spras_en || item.description, SPRAS_ZH: item.spras_zh }),
            spras_en: item.spras_en,
            spras_zh: item.spras_zh,
          };
        }
        grouped[part].nosea_required_qty = (grouped[part].nosea_required_qty || 0) + Number(item.nosea_required_qty || 0);
        grouped[part].sea_required_qty = (grouped[part].sea_required_qty || 0) + Number(item.sea_required_qty || 0);
        grouped[part].issued_qty = (grouped[part].issued_qty || 0) + Number(item.issued_qty || 0);
        grouped[part].stock_qty = Number(item.stock_qty || 0);
      });

      setRows(
        Object.values(grouped).map((item) => {
          const issued = Number(item.issued_qty || 0);
          const stock = Number(item.stock_qty || 0);
          const seaTotalRequired = Number(item.sea_required_qty || 0) + Number(item.nosea_required_qty || 0);
          const effSea = seaTotalRequired - issued;
          const effNoSea = Number(item.nosea_required_qty || 0) - issued;
          const part = normalizePart(item.part);
          const openPos = byPart[part] || [];
          const shortageInfo = shortageByPart[part];
          const chassisDetails = Object.entries(shortageInfo?.chassis || {}).map(([chassisNo, chassis]) => ({
            chassisNo,
            status: chassis?.status || '-',
            isSea: Boolean(chassis?.is_sea),
          }));
          return {
            ...item,
            effSea,
            effNoSea,
            shortageSea: stock - effSea,
            shortageNoSea: stock - effNoSea,
            normPart: part,
            openPos,
            openPoQtyTotal: openPos.reduce((sum, po) => sum + Number(po.openqty || 0), 0),
            chassisDetails,
          };
        }),
      );
      setLoading(false);
    })();
  }, [lang]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = rows.filter(
      (r) => (r.part || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q),
    );
    if (cardFilter === 'critical') result = result.filter((r) => r.shortageNoSea < 0);
    else if (cardFilter === 'potential') result = result.filter((r) => r.shortageSea < 0);
    else if (cardFilter === 'overdue') result = result.filter((r) => r.openPos.some((po) => isBeforeToday(po.deliverydate)));
    return result.sort((a, b) => (mode === 'sea' ? a.shortageSea - b.shortageSea : a.shortageNoSea - b.shortageNoSea));
  }, [rows, search, mode, cardFilter]);

  const cards = useMemo(
    () => ({
      criticalCount: rows.filter((r) => r.shortageNoSea < 0).length,
      potentialCount: rows.filter((r) => r.shortageSea < 0).length,
      overduePoCount: rows.reduce((sum, r) => sum + r.openPos.filter((po) => isBeforeToday(po.deliverydate)).length, 0),
    }),
    [rows],
  );

  const saveNote = async (part: string, noteEta: string) => {
    await update(ref(database, `production_report/notes_by_part/${part}`), {
      part,
      note_eta: noteEta,
      updated_at: new Date().toISOString(),
    });
  };

  const downloadCsv = () => {
    const mainHeaders = [
      'Part',
      'Description',
      'Required',
      'Issued',
      'Still Required',
      'Inventory',
      'Open PO Qty',
      'Excess Qty',
      'Shortage Type',
      'Shortage Qty',
    ];
    const mainRows = filtered.map((r) => {
      const shortage = mode === 'sea' ? r.shortageSea : r.shortageNoSea;
      return [
        r.part || '',
        r.description || '',
        getRequiredQty(r, mode),
        Number(r.issued_qty || 0),
        getStillRequiredQty(r, mode),
        Number(r.stock_qty || 0),
        r.openPoQtyTotal,
        getExcessQty(r, mode),
        shortage < 0 ? (mode === 'sea' ? 'Potential Shortage' : 'Critical Shortage') : 'Healthy',
        shortage,
      ];
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
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const cardFilterLabel =
    cardFilter === 'critical'
      ? 'Critical Shortage'
      : cardFilter === 'potential'
        ? 'Potential Shortage'
        : cardFilter === 'overdue'
          ? lang === 'zh'
            ? '交期延误PO'
            : 'Delayed PO'
          : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {mode === 'sea'
            ? lang === 'zh'
              ? '潜在短缺零件'
              : 'Potential Shortage'
            : lang === 'zh'
              ? '关键短缺零件'
              : 'Critical Shortage'}
        </h1>
        <Button onClick={downloadCsv} className="gap-2">
          <Download className="h-4 w-4" />
          {lang === 'zh' ? '下载Excel(CSV)' : 'Download Excel (CSV)'}
        </Button>
      </div>

      {/* Stat cards (clickable filters) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <FilterCard
          active={cardFilter === 'critical'}
          onClick={() => setCardFilter(cardFilter === 'critical' ? null : 'critical')}
          icon={ShieldAlert}
          label={lang === 'zh' ? 'Critical Shortage 零件数' : 'Critical Shortage'}
          value={cards.criticalCount}
          tone="red"
          lang={lang}
        />
        <FilterCard
          active={cardFilter === 'potential'}
          onClick={() => setCardFilter(cardFilter === 'potential' ? null : 'potential')}
          icon={AlertTriangle}
          label={lang === 'zh' ? 'Potential Shortage 零件数' : 'Potential Shortage'}
          value={cards.potentialCount}
          tone="amber"
          lang={lang}
        />
        <FilterCard
          active={cardFilter === 'overdue'}
          onClick={() => setCardFilter(cardFilter === 'overdue' ? null : 'overdue')}
          icon={CalendarX2}
          label={lang === 'zh' ? '交期延误PO数量' : 'Delayed PO Count'}
          value={cards.overduePoCount}
          tone="orange"
          lang={lang}
        />
      </div>

      {/* Mode tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="sea">{lang === 'zh' ? '房车门店 + 海运需求零件' : 'Parts for caravan store and sea'}</TabsTrigger>
          <TabsTrigger value="nosea">{lang === 'zh' ? '房车门店需求零件' : 'Parts for caravan store'}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search + active filter chip + result count */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t(lang, 'search')}: ${t(lang, 'part')} / ${t(lang, 'description')}`}
            className="pl-9"
          />
        </div>
        {cardFilter && (
          <button
            type="button"
            onClick={() => setCardFilter(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
          >
            {cardFilterLabel}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          {lang === 'zh' ? `共 ${filtered.length} 条记录` : `${filtered.length} results`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1480px] border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-[120px] border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Part
                </th>
                <th className="w-[68px] border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang === 'zh' ? '图片' : 'Photo'}
                </th>
                <th className="border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(lang, 'description')}
                </th>
                <th className="w-[80px] border-b px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Required
                </th>
                <th className="w-[72px] border-b px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Issued
                </th>
                <th className="w-[90px] border-b px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang === 'zh' ? '剩余需求' : 'Need'}
                </th>
                <th className="w-[80px] border-b px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang === 'zh' ? '库存' : 'Inventory'}
                </th>
                <th className="w-[95px] border-b px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang === 'zh' ? '超额数量' : 'Excess Qty'}
                </th>
                <th className="w-[180px] border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang === 'zh' ? '状态' : 'Status'}
                </th>
                <th className="w-[110px] border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Chassis
                </th>
                <th className="w-[150px] border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Open PO
                </th>
                <th className="w-[240px] border-b px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  NOTE / ETA
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-16 text-center text-sm text-muted-foreground">
                    {lang === 'zh' ? '没有符合条件的记录' : 'No matching records'}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const v = notes[r.normPart] || { part: r.normPart, note_eta: '', updated_at: '' };
                  const visibleChassisDetails = mode === 'sea' ? r.chassisDetails : r.chassisDetails.filter((item) => !item.isSea);
                  const required = getRequiredQty(r, mode);
                  const stillRequired = getStillRequiredQty(r, mode);
                  const excessQty = getExcessQty(r, mode);
                  const isCritical = r.shortageNoSea < 0;
                  const isPotential = !isCritical && r.shortageSea < 0;

                  return (
                    <tr key={r.normPart} className="border-b border-border/60 align-middle transition-colors hover:bg-muted/30">
                      <td className="px-3 py-3 align-middle">
                        <span className="font-mono text-xs font-semibold text-foreground">{r.part}</span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Dialog>
                          <DialogTrigger asChild>
                            <button
                              type="button"
                              className="block h-11 w-11 overflow-hidden rounded-md border bg-muted/30 transition hover:ring-2 hover:ring-primary/40"
                            >
                              <ImageWithFallback
                                src={FirebaseService.getPartImageUrl(r.part || '')}
                                fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)}
                                alt={r.part || 'part'}
                                className="h-full w-full object-contain"
                              />
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-xl">
                            <div className="h-[60vh] overflow-hidden rounded">
                              <ImageWithFallback
                                src={FirebaseService.getPartImageUrl(r.part || '')}
                                fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(r.part || '').slice(1)}
                                alt={r.part || 'part'}
                                className="h-full w-full object-contain"
                              />
                            </div>
                          </DialogContent>
                        </Dialog>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <p className="line-clamp-2 text-sm text-muted-foreground" title={r.description || ''}>
                          {r.description || '-'}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right align-middle font-mono text-sm tabular-nums">{required}</td>
                      <td className="px-3 py-3 text-right align-middle font-mono text-sm tabular-nums text-muted-foreground">
                        {Number(r.issued_qty || 0)}
                      </td>
                      <td className="px-3 py-3 text-right align-middle font-mono text-sm font-semibold tabular-nums">
                        {stillRequired}
                      </td>
                      <td className="px-3 py-3 text-right align-middle font-mono text-sm tabular-nums">
                        {Number(r.stock_qty || 0)}
                      </td>
                      <td className="px-3 py-3 text-right align-middle font-mono text-sm font-semibold tabular-nums">
                        {excessQty}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {isCritical ? (
                          <StatusCell tone="red" icon={AlertTriangle} label="Critical" qty={r.shortageNoSea} />
                        ) : isPotential ? (
                          <StatusCell tone="amber" icon={AlertTriangle} label="Potential" qty={r.shortageSea} />
                        ) : (
                          <StatusCell
                            tone="emerald"
                            icon={TrendingDown}
                            label={lang === 'zh' ? '健康' : 'Healthy'}
                            qty={mode === 'sea' ? r.shortageSea : r.shortageNoSea}
                            positive
                          />
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {visibleChassisDetails.length === 0 ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-medium">
                                {visibleChassisDetails.length} chassis
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{r.part} — Chassis</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                <p className="text-sm font-medium">
                                  {lang === 'zh'
                                    ? `受影响车架数量: ${visibleChassisDetails.length}`
                                    : `Affected chassis count: ${visibleChassisDetails.length}`}
                                </p>
                                <div className="max-h-[60vh] overflow-auto rounded-md border">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-muted/50">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          Chassis No.
                                        </th>
                                        <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          {lang === 'zh' ? '状态' : 'Status'}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {visibleChassisDetails.map((item) => (
                                        <tr key={item.chassisNo} className="border-t hover:bg-muted/30">
                                          <td className="px-3 py-2 font-mono text-xs">{item.chassisNo}</td>
                                          <td className="px-3 py-2 text-sm">{item.status}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {r.openPos.length === 0 ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs font-medium">
                                {r.openPos.length} POs
                                <span className="ml-1 text-muted-foreground">/ {r.openPoQtyTotal}</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl">
                              <DialogHeader>
                                <DialogTitle>
                                  {r.part} — {lang === 'zh' ? 'OpenPO 明细' : 'OpenPO Details'}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="max-h-[70vh] overflow-auto rounded-md border">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        PO
                                      </th>
                                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Item
                                      </th>
                                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {t(lang, 'orderDate')}
                                      </th>
                                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {t(lang, 'deliveryDate')}
                                      </th>
                                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {lang === 'zh' ? '未交数量' : 'Open Qty'}
                                      </th>
                                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {lang === 'zh' ? '状态' : 'Status'}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.openPos.map((po, i) => {
                                      const delayed = isBeforeToday(po.deliverydate);
                                      return (
                                        <tr
                                          key={`${po.po_number}-${po.po_item}-${i}`}
                                          className={`border-t ${delayed ? 'bg-orange-50' : 'hover:bg-muted/30'}`}
                                        >
                                          <td className="px-3 py-2 font-mono text-xs">{po.po_number || '-'}</td>
                                          <td className="px-3 py-2 font-mono text-xs">{po.po_item || '-'}</td>
                                          <td className="px-3 py-2">{po.orderdate || '-'}</td>
                                          <td className="px-3 py-2">{po.deliverydate || '-'}</td>
                                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                                            {Number(po.openqty || 0)}
                                          </td>
                                          <td className="px-3 py-2">
                                            {delayed ? (
                                              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-200">
                                                {lang === 'zh' ? '延误' : 'Delayed'}
                                              </span>
                                            ) : (
                                              <span className="text-muted-foreground">-</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Input
                          value={v.note_eta}
                          onChange={(e) => {
                            const next = e.target.value;
                            setNotes((prev) => ({
                              ...prev,
                              [r.normPart]: { ...v, note_eta: next, part: r.normPart },
                            }));
                            void saveNote(r.normPart, next);
                          }}
                          placeholder="NOTE / ETA"
                          className="h-8 w-full"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────── */

type Tone = 'red' | 'amber' | 'orange' | 'emerald';

function FilterCard({
  active,
  onClick,
  icon: Icon,
  label,
  value,
  tone,
  lang,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: Tone;
  lang: Lang;
}) {
  // Static class lookup keeps Tailwind JIT happy
  const styles = {
    red: { ring: 'ring-red-500 border-red-300', value: 'text-red-700', iconWrap: 'bg-red-50 text-red-600 ring-red-100', active: 'text-red-700' },
    amber: { ring: 'ring-amber-500 border-amber-300', value: 'text-amber-700', iconWrap: 'bg-amber-50 text-amber-600 ring-amber-100', active: 'text-amber-700' },
    orange: { ring: 'ring-orange-500 border-orange-300', value: 'text-orange-700', iconWrap: 'bg-orange-50 text-orange-600 ring-orange-100', active: 'text-orange-700' },
    emerald: { ring: 'ring-emerald-500 border-emerald-300', value: 'text-emerald-700', iconWrap: 'bg-emerald-50 text-emerald-600 ring-emerald-100', active: 'text-emerald-700' },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-lg border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        active ? `ring-2 ${styles.ring}` : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`text-3xl font-bold tabular-nums ${styles.value}`}>{value}</p>
        </div>
        <div className={`rounded-full p-2.5 ring-1 ring-inset ${styles.iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p
        className={`mt-3 text-xs font-medium transition-opacity ${
          active ? styles.active : 'text-muted-foreground opacity-0 group-hover:opacity-100'
        }`}
      >
        {active
          ? lang === 'zh'
            ? '✓ 已应用筛选'
            : '✓ Filter active'
          : lang === 'zh'
            ? '点击筛选'
            : 'Click to filter'}
      </p>
    </button>
  );
}

function StatusCell({
  tone,
  icon: Icon,
  label,
  qty,
  positive,
}: {
  tone: Tone;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  qty: number;
  positive?: boolean;
}) {
  const styles = {
    red: { pill: 'bg-red-50 text-red-700 ring-red-200', value: 'text-red-700' },
    amber: { pill: 'bg-amber-50 text-amber-700 ring-amber-200', value: 'text-amber-700' },
    orange: { pill: 'bg-orange-50 text-orange-700 ring-orange-200', value: 'text-orange-700' },
    emerald: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', value: 'text-emerald-700' },
  }[tone];

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles.pill}`}>
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${styles.value}`}>
        {positive ? `+${qty}` : qty}
      </span>
    </div>
  );
}
