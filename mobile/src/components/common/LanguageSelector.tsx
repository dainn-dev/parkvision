import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface LanguageSelectorProps {
  compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <div 
      className="inline-flex items-center bg-slate-800/90 border border-slate-700/80 rounded-xl p-0.5 shadow-inner text-xs font-semibold"
      id="language-switcher"
    >
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-[11px] ${
          language === 'vi'
            ? 'bg-blue-600 text-white font-bold shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Tiếng Việt"
      >
        <span className="text-xs">🇻🇳</span>
        {!compact && <span>VI</span>}
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-[11px] ${
          language === 'en'
            ? 'bg-blue-600 text-white font-bold shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="English"
      >
        <span className="text-xs">🇬🇧</span>
        {!compact && <span>EN</span>}
      </button>
    </div>
  );
};
