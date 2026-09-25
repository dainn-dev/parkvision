import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Building2,
  Calendar,
  Layers,
  Copy,
  Trash2,
  Edit3,
  Play,
  Power,
  Info,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Car,
  Hash,
  ArrowRight,
  Sliders
} from 'lucide-react';
import { TenantAccessRule } from '../../../types/tenant';
import { Button } from '../../ui';

interface RuleDetailsDrawerProps {
  rule: TenantAccessRule | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (rule: TenantAccessRule) => void;
  onToggleStatus: (ruleId: string, currentStatus: string) => void;
  onDuplicate: (ruleId: string) => void;
  onDelete: (rule: TenantAccessRule) => void;
  onTestRule: (rule: TenantAccessRule) => void;
}

export const RuleDetailsDrawer: React.FC<RuleDetailsDrawerProps> = ({
  rule,
  isOpen,
  onClose,
  onEdit,
  onToggleStatus,
  onDuplicate,
  onDelete,
  onTestRule
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'logic' | 'audit'>('overview');

  if (!isOpen || !rule) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
            Active
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#30363d]/50 text-[#8b949e] border border-[#30363d]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8b949e]" />
            Inactive
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#1f6feb]/15 text-[#58a6ff] border border-[#1f6feb]/30">
            <Calendar className="w-3 h-3 text-[#58a6ff]" />
            Scheduled
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30">
            <AlertTriangle className="w-3 h-3 text-[#f85149]" />
            Expired
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30">
            <FileText className="w-3 h-3 text-[#e3b341]" />
            Draft
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-[#21262d] text-[#8b949e]">
            {status}
          </span>
        );
    }
  };

  const getTargetSummary = () => {
    switch (rule.target?.type) {
      case 'SPECIFIC_VEHICLE':
        return `Specific Vehicle: ${rule.target.vehicleName || 'Registered Vehicle'} (${rule.target.licensePlate || 'Plate'})`;
      case 'LICENSE_PLATE':
        return `License Plate: ${rule.target.licensePlate || 'N/A'}`;
      case 'MEMBER':
        return `Member: ${rule.target.memberName || rule.target.memberEmail || 'Specified Member'}`;
      case 'MEMBER_GROUP':
        return `Member Group: ${rule.target.memberGroup || 'All Staff'}`;
      case 'VEHICLE_GROUP':
        return `Vehicle Group: ${rule.target.vehicleGroup || 'All Fleet'}`;
      case 'VISITOR':
        return 'Pre-Registered Visitors & Scheduled Guests';
      case 'ALL_VEHICLES':
        return 'All Vehicles (Broad Policy)';
      default:
        return 'All Target Vehicles';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-[#0d0e12] border-l border-[#30363d] h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#30363d] bg-[#161b22] flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                rule.action === 'ALLOW'
                  ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40'
                  : 'bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40'
              }`}>
                {rule.action === 'ALLOW' ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {rule.action}
              </span>

              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
                Priority #{rule.priority}
              </span>

              {getStatusBadge(rule.status)}

              <span className="font-mono text-xs text-[#8b949e] px-2 py-0.5 rounded bg-[#0d0e12] border border-[#30363d]">
                {rule.code}
              </span>
            </div>

            <h2 className="text-lg font-bold text-white tracking-tight">{rule.name}</h2>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {rule.description || 'Automated ANPR edge access decision rule.'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 bg-[#0d0e12] border-b border-[#30363d] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTestRule(rule)}
              className="text-xs border-[#1f6feb]/40 bg-[#1f6feb]/10 text-[#58a6ff] hover:bg-[#1f6feb]/20 gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Simulate Rule
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(rule)}
              className="text-xs border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleStatus(rule.id, rule.status)}
              className={`text-xs gap-1.5 ${
                rule.status === 'ACTIVE'
                  ? 'border-[#30363d] text-[#8b949e] hover:text-[#f85149]'
                  : 'border-[#238636]/40 text-[#3fb950] hover:bg-[#238636]/10'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {rule.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onDuplicate(rule.id)}
              className="text-xs border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(rule)}
            className="text-xs border-[#da3633]/30 text-[#f85149] hover:bg-[#da3633]/15 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-[#30363d] bg-[#161b22]/50 flex items-center gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            Overview & Scope
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'schedule'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            Schedule & Windows
          </button>
          <button
            onClick={() => setActiveTab('logic')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'logic'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            Evaluation Logic
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'audit'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            Audit Activity ({rule.auditHistory?.length || 0})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Target Entity Box */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <User className="w-4 h-4 text-[#58a6ff]" />
                    <span>Access Target Entity</span>
                  </div>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#21262d] text-[#58a6ff]">
                    {rule.target?.type || 'ALL_VEHICLES'}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]/60 space-y-1.5">
                  <div className="text-sm font-bold text-white">{getTargetSummary()}</div>
                  {rule.target?.notes && (
                    <p className="text-xs text-[#8b949e]">{rule.target.notes}</p>
                  )}
                  {rule.target?.licensePlate && (
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-xs text-[#8b949e]">Target Plate:</span>
                      <span className="font-mono text-xs font-bold text-[#f0883e] px-2 py-0.5 rounded bg-[#f0883e]/10 border border-[#f0883e]/30">
                        {rule.target.licensePlate}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scope (Sites & Gates) */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Building2 className="w-4 h-4 text-[#3fb950]" />
                  <span>Facility & Gate Scope</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]/60 space-y-2">
                    <div className="text-[#8b949e] font-medium">Applied Sites</div>
                    {rule.scope?.allSites ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        All Tenant Facilities
                      </span>
                    ) : (
                      <div className="space-y-1">
                        {(rule.scope?.siteNames || ['Main Campus Facility']).map((s, idx) => (
                          <div key={idx} className="font-medium text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff]" />
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]/60 space-y-2">
                    <div className="text-[#8b949e] font-medium">Target Gates & Lanes</div>
                    {rule.scope?.allGates ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        All Gates & Lanes
                      </span>
                    ) : (
                      <div className="space-y-1">
                        {(rule.scope?.gateNames || ['Entrance Gate 01']).map((g, idx) => (
                          <div key={idx} className="font-medium text-white flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                            {g}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Advanced & Resilience */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3 text-xs">
                <div className="flex items-center gap-2 font-semibold text-white">
                  <Sliders className="w-4 h-4 text-[#e3b341]" />
                  <span>Advanced Verification Parameters</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <div className="text-[11px] text-[#8b949e]">Min OCR Confidence</div>
                    <div className="text-sm font-bold text-white mt-1">
                      {rule.advanced?.minConfidence || 90}%
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <div className="text-[11px] text-[#8b949e]">De-duplication Window</div>
                    <div className="text-sm font-bold text-white mt-1">
                      {rule.advanced?.duplicateWindowSeconds || 5} seconds
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <div className="text-[11px] text-[#8b949e]">Fail Behavior</div>
                    <div className="text-sm font-bold text-white mt-1">
                      {rule.advanced?.failBehavior || 'DENY'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-xs text-[#8b949e]">
                <div>
                  <span className="block text-[11px]">Rule Created:</span>
                  <span className="font-mono text-white">
                    {new Date(rule.createdAt).toLocaleDateString()} {new Date(rule.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px]">Last Modified:</span>
                  <span className="font-mono text-white">
                    {new Date(rule.updatedAt).toLocaleDateString()} {new Date(rule.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-white">
                    <Clock className="w-4 h-4 text-[#e3b341]" />
                    <span>Operating Schedule Mode</span>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-[#21262d] text-[#e3b341] border border-[#30363d]">
                    {rule.schedule?.type || 'ALWAYS'}
                  </span>
                </div>

                <p className="text-xs text-[#c9d1d9] font-medium">
                  Summary: <span className="text-white font-bold">{rule.schedule?.summaryText || 'Always (24/7)'}</span>
                </p>
                <div className="text-[11px] text-[#8b949e]">
                  Evaluated in local facility timezone: <span className="text-white font-mono">{rule.schedule?.timezone || 'Asia/Ho_Chi_Minh (UTC+7)'}</span>
                </div>
              </div>

              {rule.schedule?.type === 'WEEKLY' && rule.schedule.days && (
                <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                  <div className="text-xs font-semibold text-white">Weekly Time Windows</div>
                  <div className="space-y-2 text-xs">
                    {rule.schedule.days.map((d, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          d.enabled
                            ? 'bg-[#0d0e12] border-[#30363d] text-white'
                            : 'bg-[#161b22]/40 border-[#30363d]/40 text-[#8b949e]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${d.enabled ? 'bg-[#3fb950]' : 'bg-[#8b949e]'}`} />
                          <span className="font-semibold">{d.day}</span>
                        </div>

                        <div>
                          {d.enabled && d.windows && d.windows.length > 0 ? (
                            <span className="font-mono font-bold text-[#58a6ff]">
                              {d.windows.map(w => `${w.start} - ${w.end}`).join(', ')}
                            </span>
                          ) : d.enabled ? (
                            <span className="text-[#3fb950] font-medium">Full Day (24h)</span>
                          ) : (
                            <span className="text-[#8b949e] italic">No Access</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rule.schedule?.type === 'DATE_RANGE' && (
                <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3 text-xs">
                  <div className="text-xs font-semibold text-white">Temporary Date Window</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                      <div className="text-[#8b949e] text-[11px]">Valid From</div>
                      <div className="font-mono font-bold text-white mt-1">
                        {rule.schedule.startDate} · {rule.schedule.startTime || '00:00'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                      <div className="text-[#8b949e] text-[11px]">Valid Until</div>
                      <div className="font-mono font-bold text-white mt-1">
                        {rule.schedule.endDate} · {rule.schedule.endTime || '23:59'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logic' && (
            <div className="space-y-5">
              {/* Decision Flow Engine Panel */}
              <div className="p-5 rounded-xl bg-gradient-to-b from-[#161b22] to-[#0d0e12] border border-[#30363d] space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[#58a6ff]">
                  <Layers className="w-4 h-4" />
                  <span>Deterministic Rule Evaluation Logic</span>
                </div>

                <div className="p-4 rounded-xl bg-[#0d0e12] border border-[#30363d] font-mono text-xs space-y-2.5 text-[#c9d1d9]">
                  <div className="text-[#8b949e]">{'// Evaluated in order of priority (1 = highest)'}</div>
                  <div>
                    <span className="text-[#f0883e]">IF</span> (Target matches <span className="text-[#58a6ff]">"{rule.target?.type}"</span>)
                  </div>
                  <div className="pl-4">
                    <span className="text-[#f0883e]">AND</span> (Facility is in <span className="text-[#3fb950]">{rule.scope?.allSites ? '[ALL_SITES]' : `[${(rule.scope?.siteNames || []).join(', ')}]`}</span>)
                  </div>
                  <div className="pl-4">
                    <span className="text-[#f0883e]">AND</span> (Gate is in <span className="text-[#3fb950]">{rule.scope?.allGates ? '[ALL_GATES]' : `[${(rule.scope?.gateNames || []).join(', ')}]`}</span>)
                  </div>
                  <div className="pl-4">
                    <span className="text-[#f0883e]">AND</span> (Current Time is within <span className="text-[#e3b341]">{rule.schedule?.summaryText || '24/7'}</span>)
                  </div>
                  <div className="pt-2 border-t border-[#30363d] flex items-center gap-2">
                    <span className="text-[#f0883e]">THEN:</span>
                    <span className={`px-2.5 py-0.5 rounded font-bold text-xs ${
                      rule.action === 'ALLOW' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#da3633]/20 text-[#f85149]'
                    }`}>
                      DECISION: {rule.action}
                    </span>
                    <span className="text-[#8b949e]">(Evaluation halts; barrier responds)</span>
                  </div>
                </div>

                <div className="text-xs text-[#8b949e] leading-relaxed">
                  Rules with a lower priority number run first. If this rule evaluates to true, subsequent rules in the chain are skipped.
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Need to verify against real data?</div>
                  <p className="text-xs text-[#8b949e] mt-0.5">Test this rule against specific plates and simulated event timestamps.</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onTestRule(rule)}
                  className="bg-[#238636] hover:bg-[#2ea043] text-white text-xs gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Simulator
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-white">Rule Modification & Enforcement History</div>
              {rule.auditHistory && rule.auditHistory.length > 0 ? (
                <div className="space-y-3">
                  {rule.auditHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#21262d] text-[#58a6ff]">
                          {item.action}
                        </span>
                        <span className="text-[11px] text-[#8b949e] font-mono">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-white text-xs leading-relaxed">{item.details}</p>
                      <div className="text-[11px] text-[#8b949e] pt-1">
                        Actor: <span className="text-[#c9d1d9]">{item.actorName}</span> ({item.actorEmail || 'System'})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-[#161b22] rounded-xl border border-[#30363d] text-xs text-[#8b949e]">
                  No audit history records available for this rule.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
