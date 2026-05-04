import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type OpenPoItem = {
  po_number?: string;
  po_item?: string;
  part?: string;
  vendor?: string;
  orderdate?: string;
  deliverydate?: string;
  openqty?: number;
};

export default function OpenPoVendor3060Page() {
  const [items, setItems] = useState<OpenPoItem[]>([]);

  useEffect(() => {
    get(ref(database, 'production_report/open_po/items')).then((snap) => {
      setItems(Object.values((snap.val() || {}) as Record<string, OpenPoItem>));
    });
  }, []);

  const filtered = useMemo(() => items.filter((i) => String(i.vendor || '').trim() === '3060'), [items]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">OpenPO - Vendor 3060</h1>
      <Card>
        <CardHeader><CardTitle>All OpenPO where vendor = 3060 ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left"><th className="p-2">PO</th><th className="p-2">Item</th><th className="p-2">Part</th><th className="p-2">Order Date</th><th className="p-2">Delivery Date</th><th className="p-2">Open Qty</th></tr></thead>
            <tbody>
              {filtered.map((r, idx) => <tr key={`${r.po_number}-${r.po_item}-${idx}`} className="border-b"><td className="p-2">{r.po_number}</td><td className="p-2">{r.po_item}</td><td className="p-2">{r.part}</td><td className="p-2">{r.orderdate || '-'}</td><td className="p-2">{r.deliverydate || '-'}</td><td className="p-2">{r.openqty || 0}</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
