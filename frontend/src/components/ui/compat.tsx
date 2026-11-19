import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button as ShadButton } from '@/components/ui/button';
import { Badge as ShadBadge } from '@/components/ui/badge';
import {
  Card as ShadCard,
  CardHeader as ShadCardHeader,
  CardContent as ShadCardContent,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card';
import { Input as ShadInput } from '@/components/ui/input';
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch as ShadSwitch } from '@/components/ui/switch';
import { Tabs as ShadTabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ==========================================
// 1. BUTTON COMPONENT
// ==========================================
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'loading'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  isLoading?: boolean;
  loading?: boolean;
}

const buttonVariantMap: Record<NonNullable<ButtonProps['variant']>, React.ComponentProps<typeof ShadButton>['variant']> = {
  primary: 'default',
  secondary: 'secondary',
  danger: 'destructive',
  outline: 'outline',
  ghost: 'ghost',
  success: 'default',
};

const buttonSizeMap: Record<NonNullable<ButtonProps['size']>, React.ComponentProps<typeof ShadButton>['size']> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  isLoading = false,
  loading = false,
  className = '',
  disabled,
  ...props
}) => {
  const isSpinnerActive = isLoading || loading;

  return (
    <ShadButton
      variant={buttonVariantMap[variant]}
      size={buttonSizeMap[size]}
      className={`${variant === 'success' ? 'bg-success text-[#fff] hover:bg-success/90' : ''} ${className}`}
      disabled={disabled || isSpinnerActive}
      {...props}
    >
      {isSpinnerActive ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : Icon ? (
        <Icon className="size-4 shrink-0" />
      ) : null}
      {children}
    </ShadButton>
  );
};

// ==========================================
// 2. BADGE COMPONENT
// ==========================================
export type BadgeVariant = 'emerald' | 'amber' | 'red' | 'blue' | 'purple' | 'slate' | 'indigo';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const badgeVariantStyles: Record<BadgeVariant, string> = {
  emerald: 'border-transparent bg-success/10 text-success',
  amber: 'border-transparent bg-warning/10 text-warning',
  red: 'border-transparent bg-destructive/10 text-destructive',
  blue: 'border-transparent bg-primary/10 text-primary',
  purple: 'border-transparent bg-chart-5/10 text-chart-5',
  indigo: 'border-transparent bg-primary/10 text-primary',
  slate: 'border-border bg-muted text-muted-foreground',
};

const badgeDotColors: Record<BadgeVariant, string> = {
  emerald: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
  blue: 'bg-primary',
  purple: 'bg-chart-5',
  indigo: 'bg-primary',
  slate: 'bg-muted-foreground',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  dot = false,
  className = '',
}) => (
  <ShadBadge
    variant="outline"
    className={`h-auto rounded-[4px] ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} ${badgeVariantStyles[variant]} ${className}`}
  >
    {dot && <span className={`size-1.5 rounded-full ${badgeDotColors[variant]}`} />}
    {children}
  </ShadBadge>
);

// ==========================================
// 3. CARD & STATCARD COMPONENTS
// ==========================================
export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => (
  <ShadCard
    onClick={onClick}
    className={`gap-0 bg-card py-0 text-card-foreground ring-border transition-[box-shadow] duration-[330ms] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40 ${onClick ? 'cursor-pointer hover:ring-foreground/30' : ''} ${className}`}
  >
    {children}
  </ShadCard>
);

export const CardHeader: React.FC<{
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <ShadCardHeader className={`border-b border-border px-5 py-5 ${className}`}>
    <div>
      <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      {subtitle && <CardDescription className="mt-0.5 text-xs text-muted-foreground">{subtitle}</CardDescription>}
    </div>
    {action && <CardAction className="shrink-0">{action}</CardAction>}
  </ShadCardHeader>
);

export const CardContent: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <ShadCardContent className={`px-5 py-5 ${className}`}>{children}</ShadCardContent>;

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  subtitle?: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  onClick?: () => void;
  accentColor?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  subtitle,
  icon: Icon,
  badge,
  onClick,
  accentColor: _accentColor = 'indigo',
}) => {
  const changeColors = {
    positive: 'text-success',
    negative: 'text-destructive',
    neutral: 'text-muted-foreground',
  };

  return (
    <Card onClick={onClick} className="group relative overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <span className="block text-xs text-muted-foreground">{title}</span>
          <div className="mt-2 text-2xl font-medium tabular-nums text-foreground lg:text-3xl">{value}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon && (
            <div className="rounded-[4px] bg-muted p-2.5 text-foreground">
              <Icon className="size-5" />
            </div>
          )}
          {badge}
        </div>
      </div>

      {(change || subtitle) && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
          {change && <span className={`font-medium ${changeColors[changeType]}`}>{change}</span>}
          {subtitle && <span className="text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
};

// ==========================================
// 4. MODAL COMPONENT
// ==========================================
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

const modalWidthClasses: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '4xl': 'sm:max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg',
}) => (
  <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent
      showCloseButton
      from="bottom"
      className={`flex max-h-[90vh] flex-col gap-0 overflow-hidden bg-card p-0 text-card-foreground ring-border ${modalWidthClasses[maxWidth]}`}
    >
      <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
        <DialogTitle className="text-base font-medium text-foreground">{title}</DialogTitle>
        {subtitle && <DialogDescription className="text-xs text-muted-foreground">{subtitle}</DialogDescription>}
      </DialogHeader>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">{children}</div>
      {footer && (
        <DialogFooter className="m-0 shrink-0 rounded-none border-t border-border bg-card px-6 py-4">
          {footer}
        </DialogFooter>
      )}
    </DialogContent>
  </Dialog>
);

// ==========================================
// 5. INPUT, SELECT, SWITCH & TABS
// ==========================================
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: LucideIcon;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon: Icon,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-foreground">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
            <Icon className="size-4" />
          </div>
        )}
        <ShadInput
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={`h-9 border-input bg-background py-2 text-foreground placeholder:text-muted-foreground ${Icon ? 'pl-9' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-muted-foreground">{helperText}</p>}
    </div>
  );
};

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue'> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
  helperText?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  name?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  helperText,
  className = '',
  id,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const isControlled = value !== undefined;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-foreground">
          {label}
        </label>
      )}
      <ShadSelect
        value={isControlled ? String(value) : undefined}
        defaultValue={!isControlled && defaultValue !== undefined ? String(defaultValue) : undefined}
        onValueChange={(next) => onChange?.({ target: { value: next, name } })}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={error ? true : undefined}
          className={`h-9 w-full border-input bg-background py-2 text-foreground ${className}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadSelect>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-muted-foreground">{helperText}</p>}
    </div>
  );
};

export interface SwitchProps {
  label?: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}) => (
  <div className="flex items-center justify-between gap-4 py-2">
    {(label || description) && (
      <div className="space-y-0.5">
        {label && <span className="block text-sm font-medium text-foreground">{label}</span>}
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </div>
    )}
    <ShadSwitch checked={checked} onCheckedChange={onChange} disabled={disabled} />
  </div>
);

// ==========================================
// 6. TABS & PAGINATION
// ==========================================
export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: 'pills' | 'underline';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'pills',
  className = '',
}) => (
  <ShadTabs value={activeTab} onValueChange={onChange} className={className}>
    <TabsList
      variant={variant === 'underline' ? 'line' : 'default'}
      className={variant === 'underline' ? 'h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0' : 'h-auto gap-1 border border-border bg-background p-1'}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <TabsTrigger key={tab.id} value={tab.id} className="h-auto gap-2 px-3 py-1.5">
            {Icon && <Icon className="size-3.5" />}
            {tab.label}
            {tab.badge !== undefined && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tab.badge}</span>
            )}
          </TabsTrigger>
        );
      })}
    </TabsList>
  </ShadTabs>
);

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  compact?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize = 10,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  className = '',
  compact = false,
}) => {
  const { t } = useTranslation('common');
  const safeTotalPages = Math.max(1, totalPages);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems !== undefined ? Math.min(currentPage * pageSize, totalItems) : currentPage * pageSize;

  const getPageNumbers = () => {
    if (safeTotalPages <= 7) return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', safeTotalPages];
    if (currentPage >= safeTotalPages - 3) {
      return [1, '...', safeTotalPages - 4, safeTotalPages - 3, safeTotalPages - 2, safeTotalPages - 1, safeTotalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', safeTotalPages];
  };

  return (
    <div className={`flex flex-col items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground sm:flex-row ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
        {totalItems !== undefined ? (
          <span>
            {t('Showing')} <strong className="text-foreground">{startItem}</strong> {t('to')}{' '}
            <strong className="text-foreground">{endItem}</strong> {t('of')}{' '}
            <strong className="text-foreground">{totalItems}</strong> {t('entries')}
          </span>
        ) : (
          <span>
            {t('Page')} <strong className="text-foreground">{currentPage}</strong> {t('of')}{' '}
            <strong className="text-foreground">{safeTotalPages}</strong>
          </span>
        )}

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span className="text-[11px] text-muted-foreground">{t('Per page:')}</span>
            <ShadSelect
              value={String(pageSize)}
              onValueChange={(next) => {
                onPageSizeChange(Number(next));
                onPageChange(1);
              }}
            >
              <SelectTrigger className="h-7 border-border bg-background text-xs text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </ShadSelect>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-7 border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary disabled:opacity-40"
        >
          {t('Previous')}
        </Button>

        {!compact && (
          <div className="mx-1 hidden items-center gap-1 sm:flex">
            {getPageNumbers().map((p, idx) => {
              if (p === '...') {
                return <span key={`ellipsis-${idx}`} className="px-1.5 text-muted-foreground select-none">...</span>;
              }
              const pageNum = Number(p);
              const isActive = pageNum === currentPage;
              return (
                <button
                  key={`page-${pageNum}`}
                  onClick={() => onPageChange(pageNum)}
                  className={`h-7 min-w-[28px] cursor-pointer rounded-md px-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary font-medium text-[#fff] '
                      : 'border border-border bg-background text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
        )}

        <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground sm:hidden">
          {currentPage} / {safeTotalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= safeTotalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-7 border-border bg-background px-2.5 py-1 text-xs text-foreground hover:border-primary disabled:opacity-40"
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  );
};

// ==========================================
// 7. CODE & DIFF VIEWER
// ==========================================
export const JsonViewer: React.FC<{ data: unknown; title?: string }> = ({ data, title }) => (
  <div className="overflow-hidden rounded-xl border border-border bg-background text-xs">
    {title && <div className="border-b border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground ">{title}</div>}
    <pre className="overflow-x-auto p-3 font-mono leading-relaxed whitespace-pre-wrap text-success">
      {JSON.stringify(data, null, 2)}
    </pre>
  </div>
);

export const DiffViewer: React.FC<{ changes: { field: string; before: unknown; after: unknown }[] }> = ({ changes }) => {
  const { t } = useTranslation('common');
  if (!changes || changes.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{t('No specific before/after field changes recorded.')}</p>;
  }

  return (
    <div className="space-y-2 font-mono text-xs">
      {changes.map((c, idx) => (
        <div key={idx} className="space-y-1 rounded-lg border border-border bg-background p-2.5">
          <div className="font-medium text-foreground">{c.field}</div>
          <div className="flex items-center gap-2 rounded border border-destructive/20 bg-destructive/10 px-2 py-1 text-destructive">
            <span className="text-[11px] font-medium text-destructive ">- {t('BEFORE:')}</span>
            <span>{JSON.stringify(c.before)}</span>
          </div>
          <div className="flex items-center gap-2 rounded border border-success/20 bg-success/10 px-2 py-1 text-success">
            <span className="text-[11px] font-medium text-success ">+ {t('AFTER:')}</span>
            <span>{JSON.stringify(c.after)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

