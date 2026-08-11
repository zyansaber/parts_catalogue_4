import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { searchPartsLocally } from '@/lib/part-search';
import { resolvePartDescription, type Lang } from '@/lib/i18n';
import { Part } from '@/types';
import { cn } from '@/lib/utils';

interface PartSearchAutocompleteProps {
  parts: Record<string, Part>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  lang: Lang;
  loading?: boolean;
  className?: string;
}

export function PartSearchAutocomplete({ parts, value, onChange, placeholder, lang, loading, className }: PartSearchAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => value.trim() ? searchPartsLocally(parts, value).slice(0, 8) : [], [parts, value]);
  const showSuggestions = focused && value.trim().length > 0;

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls="part-search-suggestions"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setFocused(false);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>('#part-search-suggestions button')?.focus();
          }
        }}
        className="pl-9 pr-9"
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><LoadingSpinner size="sm" /></div>}
      {showSuggestions && (
        <div id="part-search-suggestions" role="listbox" className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-white p-1 shadow-lg">
          {suggestions.length ? suggestions.map(({ material, part }) => (
            <button
              key={material}
              type="button"
              role="option"
              className="flex w-full items-start gap-3 rounded px-3 py-2 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(material); setFocused(false); }}
            >
              <span className="shrink-0 font-mono text-sm font-semibold text-slate-900">{material}</span>
              <span className="min-w-0 truncate text-sm text-slate-500">{resolvePartDescription(lang, part) || (lang === 'zh' ? '无描述' : 'No description')}</span>
            </button>
          )) : (
            <p className="px-3 py-3 text-center text-sm text-slate-500">{lang === 'zh' ? '没有匹配建议' : 'No matching suggestions'}</p>
          )}
        </div>
      )}
    </div>
  );
}
