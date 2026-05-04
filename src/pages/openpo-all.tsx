import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type OpenPoItem = {
  po_number?: string;
  po_item?: string;
  part?: string;
  vendor?: string;
  orderdate?: string;
  deliverydate?: string;
  openqty?: number;
};

export default function OpenPoAllPage() {
  const [items, setItems] = useState<OpenPoItem[]>([]);
  const [vendor, setVendor] = useState('');
  const [part, setPart] = useState('');

  useEffect(() => {
    get(ref(database, 'production_report/open_po/items')).then((snap) => {
      setItems(Object.values((snap.val() || {}) as Record<string, OpenPoItem>));
    });
  }, []);

  const filtered = useMemo(() => items.filter((i) => {
    const vOk = vendor ? String(i.vendor || '').toLowerCase().includes(vendor.toLowerCase()) : true;
    const pOk = part ? String(i.part || '').toLowerCase().includes(part.toLowerCase()) : true;
    return vOk && pOk;
  }), [items, vendor, part]);

  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">All OpenPO (with filters)</h1>
    <Card><CardHeader><CardTitle>Filters</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2"><Input placeholder="Filter vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} /><Input placeholder="Filter part" value={part} onChange={(e) => setPart(e.target.value)} /></CardContent></Card>
    <Card><CardHeader><CardTitle>OpenPO list ({filtered.length})</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Vendor</th><th className="p-2">PO</th><th className="p-2">Item</th><th className="p-2">Part</th><th className="p-2">Order Date</th><th className="p-2">Delivery Date</th><th className="p-2">Open Qty</th></tr></thead><tbody>{filtered.map((r, idx) => <tr key={`${r.po_number}-${r.po_item}-${idx}`} className="border-b"><td className="p-2">{r.vendor}</td><td className="p-2">{r.po_number}</td><td className="p-2">{r.po_item}</td><td className="p-2">{r.part}</td><td className="p-2">{r.orderdate || '-'}</td><td className="p-2">{r.deliverydate || '-'}</td><td className="p-2">{r.openqty || 0}</td></tr>)}</tbody></table></CardContent></Card>
  </div>;
}
