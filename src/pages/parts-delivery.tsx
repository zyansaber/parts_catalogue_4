import { useEffect, useMemo, useState } from 'react';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, ref } from 'firebase/database';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FirebaseService } from '@/services/firebase';
import { getLang, type Lang } from '@/lib/i18n';

type Ticket = Record<string, any>;
type OpenPoItem = { part?: string; openqty?: number };
type SalesOrderDetailItem = { description: string; material: string; orderQty: number; deliveryCount: number | null };
type DetailTicket = { id: string; ageDays: number; ticket: Record<string, any> };
type Row = {
  key: string;
  material: string;
  description: string;
  totalQty: number;
  totalTickets: number;
  oldestAging: number;
  stockQty: number;
  openPoQty: number;
  details: DetailTicket[];
};

const PAGE_SIZE = 20;

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
      material: String(item.Material ?? item.material ?? '-').trim(),
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
  const [currentPage, setCurrentPage] = useState(1);
  const [stockByMaterial, setStockByMaterial] = useState<Record<string, number>>({});
  const [openPoByMaterial, setOpenPoByMaterial] = useState<Record<string, number>>({});

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  useEffect(() => {
    Promise.all([
      get(ref(ticketDb, 'c4cTickets_test/tickets')),
      FirebaseService.getAllParts(),
      get(ref(getDatabase(), 'production_report/open_po/items')),
    ]).then(([ticketSnap, allParts, openPoSnap]) => {
      setTickets((ticketSnap.val() || {}) as Record<string, Ticket>);
      const stockMap = Object.entries(allParts || {}).reduce<Record<string, number>>((acc, [material, part]) => {
        acc[String(material).trim()] = Number((part as { Current_Stock_Qty?: number })?.Current_Stock_Qty || 0);
        return acc;
      }, {});
      setStockByMaterial(stockMap);
      const openPoMap = Object.values((openPoSnap.val() || {}) as Record<string, OpenPoItem>).reduce<Record<string, number>>((acc, item) => {
        const material = String(item.part || '').trim();
        if (!material) return acc;
        acc[material] = (acc[material] || 0) + Number(item.openqty || 0);
        return acc;
      }, {});
      setOpenPoByMaterial(openPoMap);
    });
  }, []);

  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    Object.values(tickets).forEach((entry) => {
      const ticketData = entry?.ticket || {};
      const status = String(ticketData.TicketStatusText || ticketData.TicketStatus || '').toLowerCase();
      const rejectionStatus = String(ticketData['Order Rejection Status'] || '').trim();
      if (status === 'closed') return;
      if (rejectionStatus === 'Fully Rejected') return;
      const ageDays = getAgeDays(entry);
      const details = parseSalesOrderDetails(ticketData['Sales Order Details']);
      details.filter((item) => item.deliveryCount === 0).forEach((item) => {
        if (!item.material) return;
        const key = `${item.material}__${item.description}`;
        const current = map.get(key) || {
          key,
          material: item.material,
          description: item.description,
          totalQty: 0,
          totalTickets: 0,
          oldestAging: 0,
          stockQty: stockByMaterial[item.material] || 0,
          openPoQty: openPoByMaterial[item.material] || 0,
          details: [],
        };
        current.totalQty += item.orderQty || 1;
        const tid = String(ticketData.TicketID || '-');
        if (!current.details.some((x) => x.id === tid)) {
          current.details.push({ id: tid, ageDays, ticket: ticketData });
        }
        current.totalTickets = current.details.length;
        current.oldestAging = Math.max(current.oldestAging, ageDays);
        current.stockQty = stockByMaterial[item.material] || 0;
        current.openPoQty = openPoByMaterial[item.material] || 0;
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.oldestAging - a.oldestAging);
  }, [tickets, stockByMaterial, openPoByMaterial]);

  const filtered = useMemo(() => {
    const k = search.trim().toLowerCase();
    if (!k) return rows;
    return rows.filter((r) => `${r.material} ${r.description}`.toLowerCase().includes(k));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedRows = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);
  useEffect(() => setCurrentPage(1), [search]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  return <div className="space-y-6"><h1 className="text-3xl font-bold">{lang === 'zh' ? 'Parts Delivery（全部，deliveryCount=0）' : 'Parts Delivery (All, deliveryCount=0)'}</h1><Card><CardHeader><CardTitle>{lang === 'zh' ? '搜索' : 'Search'}</CardTitle></CardHeader><CardContent><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === 'zh' ? '按物料号或描述搜索' : 'Search material or description'} /><p className="mt-2 text-xs text-gray-500">Tickets: {Object.keys(tickets).length} | Rows: {filtered.length} | {lang === 'zh' ? `第 ${currentPage}/${totalPages} 页，每页 ${PAGE_SIZE} 条` : `Page ${currentPage}/${totalPages}, ${PAGE_SIZE} rows per page`}</p></CardContent></Card><Card><CardContent className="overflow-auto pt-6"><table className="min-w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Material Code</th><th className="p-2 text-left">Description</th><th className="p-2 text-left">Total Qty</th><th className="p-2 text-left">Ticket Count</th><th className="p-2 text-left">Oldest Aging (days)</th><th className="p-2 text-left">Stock Qty</th><th className="p-2 text-left">Open PO Qty</th><th className="p-2 text-left">Detail</th></tr></thead><tbody>{pagedRows.map((r) => <tr key={r.key} className="border-b"><td className="p-2">{r.material}</td><td className="p-2">{r.description}</td><td className="p-2">{r.totalQty}</td><td className="p-2">{r.totalTickets}</td><td className="p-2">{r.oldestAging}</td><td className="p-2">{r.stockQty}</td><td className="p-2">{r.openPoQty}</td><td className="p-2"><Dialog><DialogTrigger asChild><Button variant="outline" size="sm">Detail</Button></DialogTrigger><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{r.material} - {r.description}</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-auto"><table className="min-w-full text-xs"><thead><tr className="border-b"><th className="p-2 text-left">TicketID</th><th className="p-2 text-left">Ageing</th><th className="p-2 text-left">SO Created Date</th><th className="p-2 text-left">ERPFreeOrder</th><th className="p-2 text-left">TicketStatus</th><th className="p-2 text-left">TicketStatusText</th></tr></thead><tbody>{r.details.sort((a,b)=>b.ageDays-a.ageDays).map((d)=> <tr key={d.id} className="border-b"><td className="p-2">{d.ticket.TicketID || d.id}</td><td className="p-2">{d.ageDays}</td><td className="p-2">{d.ticket['SO Created Date'] || '-'}</td><td className="p-2">{String(d.ticket.ERPFreeOrder ?? '-')}</td><td className="p-2">{d.ticket.TicketStatus || '-'}</td><td className="p-2">{d.ticket.TicketStatusText || '-'}</td></tr>)}</tbody></table></div></DialogContent></Dialog></td></tr>)}</tbody></table></CardContent></Card><div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>Next</Button></div></div>;
}
