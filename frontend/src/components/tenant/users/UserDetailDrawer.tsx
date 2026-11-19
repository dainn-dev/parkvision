import React, { useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser } from '../../../types/tenant';
import {
  X,
  User,
  Mail,
  Phone,
  Shield,
  Key,
  Layers,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Ban,
  UserCheck,
  UserX,
  History,
  Tag,
  Building,
  Calendar,
  ExternalLink,
  Edit2,
  Lock
} from 'lucide-react';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface UserDetailDrawerProps {
  user: TenantUser | null;
  isOpen: boolean;
  onClose: () => void;
  onChangeRole: (user: TenantUser) => void;
  onDeactivate: (user: TenantUser) => void;
  onResetPassword: (user: TenantUser) => void;
  onMembershipAction: (user: TenantUser, action: 'SUSPEND' | 'ACTIVATE' | 'END') => void;
}

export const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({
  user,
  isOpen,
  onClose,
  onChangeRole,
  onDeactivate,
  onResetPassword,
  onMembershipAction
}) => {
  const { userAuditLogs, tenantUsers } = usePlatform();
  const { t } = useTranslation('tenant');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MEMBERSHIP' | 'AUDIT'>('OVERVIEW');

  if (!isOpen || !user) return null;

  // Filter audit logs for this target user
  const userLogs = userAuditLogs.filter(
    (log) => log.targetUserId === user.id || log.targetUserName.toLowerCase() === user.name.toLowerCase()
  );

  const activeAdmins = tenantUsers.filter((u) => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
  const isOnlyActiveAdmin = user.role === 'TENANT_ADMIN' && user.status === 'ACTIVE' && activeAdmins.length <= 1;

  const getRoleBadge = () => {
    switch (user.role) {
      case 'TENANT_ADMIN':
        return (
          <span className=" text-[11px] font-medium px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive">
            {t('Tenant Admin')}
          </span>
        );
      case 'SITE_MANAGER':
        return (
          <span className=" text-[11px] font-medium px-2.5 py-1 rounded-full bg-warning/15 border border-warning/30 text-warning">
            {t('Site Manager')}
          </span>
        );
      case 'MEMBER':
        return (
          <span className=" text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary">
            {t('Member')}
          </span>
        );
    }
  };

  const getStatusBadge = () => {
    switch (user.status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-success/15 text-success border border-success/30">
            <CheckCircle2 className="w-3 h-3" />
            {t('Active')}
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30">
            <UserX className="w-3 h-3" />
            {t('Inactive')}
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
            <Clock className="w-3 h-3" />
            {t('Pending Invite')}
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
            <Ban className="w-3 h-3" />
            {t('Suspended')}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 flex justify-end animate-in fade-in duration-[330ms]">
      <div className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col animate-in slide-in-from-right duration-[330ms]">
        {/* Top Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/40 text-primary flex items-center justify-center font-medium text-lg">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-foreground tracking-tight">{user.name}</h2>
                {getStatusBadge()}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                <span className="">{user.email}</span>
                {user.membership && (
                  <span className="px-2 py-0.2 rounded bg-muted text-[11px] text-primary">
                    {user.membership.memberCode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Bar */}
        <div className="p-3.5 bg-card border-b border-border/80 flex items-center gap-2 flex-wrap text-xs">
          <Button
            variant="secondary"
            onClick={() => onChangeRole(user)}
            className="text-xs py-1.5 px-3 bg-muted hover:bg-border text-foreground gap-1.5 border border-border"
          >
            <Shield className="w-3.5 h-3.5 text-primary" />
            {t('Change Role')}
          </Button>

          <Button
            variant="secondary"
            onClick={() => onResetPassword(user)}
            className="text-xs py-1.5 px-3 bg-muted hover:bg-border text-foreground gap-1.5 border border-border"
          >
            <Key className="w-3.5 h-3.5 text-warning" />
            {t('Reset Password')}
          </Button>

          <Button
            variant="secondary"
            onClick={() => onDeactivate(user)}
            className={`text-xs py-1.5 px-3 gap-1.5 border ${
              user.status === 'ACTIVE'
                ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive border-destructive/30'
                : 'bg-success/10 hover:bg-success/20 text-success border-success/30'
            }`}
          >
            {user.status === 'ACTIVE' ? (
              <>
                <UserX className="w-3.5 h-3.5" />
                {t('Deactivate')}
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                {t('Reactivate')}
              </>
            )}
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-background/40 px-5 text-xs font-medium">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'OVERVIEW'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            {t('Overview & Account')}
          </button>

          <button
            onClick={() => setActiveTab('MEMBERSHIP')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'MEMBERSHIP'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            {t('Membership & Vehicles')}
            {user.membership?.vehicles && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-muted text-[11px] text-foreground">
                {user.membership.vehicles.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'AUDIT'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            {t('Audit History')}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              {/* Last Admin Banner if applicable */}
              {isOnlyActiveAdmin && (
                <div className="p-3 bg-warning/15 border border-warning/30 rounded-xl text-warning flex items-start gap-2.5">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                  <div className="text-[11px]">
                    <strong>{t('Primary Organization Admin:')}</strong> {t('This account is currently the sole active Tenant Admin. Demotion and deactivation are locked.')}
                  </div>
                </div>
              )}

              {/* Profile Card */}
              <div className="p-4 bg-background border border-border rounded-2xl space-y-3">
                <div className="text-xs font-medium text-foreground text-[11px] text-muted-foreground">
                  {t('User Profile & Authentication')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Full Name')}</span>
                    <p className="font-medium text-foreground mt-0.5">{user.name}</p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Email Address')}</span>
                    <p className=" text-foreground mt-0.5">{user.email}</p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Username')}</span>
                    <p className=" text-foreground mt-0.5">{user.username || '—'}</p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Phone')}</span>
                    <p className=" text-foreground mt-0.5">{user.phone || '—'}</p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Organization Role')}</span>
                    <div className="mt-1">{getRoleBadge()}</div>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Account Status')}</span>
                    <div className="mt-1">{getStatusBadge()}</div>
                  </div>
                </div>
              </div>

              {/* System & Security Activity */}
              <div className="p-4 bg-background border border-border rounded-2xl space-y-3">
                <div className="text-xs font-medium text-foreground text-[11px] text-muted-foreground">
                  {t('Sign-In & System Telemetry')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Last Sign-In')}</span>
                    <p className=" text-foreground mt-0.5">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : t('Never logged in')}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Created Date')}</span>
                    <p className=" text-foreground mt-0.5">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Security Credentials')}</span>
                    <p className="text-success font-medium mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t('Standard Password + MFA')}
                    </p>
                  </div>

                  <div>
                    <span className="text-muted-foreground text-[11px]">{t('Organization Facility')}</span>
                    <p className="text-foreground font-medium mt-0.5">{t('Main Campus (Dedicated)')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEMBERSHIP & VEHICLES */}
          {activeTab === 'MEMBERSHIP' && (
            <div className="space-y-4">
              {user.membership ? (
                <>
                  {/* Membership Card */}
                  <div className="p-4 bg-background border border-border rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-foreground text-[11px] text-muted-foreground">
                        {t('Facility Membership Profile')}
                      </div>
                      <div className="flex items-center gap-2">
                        {user.membership.status === 'ACTIVE' && (
                          <Button
                            variant="secondary"
                            onClick={() => onMembershipAction(user, 'SUSPEND')}
                            className="text-[11px] py-1 px-2.5 bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25"
                          >
                            <Ban className="w-3 h-3" />
                            {t('Suspend Access')}
                          </Button>
                        )}
                        {user.membership.status === 'SUSPENDED' && (
                          <Button
                            variant="secondary"
                            onClick={() => onMembershipAction(user, 'ACTIVATE')}
                            className="text-[11px] py-1 px-2.5 bg-success/15 text-success border border-success/30 hover:bg-success/25"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {t('Reactivate Access')}
                          </Button>
                        )}
                        {user.membership.status !== 'ENDED' && (
                          <Button
                            variant="secondary"
                            onClick={() => onMembershipAction(user, 'END')}
                            className="text-[11px] py-1 px-2.5 bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                          >
                            {t('End Membership')}
                          </Button>
                        )}
                      </div>
                    </div>

                    {user.membership.suspendedReason && (
                      <div className="p-2.5 bg-warning/15 border border-warning/30 rounded-xl text-warning text-[11px]">
                        <strong>{t('Suspension Reason:')}</strong> {user.membership.suspendedReason}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-muted-foreground text-[11px]">{t('Member ID Code')}</span>
                        <p className="font-mono font-medium text-primary mt-0.5">{user.membership.memberCode}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground text-[11px]">{t('Membership Type')}</span>
                        <p className="font-medium text-foreground mt-0.5">{t(user.membership.type)}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground text-[11px]">{t('Department / Org Unit')}</span>
                        <p className="text-foreground mt-0.5">{user.membership.department || '—'}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground text-[11px]">{t('Employee ID')}</span>
                        <p className=" text-foreground mt-0.5">{user.membership.employeeId || '—'}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground text-[11px]">{t('Membership Status')}</span>
                        <p className="font-medium text-foreground mt-0.5">{t(user.membership.status)}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground text-[11px]">{t('Member Since')}</span>
                        <p className=" text-foreground mt-0.5">
                          {new Date(user.membership.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Linked Vehicles */}
                  <div className="p-4 bg-background border border-border rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-foreground text-[11px] text-muted-foreground">
                        {t('Registered Vehicles & Whitelist Passes')} ({user.membership.vehicles.length})
                      </div>
                    </div>

                    {user.membership.vehicles.length === 0 ? (
                      <div className="p-4 bg-card border border-border rounded-xl text-center text-muted-foreground">
                        <Car className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
                        <p>{t('No vehicles currently registered for this member.')}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {user.membership.vehicles.map((v, i) => (
                          <div
                            key={i}
                            className="p-3 bg-card border border-border rounded-xl flex items-center justify-between hover:border-primary/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-muted border border-border text-primary flex items-center justify-center">
                                <Car className="w-4 h-4" />
                              </div>
                              <div>
                                <span className=" font-medium text-xs text-foreground bg-background px-2 py-0.5 rounded border border-border">
                                  {v.plate}
                                </span>
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  {v.model} {v.color && `· ${v.color}`} ({v.type})
                                </div>
                              </div>
                            </div>

                            <div>
                              <span
                                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                  v.status === 'ACTIVE'
                                    ? 'bg-success/15 text-success border border-success/30'
                                    : v.status === 'BLOCKED'
                                    ? 'bg-destructive/15 text-destructive border border-destructive/30'
                                    : 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                                }`}
                              >
                                {t(v.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 bg-background border border-border rounded-2xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mx-auto">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground text-sm">{t('No Business Membership Profile')}</h3>
                    <p className="text-muted-foreground text-xs max-w-sm mx-auto mt-1">
                      {t('This user account is configured for platform access only and does not have an active parking membership or linked vehicle pass.')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT HISTORY */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-foreground text-[11px] text-muted-foreground">
                {t('Activity & Role Change Logs')} ({userLogs.length})
              </div>

              {userLogs.length === 0 ? (
                <div className="p-6 bg-background border border-border rounded-2xl text-center text-muted-foreground">
                  <History className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
                  <p>{t('No audit trail records found for this user.')}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {userLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 bg-background border border-border rounded-xl space-y-1.5 hover:border-primary/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className=" text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          {log.action}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-foreground text-xs leading-relaxed">{log.description}</p>
                      <div className="text-[11px] text-muted-foreground">
                        {t('Action triggered by:')} <strong className="text-foreground">{log.actorName}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-border bg-background flex items-center justify-end">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            {t('Close')}
          </Button>
        </div>
      </div>
    </div>
  );
};
