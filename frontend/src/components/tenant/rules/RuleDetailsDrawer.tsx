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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('tenant');

  if (!isOpen || !rule) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success border border-success/30">
            <span className="w-1.5 h-1.5 rounded-full bg-success " />
            {t('Active')}
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-border/50 text-muted-foreground border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            {t('Inactive')}
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30">
            <Calendar className="w-3 h-3 text-primary" />
            {t('Scheduled')}
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/30">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            {t('Expired')}
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/15 text-warning border border-warning/30">
            <FileText className="w-3 h-3 text-warning" />
            {t('Draft')}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            {status}
          </span>
        );
    }
  };

  const getTargetSummary = () => {
    switch (rule.target?.type) {
      case 'SPECIFIC_VEHICLE':
        return `${t('Specific Vehicle:')} ${rule.target.vehicleName || t('Registered Vehicle')} (${rule.target.licensePlate || t('Plate')})`;
      case 'LICENSE_PLATE':
        return `${t('License Plate:')} ${rule.target.licensePlate || 'N/A'}`;
      case 'MEMBER':
        return `${t('Member:')} ${rule.target.memberName || rule.target.memberEmail || t('Specified Member')}`;
      case 'MEMBER_GROUP':
        return `${t('Member Group:')} ${rule.target.memberGroup || t('All Staff')}`;
      case 'VEHICLE_GROUP':
        return `${t('Vehicle Group:')} ${rule.target.vehicleGroup || t('All Fleet')}`;
      case 'VISITOR':
        return t('Pre-Registered Visitors & Scheduled Guests');
      case 'ALL_VEHICLES':
        return t('All Vehicles (Broad Policy)');
      default:
        return t('All Target Vehicles');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      <div
        className="fixed inset-0 bg-black/70 transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-background border-l border-border h-full flex flex-col z-10 animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-border bg-card flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                rule.action === 'ALLOW'
                  ? 'bg-success/20 text-success border border-success/40'
                  : 'bg-destructive/20 text-destructive border border-destructive/40'
              }`}>
                {rule.action === 'ALLOW' ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {t(rule.action)}
              </span>

              <span className=" text-xs font-medium px-2 py-0.5 rounded bg-muted border border-border text-primary">
                {t('Priority')} #{rule.priority}
              </span>

              {getStatusBadge(rule.status)}

              <span className=" text-xs text-muted-foreground px-2 py-0.5 rounded bg-background border border-border">
                {rule.code}
              </span>
            </div>

            <h2 className="text-lg font-medium text-foreground tracking-tight">{rule.name}</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {rule.description || t('Automated ANPR edge access decision rule.')}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Actions Bar */}
        <div className="px-6 py-3 bg-background border-b border-border flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTestRule(rule)}
              className="text-xs border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {t('Simulate Rule')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(rule)}
              className="text-xs border-border text-foreground hover:bg-muted gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {t('Edit')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleStatus(rule.id, rule.status)}
              className={`text-xs gap-1.5 ${
                rule.status === 'ACTIVE'
                  ? 'border-border text-muted-foreground hover:text-destructive'
                  : 'border-success/40 text-success hover:bg-success/10'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {rule.status === 'ACTIVE' ? t('Deactivate') : t('Activate')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onDuplicate(rule.id)}
              className="text-xs border-border text-foreground hover:bg-muted gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              {t('Duplicate')}
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(rule)}
            className="text-xs border-destructive/30 text-destructive hover:bg-destructive/15 gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('Delete')}
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-border bg-card/50 flex items-center gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('Overview & Scope')}
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'schedule'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('Schedule & Windows')}
          </button>
          <button
            onClick={() => setActiveTab('logic')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'logic'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('Evaluation Logic')}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'audit'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('Audit Activity')} ({rule.auditHistory?.length || 0})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Target Entity Box */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <User className="w-4 h-4 text-primary" />
                    <span>{t('Access Target Entity')}</span>
                  </div>
                  <span className=" text-[11px] px-2 py-0.5 rounded bg-muted text-primary">
                    {t(rule.target?.type || 'ALL_VEHICLES')}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-background border border-border/60 space-y-1.5">
                  <div className="text-sm font-medium text-foreground">{getTargetSummary()}</div>
                  {rule.target?.notes && (
                    <p className="text-xs text-muted-foreground">{rule.target.notes}</p>
                  )}
                  {rule.target?.licensePlate && (
                    <div className="pt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('Target Plate:')}</span>
                      <span className=" text-xs font-medium text-warning px-2 py-0.5 rounded bg-warning/10 border border-warning/30">
                        {rule.target.licensePlate}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Scope (Sites & Gates) */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Building2 className="w-4 h-4 text-success" />
                  <span>{t('Facility & Gate Scope')}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-lg bg-background border border-border/60 space-y-2">
                    <div className="text-muted-foreground font-medium">{t('Applied Sites')}</div>
                    {rule.scope?.allSites ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-success/10 border border-success/30 text-success font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('All Tenant Facilities')}
                      </span>
                    ) : (
                      <div className="space-y-1">
                        {(rule.scope?.siteNames || [t('Main Campus Facility')]).map((s, idx) => (
                          <div key={idx} className="font-medium text-foreground flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-lg bg-background border border-border/60 space-y-2">
                    <div className="text-muted-foreground font-medium">{t('Target Gates & Lanes')}</div>
                    {rule.scope?.allGates ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-success/10 border border-success/30 text-success font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('All Gates & Lanes')}
                      </span>
                    ) : (
                      <div className="space-y-1">
                        {(rule.scope?.gateNames || [t('Entrance Gate 01')]).map((g, idx) => (
                          <div key={idx} className="font-medium text-foreground flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                            {g}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Advanced & Resilience */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Sliders className="w-4 h-4 text-warning" />
                  <span>{t('Advanced Verification Parameters')}</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <div className="text-[11px] text-muted-foreground">{t('Min OCR Confidence')}</div>
                    <div className="text-sm font-medium text-foreground mt-1">
                      {rule.advanced?.minConfidence || 90}%
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <div className="text-[11px] text-muted-foreground">{t('De-duplication Window')}</div>
                    <div className="text-sm font-medium text-foreground mt-1">
                      {rule.advanced?.duplicateWindowSeconds || 5} {t('seconds')}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <div className="text-[11px] text-muted-foreground">{t('Fail Behavior')}</div>
                    <div className="text-sm font-medium text-foreground mt-1">
                      {rule.advanced?.failBehavior || 'DENY'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="block text-[11px]">{t('Rule Created:')}</span>
                  <span className=" text-foreground">
                    {new Date(rule.createdAt).toLocaleDateString()} {new Date(rule.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px]">{t('Last Modified:')}</span>
                  <span className=" text-foreground">
                    {new Date(rule.updatedAt).toLocaleDateString()} {new Date(rule.updatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Clock className="w-4 h-4 text-warning" />
                    <span>{t('Operating Schedule Mode')}</span>
                  </div>
                  <span className=" text-xs px-2.5 py-0.5 rounded bg-muted text-warning border border-border">
                    {rule.schedule?.type || 'ALWAYS'}
                  </span>
                </div>

                <p className="text-xs text-foreground font-medium">
                  {t('Summary:')} <span className="text-foreground font-medium">{rule.schedule?.summaryText || t('Always (24/7)')}</span>
                </p>
                <div className="text-[11px] text-muted-foreground">
                  {t('Evaluated in local facility timezone:')} <span className="text-foreground ">{rule.schedule?.timezone || 'Asia/Ho_Chi_Minh (UTC+7)'}</span>
                </div>
              </div>

              {rule.schedule?.type === 'WEEKLY' && rule.schedule.days && (
                <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                  <div className="text-xs font-medium text-foreground">{t('Weekly Time Windows')}</div>
                  <div className="space-y-2 text-xs">
                    {rule.schedule.days.map((d, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          d.enabled
                            ? 'bg-background border-border text-foreground'
                            : 'bg-card/40 border-border/40 text-muted-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${d.enabled ? 'bg-success' : 'bg-muted-foreground'}`} />
                          <span className="font-medium">{t(d.day)}</span>
                        </div>

                        <div>
                          {d.enabled && d.windows && d.windows.length > 0 ? (
                            <span className=" font-medium text-primary">
                              {d.windows.map(w => `${w.start} - ${w.end}`).join(', ')}
                            </span>
                          ) : d.enabled ? (
                            <span className="text-success font-medium">{t('Full Day (24h)')}</span>
                          ) : (
                            <span className="text-muted-foreground italic">{t('No Access')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rule.schedule?.type === 'DATE_RANGE' && (
                <div className="p-4 rounded-xl bg-card border border-border space-y-3 text-xs">
                  <div className="text-xs font-medium text-foreground">{t('Temporary Date Window')}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="text-muted-foreground text-[11px]">{t('Valid From')}</div>
                      <div className=" font-medium text-foreground mt-1">
                        {rule.schedule.startDate} · {rule.schedule.startTime || '00:00'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-background border border-border">
                      <div className="text-muted-foreground text-[11px]">{t('Valid Until')}</div>
                      <div className=" font-medium text-foreground mt-1">
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
              <div className="p-5 rounded-xl bg-card border border-border space-y-4">
                <div className="flex items-center gap-2 text-xs font-medium text-primary">
                  <Layers className="w-4 h-4" />
                  <span>{t('Deterministic Rule Evaluation Logic')}</span>
                </div>

                <div className="p-4 rounded-xl bg-background border border-border text-xs space-y-2.5 text-foreground">
                  <div className="text-muted-foreground">{t('// Evaluated in order of priority (1 = highest)')}</div>
                  <div>
                    <span className="text-warning">{t('IF')}</span> ({t('Target matches')} <span className="text-primary">"{rule.target?.type}"</span>)
                  </div>
                  <div className="pl-4">
                    <span className="text-warning">{t('AND')}</span> ({t('Facility is in')} <span className="text-success">{rule.scope?.allSites ? '[ALL_SITES]' : `[${(rule.scope?.siteNames || []).join(', ')}]`}</span>)
                  </div>
                  <div className="pl-4">
                    <span className="text-warning">{t('AND')}</span> ({t('Gate is in')} <span className="text-success">{rule.scope?.allGates ? '[ALL_GATES]' : `[${(rule.scope?.gateNames || []).join(', ')}]`}</span>)
                  </div>
                  <div className="pl-4">
                    <span className="text-warning">{t('AND')}</span> ({t('Current Time is within')} <span className="text-warning">{rule.schedule?.summaryText || '24/7'}</span>)
                  </div>
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <span className="text-warning">{t('THEN:')}</span>
                    <span className={`px-2.5 py-0.5 rounded font-medium text-xs ${
                      rule.action === 'ALLOW' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                    }`}>
                      {t('DECISION:')} {t(rule.action)}
                    </span>
                    <span className="text-muted-foreground">{t('(Evaluation halts; barrier responds)')}</span>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed">
                  {t('Rules with a lower priority number run first. If this rule evaluates to true, subsequent rules in the chain are skipped.')}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">{t('Need to verify against real data?')}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('Test this rule against specific plates and simulated event timestamps.')}</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onTestRule(rule)}
                  className="bg-primary hover:bg-primary/90 text-[#fff] text-xs gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {t('Run Simulator')}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="text-xs font-medium text-foreground">{t('Rule Modification & Enforcement History')}</div>
              {rule.auditHistory && rule.auditHistory.length > 0 ? (
                <div className="space-y-3">
                  {rule.auditHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-xl bg-card border border-border space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className=" text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-primary">
                          {item.action}
                        </span>
                        <span className="text-[11px] text-muted-foreground ">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-foreground text-xs leading-relaxed">{item.details}</p>
                      <div className="text-[11px] text-muted-foreground pt-1">
                        {t('Actor:')} <span className="text-foreground">{item.actorName}</span> ({item.actorEmail || t('System')})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-card rounded-xl border border-border text-xs text-muted-foreground">
                  {t('No audit history records available for this rule.')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
