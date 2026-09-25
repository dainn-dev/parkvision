import React, { ReactNode } from 'react';
import { LucideIcon, X, CheckCircle2, AlertTriangle, XCircle, Info, ChevronRight } from 'lucide-react';

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
  const baseStyle = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0e12] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variantStyles = {
    primary: 'bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 shadow-sm focus:ring-[#58a6ff] border border-[#58a6ff]/40',
    secondary: 'bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] focus:ring-[#58a6ff]',
    danger: 'bg-[#f85149] hover:bg-[#da3633] text-white shadow-sm focus:ring-[#f85149] border border-[#f85149]/30',
    success: 'bg-[#238636] hover:bg-[#2ea043] text-white shadow-sm focus:ring-[#3fb950] border border-[#3fb950]/30',
    outline: 'border border-[#30363d] bg-transparent text-[#c9d1d9] hover:bg-[#21262d] hover:border-[#8b949e] focus:ring-[#58a6ff]',
    ghost: 'bg-transparent text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9] focus:ring-[#58a6ff]'
  };

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5'
  };

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isSpinnerActive}
      {...props}
    >
      {isSpinnerActive ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      {children}
    </button>
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

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'md',
  dot = false,
  className = ''
}) => {
  const variantStyles = {
    emerald: 'bg-[#238636]/20 text-[#3fb950] border-[#3fb950]/30',
    amber: 'bg-[#9e6a03]/20 text-[#d29922] border-[#d29922]/30',
    red: 'bg-[#da3633]/20 text-[#f85149] border-[#f85149]/30',
    blue: 'bg-[#388bfd]/20 text-[#58a6ff] border-[#58a6ff]/30',
    purple: 'bg-[#8957e5]/20 text-[#a371f7] border-[#a371f7]/30',
    indigo: 'bg-[#1f6feb]/20 text-[#58a6ff] border-[#58a6ff]/30',
    slate: 'bg-[#21262d] text-[#8b949e] border-[#30363d]'
  };

  const dotColors = {
    emerald: 'bg-[#3fb950]',
    amber: 'bg-[#d29922]',
    red: 'bg-[#f85149]',
    blue: 'bg-[#58a6ff]',
    purple: 'bg-[#a371f7]',
    indigo: 'bg-[#58a6ff]',
    slate: 'bg-[#8b949e]'
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium'
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border whitespace-nowrap tracking-wide ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
};

// ==========================================
// 3. CARD & STATCARD COMPONENTS
// ==========================================
export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`bg-[#161b22] border border-[#30363d] rounded-xl transition-all duration-150 ${onClick ? 'cursor-pointer hover:border-[#484f58] hover:bg-[#1c2128]' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <div className={`p-5 border-b border-[#30363d] flex items-center justify-between gap-4 ${className}`}>
    <div>
      <h3 className="text-sm font-semibold text-white tracking-wide uppercase text-[11px] text-[#8b949e]">{title}</h3>
      {subtitle && <p className="text-xs text-[#8b949e] mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardContent: React.FC<{ children: ReactNode; className?: string }> = ({
  children,
  className = ''
}) => <div className={`p-5 ${className}`}>{children}</div>;

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
  accentColor = 'indigo'
}) => {
  const changeColors = {
    positive: 'text-[#3fb950]',
    negative: 'text-[#f85149]',
    neutral: 'text-[#8b949e]'
  };

  return (
    <Card onClick={onClick} className="p-5 relative overflow-hidden group border-[#30363d] hover:border-[#484f58]">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] block">{title}</span>
          <div className="mt-2 text-2xl lg:text-3xl font-bold tracking-tight text-white font-mono">{value}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon && (
            <div className="p-2.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#58a6ff] group-hover:border-[#58a6ff]/50 transition-colors">
              <Icon className="w-5 h-5" />
            </div>
          )}
          {badge}
        </div>
      </div>

      {(change || subtitle) && (
        <div className="mt-3 pt-3 border-t border-[#30363d] flex items-center justify-between text-xs">
          {change && <span className={`font-semibold ${changeColors[changeType]}`}>{change}</span>}
          {subtitle && <span className="text-[#8b949e]">{subtitle}</span>}
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

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'lg'
}) => {
  if (!isOpen) return null;

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className={`bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full ${widthClasses[maxWidth]} overflow-hidden transform transition-all flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22] shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-xs text-[#8b949e] mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#8b949e] hover:text-white hover:bg-[#21262d] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-[#c9d1d9] flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[#30363d] bg-[#161b22] flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

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
        <label htmlFor={inputId} className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative rounded-lg shadow-sm">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8b949e]">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          id={inputId}
          className={`block w-full rounded-lg bg-[#0d0e12] border text-sm text-[#c9d1d9] placeholder-[#8b949e] focus:outline-none focus:ring-2 focus:ring-[#58a6ff] focus:border-[#58a6ff] transition-colors py-2 ${
            Icon ? 'pl-9 pr-3' : 'px-3'
          } ${error ? 'border-[#f85149] focus:ring-[#f85149]' : 'border-[#30363d] hover:border-[#484f58]'} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[#f85149] font-medium">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-[#8b949e]">{helperText}</p>}
    </div>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
  error?: string;
  helperText?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  helperText,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`block w-full rounded-lg bg-[#0d0e12] border border-[#30363d] text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#58a6ff] focus:border-[#58a6ff] transition-colors px-3 py-2 cursor-pointer ${
          error ? 'border-[#f85149]' : 'hover:border-[#484f58]'
        } ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#161b22] text-[#c9d1d9]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[#f85149] font-medium">{error}</p>}
      {helperText && !error && <p className="text-[11px] text-[#8b949e]">{helperText}</p>}
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
  disabled = false
}) => {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      {(label || description) && (
        <div className="space-y-0.5">
          {label && <span className="text-sm font-medium text-[#c9d1d9] block">{label}</span>}
          {description && <span className="text-xs text-[#8b949e] block">{description}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#58a6ff] focus:ring-offset-2 focus:ring-offset-[#0d0e12] ${
          checked ? 'bg-[#58a6ff]' : 'bg-[#21262d]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};

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
  className = ''
}) => {
  if (variant === 'underline') {
    return (
      <div className={`border-b border-[#30363d] flex gap-6 overflow-x-auto ${className}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`pb-3 px-1 text-sm font-medium transition-all duration-150 border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-[#58a6ff] text-[#58a6ff] font-semibold'
                  : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#484f58]'
              }`}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#21262d] text-[#8b949e]">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`inline-flex p-1 bg-[#0d0e12] border border-[#30363d] rounded-xl gap-1 overflow-x-auto ${className}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-[#58a6ff] text-slate-950 font-semibold shadow-sm'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-[#388bfd] text-slate-950' : 'bg-[#21262d] text-[#8b949e]'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

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
  compact = false
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems !== undefined ? Math.min(currentPage * pageSize, totalItems) : currentPage * pageSize;

  const getPageNumbers = () => {
    if (safeTotalPages <= 7) {
      return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', safeTotalPages];
    }
    if (currentPage >= safeTotalPages - 3) {
      return [1, '...', safeTotalPages - 4, safeTotalPages - 3, safeTotalPages - 2, safeTotalPages - 1, safeTotalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', safeTotalPages];
  };

  const pages = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-[#161b22] border-t border-[#30363d] text-xs text-[#8b949e] ${className}`}
    >
      {/* Left: Summary & Page Size */}
      <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
        {totalItems !== undefined ? (
          <span>
            Showing <strong className="text-[#c9d1d9]">{startItem}</strong> to{' '}
            <strong className="text-[#c9d1d9]">{endItem}</strong> of{' '}
            <strong className="text-[#c9d1d9]">{totalItems}</strong> entries
          </span>
        ) : (
          <span>
            Page <strong className="text-[#c9d1d9]">{currentPage}</strong> of{' '}
            <strong className="text-[#c9d1d9]">{safeTotalPages}</strong>
          </span>
        )}

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 border-l border-[#30363d] pl-3">
            <span className="text-[11px] text-[#8b949e]">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="bg-[#0d0e12] border border-[#30363d] rounded-md px-2 py-1 text-xs text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff] cursor-pointer"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Controls */}
      <div className="flex items-center gap-1">
        {/* Previous Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="text-xs px-2.5 py-1 h-7 text-[#c9d1d9] bg-[#0d0e12] border-[#30363d] hover:border-[#58a6ff] disabled:opacity-40"
        >
          Previous
        </Button>

        {/* Page Numbers */}
        {!compact && (
          <div className="hidden sm:flex items-center gap-1 mx-1">
            {pages.map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-[#8b949e] select-none">
                    ...
                  </span>
                );
              }
              const pageNum = Number(p);
              const isActive = pageNum === currentPage;
              return (
                <button
                  key={`page-${pageNum}`}
                  onClick={() => onPageChange(pageNum)}
                  className={`min-w-[28px] h-7 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#58a6ff] text-slate-950 font-bold shadow-xs'
                      : 'bg-[#0d0e12] text-[#8b949e] border border-[#30363d] hover:text-[#c9d1d9] hover:border-[#484f58]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
        )}

        {/* Compact / Mobile Page indicator */}
        <span className="sm:hidden px-2 py-1 bg-[#0d0e12] border border-[#30363d] rounded-md text-[#c9d1d9] font-mono text-[11px]">
          {currentPage} / {safeTotalPages}
        </span>

        {/* Next Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= safeTotalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="text-xs px-2.5 py-1 h-7 text-[#c9d1d9] bg-[#0d0e12] border-[#30363d] hover:border-[#58a6ff] disabled:opacity-40"
        >
          Next
        </Button>
      </div>
    </div>
  );
};

// ==========================================
// 7. CODE & DIFF VIEWER
// ==========================================
export const JsonViewer: React.FC<{ data: any; title?: string }> = ({ data, title }) => (
  <div className="bg-[#0d0e12] rounded-xl border border-[#30363d] overflow-hidden text-xs">
    {title && <div className="px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] text-[#8b949e] font-mono uppercase text-[10px] tracking-wider">{title}</div>}
    <pre className="p-3 text-[#3fb950] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  </div>
);

export const DiffViewer: React.FC<{ changes: { field: string; before: any; after: any }[] }> = ({ changes }) => {
  if (!changes || changes.length === 0) {
    return <p className="text-xs text-[#8b949e] italic">No specific before/after field changes recorded.</p>;
  }

  return (
    <div className="space-y-2 text-xs font-mono">
      {changes.map((c, idx) => (
        <div key={idx} className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d] space-y-1">
          <div className="text-[#c9d1d9] font-semibold">{c.field}</div>
          <div className="flex items-center gap-2 text-[#f85149] bg-[#da3633]/10 px-2 py-1 rounded border border-[#da3633]/20">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#f85149]">- BEFORE:</span>
            <span>{JSON.stringify(c.before)}</span>
          </div>
          <div className="flex items-center gap-2 text-[#3fb950] bg-[#238636]/10 px-2 py-1 rounded border border-[#238636]/20">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[#3fb950]">+ AFTER:</span>
            <span>{JSON.stringify(c.after)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
