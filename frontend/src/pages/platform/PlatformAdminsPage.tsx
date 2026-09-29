import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { PlatformAdmin, AdminRole } from '../../types/platform';
import {
  Users,
  Plus,
  ShieldCheck,
  Key,
  Lock,
  Eye,
  UserX,
  RotateCcw,
  UserCheck,
  Clock,
  ShieldAlert,
  Search
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Input,
  Select,
  Modal,
  Pagination,
  Tabs
} from '../../components/ui';
import { useTranslation } from 'react-i18next';

export const PlatformAdminsPage: React.FC = () => {
  const { t } = useTranslation('platform');
  const {
    admins,
    createAdmin,
    disableAdmin,
    resetAdminMfa,
    openMfaModal,
    sessions,
    revokeSession,
    revokeAllUserSessions,
    auditLogs,
    addToast
  } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAdmin, setSelectedAdmin] = useState<PlatformAdmin | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'security' | 'sessions' | 'activity'>('overview');

  // New Admin Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('PLATFORM_ADMIN');
  const [newPassword, setNewPassword] = useState('');

  const filteredAdmins = admins.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateAdmin = () => {
    if (!newPassword || newPassword.length < 10) {
      addToast({ type: 'error', title: t('Validation Error'), description: t('Initial password must be at least 10 characters.') });
      return;
    }
    createAdmin({
      name: newName,
      email: newEmail,
      role: newRole,
      password: newPassword
    });

    setIsAddModalOpen(false);
    setNewName('');
    setNewEmail('');
    setNewPassword('');
  };

  const adminSessions = selectedAdmin ? sessions.filter((s) => s.userId === selectedAdmin.id) : [];
  const adminAuditLogs = selectedAdmin ? auditLogs.filter((a) => a.actorEmail === selectedAdmin.email) : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" /> {t('Platform Administrators')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t('Manage high-privilege governance personnel with administrative access to the platform console.')}
          </p>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setIsAddModalOpen(true)}
          className="shadow-md shadow-indigo-600/30"
        >
          {t('Add Administrator')}
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="p-4">
        <Input
          placeholder={t('Search administrators by name or email...')}
          icon={Search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Admin Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">{t('Administrator')}</th>
                <th className="py-3.5 px-4">{t('Role')}</th>
                <th className="py-3.5 px-4">{t('Status')}</th>
                <th className="py-3.5 px-4">{t('MFA State')}</th>
                <th className="py-3.5 px-4">{t('Last Login')}</th>
                <th className="py-3.5 px-4 text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {filteredAdmins.map((admin) => (
                <tr
                  key={admin.id}
                  className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedAdmin(admin)}
                >
                  <td className="py-3.5 px-4">
                    <div>
                      <span className="font-bold text-slate-100 block text-sm">{admin.name}</span>
                      <span className="text-[11px] text-slate-400">{admin.email}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4">
                    <Badge variant={admin.role === 'PLATFORM_ADMIN' ? 'purple' : 'indigo'} size="sm">
                      {admin.role}
                    </Badge>
                  </td>

                  <td className="py-3.5 px-4">
                    <Badge variant={admin.status === 'ACTIVE' ? 'emerald' : 'slate'} dot>
                      {admin.status}
                    </Badge>
                  </td>

                  <td className="py-3.5 px-4">
                    {admin.mfaEnabled ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                        <UserCheck className="w-3.5 h-3.5" /> {t('Enrolled')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                        <ShieldAlert className="w-3.5 h-3.5" /> {t('Pending')}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-slate-400 font-mono">
                    {admin.lastLoginAt === 'Never' ? t('Never') : new Date(admin.lastLoginAt).toLocaleString()}
                  </td>

                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Eye}
                        onClick={() => setSelectedAdmin(admin)}
                      />

                      {admin.status === 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-400 hover:bg-red-950/50 hover:border-red-800"
                          onClick={() => disableAdmin(admin.id, t('Administrative override'))}
                        >
                          {t('Disable')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Admin Detail Modal */}
      {selectedAdmin && (
        <Modal
          isOpen={Boolean(selectedAdmin)}
          onClose={() => setSelectedAdmin(null)}
          title={t('Administrator Account: {{name}}', { name: selectedAdmin.name })}
          subtitle={selectedAdmin.email}
          maxWidth="2xl"
        >
          <Tabs
            variant="underline"
            tabs={[
              { id: 'overview', label: t('Overview') },
              { id: 'security', label: t('Security & MFA') },
              { id: 'sessions', label: t('Active Sessions'), badge: adminSessions.length },
              { id: 'activity', label: t('Audit Activity'), badge: adminAuditLogs.length }
            ]}
            activeTab={detailTab}
            onChange={(id) => setDetailTab(id as any)}
          />

          {detailTab === 'overview' && (
            <div className="space-y-4 text-xs pt-3">
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div><span className="text-slate-500">ID:</span> <code className="text-slate-200 font-mono">{selectedAdmin.id}</code></div>
                <div><span className="text-slate-500">{t('Role:')}</span> {selectedAdmin.role}</div>
                <div><span className="text-slate-500">{t('Status:')}</span> {selectedAdmin.status}</div>
                <div><span className="text-slate-500">{t('Created:')}</span> {new Date(selectedAdmin.createdAt).toLocaleDateString()}</div>
                <div><span className="text-slate-500">{t('Failed Logins:')}</span> {selectedAdmin.failedLoginAttempts}</div>
                <div><span className="text-slate-500">{t('Last Active:')}</span> {selectedAdmin.lastLoginAt}</div>
              </div>
            </div>
          )}

          {detailTab === 'security' && (
            <div className="space-y-4 text-xs pt-3">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white">{t('Multi-Factor Authentication (MFA)')}</h4>
                  <p className="text-slate-400 mt-0.5">
                    {selectedAdmin.mfaEnabled ? t('Enrolled with Time-Based One-Time Password (TOTP)') : t('MFA is currently pending setup.')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => openMfaModal('reset_admin', selectedAdmin.name)}
                >
                  {t('Reset MFA Secret')}
                </Button>
              </div>
            </div>
          )}

          {detailTab === 'sessions' && (
            <div className="space-y-3 text-xs pt-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">{t('Active Device Sessions')}</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => revokeAllUserSessions(selectedAdmin.id)}
                >
                  {t('Revoke All Device Sessions')}
                </Button>
              </div>

              {adminSessions.length === 0 ? (
                <p className="py-6 text-center text-slate-500">{t('No active device sessions for this administrator.')}</p>
              ) : (
                adminSessions.map((sess) => (
                  <div key={sess.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">{sess.device} • {sess.browser}</span>
                      <span className="text-slate-400 font-mono">IP: {sess.ipAddress} ({sess.location})</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => revokeSession(sess.id)}>
                      {t('Revoke')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {detailTab === 'activity' && (
            <div className="space-y-2 text-xs pt-3">
              {adminAuditLogs.length === 0 ? (
                <p className="py-6 text-center text-slate-500">{t('No audit activity logged for this administrator.')}</p>
              ) : (
                adminAuditLogs.map((log) => (
                  <div key={log.id} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-200 block">{log.action}</span>
                      <span className="text-slate-400">{log.resourceType}: {log.resourceId}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </Modal>
      )}

      {/* Create Admin Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Create Platform Administrator')}
        subtitle={t('Provision high-privilege governance user')}
      >
        <div className="space-y-4 text-xs">
          <Input
            label={t('Full Name *')}
            placeholder={t('e.g. Johnathan Vance')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <Input
            label={t('Email Address *')}
            type="email"
            placeholder="admin@platform.internal"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />

          <Select
            label={t('Administrative Role')}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as AdminRole)}
            options={[
              { value: 'super_admin', label: 'SUPER_ADMIN (Full Global Control)' },
              { value: 'ops', label: 'OPS (Security & Audit Operations)' },
              { value: 'support', label: 'SUPPORT (Tenant Read & Operational Support)' }
            ]}
          />

          <Input
            label={t('Initial Secret Password *')}
            type="password"
            placeholder="••••••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateAdmin}>
              {t('Create Administrator')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
