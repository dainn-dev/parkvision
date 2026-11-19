import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { TenantAccessRule } from '../../../types/tenant';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface RuleDeleteConfirmDialogProps {
  rule: TenantAccessRule | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (ruleId: string) => void;
}

export const RuleDeleteConfirmDialog: React.FC<RuleDeleteConfirmDialogProps> = ({
  rule,
  isOpen,
  onClose,
  onConfirm
}) => {
  const { t } = useTranslation('tenant');
  if (!isOpen || !rule) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-md bg-background border border-border rounded-2xl p-6 z-10 animate-in zoom-in-95 duration-[330ms] space-y-4">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="text-base font-medium text-foreground">{t('Delete Access Policy Rule?')}</h3>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {t('Are you sure you want to permanently delete rule')} <strong className="text-foreground">"{rule.name}"</strong> (<span className="font-mono text-primary">{rule.code}</span>)?
          </p>
        </div>

        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {t('Edge controllers will immediately purge this rule. Vehicles evaluated previously by this rule will fall back to default tenant access policies.')}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-border text-muted-foreground hover:text-foreground"
          >
            {t('Cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onConfirm(rule.id);
              onClose();
            }}
            className="text-xs bg-destructive hover:bg-destructive/90 text-[#fff] border-transparent gap-1.5 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('Delete Rule')}
          </Button>
        </div>
      </div>
    </div>
  );
};
