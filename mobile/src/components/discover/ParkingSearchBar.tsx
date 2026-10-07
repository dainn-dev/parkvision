import React, { useState, useRef, useEffect } from 'react';
import { Search, X, History } from 'lucide-react';
import { getRecentSearches } from '../../lib/recentSearches';
import { useLanguage } from '../../i18n/LanguageContext';

interface ParkingSearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
  onSubmitSearch?: (query: string) => void;
  onSelectRecent?: (query: string) => void;
}

export const ParkingSearchBar: React.FC<ParkingSearchBarProps> = ({
  value,
  onChange,
  onClear,
  onSubmitSearch,
  onSelectRecent
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFocus = () => {
    setRecentSearches(getRecentSearches());
    setIsFocused(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onSubmitSearch?.(value);
      setIsFocused(false);
    }
  };

  return (
    <div ref={containerRef} className="relative z-20 px-4 pt-3 pb-2 bg-slate-900">
      <div className={`relative flex items-center bg-slate-800 border rounded-2xl shadow-inner transition-all ${
        isFocused ? 'border-blue-500 ring-2 ring-blue-500/20 bg-slate-800/95' : 'border-slate-700/80 hover:border-slate-600'
      }`}>
        <div className="pl-3.5 pr-2 text-slate-400">
          <Search className="w-4 h-4 text-slate-400" />
        </div>
        <input
          type="text"
          value={value}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full py-2.5 pr-8 text-sm text-slate-100 placeholder-slate-400 bg-transparent focus:outline-none"
        />
        {value && (
          <button
            onClick={onClear}
            className="pr-3 text-slate-400 hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Recent Searches Dropdown panel when focused & empty */}
      {isFocused && !value && recentSearches.length > 0 && (
        <div className="absolute left-4 right-4 top-full mt-1 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-fadeIn p-3 z-30">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-blue-400" />
              {t('recentSearches')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentSearches.map((term, index) => (
              <button
                key={index}
                onClick={() => {
                  if (onSelectRecent) onSelectRecent(term);
                  onChange(term);
                  setIsFocused(false);
                }}
                className="px-2.5 py-1.5 bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 border border-slate-600/40"
              >
                <History className="w-3 h-3 text-slate-400" />
                <span>{term}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
