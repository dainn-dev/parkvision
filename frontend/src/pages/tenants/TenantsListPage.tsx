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
import { useTranslation } from 'react-i18next';
import { canManagePlatformOps } from '../../lib/permissions';

export const TenantsListPage: React.FC<{
  onOpenCreateModal: () => void;
}> = ({ onOpenCreateModal }) => {
  const { tenants, setTenantStatus, setSelectedTenantId, currentUser } = usePlatform();
  // Create tenant / lifecycle changes are super_admin or ops only — hidden for support.
  const canManage = canManagePlatformOps(currentUser.rawRole);
  const { t } = useTranslation('platform');

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

  const [reasonError, setReasonError] = useState('');

  const formatCount = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  };

  const handleOpenAction = (tenant: Tenant, targetStatus: TenantStatus) => {
    setReasonError('');
    setActionModal({
      isOpen: true,
      tenant,
      targetStatus,
      reason: ''
    });
  };

  const handleConfirmAction = () => {
    if (!actionModal.tenant || !actionModal.targetStatus) return;
    if (actionModal.targetStatus === 'SUSPENDED' && !actionModal.reason.trim()) {
      setReasonError(t('A reason is required to suspend a tenant.'));
      return;
    }
    setTenantStatus(actionModal.tenant.id, actionModal.targetStatus, actionModal.reason.trim() || undefined);
    setReasonError('');
    setActionModal({ isOpen: false, tenant: null, targetStatus: null, reason: '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-[330ms]">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium text-foreground tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-warning" /> {t('Organization Tenants')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Enterprise multi-tenant directory, usage tracking, and administrative lifecycle.')}
          </p>
        </div>

        {canManage && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={onOpenCreateModal}
            className=" "
          >
            {t('Provision Tenant')}
          </Button>
        )}
      </div>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('Active Tenants')}
          value={tenants.filter((t) => t.status === 'ACTIVE').length}
          subtitle={t('Full platform operational rights')}
          badge={<Badge variant="emerald" dot>{t('ACTIVE')}</Badge>}
        />
        <StatCard
          title={t('Trial Evaluation')}
          value={tenants.filter((t) => t.status === 'TRIAL').length}
          subtitle={t('Temporary sandbox licenses')}
          badge={<Badge variant="amber" dot>{t('TRIAL')}</Badge>}
        />
        <StatCard
          title={t('Suspended Orgs')}
          value={tenants.filter((t) => t.status === 'SUSPENDED').length}
          subtitle={t('Access temporarily revoked')}
          badge={<Badge variant="red" dot>{t('SUSPENDED')}</Badge>}
        />
        <StatCard
          title={t('Disabled Orgs')}
          value={tenants.filter((t) => t.status === 'DISABLED').length}
          subtitle={t('Permanently decommissioned')}
          badge={<Badge variant="slate">{t('DISABLED')}</Badge>}
        />
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-80">
          <Input
            placeholder={t('Search tenant name, code, email...')}
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
              { value: 'ALL', label: t('All Lifecycle Statuses') },
              { value: 'ACTIVE', label: t('Active Only') },
              { value: 'TRIAL', label: t('Trial Only') },
              { value: 'SUSPENDED', label: t('Suspended Only') },
              { value: 'DISABLED', label: t('Disabled Only') }
            ]}
          />
        </div>
      </Card>

      {/* Tenants Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="py-3.5 px-4">{t('Organization & Code')}</th>
                <th className="py-3.5 px-4">{t('Status')}</th>
                <th className="py-3.5 px-4">{t('Tenant Admin')}</th>
                <th className="py-3.5 px-4 text-center">{t('Users')}</th>
                <th className="py-3.5 px-4 text-center">{t('Cameras')}</th>
                <th className="py-3.5 px-4 text-center">{t('24h Events')}</th>
                <th className="py-3.5 px-4">{t('Created Date')}</th>
                <th className="py-3.5 px-4 text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80 text-foreground">
              {paginatedTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    {t('No enterprise tenants matching query parameters.')}
                  </td>
                </tr>
              ) : (
                paginatedTenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="hover:bg-muted/50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedTenantId(tenant.id)}
                  >
                    {/* Name & Code */}
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-medium text-foreground group-hover:text-primary transition-colors block text-sm">
                          {tenant.name}
                        </span>
                        <code className="text-[11px] text-warning font-mono">
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
                        <span className="font-medium text-foreground block">
                          {tenant.administrator.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {tenant.administrator.email}
                        </span>
                      </div>
                    </td>

                    {/* Users Count */}
                    <td className="py-3.5 px-4 text-center font-medium">
                      {tenant.statistics.usersCount}
                    </td>

                    {/* Cameras */}
                    <td className="py-3.5 px-4 text-center font-medium">
                      {tenant.statistics.camerasCount}
                    </td>

                    {/* Events */}
                    <td className="py-3.5 px-4 text-center text-primary font-medium">
                      {formatCount(tenant.statistics.eventsCount)}
                    </td>

                    {/* Created */}
                    <td className="py-3.5 px-4 text-muted-foreground">
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
                          title={t('View Tenant Detail')}
                        />

                        {canManage && tenant.status === 'ACTIVE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                            onClick={() => handleOpenAction(tenant, 'SUSPENDED')}
                          >
                            {t('Suspend')}
                          </Button>
                        )}

                        {canManage && tenant.status === 'SUSPENDED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-success hover:bg-success/10 hover:border-success/30"
                            onClick={() => handleOpenAction(tenant, 'ACTIVE')}
                          >
                            {t('Activate')}
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
        title={t('Change Tenant Lifecycle Status: {{status}}', { status: actionModal.targetStatus })}
        subtitle={t('Organization: {{name}} ({{code}})', { name: actionModal.tenant?.name, code: actionModal.tenant?.code })}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/50 text-warning">
            {t("Modifying a tenant's lifecycle status will alter access permissions for all enrolled users and cameras.")}
          </div>

          <Input
            label={t('Reason for Lifecycle Action (Audited) *')}
            placeholder={t('e.g. Administrative request, billing resolution, security check...')}
            value={actionModal.reason}
            onChange={(e) => {
              setActionModal((prev) => ({ ...prev, reason: e.target.value }));
              if (reasonError) setReasonError('');
            }}
            error={reasonError}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionModal({ isOpen: false, tenant: null, targetStatus: null, reason: '' })}
            >
              {t('Cancel')}
            </Button>

            <Button
              variant={actionModal.targetStatus === 'ACTIVE' ? 'success' : 'danger'}
              size="sm"
              onClick={handleConfirmAction}
            >
              {t('Confirm Status Change')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
