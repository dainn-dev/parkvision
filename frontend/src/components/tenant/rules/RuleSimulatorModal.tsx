import React, { useState } from 'react';
import {
  X,
  Play,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import { tenantApi } from '../../../services/api';
import { TenantAccessRule } from '../../../types/tenant';
import { Button, Input } from '../../ui';

interface RuleSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRule?: TenantAccessRule | null;
}

interface SimulateResult {
  decision: string;
  reason: string;
  matchedRule?: string | null;
}

export const RuleSimulatorModal: React.FC<RuleSimulatorModalProps> = ({
  isOpen,
  onClose,
  initialRule
}) => {
  const { activeTenantId, addToast } = usePlatform();

  const [plate, setPlate] = useState<string>(
    initialRule?.target?.licensePlate || '51A-123.45'
  );
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleRunSimulation = async () => {
    if (!activeTenantId) {
      addToast({ type: 'error', title: 'No tenant selected' });
      return;
    }
    setIsEvaluating(true);
    try {
      const out = await tenantApi.simulateRule(activeTenantId, plate || undefined);
      setResult(out);
    } catch {
      addToast({ type: 'error', title: 'Simulation failed' });
    } finally {
      setIsEvaluating(false);
    }
  };

  const setPresetPlate = (testPlate: string) => {
    setPlate(testPlate);
  };

  const allowed = result?.decision === 'allow';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1f6feb]/15 border border-[#1f6feb]/30 text-[#58a6ff]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                ANPR Policy Simulator & Decision Engine
              </h3>
              <p className="text-xs text-[#8b949e]">
                Dry-run the live decision engine (`decide_access`) against a plate
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Input Panel */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-4">
            <div className="font-bold text-white text-xs">Simulated Ingress Request</div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Vehicle License Plate
              </label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="e.g. 51A-123.45"
                className="font-mono uppercase text-white bg-[#0d0e12] border-[#30363d]"
              />

              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-[#8b949e]">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => setPresetPlate('51K-881.00')}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30 hover:bg-[#da3633]/25 cursor-pointer"
                >
                  51K-881.00 (Blocked)
                </button>
                <button
                  type="button"
                  onClick={() => setPresetPlate('30H-222.22')}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30 hover:bg-[#238636]/25 cursor-pointer"
                >
                  30H-222.22 (VIP)
                </button>
                <button
                  type="button"
                  onClick={() => setPresetPlate('51A-123.45')}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1f6feb]/15 text-[#58a6ff] border border-[#1f6feb]/30 hover:bg-[#1f6feb]/25 cursor-pointer"
                >
                  51A-123.45 (Staff)
                </button>
                <button
                  type="button"
                  onClick={() => setPresetPlate('59Z-999.99')}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:text-white cursor-pointer"
                >
                  59Z-999.99 (Unknown)
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleRunSimulation}
              disabled={isEvaluating}
              className="w-full bg-[#1f6feb] hover:bg-[#388bfd] text-white py-2.5 gap-2 text-xs font-bold shadow-sm"
            >
              {isEvaluating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Run Access Evaluation
            </Button>
          </div>

          {/* Result Banner */}
          {result && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div
                className={`p-5 rounded-2xl border ${
                  allowed
                    ? 'bg-gradient-to-r from-[#238636]/20 via-[#161b22] to-[#161b22] border-[#238636]/50'
                    : 'bg-gradient-to-r from-[#da3633]/20 via-[#161b22] to-[#161b22] border-[#da3633]/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-md ${
                      allowed
                        ? 'bg-[#238636]/30 border-[#238636] text-[#3fb950]'
                        : 'bg-[#da3633]/30 border-[#da3633] text-[#f85149]'
                    }`}
                  >
                    {allowed ? (
                      <ShieldCheck className="w-7 h-7" />
                    ) : (
                      <ShieldAlert className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <span
                      className={`text-lg font-black tracking-wide ${
                        allowed ? 'text-[#3fb950]' : 'text-[#f85149]'
                      }`}
                    >
                      {allowed ? 'ACCESS PERMITTED (ALLOW)' : 'ACCESS DENIED (DENY)'}
                    </span>
                    <p className="text-white text-xs mt-1 leading-relaxed font-mono">
                      {result.reason}
                    </p>
                  </div>
                </div>

                {result.matchedRule && (
                  <div className="mt-4 pt-3 border-t border-[#30363d]/60 flex items-center justify-between text-xs text-[#8b949e]">
                    <div>
                      Enforcing Policy: <span className="font-bold text-white">{result.matchedRule}</span>
                    </div>
                    <div>
                      Evaluation: <span className="text-[#3fb950] font-medium">Server-side decision engine</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-start gap-2.5 text-[#8b949e]">
                <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Decision comes from the live engine: the plate is matched against the
                  vehicle registry first, then active rules by priority. Site/gate/schedule
                  scoping is applied inside the engine; the simulator returns the final
                  decision and the winning rule name.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <div className="text-xs text-[#8b949e]">
            Evaluation is deterministic and stops on the first matching rule.
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d]"
          >
            Close Simulator
          </Button>
        </div>
      </div>
    </div>
  );
};
