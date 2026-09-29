import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

export const LanguageSwitcher: React.FC<{ className?: string; showIcon?: boolean }> = ({
  className = '',
  showIcon = true
}) => {
  const { i18n, t } = useTranslation('common');
  const current = i18n.language.startsWith('vi') ? 'vi' : 'en';

  return (
    <div
      className={`flex items-center rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden ${className}`}
      title={t('Switch language')}
    >
      {showIcon && <Languages className="w-3.5 h-3.5 text-[#8b949e] ml-2" />}
      {(['vi', 'en'] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => i18n.changeLanguage(lng)}
          className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            current === lng
              ? 'bg-[#58a6ff] text-slate-950'
              : 'text-[#8b949e] hover:text-white'
          }`}
          aria-pressed={current === lng}
        >
          {lng === 'vi' ? 'VI' : 'EN'}
        </button>
      ))}
    </div>
  );
};
