import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type OpenPoItem = { po_number?: string; po_item?: string; part?: string; vendor?: string; orderdate?: string; deliverydate?: string; openqty?: number; };

export default function OpenPoVendor3060Page() {
  const [items, setItems] = useState<OpenPoItem[]>([]);
  useEffect(() => { get(ref(database, 'production_report/open_po/items')).then((snap) => setItems(Object.values((snap.val() || {}) as Record<string, OpenPoItem>))); }, []);
  const filtered = useMemo(() => items.filter((i) => String(i.vendor || '').replace(/^0+/, '').trim() === '3060'), [items]);
  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">OpenPO - Vendor 3060（去掉前导0） / trim leading 0</h1><Card><CardHeader><CardTitle>{filtered.length}</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Vendor</th><th className="p-2">PO</th><th className="p-2">Item</th><th className="p-2">Part</th><th className="p-2">Order</th><th className="p-2">Delivery</th></tr></thead><tbody>{filtered.map((r,i)=><tr key={i} className="border-b"><td className="p-2">{String(r.vendor||'').replace(/^0+/, '')}</td><td className="p-2">{r.po_number}</td><td className="p-2">{r.po_item}</td><td className="p-2">{r.part}</td><td className="p-2">{r.orderdate||'-'}</td><td className="p-2">{r.deliverydate||'-'}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
