import React, { useState } from 'react';
import {
  X,
  Play,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Car,
  User,
  HelpCircle,
  Sparkles,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import { AccessRuleSimulationResult, TenantAccessRule } from '../../../types/tenant';
import { Button, Input } from '../../ui';

interface RuleSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRule?: TenantAccessRule | null;
}

export const RuleSimulatorModal: React.FC<RuleSimulatorModalProps> = ({
  isOpen,
  onClose,
  initialRule
}) => {
  const { tenantSites, simulateAccessDecision, tenantVehicles } = usePlatform();

  // Test inputs
  const [plate, setPlate] = useState<string>(
    initialRule?.target?.licensePlate || '51A-123.45'
  );
  const [siteId, setSiteId] = useState<string>('site-001');
  const [gateId, setGateId] = useState<string>('gate-mc-01');
  const [dateTime, setDateTime] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );

  // Result state
  const [result, setResult] = useState<AccessRuleSimulationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentSite = tenantSites.find(s => s.id === siteId) || tenantSites[0];
  const currentGates = [
    { id: 'gate-mc-01', name: 'Entrance Gate 01 (Inbound Main)' },
    { id: 'gate-mc-02', name: 'Entrance Gate 02 VIP (FastTrack)' },
    { id: 'gate-mc-03', name: 'Exit Gate 01 (Outbound Main)' },
    { id: 'gate-cargo-01', name: 'Cargo Logistics Gate 01' }
  ];

  const handleRunSimulation = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      const simResult = simulateAccessDecision({
        plate,
        siteId,
        gateId,
        timestamp: dateTime ? new Date(dateTime).toISOString() : new Date().toISOString()
      });
      setResult(simResult);
      setIsEvaluating(false);
    }, 250);
  };

  const setPresetPlate = (testPlate: string) => {
    setPlate(testPlate);
  };

  const setPresetTime = (type: 'now' | 'night' | 'weekend') => {
    const d = new Date();
    if (type === 'now') {
      setDateTime(d.toISOString().slice(0, 16));
    } else if (type === 'night') {
      d.setHours(23, 15, 0, 0);
      setDateTime(d.toISOString().slice(0, 16));
    } else if (type === 'weekend') {
      // Find upcoming Sunday
      const day = d.getDay();
      const diff = (7 - day) % 7;
      d.setDate(d.getDate() + diff);
      d.setHours(14, 0, 0, 0);
      setDateTime(d.toISOString().slice(0, 16));
    }
  };

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
                Simulate gate entry requests and verify deterministic rule evaluation order
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    onClick={() => setPresetPlate('43A-778.19')}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30 hover:bg-[#d29922]/25 cursor-pointer"
                  >
                    43A-778.19 (Contractor)
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

              <div>
                <label className="block text-[#c9d1d9] font-medium mb-1.5">
                  Arrival Timestamp (Local Facility Time)
                </label>
                <Input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="text-white bg-[#0d0e12] border-[#30363d]"
                />

                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-[#8b949e]">Time Presets:</span>
                  <button
                    type="button"
                    onClick={() => setPresetTime('now')}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:text-white cursor-pointer"
                  >
                    Current Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTime('night')}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:text-white cursor-pointer"
                  >
                    Late Night (23:15)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetTime('weekend')}
                    className="px-2 py-0.5 rounded text-[10px] bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:text-white cursor-pointer"
                  >
                    Sunday Afternoon
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#30363d]/60">
              <div>
                <label className="block text-[#8b949e] mb-1">Target Facility (Site)</label>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="w-full bg-[#0d0e12] border border-[#30363d] rounded p-2 text-white"
                >
                  {tenantSites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#8b949e] mb-1">Target Gate / Lane</label>
                <select
                  value={gateId}
                  onChange={(e) => setGateId(e.target.value)}
                  className="w-full bg-[#0d0e12] border border-[#30363d] rounded p-2 text-white"
                >
                  {currentGates.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
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
                  result.decision === 'ALLOW'
                    ? 'bg-gradient-to-r from-[#238636]/20 via-[#161b22] to-[#161b22] border-[#238636]/50'
                    : 'bg-gradient-to-r from-[#da3633]/20 via-[#161b22] to-[#161b22] border-[#da3633]/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-md ${
                        result.decision === 'ALLOW'
                          ? 'bg-[#238636]/30 border-[#238636] text-[#3fb950]'
                          : 'bg-[#da3633]/30 border-[#da3633] text-[#f85149]'
                      }`}
                    >
                      {result.decision === 'ALLOW' ? (
                        <ShieldCheck className="w-7 h-7" />
                      ) : (
                        <ShieldAlert className="w-7 h-7" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-lg font-black tracking-wide ${
                            result.decision === 'ALLOW' ? 'text-[#3fb950]' : 'text-[#f85149]'
                          }`}
                        >
                          {result.decision === 'ALLOW' ? 'ACCESS PERMITTED (ALLOW)' : 'ACCESS DENIED (DENY)'}
                        </span>
                        {result.winningRule && (
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#21262d] text-[#58a6ff]">
                            Priority #{result.winningRule.priority}
                          </span>
                        )}
                      </div>
                      <p className="text-white text-xs mt-1 leading-relaxed">
                        {result.reason}
                      </p>
                    </div>
                  </div>
                </div>

                {result.winningRule && (
                  <div className="mt-4 pt-3 border-t border-[#30363d]/60 flex items-center justify-between text-xs text-[#8b949e]">
                    <div>
                      Enforcing Policy: <span className="font-bold text-white">{result.winningRule.name}</span>{' '}
                      <span className="font-mono text-[11px] text-[#58a6ff]">({result.winningRule.code})</span>
                    </div>
                    <div>
                      Evaluation: <span className="text-[#3fb950] font-medium">Deterministic Match</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step-by-Step Rule Evaluation Trace Table */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-xs">
                    Rule Evaluation Chain Trace ({result.allEvaluatedRules.length} rules evaluated)
                  </div>
                  <span className="text-[11px] text-[#8b949e]">
                    Evaluated sequentially by priority
                  </span>
                </div>

                <div className="space-y-2">
                  {result.allEvaluatedRules.map((r, idx) => {
                    const isWinner = result.winningRule?.id === r.ruleId;
                    return (
                      <div
                        key={r.ruleId || idx}
                        className={`p-3 rounded-xl border text-xs transition-all ${
                          isWinner
                            ? 'bg-[#1f6feb]/15 border-[#1f6feb] text-white shadow-xs'
                            : r.matched
                            ? 'bg-[#0d0e12] border-[#30363d] opacity-50'
                            : 'bg-[#0d0e12]/60 border-[#30363d]/50 opacity-70'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#21262d] text-[#58a6ff]">
                              #{r.priority}
                            </span>
                            <span className="font-bold text-white">{r.ruleName}</span>
                            <span className="font-mono text-[11px] text-[#8b949e]">({r.ruleCode})</span>
                            <span
                              className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                                r.action === 'ALLOW' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#da3633]/20 text-[#f85149]'
                              }`}
                            >
                              {r.action}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isWinner ? (
                              <span className="px-2 py-0.5 rounded bg-[#238636] text-white font-bold text-[10px]">
                                WINNING RULE
                              </span>
                            ) : r.matched ? (
                              <span className="text-[10px] text-[#8b949e] italic">
                                Overridden by prior rule
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#8b949e]">
                          <div className="flex items-center gap-1.5">
                            {r.targetMatched ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-[#f85149]" />
                            )}
                            <span>Target: {r.targetMatched ? 'Match' : 'Mismatch'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {r.scopeMatched ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-[#f85149]" />
                            )}
                            <span>Facility/Gate: {r.scopeMatched ? 'Match' : 'Mismatch'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {r.scheduleMatched ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-[#f85149]" />
                            )}
                            <span>Schedule: {r.scheduleMatched ? 'Match' : 'Mismatch'}</span>
                          </div>
                        </div>

                        <div className="mt-1.5 text-[11px] text-[#8b949e]">
                          {r.matchReason}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between">
          <div className="text-xs text-[#8b949e]">
            Deterministic evaluation stops immediately on the first matching rule.
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
