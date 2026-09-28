import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { platformApi, UserOut } from '../../services/api';
import {
  ArrowLeft,
  Building2,
  Users,
  Video,
  DoorOpen,
  Radio,
  Database,
  Activity,
  ShieldAlert,
  Ban,
  CheckCircle,
  Calendar,
  Clock,
  Mail,
  Phone,
  Globe,
  UserCog
} from 'lucide-react';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Tabs,
  StatCard,
  Input,
  Modal
} from '../../components/ui';

export const TenantDetailPage: React.FC<{
  tenantId: string;
  onBack: () => void;
}> = ({ tenantId, onBack }) => {
  const { tenants, setTenantStatus, auditLogs, impersonateTenant } = usePlatform();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'usage' | 'activity'>('overview');

  const tenant = tenants.find((t) => t.id === tenantId) || tenants[0];

  const [tenantUsers, setTenantUsers] = useState<UserOut[]>([]);
  useEffect(() => {
    if (!tenant?.id) return;
    platformApi.listTenantUsers(tenant.id).then(setTenantUsers).catch(() => setTenantUsers([]));
  }, [tenant?.id]);
  const ownerUser = tenantUsers.find((u) => u.role === 'owner' || u.role === 'admin');

  const [statusReason, setStatusReason] = useState('');
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'DISABLED'>('SUSPENDED');

  const tenantAuditLogs = auditLogs.filter(
    (a) => a.tenantName === tenant.name || a.resourceId === tenant.id
  );

  const handleApplyStatusChange = () => {
    setTenantStatus(tenant.id, targetStatus, statusReason);
    setIsStatusModalOpen(false);
    setStatusReason('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tenants List
      </button>

      {/* Organization Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/30 border-indigo-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 font-extrabold flex items-center justify-center text-lg shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white tracking-tight">{tenant.name}</h2>
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
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                <span className="font-mono text-amber-300 font-semibold bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                  {tenant.code}
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> {tenant.email}
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" /> {tenant.timezone}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" /> Created {new Date(tenant.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Lifecycle Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={UserCog}
              loading={isImpersonating}
              onClick={async () => {
                setIsImpersonating(true);
                try {
                  await impersonateTenant(tenant.id);
                } finally {
                  setIsImpersonating(false);
                }
              }}
            >
              Impersonate
            </Button>
            {tenant.status === 'ACTIVE' ? (
              <Button
                variant="danger"
                size="sm"
                icon={Ban}
                onClick={() => {
                  setTargetStatus('SUSPENDED');
                  setIsStatusModalOpen(true);
                }}
              >
                Suspend Tenant
              </Button>
            ) : (
              <Button
                variant="success"
                size="sm"
                icon={CheckCircle}
                onClick={() => {
                  setTargetStatus('ACTIVE');
                  setIsStatusModalOpen(true);
                }}
              >
                Activate Tenant
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs Bar */}
      <Tabs
        variant="underline"
        tabs={[
          { id: 'overview', label: 'Overview & Resources' },
          { id: 'users', label: 'Enrolled Users', badge: tenant.statistics.usersCount },
          { id: 'usage', label: 'Usage & Capacity' },
          { id: 'activity', label: 'Audit Activity', badge: tenantAuditLogs.length }
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <StatCard
              title="Users"
              value={tenant.statistics.usersCount}
              icon={Users}
            />
            <StatCard
              title="Vehicles"
              value={tenant.statistics.vehiclesCount.toLocaleString()}
              icon={Activity}
            />
            <StatCard
              title="Cameras"
              value={tenant.statistics.camerasCount}
              icon={Video}
            />
            <StatCard
              title="Gates"
              value={tenant.statistics.gatesCount}
              icon={DoorOpen}
            />
            <StatCard
              title="Edge Nodes"
              value={tenant.statistics.edgeDevicesCount}
              icon={Radio}
            />
            <StatCard
              title="Storage"
              value={`${tenant.statistics.storageUsedGb} GB`}
              icon={Database}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Primary Tenant Administrator" />
              <CardContent className="space-y-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block text-sm">{ownerUser?.fullName || tenant.email || '—'}</span>
                    <span className="text-slate-400">{ownerUser?.email || tenant.email || '—'}</span>
                  </div>
                  <Badge variant="indigo">{ownerUser?.role?.toUpperCase() || 'OWNER'}</Badge>
                </div>
                <div className="text-slate-400 space-y-1 pt-1">
                  <div><strong>Phone:</strong> {tenant.administrator.phone || 'N/A'}</div>
                  <div><strong>Admin User ID:</strong> {ownerUser?.id || '—'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Organization Configuration" />
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Organization ID</span>
                  <span className="font-mono text-slate-200">{tenant.id}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Routing Code</span>
                  <span className="font-mono text-amber-300">{tenant.code}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Timezone</span>
                  <span className="text-slate-200">{tenant.timezone}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Last Active Timestamp</span>
                  <span className="text-slate-200">{new Date(tenant.lastActivityAt).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Users */}
      {activeTab === 'users' && (
        <Card>
          <CardHeader title="Registered Organization Users" subtitle="Read-only tenant user registry" />
          <CardContent>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
              Showing enrolled tenant users under <strong>{tenant.name}</strong>. Full CRUD rights belong to the designated Tenant Administrator.
            </div>
            <div className="mt-4 space-y-2 text-xs">
              {tenantUsers.length === 0 && (
                <div className="p-3 text-slate-500">No users provisioned for this tenant yet.</div>
              )}
              {tenantUsers.map((u) => (
                <div key={u.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">{u.fullName}</span>
                    <span className="text-slate-400">{u.email}</span>
                  </div>
                  <Badge variant="indigo">{u.role.toUpperCase()}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Usage */}
      {activeTab === 'usage' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Tenant Storage & Payload Consumption" />
            <CardContent className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-slate-300 font-semibold">MinIO NVMe OCR Frame Storage</span>
                  <span className="font-mono text-indigo-300 font-bold">{tenant.statistics.storageUsedGb} GB / 500 GB</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (tenant.statistics.storageUsedGb / 500) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-500 block">Total Recognition Events</span>
                  <span className="text-lg font-mono font-bold text-white mt-1 block">
                    {tenant.statistics.eventsCount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">API Calls (30d)</span>
                  <span className="text-lg font-mono font-bold text-emerald-400 mt-1 block">
                    —
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Active Edge Nodes</span>
                  <span className="text-lg font-mono font-bold text-sky-400 mt-1 block">
                    {tenant.statistics.edgeDevicesCount}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 4: Activity */}
      {activeTab === 'activity' && (
        <Card>
          <CardHeader title="Filtered Tenant Audit Log History" />
          <CardContent className="space-y-3 text-xs">
            {tenantAuditLogs.length === 0 ? (
              <p className="py-6 text-center text-slate-500">No specific audit entries recorded for this tenant yet.</p>
            ) : (
              tenantAuditLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block">{log.action}</span>
                    <span className="text-slate-400">by {log.actorName}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={`Apply Lifecycle Action: ${targetStatus}`}
        subtitle={`Organization: ${tenant.name}`}
      >
        <div className="space-y-4 text-xs">
          <Input
            label="Reason for Lifecycle Override (Audited) *"
            placeholder="e.g. Administrative request, security investigation..."
            value={statusReason}
            onChange={(e) => setStatusReason(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsStatusModalOpen(false)}>
              Cancel
            </Button>
            <Button variant={targetStatus === 'ACTIVE' ? 'success' : 'danger'} size="sm" onClick={handleApplyStatusChange}>
              Confirm & Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
