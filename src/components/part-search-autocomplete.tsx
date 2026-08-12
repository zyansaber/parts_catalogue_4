import { useEffect, useId, useMemo, useState } from 'react';
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const suggestions = useMemo(() => value.trim() ? searchPartsLocally(parts, value).slice(0, 8) : [], [parts, value]);
  const showSuggestions = focused && value.trim().length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  const selectSuggestion = (material: string) => {
    onChange(material);
    setActiveIndex(-1);
    setFocused(false);
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        type="search"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          switch (event.key) {
            case 'ArrowDown':
              event.preventDefault();
              setFocused(true);
              setActiveIndex(current => Math.min(current + 1, suggestions.length - 1));
              break;
            case 'ArrowUp':
              event.preventDefault();
              setActiveIndex(current => Math.max(current - 1, 0));
              break;
            case 'Enter': {
              // Enter accepts the highlighted suggestion, or the best match when none is highlighted.
              const selected = suggestions[activeIndex >= 0 ? activeIndex : 0];
              if (selected) {
                event.preventDefault();
                selectSuggestion(selected.material);
              } else {
                setFocused(false);
              }
              break;
            }
            case 'Escape':
              event.preventDefault();
              setFocused(false);
              setActiveIndex(-1);
              break;
          }
        }}
        className="pl-9 pr-9"
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2"><LoadingSpinner size="sm" /></div>}
      {showSuggestions && (
        <div id={listId} role="listbox" className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-white p-1 shadow-lg">
          {suggestions.length ? suggestions.map(({ material, part }, index) => (
            <button
              key={material}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              tabIndex={-1}
              className="flex w-full items-start gap-3 rounded px-3 py-2 text-left hover:bg-slate-100 focus:outline-none aria-selected:bg-slate-100"
              onMouseEnter={() => setActiveIndex(index)}
              onPointerDown={(event) => {
                // Select before the input's blur closes and unmounts the menu.
                event.preventDefault();
                selectSuggestion(material);
              }}
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
