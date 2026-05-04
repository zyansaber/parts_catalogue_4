import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type OpenPoItem = { po_number?: string; po_item?: string; part?: string; vendor?: string; orderdate?: string; deliverydate?: string; openqty?: number; };

export default function OpenPoAllPage() {
  const [items, setItems] = useState<OpenPoItem[]>([]); const [vendor, setVendor] = useState(''); const [part, setPart] = useState('');
  useEffect(() => { get(ref(database, 'production_report/open_po/items')).then((snap) => setItems(Object.values((snap.val() || {}) as Record<string, OpenPoItem>))); }, []);
  const filtered = useMemo(() => items.filter((i) => (!vendor || String(i.vendor||'').replace(/^0+/,'').includes(vendor.replace(/^0+/,''))) && (!part || String(i.part||'').toLowerCase().includes(part.toLowerCase()))), [items,vendor,part]);
  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">全部 OpenPO / All OpenPO</h1><Card><CardHeader><CardTitle>过滤 / Filter</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Input placeholder="Vendor" value={vendor} onChange={(e)=>setVendor(e.target.value)} /><Input placeholder="Part" value={part} onChange={(e)=>setPart(e.target.value)} /></CardContent></Card><Card><CardHeader><CardTitle>{filtered.length}</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Vendor</th><th className="p-2">PO</th><th className="p-2">Item</th><th className="p-2">Part</th></tr></thead><tbody>{filtered.map((r,i)=><tr key={i} className="border-b"><td className="p-2">{String(r.vendor||'').replace(/^0+/, '')}</td><td className="p-2">{r.po_number}</td><td className="p-2">{r.po_item}</td><td className="p-2">{r.part}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
