import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getLang, type Lang } from '@/lib/i18n';

type FirestoreField = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; timestampValue?: string };
type FirestoreDoc = { name?: string; fields?: Record<string, FirestoreField> };

const getValue = (f?: FirestoreField) => f?.stringValue ?? f?.integerValue ?? f?.doubleValue ?? f?.timestampValue ?? (typeof f?.booleanValue === 'boolean' ? String(f.booleanValue) : '');

export default function PartsRequestsApiPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  const fetchData = async () => {
    setLoading(true);
    const res = await fetch('https://firestore.googleapis.com/v1/projects/rrvps-98af0/databases/prod/documents:runQuery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'parts-requests', allDescendants: false }],
          where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'NOT_EQUAL', value: { stringValue: 'delivered' } } },
        },
      }),
    });
    const data = await res.json();
    const mapped = (Array.isArray(data) ? data : []).filter((x) => x.document).map((x) => {
      const doc: FirestoreDoc = x.document;
      const fields = doc.fields || {};
      const row: Record<string, string> = { id: (doc.name || '').split('/').pop() || '' };
      Object.entries(fields).forEach(([k, v]) => { row[k] = String(getValue(v)); });
      return row;
    });
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);
  const columns = useMemo(() => Array.from(new Set(rows.flatMap((r) => Object.keys(r)))), [rows]);

  return <div className="space-y-6"><div className="flex items-center justify-between"><h1 className="text-3xl font-bold">{lang === 'zh' ? 'Parts Requests API 表格' : 'Parts Requests API Table'}</h1><Button onClick={fetchData}>{loading ? (lang === 'zh' ? '加载中...' : 'Loading...') : (lang === 'zh' ? '刷新' : 'Refresh')}</Button></div><Card><CardHeader><CardTitle>{rows.length} rows</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b">{columns.map((c) => <th key={c} className="p-2 text-left">{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b">{columns.map((c) => <td key={c} className="p-2">{r[c] || '-'}</td>)}</tr>)}</tbody></table></CardContent></Card></div>;
}
