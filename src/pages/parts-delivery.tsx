import { useEffect, useMemo, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, ref } from 'firebase/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getLang, type Lang } from '@/lib/i18n';

type Ticket = Record<string, any>;
type SalesOrderDetailItem = { description: string; material: string; orderQty: number; deliveryCount: number | null };
type Row = { key: string; material: string; description: string; totalQty: number; totalTickets: number; oldestAging: number };

const ticketFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBVqlE55a2CUDmy_0NRWyL-eHE-ptz3Jo0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'snowy-hr-report.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://snowy-hr-report-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'snowy-hr-report',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'snowy-hr-report.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '827350144699',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:827350144699:web:c26b2e18bf3765cb877b9e',
};
const app = getApps().some((a) => a.name === 'ticketsApp') ? getApp('ticketsApp') : initializeApp(ticketFirebaseConfig, 'ticketsApp');
const ticketDb = getDatabase(app);

const parseTicketDate = (raw?: string) => {
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
};

const getAgeDays = (ticketEntry: Ticket) => {
  const createdOn = parseTicketDate(String(ticketEntry?.ticket?.CreatedOn || ''));
  if (!createdOn) return 0;
  return Math.max(0, Math.floor((Date.now() - createdOn.getTime()) / (1000 * 60 * 60 * 24)));
};

const parseSalesOrderDetails = (value: unknown): SalesOrderDetailItem[] => {
  if (!value) return [];
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (Array.isArray(parsed)) return parsed.flatMap((item) => parseSalesOrderDetails(item));
  if (typeof parsed !== 'object' || parsed === null) return [];

  const entries = Object.entries(parsed as Record<string, unknown>);
  const looksLikeItem = entries.some(([key]) => ['Delivery Count', 'Description', 'Material', 'Order Qty'].includes(key));
  if (looksLikeItem) {
    const item = parsed as Record<string, unknown>;
    const deliveryCount = Number.parseInt(String(item['Delivery Count'] ?? item.deliveryCount ?? ''), 10);
    const orderQty = Number.parseFloat(String(item['Order Qty'] ?? item.orderQty ?? '0'));
    return [{
      description: String(item.Description ?? item.description ?? '-'),
      material: String(item.Material ?? item.material ?? '-'),
      deliveryCount: Number.isNaN(deliveryCount) ? null : deliveryCount,
      orderQty: Number.isNaN(orderQty) ? 0 : orderQty,
    }];
  }
  return entries.flatMap(([, nestedValue]) => parseSalesOrderDetails(nestedValue));
};

export default function PartsDeliveryPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [tickets, setTickets] = useState<Record<string, Ticket>>({});
  const [search, setSearch] = useState('');

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);
  useEffect(() => { get(ref(ticketDb, 'c4cTickets_test/tickets')).then((s) => setTickets((s.val() || {}) as Record<string, Ticket>)); }, []);

  const rows = useMemo(() => {
    const map = new Map<string, Row & { ticketSet: Set<string> }>();
    Object.values(tickets).forEach((ticket) => {
      const status = String(ticket?.ticket?.TicketStatusText || ticket?.ticket?.TicketStatus || '').toLowerCase();
      if (status === 'closed') return;
      const ageDays = getAgeDays(ticket);
      const details = parseSalesOrderDetails(ticket?.ticket?.['Sales Order Details']);
      details.filter((item) => item.deliveryCount === 0).forEach((item) => {
        if (!item.material.trim()) return;
        const key = `${item.material}__${item.description}`;
        const current = map.get(key) || { key, material: item.material, description: item.description, totalQty: 0, totalTickets: 0, oldestAging: 0, ticketSet: new Set<string>() };
        current.totalQty += item.orderQty || 1;
        const tid = String(ticket?.ticket?.TicketID || '-');
        current.ticketSet.add(tid);
        current.totalTickets = current.ticketSet.size;
        current.oldestAging = Math.max(current.oldestAging, ageDays);
        map.set(key, current);
      });
    });
    return Array.from(map.values()).map(({ ticketSet, ...row }) => row).sort((a, b) => b.totalQty - a.totalQty);
  }, [tickets]);

  const filtered = useMemo(() => {
    const k = search.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => `${r.material} ${r.description}`.toLowerCase().includes(k));
  }, [rows, search]);

  return <div className="space-y-6"><h1 className="text-3xl font-bold">{lang === 'zh' ? 'Parts Delivery（全部，deliveryCount=0）' : 'Parts Delivery (All, deliveryCount=0)'}</h1><Card><CardHeader><CardTitle>{lang === 'zh' ? '搜索' : 'Search'}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === 'zh' ? '按物料号或描述搜索' : 'Search material or description'} /><p className="mt-2 text-xs text-gray-500">Tickets: {Object.keys(tickets).length} | Rows: {filtered.length}</p></CardContent></Card><Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Material Code</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">Total Qty</th><th className="p-2 text-left">Ticket Count</th><th className="p-2 text-left">Oldest Aging (days)</th></tr></thead><tbody>{filtered.map((r) => <tr key={r.key} className="border-b"><td className="p-2">{r.material}</td><td className="p-2">{r.description}</td><td className="p-2">{r.totalQty}</td><td className="p-2">{r.totalTickets}</td><td className="p-2">{r.oldestAging}</td></tr>)}</tbody></table></CardContent></Card></div>;
}
