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
import { RuleDetailsDrawer } from '../../components/tenant/rules/RuleDetailsDrawer';
import { CreateEditRuleModal } from '../../components/tenant/rules/CreateEditRuleModal';
import { RuleSimulatorModal } from '../../components/tenant/rules/RuleSimulatorModal';
import { RulePriorityReorderModal } from '../../components/tenant/rules/RulePriorityReorderModal';
import { RuleDeleteConfirmDialog } from '../../components/tenant/rules/RuleDeleteConfirmDialog';

export const TenantRulesPage: React.FC = () => {
  const {
    tenantAccessRules,
    tenantSites,
    deleteTenantAccessRule,
    activateTenantAccessRule,
    deactivateTenantAccessRule,
    duplicateTenantAccessRule
  } = usePlatform();

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
    <div className="space-y-6 pb-16 animate-in fade-in duration-300">
      {/* Top Banner & Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-[#161b22]/80 p-6 rounded-2xl border border-[#30363d] backdrop-blur-xs shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                  Automated Access Policy Rules
                </h1>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
                  {tenantAccessRules.length} Total Rules
                </span>
              </div>
              <p className="text-xs text-[#8b949e] mt-0.5">
                Deterministic priority-ordered policy rules evaluated by edge ANPR barrier controllers
              </p>
            </div>
          </div>

          {/* Quick Metrics Pills */}
          <div className="flex items-center gap-2.5 pt-2 flex-wrap text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#238636]/15 border border-[#238636]/30 text-[#3fb950] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
              {activeCount} Active (Enforcing)
            </span>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#da3633]/15 border border-[#da3633]/30 text-[#f85149] font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              {blocklistCount} Blocklists (DENY)
            </span>

            {draftCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d29922]/15 border border-[#d29922]/30 text-[#e3b341] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e3b341]" />
                {draftCount} Draft Policies
              </span>
            )}
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenSimulator()}
            className="text-xs border-[#1f6feb]/40 bg-[#1f6feb]/10 text-[#58a6ff] hover:bg-[#1f6feb]/20 gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#58a6ff]" />
            Test & Simulate Rule
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReorderModalOpen(true)}
            className="text-xs border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] gap-1.5"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Reorder Priorities
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreateModal}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 shadow-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Create Access Rule
          </Button>
        </div>
      </div>

      {/* Evaluation Sequence Notice Banner */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#1f6feb]/15 via-[#161b22] to-[#161b22] border border-[#1f6feb]/30 flex items-center justify-between gap-3 text-xs text-[#c9d1d9]">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-[#58a6ff] shrink-0" />
          <span>
            <strong>Deterministic Evaluation:</strong> Edge controllers process active rules strictly from top to bottom (Priority #1 to #999). As soon as an entry matches target, facility, and time window, evaluation halts and the barrier executes the action.
          </span>
        </div>
        <button
          onClick={() => setIsReorderModalOpen(true)}
          className="text-[#58a6ff] hover:underline whitespace-nowrap font-medium text-[11px] cursor-pointer"
        >
          Adjust Sequence &rarr;
        </button>
      </div>

      {/* Toolbar: Search, Filters & View Switcher */}
      <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
          <input
            type="text"
            placeholder="Search by rule name, code, plate, or target..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0d0e12] border border-[#30363d] rounded-lg pl-9 pr-3 py-2 text-white placeholder-[#8b949e] focus:outline-hidden focus:border-[#58a6ff]"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="EXPIRED">Expired</option>
          </select>

          {/* Action */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-white"
          >
            <option value="ALL">All Actions</option>
            <option value="ALLOW">ALLOW (Permit)</option>
            <option value="DENY">DENY (Block)</option>
          </select>

          {/* Target */}
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-white"
          >
            <option value="ALL">All Targets</option>
            <option value="MEMBER_GROUP">Member Group</option>
            <option value="LICENSE_PLATE">License Plate</option>
            <option value="SPECIFIC_VEHICLE">Specific Vehicle</option>
            <option value="MEMBER">Individual Member</option>
            <option value="VEHICLE_GROUP">Vehicle Group</option>
            <option value="VISITOR">Visitor / Guest</option>
            <option value="ALL_VEHICLES">All Vehicles</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-[#30363d] rounded-lg p-0.5 bg-[#0d0e12]">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[#21262d] text-white'
                  : 'text-[#8b949e] hover:text-white'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[#21262d] text-white'
                  : 'text-[#8b949e] hover:text-white'
              }`}
              title="Dense Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Rules Display */}
      {filteredRules.length === 0 ? (
        <div className="p-12 text-center bg-[#161b22] rounded-2xl border border-[#30363d] space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#21262d] border border-[#30363d] text-[#8b949e] flex items-center justify-center mx-auto">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Matching Access Rules Found</h3>
          <p className="text-xs text-[#8b949e] max-w-sm mx-auto">
            No rules match the selected search criteria or filter combinations. Try resetting filters or create a new rule.
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
            className="text-xs border-[#30363d] text-[#58a6ff] hover:bg-[#21262d]"
          >
            Clear All Filters
          </Button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRules.map((rule) => {
            const isAllow = rule.action === 'ALLOW';
            return (
              <div
                key={rule.id}
                className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between space-y-4 hover:border-[#58a6ff]/40 transition-all shadow-xs group"
              >
                <div>
                  {/* Card Header: Action, Priority & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          isAllow
                            ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40'
                            : 'bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40'
                        }`}
                      >
                        {isAllow ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                        {rule.action}
                      </span>

                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
                        Priority #{rule.priority}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        rule.status === 'ACTIVE'
                          ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                          : rule.status === 'DRAFT'
                          ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                          : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#30363d]'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {rule.status}
                    </span>
                  </div>

                  {/* Title & Code */}
                  <div className="mt-3">
                    <h3 className="text-sm font-bold text-white group-hover:text-[#58a6ff] transition-colors line-clamp-1">
                      {rule.name}
                    </h3>
                    <span className="font-mono text-[11px] text-[#8b949e]">{rule.code}</span>
                  </div>

                  {/* Target Entity Box */}
                  <div className="mt-3 p-2.5 rounded-xl bg-[#0d0e12] border border-[#30363d]/60 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-[#8b949e]">
                      <span>Target:</span>
                      <span className="font-mono font-medium text-[#58a6ff]">{rule.target?.type || rule.type}</span>
                    </div>
                    <div className="font-semibold text-white truncate">
                      {rule.target?.type === 'LICENSE_PLATE' && rule.target.licensePlate ? (
                        <span className="font-mono text-[#f0883e]">{rule.target.licensePlate}</span>
                      ) : rule.target?.type === 'MEMBER_GROUP' && rule.target.memberGroup ? (
                        <span>Group: {rule.target.memberGroup}</span>
                      ) : rule.target?.type === 'SPECIFIC_VEHICLE' && rule.target.vehicleName ? (
                        <span>{rule.target.vehicleName}</span>
                      ) : rule.target?.type === 'ALL_VEHICLES' ? (
                        <span>All Vehicles</span>
                      ) : (
                        <span>{rule.target?.memberName || 'General Fleet Policy'}</span>
                      )}
                    </div>
                  </div>

                  {/* Meta: Schedule & Scope */}
                  <div className="space-y-2 mt-3 text-xs">
                    <div className="flex items-center gap-2 text-[#8b949e]">
                      <Clock className="w-3.5 h-3.5 text-[#e3b341] shrink-0" />
                      <span className="truncate">{rule.schedule?.summaryText || rule.schedule || '24/7 Always Active'}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[#8b949e]">
                      <Building2 className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />
                      <span className="truncate">
                        {rule.scope?.allSites || rule.sites?.includes('ALL_SITES') || rule.sites?.includes('ALL')
                          ? 'All Facilities'
                          : `${(rule.scope?.siteNames || []).join(', ') || `${rule.sites?.length || 1} Site(s)`}`}
                        {' · '}
                        {rule.scope?.allGates || rule.gates?.includes('ALL_GATES') || rule.gates?.includes('ALL')
                          ? 'All Gates'
                          : `${rule.scope?.gateIds?.length || 1} Gate(s)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-[#30363d]/60 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setSelectedRuleForDrawer(rule)}
                    className="text-[#58a6ff] hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    View Details
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenSimulator(rule)}
                      className="p-1.5 rounded hover:bg-[#1f6feb]/20 text-[#8b949e] hover:text-[#58a6ff] transition-colors cursor-pointer"
                      title="Test in Simulator"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(rule)}
                      className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                      title="Edit Rule"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => duplicateTenantAccessRule(rule.id)}
                      className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                      title="Duplicate Rule"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleToggleStatus(rule.id, rule.status)}
                      className={`p-1.5 rounded transition-colors cursor-pointer ${
                        rule.status === 'ACTIVE'
                          ? 'text-[#8b949e] hover:text-[#e3b341] hover:bg-[#e3b341]/10'
                          : 'text-[#8b949e] hover:text-[#3fb950] hover:bg-[#3fb950]/10'
                      }`}
                      title={rule.status === 'ACTIVE' ? 'Deactivate Rule' : 'Activate Rule'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setRuleToDelete(rule)}
                      className="p-1.5 rounded hover:bg-[#da3633]/20 text-[#8b949e] hover:text-[#f85149] transition-colors cursor-pointer"
                      title="Delete Rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Dense Table View */
        <div className="bg-[#161b22] rounded-2xl border border-[#30363d] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] border-b border-[#30363d] text-[#8b949e]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Priority</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Rule Name & Code</th>
                  <th className="py-3 px-4 font-semibold">Target Entity</th>
                  <th className="py-3 px-4 font-semibold">Facility & Gates</th>
                  <th className="py-3 px-4 font-semibold">Operating Schedule</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]/60">
                {filteredRules.map((rule) => {
                  const isAllow = rule.action === 'ALLOW';
                  return (
                    <tr
                      key={rule.id}
                      className="hover:bg-[#21262d]/50 transition-colors group cursor-pointer"
                      onClick={() => setSelectedRuleForDrawer(rule)}
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#21262d] text-[#58a6ff]">
                          #{rule.priority}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            isAllow
                              ? 'bg-[#238636]/20 text-[#3fb950]'
                              : 'bg-[#da3633]/20 text-[#f85149]'
                          }`}
                        >
                          {isAllow ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                          {rule.action}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-white group-hover:text-[#58a6ff] transition-colors">
                          {rule.name}
                        </div>
                        <div className="font-mono text-[11px] text-[#8b949e]">{rule.code}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-[#58a6ff] block">
                          {rule.target?.type || rule.type}
                        </span>
                        <span className="text-white font-medium">
                          {rule.target?.licensePlate || rule.target?.memberGroup || rule.target?.vehicleName || 'All Vehicles'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-[#c9d1d9]">
                        <div>
                          {rule.scope?.allSites || rule.sites?.includes('ALL_SITES') || rule.sites?.includes('ALL')
                            ? 'All Facilities'
                            : (rule.scope?.siteNames || []).join(', ') || 'Targeted Site'}
                        </div>
                        <div className="text-[11px] text-[#8b949e]">
                          {rule.scope?.allGates || rule.gates?.includes('ALL_GATES') ? 'All Gates' : `${rule.scope?.gateIds?.length || 1} Gate(s)`}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-[#c9d1d9] font-medium max-w-xs truncate">
                        {rule.schedule?.summaryText || rule.schedule || '24/7 Always Active'}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                            rule.status === 'ACTIVE'
                              ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                              : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#30363d]'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {rule.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenSimulator(rule)}
                            className="p-1.5 rounded hover:bg-[#1f6feb]/20 text-[#8b949e] hover:text-[#58a6ff] transition-colors cursor-pointer"
                            title="Test Rule"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(rule)}
                            className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setRuleToDelete(rule)}
                            className="p-1.5 rounded hover:bg-[#da3633]/20 text-[#8b949e] hover:text-[#f85149] transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
