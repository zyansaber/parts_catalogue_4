import { useEffect, useMemo, useState } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

type SummaryItem = {
  part?: string;
  nosea_required_qty?: number;
  sea_required_qty?: number;
  stock_qty?: number;
};

type OpenPoItem = {
  po_number?: string;
  po_item?: string;
  part?: string;
  vendor?: string;
  orderdate?: string;
  deliverydate?: string;
  openqty?: number;
};

export default function ProductionRequiredAnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<SummaryItem & { gap: number; openPos: OpenPoItem[] }>>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summarySnap, openPoSnap] = await Promise.all([
          get(ref(database, 'production_report/summary/items')),
          get(ref(database, 'production_report/open_po/items')),
        ]);

        const summaryItems = Object.values((summarySnap.val() || {}) as Record<string, SummaryItem>);
        const openPoItems = Object.values((openPoSnap.val() || {}) as Record<string, OpenPoItem>);

        const openPoByPart = openPoItems.reduce<Record<string, OpenPoItem[]>>((acc, po) => {
          const part = (po.part || '').trim();
          if (!part) return acc;
          if (!acc[part]) acc[part] = [];
          acc[part].push(po);
          return acc;
        }, {});

        const mapped = summaryItems.map((item) => {
          const stock = Number(item.stock_qty || 0);
          const required = Number(item.nosea_required_qty || 0) + Number(item.sea_required_qty || 0);
          const gap = stock - required;
          const part = (item.part || '').trim();
          const openPos = gap < 0 && part ? (openPoByPart[part] || []) : [];
          return { ...item, gap, openPos };
        });

        setRows(mapped);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const key = search.toLowerCase();
    return rows
      .filter((r) => (r.part || '').toLowerCase().includes(key))
      .sort((a, b) => a.gap - b.gap);
  }, [rows, search]);

  if (loading) {
    return <div className="flex min-h-96 items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Production Required (Sea / NoSea)</h1>
        <p className="mt-1 text-gray-600">按零件对比 nosea / sea required，并计算 stock - required。负数表示生产缺件。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Part</CardTitle>
        </CardHeader>
        <CardContent>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="输入 part 编号" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Required vs Stock</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">Part</th><th className="p-2">NoSea Required</th><th className="p-2">Sea Required</th><th className="p-2">Stock</th><th className="p-2">Stock - Required</th><th className="p-2">OpenPO</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.part} className="border-b align-top">
                  <td className="p-2 font-medium">{r.part}</td>
                  <td className="p-2">{Number(r.nosea_required_qty || 0)}</td>
                  <td className="p-2">{Number(r.sea_required_qty || 0)}</td>
                  <td className="p-2">{Number(r.stock_qty || 0)}</td>
                  <td className={`p-2 font-semibold ${r.gap < 0 ? 'text-red-600' : 'text-green-600'}`}>{r.gap}</td>
                  <td className="p-2">
                    {r.openPos.length === 0 ? '—' : (
                      <div className="space-y-1">
                        {r.openPos.slice(0, 5).map((po, i) => (
                          <div key={`${po.po_number}-${po.po_item}-${i}`} className="rounded bg-gray-50 p-1">
                            PO {po.po_number}/{po.po_item} | Order: {po.orderdate || '-'} | Delivery: {po.deliverydate || '-'}
                          </div>
                        ))}
                        {r.openPos.length > 5 ? <div className="text-xs text-gray-500">+{r.openPos.length - 5} more</div> : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
