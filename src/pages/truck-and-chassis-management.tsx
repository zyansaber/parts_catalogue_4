import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { AlertCircle, CheckCircle2, ClipboardList, FileText, PackageSearch, Search, Truck } from 'lucide-react';
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

type CardFilter = 'all' | 'issued' | 'notIssued' | 'description';

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
  { key: 'issuepostingdate', label: 'issuepostingdate' },
  { key: 'materialdocument', label: 'materialdocument' },
  { key: 'movementtype', label: 'movementtype' },
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
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [descriptionFilter, setDescriptionFilter] = useState<string | null>(null);

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
  const notIssuedRows = useMemo(() => rows.filter((row) => !isIssued(row.isissuedtoproduction)), [rows]);
  const notIssuedCount = notIssuedRows.length;
  const descriptionCount = rows.filter((row) => Boolean(row.description)).length;
  const notIssuedDescriptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    notIssuedRows.forEach((row) => {
      const description = String(row.description || 'No Description');
      counts.set(description, (counts.get(description) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([description, count]) => ({ description, count }))
      .sort((a, b) => b.count - a.count || a.description.localeCompare(b.description));
  }, [notIssuedRows]);

  const selectCardFilter = (nextFilter: CardFilter) => {
    setCardFilter(nextFilter);
    setDescriptionFilter(null);
  };

  const filteredRows = useMemo(() => {
    const cardFilteredRows = rows.filter((row) => {
      if (cardFilter === 'issued') return isIssued(row.isissuedtoproduction);
      if (cardFilter === 'notIssued') {
        if (isIssued(row.isissuedtoproduction)) return false;
        if (descriptionFilter) return String(row.description || 'No Description') === descriptionFilter;
        return true;
      }
      if (cardFilter === 'description') return Boolean(row.description);
      return true;
    });
    const keyword = search.trim().toLowerCase();
    if (!keyword) return cardFilteredRows;
    return cardFilteredRows.filter((row) => (
      FIELD_LABELS.map(({ key }) => row[key])
        .map((value) => displayValue(value).toLowerCase())
        .join(' ')
        .includes(keyword)
    ));
  }, [rows, search, cardFilter, descriptionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, cardFilter, descriptionFilter]);
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => selectCardFilter('all')}
          onKeyDown={(event) => event.key === 'Enter' && selectCardFilter('all')}
          className={cardFilter === 'all' ? 'cursor-pointer border-blue-500 bg-blue-50' : 'cursor-pointer transition-colors hover:bg-gray-50'}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total d_tracking Items</CardTitle>
            <ClipboardList className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => selectCardFilter('issued')}
          onKeyDown={(event) => event.key === 'Enter' && selectCardFilter('issued')}
          className={cardFilter === 'issued' ? 'cursor-pointer border-blue-500 bg-blue-50' : 'cursor-pointer transition-colors hover:bg-gray-50'}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issued to Production</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{issuedCount}</div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => selectCardFilter('notIssued')}
          onKeyDown={(event) => event.key === 'Enter' && selectCardFilter('notIssued')}
          className={cardFilter === 'notIssued' ? 'cursor-pointer border-blue-500 bg-blue-50' : 'cursor-pointer transition-colors hover:bg-gray-50'}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">(not issued vehicle)</CardTitle>
            <PackageSearch className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{notIssuedCount}</div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => selectCardFilter('description')}
          onKeyDown={(event) => event.key === 'Enter' && selectCardFilter('description')}
          className={cardFilter === 'description' ? 'cursor-pointer border-blue-500 bg-blue-50' : 'cursor-pointer transition-colors hover:bg-gray-50'}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Description Records</CardTitle>
            <FileText className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{descriptionCount}</div>
          </CardContent>
        </Card>
      </div>

      {cardFilter === 'notIssued' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Not Issued Vehicle Descriptions</h2>
              <p className="text-sm text-gray-600">Click a description card to filter Truck Records by that description.</p>
            </div>
            {descriptionFilter && (
              <button
                className="w-fit rounded-md border px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                onClick={() => setDescriptionFilter(null)}
              >
                Clear description filter
              </button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {notIssuedDescriptionCounts.map(({ description, count }) => (
              <Card
                key={description}
                role="button"
                tabIndex={0}
                onClick={() => setDescriptionFilter(description)}
                onKeyDown={(event) => event.key === 'Enter' && setDescriptionFilter(description)}
                className={descriptionFilter === description ? 'cursor-pointer border-blue-500 bg-blue-50' : 'cursor-pointer transition-colors hover:bg-gray-50'}
              >
                <CardContent className="pt-6">
                  <div className="line-clamp-2 min-h-10 text-sm font-medium text-gray-900" title={description}>
                    {description}
                  </div>
                  <div className="mt-3 text-2xl font-bold text-gray-900">{count}</div>
                </CardContent>
              </Card>
            ))}
            {!notIssuedDescriptionCounts.length && (
              <Card>
                <CardContent className="pt-6 text-sm text-gray-500">No not issued vehicle descriptions found.</CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

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
