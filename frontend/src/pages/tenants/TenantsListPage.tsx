import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { Tenant, TenantStatus } from '../../types/platform';
import {
  Building2,
  Search,
  Plus,
  MoreVertical,
  Eye,
  Edit2,
  Ban,
  CheckCircle,
  XCircle,
  Users,
  Activity,
  Database
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  Badge,
  Modal,
  Card,
  Pagination,
  StatCard
} from '../../components/ui';

export const TenantsListPage: React.FC<{
  onOpenCreateModal: () => void;
}> = ({ onOpenCreateModal }) => {
  const { tenants, setTenantStatus, setSelectedTenantId } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Action Modal State
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    tenant: Tenant | null;
    targetStatus: TenantStatus | null;
    reason: string;
  }>({
    isOpen: false,
    tenant: null,
    targetStatus: null,
    reason: ''
  });

  // Filtering
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.administrator.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredTenants.length / pageSize) || 1;
  const paginatedTenants = filteredTenants.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleOpenAction = (tenant: Tenant, targetStatus: TenantStatus) => {
    setActionModal({
      isOpen: true,
      tenant,
      targetStatus,
      reason: ''
    });
  };

  const handleConfirmAction = () => {
    if (actionModal.tenant && actionModal.targetStatus) {
      setTenantStatus(actionModal.tenant.id, actionModal.targetStatus, actionModal.reason);
    }
    setActionModal({ isOpen: false, tenant: null, targetStatus: null, reason: '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" /> Organization Tenants
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise multi-tenant directory, usage tracking, and administrative lifecycle.
          </p>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={onOpenCreateModal}
          className="shadow-md shadow-indigo-600/30"
        >
          Provision Tenant
        </Button>
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Tenants"
          value={tenants.filter((t) => t.status === 'ACTIVE').length}
          subtitle="Full platform operational rights"
          badge={<Badge variant="emerald" dot>ACTIVE</Badge>}
        />
        <StatCard
          title="Trial Evaluation"
          value={tenants.filter((t) => t.status === 'TRIAL').length}
          subtitle="Temporary sandbox licenses"
          badge={<Badge variant="amber" dot>TRIAL</Badge>}
        />
        <StatCard
          title="Suspended Orgs"
          value={tenants.filter((t) => t.status === 'SUSPENDED').length}
          subtitle="Access temporarily revoked"
          badge={<Badge variant="red" dot>SUSPENDED</Badge>}
        />
        <StatCard
          title="Disabled Orgs"
          value={tenants.filter((t) => t.status === 'DISABLED').length}
          subtitle="Permanently decommissioned"
          badge={<Badge variant="slate">DISABLED</Badge>}
        />
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search tenant name, code, email..."
            icon={Search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Lifecycle Statuses' },
              { value: 'ACTIVE', label: 'Active Only' },
              { value: 'TRIAL', label: 'Trial Only' },
              { value: 'SUSPENDED', label: 'Suspended Only' },
              { value: 'DISABLED', label: 'Disabled Only' }
            ]}
          />
        </div>
      </Card>

      {/* Tenants Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">Organization & Code</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Tenant Admin</th>
                <th className="py-3.5 px-4 text-center">Users</th>
                <th className="py-3.5 px-4 text-center">Cameras</th>
                <th className="py-3.5 px-4 text-center">24h Events</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {paginatedTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No enterprise tenants matching query parameters.
                  </td>
                </tr>
              ) : (
                paginatedTenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedTenantId(tenant.id)}
                  >
                    {/* Name & Code */}
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors block text-sm">
                          {tenant.name}
                        </span>
                        <code className="text-[10px] text-amber-300/90 font-mono">
                          {tenant.code}
                        </code>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <Badge
                        variant={
                          tenant.status === 'ACTIVE'
                            ? 'emerald'
                            : tenant.status === 'TRIAL'
                            ? 'amber'
                            : tenant.status === 'SUSPENDED'
                            ? 'red'
                            : 'slate'
                        }
                        dot
                      >
                        {tenant.status}
                      </Badge>
                    </td>

                    {/* Tenant Admin */}
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-semibold text-slate-200 block">
                          {tenant.administrator.name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {tenant.administrator.email}
                        </span>
                      </div>
                    </td>

                    {/* Users Count */}
                    <td className="py-3.5 px-4 text-center font-mono font-medium">
                      {tenant.statistics.usersCount}
                    </td>

                    {/* Cameras */}
                    <td className="py-3.5 px-4 text-center font-mono font-medium">
                      {tenant.statistics.camerasCount}
                    </td>

                    {/* Events */}
                    <td className="py-3.5 px-4 text-center font-mono text-indigo-300 font-semibold">
                      {(tenant.statistics.eventsCount / 1000).toFixed(0)}k
                    </td>

                    {/* Created */}
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td
                      className="py-3.5 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Eye}
                          onClick={() => setSelectedTenantId(tenant.id)}
                          title="View Tenant Detail"
                        />

                        {tenant.status === 'ACTIVE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-400 hover:bg-red-950/50 hover:border-red-800"
                            onClick={() => handleOpenAction(tenant, 'SUSPENDED')}
                          >
                            Suspend
                          </Button>
                        )}

                        {tenant.status === 'SUSPENDED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-400 hover:bg-emerald-950/50 hover:border-emerald-800"
                            onClick={() => handleOpenAction(tenant, 'ACTIVE')}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredTenants.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Lifecycle Action Modal */}
      <Modal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, tenant: null, targetStatus: null, reason: '' })}
        title={`Change Tenant Lifecycle Status: ${actionModal.targetStatus}`}
        subtitle={`Organization: ${actionModal.tenant?.name} (${actionModal.tenant?.code})`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200">
            Modifying a tenant's lifecycle status will alter access permissions for all enrolled users and cameras.
          </div>

          <Input
            label="Reason for Lifecycle Action (Audited) *"
            placeholder="e.g. Administrative request, billing resolution, security check..."
            value={actionModal.reason}
            onChange={(e) => setActionModal((prev) => ({ ...prev, reason: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionModal({ isOpen: false, tenant: null, targetStatus: null, reason: '' })}
            >
              Cancel
            </Button>

            <Button
              variant={actionModal.targetStatus === 'ACTIVE' ? 'success' : 'danger'}
              size="sm"
              onClick={handleConfirmAction}
            >
              Confirm Status Change
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
