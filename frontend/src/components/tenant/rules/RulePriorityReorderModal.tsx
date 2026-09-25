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

interface RulePriorityReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulePriorityReorderModal: React.FC<RulePriorityReorderModalProps> = ({
  isOpen,
  onClose
}) => {
  const { tenantAccessRules, reorderRulePriorities } = usePlatform();
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
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Reorder Rule Evaluation Priorities
              </h3>
              <p className="text-xs text-[#8b949e]">
                Higher positions in the list are evaluated first by edge controllers
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice */}
        <div className="px-6 py-2.5 bg-[#1f6feb]/10 border-b border-[#1f6feb]/20 flex items-center gap-2 text-xs text-[#58a6ff]">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            Evaluation occurs sequentially from position #1 downwards. The first matched rule determines gate action.
          </span>
        </div>

        {/* Rules List */}
        <div className="p-6 overflow-y-auto space-y-2 flex-1 text-xs">
          {rules.map((rule, idx) => {
            const simulatedNewPriority = (idx + 1) * 10;
            return (
              <div
                key={rule.id}
                className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between gap-3 hover:border-[#58a6ff]/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-[#8b949e]" />
                    <span className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center font-mono font-bold text-white text-xs">
                      #{simulatedNewPriority}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{rule.name}</span>
                      <span className="font-mono text-[11px] text-[#8b949e]">({rule.code})</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rule.action === 'ALLOW'
                            ? 'bg-[#238636]/20 text-[#3fb950]'
                            : 'bg-[#da3633]/20 text-[#f85149]'
                        }`}
                      >
                        {rule.action === 'ALLOW' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {rule.action}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#8b949e] mt-0.5">
                      Target: <span className="text-[#c9d1d9]">{rule.target?.type || rule.type}</span> · Status:{' '}
                      <span className={rule.status === 'ACTIVE' ? 'text-[#3fb950]' : 'text-[#8b949e]'}>
                        {rule.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveRule(idx, 'up')}
                    className="p-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Move higher priority"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === rules.length - 1}
                    onClick={() => moveRule(idx, 'down')}
                    className="p-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Move lower priority"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <span className="text-xs text-[#8b949e]">
            Priorities will automatically re-index in intervals of 10 (#10, #20, #30...)
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs border-[#30363d] text-[#8b949e] hover:text-white"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5"
            >
              <Check className="w-4 h-4" />
              Save Evaluation Sequence
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
