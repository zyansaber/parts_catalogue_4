import { useEffect, useMemo, useState } from 'react';
import { get, ref, set, update } from 'firebase/database';
import { database } from '@/lib/firebase';
import { FirebaseService } from '@/services/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { getLang, t, type Lang } from '@/lib/i18n';

type OpenPoItem = { purchasinggroup?: string };

export default function AppAdminPage() {
  const [lang, setLang] = useState<Lang>(getLang());
  const [codes, setCodes] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [hiddenPartsText, setHiddenPartsText] = useState('');
  const [isSavingHiddenParts, setIsSavingHiddenParts] = useState(false);

  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  useEffect(() => {
    (async () => {
      const [openSnap, mapSnap, hiddenPartsSnap] = await Promise.all([
        get(ref(database, 'production_report/open_po/items')),
        get(ref(database, 'app_admin/purchasing_group_mapping')),
        get(ref(database, 'app_admin/catalogue_hidden_parts')),
      ]);
      const items = Object.values((openSnap.val() || {}) as Record<string, OpenPoItem>);
      const uniqueCodes = Array.from(new Set(items.map((x) => String(x.purchasinggroup || '').trim()).filter(Boolean))).sort();
      setCodes(uniqueCodes);
      setMapping((mapSnap.val() || {}) as Record<string, string>);
      setHiddenPartsText(FirebaseService.parseCatalogueHiddenParts(hiddenPartsSnap.val()).join('\n'));
    })();
  }, []);

  const rows = useMemo(() => codes.map((code) => ({ code, name: mapping[code] || '' })), [codes, mapping]);
  const hiddenParts = useMemo(
    () => FirebaseService.parseCatalogueHiddenParts(hiddenPartsText),
    [hiddenPartsText],
  );

  const onSave = async () => {
    await update(ref(database, 'app_admin/purchasing_group_mapping'), mapping);
  };

  const onSaveHiddenParts = async () => {
    setIsSavingHiddenParts(true);
    try {
      const normalizedList = hiddenParts.join('\n');
      await set(ref(database, 'app_admin/catalogue_hidden_parts'), normalizedList);
      setHiddenPartsText(normalizedList);
      toast.success(lang === 'zh' ? '隐藏配件列表已保存' : 'Hidden parts list saved');
    } catch (error) {
      console.error('Error saving catalogue hidden parts:', error);
      toast.error(lang === 'zh' ? '保存失败，请重试' : 'Unable to save. Please try again.');
    } finally {
      setIsSavingHiddenParts(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t(lang, 'appAdmin')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'zh' ? '主页隐藏配件' : 'Parts hidden from catalogue'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {lang === 'zh'
              ? '直接粘贴配件编号（每行一个，也支持逗号、分号或空格分隔）。保存后这些配件不会显示在 catalogue 主页。'
              : 'Paste part numbers directly (one per line; commas, semicolons, and spaces are also supported). Saved parts will not appear on the catalogue home page.'}
          </p>
          <Textarea
            value={hiddenPartsText}
            onChange={(event) => setHiddenPartsText(event.target.value)}
            placeholder={lang === 'zh' ? '例如：\n100001\n100002' : 'Example:\n100001\n100002'}
            className="min-h-48 font-mono"
          />
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              {lang === 'zh' ? `${hiddenParts.length} 个配件将被隐藏` : `${hiddenParts.length} parts will be hidden`}
            </span>
            <Button onClick={onSaveHiddenParts} disabled={isSavingHiddenParts}>
              {isSavingHiddenParts
                ? (lang === 'zh' ? '保存中…' : 'Saving…')
                : (lang === 'zh' ? '保存隐藏列表' : 'Save hidden list')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{lang === 'zh' ? 'Purchasing Group 映射' : 'Purchasing Group Mapping'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div key={row.code} className="grid grid-cols-2 gap-2">
              <Input value={row.code} disabled />
              <Input
                value={row.name}
                placeholder={lang === 'zh' ? '代表名字' : 'Display name'}
                onChange={(event) => setMapping((previous) => ({ ...previous, [row.code]: event.target.value }))}
              />
            </div>
          ))}
          <Button onClick={onSave}>{lang === 'zh' ? '保存' : 'Save'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
