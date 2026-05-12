import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getLang, type Lang } from '@/lib/i18n';

type FirestoreField = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
};
type FirestoreDoc = { name?: string; fields?: Record<string, FirestoreField> };
const DEFAULT_R2_PUBLIC_BASE = 'https://pub-7e56631fd9fb4c6e9686364d876155f8.r2.dev';

const getValue = (f?: FirestoreField) =>
  f?.stringValue ??
  f?.integerValue ??
  f?.doubleValue ??
  f?.timestampValue ??
  (typeof f?.booleanValue === 'boolean' ? String(f.booleanValue) : '');

const DISPLAY_COLUMNS = ['line', 'reason', 'chassisNumber', 'material', 'description', 'actionTaken', 'photo'] as const;

const normalizeImageUrl = (url: string) => {
  if (!url || !url.includes('firebasestorage.googleapis.com')) return url;
  const match = url.match(/\/o\/([^?]+)/);
  const encodedPath = match?.[1];
  if (!encodedPath) return url;

  const decodedPath = decodeURIComponent(encodedPath);
  const filename = decodedPath.split('/').pop();
  if (!filename) return url;

  const base = (import.meta.env.VITE_CF_PUBLIC_BASE || import.meta.env.VITE_R2_PUBLIC_BASE || DEFAULT_R2_PUBLIC_BASE).trim().replace(/\/+$/, '');
  return base ? `${base}/partsfolder/${filename}` : url;
};

export default function PartsRequestsApiPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://firestore.googleapis.com/v1/projects/rrvps-98af0/databases/prod/documents:runQuery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'parts-requests', allDescendants: false }],
          },
        }),
      });
      const data = await res.json();
      const mapped = (Array.isArray(data) ? data : [])
        .filter((x) => x.document)
        .map((x) => {
          const doc: FirestoreDoc = x.document;
          const fields = doc.fields || {};
          const row: Record<string, string> = {};
          Object.entries(fields).forEach(([k, v]) => {
            row[k] = String(getValue(v));
          });

          row.photo = normalizeImageUrl(row.imageUrl || '');
          return row;
        })
        .filter((row) => row.storeDelivered !== 'true');

      setRows(mapped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tableRows = useMemo(
    () => rows.map((row) => DISPLAY_COLUMNS.reduce((acc, key) => ({ ...acc, [key]: row[key] || '' }), {} as Record<string, string>)),
    [rows],
  );

  const columnTitles: Record<(typeof DISPLAY_COLUMNS)[number], string> = {
    line: 'Line',
    reason: 'Reason',
    chassisNumber: 'Chassis Number',
    material: 'Material',
    description: 'Description',
    actionTaken: 'Action Taken',
    photo: 'Photo',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {lang === 'zh' ? '零件需求看板（API）' : 'Parts Requests Dashboard (API)'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === 'zh'
              ? '仅展示核心字段，已自动排除 storeDelivered=true 的记录。'
              : 'Showing essential fields only, with storeDelivered=true records automatically excluded.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">{rows.length} {lang === 'zh' ? '条记录' : 'records'}</Badge>
          <Button onClick={fetchData}>{loading ? (lang === 'zh' ? '加载中...' : 'Loading...') : (lang === 'zh' ? '刷新' : 'Refresh')}</Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">{lang === 'zh' ? '需求清单' : 'Request List'}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {DISPLAY_COLUMNS.map((c) => (
                  <th key={c} className="p-3 text-left font-medium text-foreground/90">{columnTitles[c]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr key={`${r.line}-${r.material}-${i}`} className="border-b transition-colors hover:bg-muted/20">
                  {DISPLAY_COLUMNS.map((c) => (
                    <td key={c} className="p-3 align-top">
                      {c === 'photo' ? (
                        r.photo ? (
                          <Button variant="outline" size="sm" onClick={() => setActivePhoto(r.photo)}>
                            {lang === 'zh' ? '查看图片' : 'View Photo'}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )
                      ) : (
                        r[c] || <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(activePhoto)} onOpenChange={(open) => !open && setActivePhoto(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lang === 'zh' ? '图片预览' : 'Photo Preview'}</DialogTitle>
          </DialogHeader>
          {activePhoto ? (
            <img src={activePhoto} alt="Part request" className="max-h-[75vh] w-full rounded-md object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
