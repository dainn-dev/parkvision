import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  ShieldAlert,
  GripVertical,
  Check,
  Info,
  Layers
} from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantAccessRule } from '../../../types/tenant';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface RulePriorityReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulePriorityReorderModal: React.FC<RulePriorityReorderModalProps> = ({
  isOpen,
  onClose
}) => {
  const { tenantAccessRules, reorderRulePriorities } = usePlatform();
  const { t } = useTranslation('tenant');
  const [rules, setRules] = useState<TenantAccessRule[]>([]);

  useEffect(() => {
    if (isOpen) {
      setRules([...tenantAccessRules].sort((a, b) => (a.priority || 999) - (b.priority || 999)));
    }
  }, [isOpen, tenantAccessRules]);

  if (!isOpen) return null;

  const moveRule = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;

    const newRules = [...rules];
    const temp = newRules[index];
    newRules[index] = newRules[targetIndex];
    newRules[targetIndex] = temp;
    setRules(newRules);
  };

  const handleSave = () => {
    const orderedIds = rules.map(r => r.id);
    reorderRulePriorities(orderedIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">
                {t('Reorder Rule Evaluation Priorities')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('Higher positions in the list are evaluated first by edge controllers')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice */}
        <div className="px-6 py-2.5 bg-primary/10 border-b border-primary/20 flex items-center gap-2 text-xs text-primary">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {t('Evaluation occurs sequentially from position #1 downwards. The first matched rule determines gate action.')}
          </span>
        </div>

        {/* Rules List */}
        <div className="p-6 overflow-y-auto space-y-2 flex-1 text-xs">
          {rules.map((rule, idx) => {
            const simulatedNewPriority = (idx + 1) * 10;
            return (
              <div
                key={rule.id}
                className="p-3 rounded-xl bg-card border border-border flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <span className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center font-medium text-foreground text-xs">
                      #{simulatedNewPriority}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{rule.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">({rule.code})</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          rule.action === 'ALLOW'
                            ? 'bg-success/20 text-success'
                            : 'bg-destructive/20 text-destructive'
                        }`}
                      >
                        {rule.action === 'ALLOW' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {t(rule.action)}
                      </span>
                    </div>

                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {t('Target:')} <span className="text-foreground">{rule.target?.type || rule.type}</span> · {t('Status:')}{' '}
                      <span className={rule.status === 'ACTIVE' ? 'text-success' : 'text-muted-foreground'}>
                        {t(rule.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveRule(idx, 'up')}
                    className="p-1.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title={t('Move higher priority')}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === rules.length - 1}
                    onClick={() => moveRule(idx, 'down')}
                    className="p-1.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title={t('Move lower priority')}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t('Priorities will automatically re-index in intervals of 10 (#10, #20, #30...)')}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-border text-muted-foreground hover:text-foreground"
            >
              {t('Cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5"
            >
              <Check className="w-4 h-4" />
              {t('Save Evaluation Sequence')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
