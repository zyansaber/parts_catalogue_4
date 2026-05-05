import { useEffect, useMemo, useState } from 'react';
import { get, ref, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getLang, t, type Lang } from '@/lib/i18n';

type OpenPoItem = { purchasinggroup?: string };

export default function AppAdminPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [codes, setCodes] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  useEffect(() => {
    (async () => {
      const [openSnap, mapSnap] = await Promise.all([
        get(ref(database, 'production_report/open_po/items')),
        get(ref(database, 'app_admin/purchasing_group_mapping')),
      ]);
      const items = Object.values((openSnap.val() || {}) as Record<string, OpenPoItem>);
      const uniqueCodes = Array.from(new Set(items.map((x) => String(x.purchasinggroup || '').trim()).filter(Boolean))).sort();
      setCodes(uniqueCodes);
      setMapping((mapSnap.val() || {}) as Record<string, string>);
    })();
  }, []);

  const rows = useMemo(() => codes.map((code) => ({ code, name: mapping[code] || '' })), [codes, mapping]);
  const onSave = async () => { await update(ref(database, 'app_admin/purchasing_group_mapping'), mapping); };

  return <div className="space-y-6"><h1 className="text-3xl font-bold">{t(lang, 'appAdmin')}</h1><Card><CardHeader><CardTitle>{lang === 'zh' ? 'Purchasing Group 映射' : 'Purchasing Group Mapping'}</CardTitle></CardHeader><CardContent className="space-y-3">{rows.map((r) => <div key={r.code} className="grid grid-cols-2 gap-2"><Input value={r.code} disabled /><Input value={r.name} placeholder={lang === 'zh' ? '代表名字' : 'Display name'} onChange={(e) => setMapping((prev) => ({ ...prev, [r.code]: e.target.value }))} /></div>)}<Button onClick={onSave}>{lang === 'zh' ? '保存' : 'Save'}</Button></CardContent></Card></div>;
}
