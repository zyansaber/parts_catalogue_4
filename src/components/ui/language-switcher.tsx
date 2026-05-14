import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLang, setLang, type Lang } from '@/lib/i18n';

export function LanguageSwitcher() {
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    const handleLanguageChange = () => {
      setLangState(getLang());
    };
    window.addEventListener('language-change', handleLanguageChange);
    return () => window.removeEventListener('language-change', handleLanguageChange);
  }, []);

  const toggleLanguage = () => {
    const newLang: Lang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    setLangState(newLang);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center gap-2"
      title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
    >
      <Globe className="h-4 w-4" />
      <span>{lang === 'zh' ? '中文' : 'English'}</span>
    </Button>
  );
}
