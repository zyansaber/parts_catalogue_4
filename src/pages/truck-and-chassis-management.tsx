import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { AlertCircle, CheckCircle2, ClipboardList, PackageSearch, Search, Truck } from 'lucide-react';
import { database } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { getLang, t, type Lang } from '@/lib/i18n';

type DTrackingItem = {
  chassisno?: string | number;
  description?: string;
  isissuedtoproduction?: boolean | string | number;
  issuematerialdocitem?: string | number;
  issuematerialdocument?: string | number;
  issuematerialdocyear?: string | number;
  issuemovementtype?: string | number;
  issuepostingdate?: string | number;
  issueproductionorder?: string | number;
  materialdocitem?: string | number;
  materialdocument?: string | number;
  materialdocyear?: string | number;
  movementtype?: string | number;
  part?: string | number;
  postingdate?: string | number;
  receivedserial?: string | number;
};

type Row = DTrackingItem & {
  id: string;
};

const DATA_PATH = 'production_report/d_tracking/items';
const PAGE_SIZE = 50;

const FIELD_LABELS: Array<{ key: keyof DTrackingItem; label: string }> = [
  { key: 'chassisno', label: 'chassisno' },
  { key: 'part', label: 'part' },
  { key: 'description', label: 'description' },
  { key: 'receivedserial', label: 'receivedserial' },
  { key: 'isissuedtoproduction', label: 'isissuedtoproduction' },
  { key: 'issueproductionorder', label: 'issueproductionorder' },
  { key: 'issuematerialdocument', label: 'issuematerialdocument' },
  { key: 'issuematerialdocitem', label: 'issuematerialdocitem' },
  { key: 'issuematerialdocyear', label: 'issuematerialdocyear' },
  { key: 'issuemovementtype', label: 'issuemovementtype' },
  { key: 'issuepostingdate', label: 'issuepostingdate' },
  { key: 'materialdocument', label: 'materialdocument' },
  { key: 'materialdocitem', label: 'materialdocitem' },
  { key: 'materialdocyear', label: 'materialdocyear' },
  { key: 'movementtype', label: 'movementtype' },
  { key: 'postingdate', label: 'postingdate' },
];

const displayValue = (value: unknown) => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

const isIssued = (value: DTrackingItem['isissuedtoproduction']) => (
  value === true || String(value).toLowerCase() === 'true' || String(value) === '1'
);

const normalizeRows = (value: unknown): Row[] => {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, DTrackingItem>).map(([id, item]) => ({ id, ...(item || {}) }));
};

export default function TruckAndChassisManagementPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    get(ref(database, DATA_PATH))
      .then((snapshot) => {
        if (cancelled) return;
        const allRows = normalizeRows(snapshot.val()).sort((a, b) => a.id.localeCompare(b.id));
        setRows(allRows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const issuedCount = rows.filter((row) => isIssued(row.isissuedtoproduction)).length;
  const receivedSerialCount = rows.filter((row) => Boolean(row.receivedserial)).length;

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => (
      FIELD_LABELS.map(({ key }) => row[key])
        .map((value) => displayValue(value).toLowerCase())
        .join(' ')
        .includes(keyword)
    ));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Truck className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">{t(lang, 'truckAndChassisManagement')}</h1>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Firebase path: <span className="font-mono">{DATA_PATH}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total d_tracking Items</CardTitle>
            <ClipboardList className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issued to Production</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issuedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Received Serial Records</CardTitle>
            <PackageSearch className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{receivedSerialCount}</div>
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader>
          <CardTitle>Truck Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by chassis no, part, serial, document, production order, description..."
            />
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Failed to load d_tracking items: {error}
            </div>
          ) : loading ? (
            <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
          ) : (
            <>
              <div className="overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr className="border-b">
                      {FIELD_LABELS.map(({ key, label }) => (
                        <th key={key} className="whitespace-nowrap p-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row) => (
                      <tr key={row.id} className="border-b last:border-b-0 hover:bg-gray-50">
                        {FIELD_LABELS.map(({ key }) => (
                          <td key={key} className="whitespace-nowrap p-3 text-gray-800">
                            {key === 'isissuedtoproduction' ? (
                              <Badge variant={isIssued(row[key]) ? 'default' : 'secondary'}>
                                {displayValue(row[key])}
                              </Badge>
                            ) : displayValue(row[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!pagedRows.length && (
                      <tr>
                        <td className="p-8 text-center text-gray-500" colSpan={FIELD_LABELS.length}>No records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Showing {pagedRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <span>Page {page} / {totalPages}</span>
                  <button
                    className="rounded-md border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
