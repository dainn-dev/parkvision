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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('tenant');

  const [plate, setPlate] = useState<string>(
    initialRule?.target?.licensePlate || '51A-123.45'
  );
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleRunSimulation = async () => {
    if (!activeTenantId) {
      addToast({ type: 'error', title: t('No tenant selected') });
      return;
    }
    setIsEvaluating(true);
    try {
      const out = await tenantApi.simulateRule(activeTenantId, plate || undefined);
      setResult(out);
    } catch {
      addToast({ type: 'error', title: t('Simulation failed') });
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
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms] flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/15 border border-primary/30 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">
                {t('ANPR Policy Simulator & Decision Engine')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('Dry-run the live decision engine (`decide_access`) against a plate')}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Input Panel */}
          <div className="p-4 rounded-xl bg-card border border-border space-y-4">
            <div className="font-medium text-foreground text-xs">{t('Simulated Ingress Request')}</div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Vehicle License Plate')}
              </label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder={t('e.g. 51A-123.45')}
                className=" text-foreground bg-background border-border"
              />

              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{t('Quick Presets:')}</span>
                <button
                  type="button"
                  onClick={() => setPresetPlate('51K-881.00')}
                  className="px-2 py-0.5 rounded text-[11px] bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 cursor-pointer"
                >
                  51K-881.00 ({t('Blocked')})
                </button>
                <button
                  type="button"
                  onClick={() => setPresetPlate('30H-222.22')}
                  className="px-2 py-0.5 rounded text-[11px] bg-success/15 text-success border border-success/30 hover:bg-success/25 cursor-pointer"
                >
                  30H-222.22 ({t('VIP')})
                </button>
                <button
                  type="button"
                  onClick={() => setPresetPlate('51A-123.45')}
                  className="px-2 py-0.5 rounded text-[11px] bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 cursor-pointer"
                >
                  51A-123.45 ({t('Staff')})
                </button>
                <button
                  type="button"
                  onClick={() => setPresetPlate('59Z-999.99')}
                  className="px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground border border-border hover:text-foreground cursor-pointer"
                >
                  59Z-999.99 ({t('Unknown')})
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleRunSimulation}
              disabled={isEvaluating}
              className="w-full bg-primary hover:bg-primary/90 text-[#fff] py-2.5 gap-2 text-xs font-medium "
            >
              {isEvaluating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {t('Run Access Evaluation')}
            </Button>
          </div>

          {/* Result Banner */}
          {result && (
            <div className="space-y-4 animate-in fade-in duration-[330ms]">
              <div
                className={`p-5 rounded-2xl border ${
                  allowed
                    ? 'bg-card border-success/50'
                    : 'bg-card border-destructive/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                      allowed
                        ? 'bg-success/30 border-success text-success'
                        : 'bg-destructive/30 border-destructive text-destructive'
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
                      className={`text-lg font-medium tracking-wide ${
                        allowed ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {allowed ? t('ACCESS PERMITTED (ALLOW)') : t('ACCESS DENIED (DENY)')}
                    </span>
                    <p className="text-foreground text-xs mt-1 leading-relaxed ">
                      {result.reason}
                    </p>
                  </div>
                </div>

                {result.matchedRule && (
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      {t('Enforcing Policy:')} <span className="font-medium text-foreground">{result.matchedRule}</span>
                    </div>
                    <div>
                      {t('Evaluation:')} <span className="text-success font-medium">{t('Server-side decision engine')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-2.5 text-muted-foreground">
                <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t('Decision comes from the live engine: the plate is matched against the vehicle registry first, then active rules by priority. Site/gate/schedule scoping is applied inside the engine; the simulator returns the final decision and the winning rule name.')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {t('Evaluation is deterministic and stops on the first matching rule.')}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-border text-foreground hover:bg-muted"
          >
            {t('Close Simulator')}
          </Button>
        </div>
      </div>
    </div>
  );
};
