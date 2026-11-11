import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Languages } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AppLanguage } from '../../i18n';

interface LanguageOption {
  code: AppLanguage;
  shortLabel: string;
  label: string;
}

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'vi', shortLabel: 'VI', label: 'Tiếng Việt' },
  { code: 'en', shortLabel: 'EN', label: 'English' },
];

export const LanguageSwitcher: React.FC<{ className?: string; showIcon?: boolean }> = ({
  className = '',
  showIcon = true,
}) => {
  const { i18n, t } = useTranslation('common');
  const current = i18n.language.startsWith('vi') ? 'vi' : 'en';
  const currentOption = LANGUAGE_OPTIONS.find((option) => option.code === current) ?? LANGUAGE_OPTIONS[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('Switch language')}
          title={t('Switch language')}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
            className,
          )}
        >
          {showIcon && <Languages aria-hidden="true" className="size-3.5 shrink-0" />}
          <span className={cn(showIcon && 'hidden sm:inline')}>{currentOption.shortLabel}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-40" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-44 min-w-44">
        <DropdownMenuLabel>{t('Switch language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            if (value === 'vi' || value === 'en') {
              void i18n.changeLanguage(value);
            }
          }}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.code} value={option.code}>
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">{option.label}</span>
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                  {option.shortLabel}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
