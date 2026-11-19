import React, { useState, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  ShieldCheck,
  ShieldAlert,
  Plus,
  Clock,
  Building2,
  CheckCircle2,
  Trash2,
  Edit,
  Sliders,
  Calendar,
  Search,
  Filter,
  Play,
  Layers,
  Copy,
  Power,
  Info,
  AlertTriangle,
  LayoutGrid,
  List,
  User,
  Tag,
  Car,
  ChevronRight,
  Sparkles,
  ArrowUpDown
} from 'lucide-react';
import { TenantAccessRule, AccessRuleAction, AccessRuleStatus } from '../../types/tenant';
import { Button, Input } from '../../components/ui';
import { canTenantWrite } from '../../lib/permissions';
import { RuleDetailsDrawer } from '../../components/tenant/rules/RuleDetailsDrawer';
import { CreateEditRuleModal } from '../../components/tenant/rules/CreateEditRuleModal';
import { RuleSimulatorModal } from '../../components/tenant/rules/RuleSimulatorModal';
import { RulePriorityReorderModal } from '../../components/tenant/rules/RulePriorityReorderModal';
import { RuleDeleteConfirmDialog } from '../../components/tenant/rules/RuleDeleteConfirmDialog';
import { useTranslation } from 'react-i18next';

export const TenantRulesPage: React.FC = () => {
  const { t } = useTranslation('tenant');
  const {
    tenantAccessRules,
    tenantSites,
    deleteTenantAccessRule,
    activateTenantAccessRule,
    deactivateTenantAccessRule,
    duplicateTenantAccessRule,
    currentUser
  } = usePlatform();

  // Create/edit/delete/duplicate/toggle/simulate/reorder are all WRITE_ROLES
  // (owner/admin/operator) — mirrors tenant/rules.py's `require_roles(*WRITE_ROLES)`.
  const canManage = canTenantWrite(currentUser.rawRole);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [targetFilter, setTargetFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Modal and drawer states
  const [selectedRuleForDrawer, setSelectedRuleForDrawer] = useState<TenantAccessRule | null>(null);
  const [isCreateEditModalOpen, setIsCreateEditModalOpen] = useState(false);
  const [ruleToEdit, setRuleToEdit] = useState<TenantAccessRule | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [ruleToSimulate, setRuleToSimulate] = useState<TenantAccessRule | null>(null);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<TenantAccessRule | null>(null);

  // Filtered & sorted rules
  const filteredRules = useMemo(() => {
    return tenantAccessRules
      .filter((rule) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const nameMatch = rule.name.toLowerCase().includes(q);
          const codeMatch = rule.code.toLowerCase().includes(q);
          const descMatch = (rule.description || '').toLowerCase().includes(q);
          const targetMatch = (rule.target?.licensePlate || '').toLowerCase().includes(q) ||
            (rule.target?.memberGroup || '').toLowerCase().includes(q) ||
            (rule.target?.memberName || '').toLowerCase().includes(q);

          if (!nameMatch && !codeMatch && !descMatch && !targetMatch) return false;
        }

        // Status filter
        if (statusFilter !== 'ALL' && rule.status !== statusFilter) {
          return false;
        }

        // Action filter
        if (actionFilter !== 'ALL' && rule.action !== actionFilter) {
          return false;
        }

        // Target filter
        if (targetFilter !== 'ALL' && rule.target?.type !== targetFilter) {
          return false;
        }

        // Site filter
        if (siteFilter !== 'ALL') {
          const applies = rule.scope?.allSites ||
            (rule.scope?.siteIds && rule.scope.siteIds.includes(siteFilter)) ||
            (rule.sites && rule.sites.includes(siteFilter));
          if (!applies) return false;
        }

        return true;
      })
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  }, [tenantAccessRules, searchQuery, statusFilter, actionFilter, targetFilter, siteFilter]);

  // Summary Metrics
  const activeCount = tenantAccessRules.filter(r => r.status === 'ACTIVE').length;
  const draftCount = tenantAccessRules.filter(r => r.status === 'DRAFT').length;
  const blocklistCount = tenantAccessRules.filter(r => r.action === 'DENY').length;

  const handleOpenCreateModal = () => {
    setRuleToEdit(null);
    setIsCreateEditModalOpen(true);
  };

  const handleOpenEditModal = (rule: TenantAccessRule) => {
    setRuleToEdit(rule);
    setIsCreateEditModalOpen(true);
  };

  const handleOpenSimulator = (rule?: TenantAccessRule) => {
    setRuleToSimulate(rule || null);
    setIsSimulatorOpen(true);
  };

  const handleToggleStatus = (ruleId: string, currentStatus: string) => {
    if (currentStatus === 'ACTIVE') {
      deactivateTenantAccessRule(ruleId);
    } else {
      activateTenantAccessRule(ruleId);
    }
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-[330ms]">
      {/* Top Banner & Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-card/80 p-6 rounded-2xl border border-border ">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl font-medium text-foreground tracking-tight">
                  {t('Automated Access Policy Rules')}
                </h1>
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-muted border border-border text-primary">
                  {t('{{count}} Total Rules', { count: tenantAccessRules.length })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('Deterministic priority-ordered policy rules evaluated by edge ANPR barrier controllers')}
              </p>
            </div>
          </div>

          {/* Quick Metrics Pills */}
          <div className="flex items-center gap-2.5 pt-2 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/15 border border-success/30 text-success font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-success " />
              {t('{{count}} Active (Enforcing)', { count: activeCount })}
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive font-medium">
              <ShieldAlert className="w-3.5 h-3.5" />
              {t('{{count}} Blocklists (DENY)', { count: blocklistCount })}
            </span>

            {draftCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 border border-warning/30 text-warning font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                {t('{{count}} Draft Policies', { count: draftCount })}
              </span>
            )}
          </div>
        </div>

        {/* Global Action Buttons */}
        {canManage && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenSimulator()}
              className="text-xs border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {t('Test & Simulate Rule')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReorderModalOpen(true)}
              className="text-xs border-border text-foreground hover:bg-muted gap-1.5"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {t('Reorder Priorities')}
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateModal}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 font-medium"
            >
              <Plus className="w-4 h-4" />
              {t('Create Access Rule')}
            </Button>
          </div>
        )}
      </div>

      {/* Evaluation Sequence Notice Banner */}
      <div className="p-3.5 rounded-xl bg-card border border-primary/30 flex items-center justify-between gap-3 text-xs text-foreground">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-primary shrink-0" />
          <span>
            <strong>{t('Deterministic Evaluation:')}</strong> {t('Edge controllers process active rules strictly from top to bottom (Priority #1 to #999). As soon as an entry matches target, facility, and time window, evaluation halts and the barrier executes the action.')}
          </span>
        </div>
        <button
          onClick={() => setIsReorderModalOpen(true)}
          className="text-primary hover:underline whitespace-nowrap font-medium text-[11px] cursor-pointer"
        >
          {t('Adjust Sequence')} &rarr;
        </button>
      </div>

      {/* Toolbar: Search, Filters & View Switcher */}
      <div className="p-4 rounded-xl bg-card border border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('Search by rule name, code, plate, or target...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-foreground placeholder-muted-foreground focus:outline-hidden focus:border-primary"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-foreground"
          >
            <option value="ALL">{t('All Statuses')}</option>
            <option value="ACTIVE">{t('Active')}</option>
            <option value="INACTIVE">{t('Inactive')}</option>
            <option value="DRAFT">{t('Draft')}</option>
            <option value="SCHEDULED">{t('Scheduled')}</option>
            <option value="EXPIRED">{t('Expired')}</option>
          </select>

          {/* Action */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-foreground"
          >
            <option value="ALL">{t('All Actions')}</option>
            <option value="ALLOW">{t('ALLOW (Permit)')}</option>
            <option value="DENY">{t('DENY (Block)')}</option>
          </select>

          {/* Target */}
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-foreground"
          >
            <option value="ALL">{t('All Targets')}</option>
            <option value="MEMBER_GROUP">{t('Member Group')}</option>
            <option value="LICENSE_PLATE">{t('License Plate')}</option>
            <option value="SPECIFIC_VEHICLE">{t('Specific Vehicle')}</option>
            <option value="MEMBER">{t('Individual Member')}</option>
            <option value="VEHICLE_GROUP">{t('Vehicle Group')}</option>
            <option value="VISITOR">{t('Visitor / Guest')}</option>
            <option value="ALL_VEHICLES">{t('All Vehicles')}</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-lg p-0.5 bg-background">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('Card Grid View')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('Dense Table View')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Rules Display */}
      {filteredRules.length === 0 ? (
        <div className="p-12 text-center bg-card rounded-2xl border border-border space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-muted border border-border text-muted-foreground flex items-center justify-center mx-auto">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-base font-medium text-foreground">{t('No Matching Access Rules Found')}</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {t('No rules match the selected search criteria or filter combinations. Try resetting filters or create a new rule.')}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
              setActionFilter('ALL');
              setTargetFilter('ALL');
              setSiteFilter('ALL');
            }}
            className="text-xs border-border text-primary hover:bg-muted"
          >
            {t('Clear All Filters')}
          </Button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRules.map((rule) => {
            const isAllow = rule.action === 'ALLOW';
            return (
              <div
                key={rule.id}
                className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-4 hover:border-primary/40 transition-colors group"
              >
                <div>
                  {/* Card Header: Action, Priority & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                          isAllow
                            ? 'bg-success/20 text-success border border-success/40'
                            : 'bg-destructive/20 text-destructive border border-destructive/40'
                        }`}
                      >
                        {isAllow ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                        {t(rule.action)}
                      </span>

                      <span className=" text-xs font-medium px-2 py-0.5 rounded bg-muted border border-border text-primary">
                        {t('Priority #{{num}}', { num: rule.priority })}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        rule.status === 'ACTIVE'
                          ? 'bg-success/15 text-success border border-success/30'
                          : rule.status === 'DRAFT'
                          ? 'bg-warning/15 text-warning border border-warning/30'
                          : 'bg-muted-foreground/15 text-muted-foreground border border-border'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {t(rule.status)}
                    </span>
                  </div>

                  {/* Title & Code */}
                  <div className="mt-3">
                    <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {rule.name}
                    </h3>
                    <span className="font-mono text-[11px] text-muted-foreground">{rule.code}</span>
                  </div>

                  {/* Target Entity Box */}
                  <div className="mt-3 p-2.5 rounded-xl bg-background border border-border/60 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{t('Target:')}</span>
                      <span className=" font-medium text-primary">{rule.target?.type || rule.type}</span>
                    </div>
                    <div className="font-medium text-foreground truncate">
                      {rule.target?.type === 'LICENSE_PLATE' && rule.target.licensePlate ? (
                        <span className="font-mono text-warning">{rule.target.licensePlate}</span>
                      ) : rule.target?.type === 'MEMBER_GROUP' && rule.target.memberGroup ? (
                        <span>{t('Group:')} {rule.target.memberGroup}</span>
                      ) : rule.target?.type === 'SPECIFIC_VEHICLE' && rule.target.vehicleName ? (
                        <span>{rule.target.vehicleName}</span>
                      ) : rule.target?.type === 'ALL_VEHICLES' ? (
                        <span>{t('All Vehicles')}</span>
                      ) : (
                        <span>{rule.target?.memberName || t('General Fleet Policy')}</span>
                      )}
                    </div>
                  </div>

                  {/* Meta: Schedule & Scope */}
                  <div className="space-y-2 mt-3 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
                      <span className="truncate">{rule.schedule?.summaryText || t('24/7 Always Active')}</span>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">
                        {rule.scope?.allSites || rule.sites?.includes('ALL_SITES') || rule.sites?.includes('ALL')
                          ? t('All Facilities')
                          : `${(rule.scope?.siteNames || []).join(', ') || t('{{count}} Site(s)', { count: rule.sites?.length || 1 })}`}
                        {' · '}
                        {rule.scope?.allGates || rule.gates?.includes('ALL_GATES') || rule.gates?.includes('ALL')
                          ? t('All Gates')
                          : t('{{count}} Gate(s)', { count: rule.scope?.gateIds?.length || 1 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setSelectedRuleForDrawer(rule)}
                    className="text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    {t('View Details')}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenSimulator(rule)}
                        className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                        title={t('Test in Simulator')}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleOpenEditModal(rule)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title={t('Edit Rule')}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => duplicateTenantAccessRule(rule.id)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        title={t('Duplicate Rule')}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleToggleStatus(rule.id, rule.status)}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          rule.status === 'ACTIVE'
                            ? 'text-muted-foreground hover:text-warning hover:bg-warning/10'
                            : 'text-muted-foreground hover:text-success hover:bg-success/10'
                        }`}
                        title={rule.status === 'ACTIVE' ? t('Deactivate Rule') : t('Activate Rule')}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setRuleToDelete(rule)}
                        className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        title={t('Delete Rule')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Dense Table View */
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 font-medium">{t('Priority')}</th>
                  <th className="py-3 px-4 font-medium">{t('Action')}</th>
                  <th className="py-3 px-4 font-medium">{t('Rule Name & Code')}</th>
                  <th className="py-3 px-4 font-medium">{t('Target Entity')}</th>
                  <th className="py-3 px-4 font-medium">{t('Facility & Gates')}</th>
                  <th className="py-3 px-4 font-medium">{t('Operating Schedule')}</th>
                  <th className="py-3 px-4 font-medium">{t('Status')}</th>
                  <th className="py-3 px-4 font-medium text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRules.map((rule) => {
                  const isAllow = rule.action === 'ALLOW';
                  return (
                    <tr
                      key={rule.id}
                      className="hover:bg-muted/50 transition-colors group cursor-pointer"
                      onClick={() => setSelectedRuleForDrawer(rule)}
                    >
                      <td className="py-3 px-4">
                        <span className=" text-xs font-medium px-2 py-0.5 rounded bg-muted text-primary">
                          #{rule.priority}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            isAllow
                              ? 'bg-success/20 text-success'
                              : 'bg-destructive/20 text-destructive'
                          }`}
                        >
                          {isAllow ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                          {t(rule.action)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                          {rule.name}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{rule.code}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className=" text-[11px] text-primary block">
                          {rule.target?.type || rule.type}
                        </span>
                        <span className="text-foreground font-medium">
                          {rule.target?.licensePlate || rule.target?.memberGroup || rule.target?.vehicleName || t('All Vehicles')}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-foreground">
                        <div>
                          {rule.scope?.allSites || rule.sites?.includes('ALL_SITES') || rule.sites?.includes('ALL')
                            ? t('All Facilities')
                            : (rule.scope?.siteNames || []).join(', ') || t('Targeted Site')}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {rule.scope?.allGates || rule.gates?.includes('ALL_GATES') ? t('All Gates') : t('{{count}} Gate(s)', { count: rule.scope?.gateIds?.length || 1 })}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-foreground font-medium max-w-xs truncate">
                        {rule.schedule?.summaryText || t('24/7 Always Active')}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            rule.status === 'ACTIVE'
                              ? 'bg-success/15 text-success border border-success/30'
                              : 'bg-muted-foreground/15 text-muted-foreground border border-border'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {t(rule.status)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {canManage && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenSimulator(rule)}
                              className="p-1.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                              title={t('Test Rule')}
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(rule)}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title={t('Edit')}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setRuleToDelete(rule)}
                              className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                              title={t('Delete')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS & DRAWERS */}
      <RuleDetailsDrawer
        rule={selectedRuleForDrawer}
        isOpen={Boolean(selectedRuleForDrawer)}
        onClose={() => setSelectedRuleForDrawer(null)}
        onEdit={(rule) => {
          setSelectedRuleForDrawer(null);
          handleOpenEditModal(rule);
        }}
        onToggleStatus={handleToggleStatus}
        onDuplicate={(ruleId) => duplicateTenantAccessRule(ruleId)}
        onDelete={(rule) => {
          setSelectedRuleForDrawer(null);
          setRuleToDelete(rule);
        }}
        onTestRule={(rule) => {
          setSelectedRuleForDrawer(null);
          handleOpenSimulator(rule);
        }}
      />

      <CreateEditRuleModal
        isOpen={isCreateEditModalOpen}
        onClose={() => setIsCreateEditModalOpen(false)}
        ruleToEdit={ruleToEdit}
      />

      <RuleSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        initialRule={ruleToSimulate}
      />

      <RulePriorityReorderModal
        isOpen={isReorderModalOpen}
        onClose={() => setIsReorderModalOpen(false)}
      />

      <RuleDeleteConfirmDialog
        rule={ruleToDelete}
        isOpen={Boolean(ruleToDelete)}
        onClose={() => setRuleToDelete(null)}
        onConfirm={(id) => deleteTenantAccessRule(id)}
      />
    </div>
  );
};
