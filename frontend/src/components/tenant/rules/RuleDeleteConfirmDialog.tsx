import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { TenantAccessRule } from '../../../types/tenant';
import { Button } from '../../ui';

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
  if (!isOpen || !rule) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl p-6 z-10 animate-in zoom-in-95 duration-150 space-y-4">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-[#da3633]/15 border border-[#da3633]/30 text-[#f85149] flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="text-base font-bold text-white">Delete Access Policy Rule?</h3>
          <p className="text-xs text-[#8b949e] mt-1.5 leading-relaxed">
            Are you sure you want to permanently delete rule <strong className="text-white">"{rule.name}"</strong> (<span className="font-mono text-[#58a6ff]">{rule.code}</span>)?
          </p>
        </div>

        <div className="p-3 rounded-lg bg-[#da3633]/10 border border-[#da3633]/30 text-xs text-[#f85149] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Edge controllers will immediately purge this rule. Vehicles evaluated previously by this rule will fall back to default tenant access policies.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-[#30363d] text-[#8b949e] hover:text-white"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onConfirm(rule.id);
              onClose();
            }}
            className="text-xs bg-[#da3633] hover:bg-[#b62324] text-white border-transparent gap-1.5 font-bold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Rule
          </Button>
        </div>
      </div>
    </div>
  );
};
