import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getLang, type Lang } from '@/lib/i18n';

type Ticket = Record<string, any>;
type Row = { part: string; qty: number; tickets: number };

async function loadTicketData(): Promise<Record<string, Ticket>> {
  const snap = await get(ref(database, 'c4cTickets_test/tickets'));
  return (snap.val() || {}) as Record<string, Ticket>;
}

function useTicketData() {
  const [tickets, setTickets] = useState<Record<string, Ticket>>({});
  useEffect(() => { loadTicketData().then(setTickets); }, []);
  return tickets;
}

function parseSalesDetails(ticket: Ticket): any[] {
  const raw = ticket['Sales Order Details'] || ticket.salesOrderDetails || ticket.sales_order_details || [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw) return Object.values(raw);
  return [];
}

export default function PartsDeliveryPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [dealer, setDealer] = useState('');
  const tickets = useTicketData();

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  const dealers = useMemo(() => Array.from(new Set(Object.values(tickets).map((t) => String(t.dealer || t.Dealer || '')).filter(Boolean))).sort(), [tickets]);
  useEffect(() => { if (!dealer && dealers.length) setDealer(dealers[0]); }, [dealers, dealer]);

  const rows = useMemo(() => {
    const map: Record<string, Row> = {};
    Object.values(tickets).forEach((ticket) => {
      const ticketDealer = String(ticket.dealer || ticket.Dealer || '');
      const status = String(ticket.status || ticket.Status || '').toLowerCase();
      if (dealer && ticketDealer !== dealer) return;
      if (status === 'closed' || status === 'delivered') return;

      parseSalesDetails(ticket).forEach((item) => {
        const deliveryCount = Number(item.deliveryCount ?? item.delivery_count ?? 0);
        if (deliveryCount !== 0) return;
        const part = String(item.part || item.partCode || item.material || item.Material || '').trim();
        const qty = Number(item.qty || item.quantity || item.requiredQty || 0);
        if (!part) return;
        if (!map[part]) map[part] = { part, qty: 0, tickets: 0 };
        map[part].qty += qty || 1;
        map[part].tickets += 1;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [tickets, dealer]);

  return <div className="space-y-6"><h1 className="text-3xl font-bold">{lang === 'zh' ? 'Parts Delivery（deliveryCount=0）' : 'Parts Delivery (deliveryCount=0)'}</h1><Card><CardHeader><CardTitle>{lang === 'zh' ? 'Dealer 过滤' : 'Dealer Filter'}</CardTitle></CardHeader><CardContent><Input value={dealer} onChange={(e) => setDealer(e.target.value)} list="dealers" /><datalist id="dealers">{dealers.map((d) => <option key={d} value={d} />)}</datalist></CardContent></Card><Card><CardHeader><CardTitle>{rows.length} parts</CardTitle></CardHeader><CardContent className="overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Part</th><th className="p-2 text-left">Qty</th><th className="p-2 text-left">Ticket Count</th></tr></thead><tbody>{rows.map((r) => <tr key={r.part} className="border-b"><td className="p-2">{r.part}</td><td className="p-2">{r.qty}</td><td className="p-2">{r.tickets}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
