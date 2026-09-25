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
          <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#f85149]/15 border border-[#f85149]/30 text-[#ff7b72]">
            Tenant Admin
          </span>
        );
      case 'SITE_MANAGER':
        return (
          <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#d29922]/15 border border-[#d29922]/30 text-[#e3b341]">
            Site Manager
          </span>
        );
      case 'MEMBER':
        return (
          <span className="font-mono text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff]">
            Member
          </span>
        );
    }
  };

  const getStatusBadge = () => {
    switch (user.status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
            <CheckCircle2 className="w-3 h-3" />
            Active
          </span>
        );
      case 'INACTIVE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30">
            <UserX className="w-3 h-3" />
            Inactive
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#d29922]/15 text-[#d29922] border border-[#d29922]/30">
            <Clock className="w-3 h-3" />
            Pending Invite
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#f85149]/15 text-[#ff7b72] border border-[#f85149]/30">
            <Ban className="w-3 h-3" />
            Suspended
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#161b22] border-l border-[#30363d] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Top Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#58a6ff]/20 border border-[#58a6ff]/40 text-[#58a6ff] flex items-center justify-center font-bold text-lg">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">{user.name}</h2>
                {getStatusBadge()}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8b949e]">
                <span className="font-mono">{user.email}</span>
                {user.membership && (
                  <span className="px-2 py-0.2 rounded bg-[#21262d] font-mono text-[10px] text-[#58a6ff]">
                    {user.membership.memberCode}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-2 rounded-xl hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Bar */}
        <div className="p-3.5 bg-[#161b22] border-b border-[#30363d]/80 flex items-center gap-2 flex-wrap text-xs">
          <Button
            variant="secondary"
            onClick={() => onChangeRole(user)}
            className="text-xs py-1.5 px-3 bg-[#21262d] hover:bg-[#30363d] text-white gap-1.5 border border-[#30363d]"
          >
            <Shield className="w-3.5 h-3.5 text-[#58a6ff]" />
            Change Role
          </Button>

          <Button
            variant="secondary"
            onClick={() => onResetPassword(user)}
            className="text-xs py-1.5 px-3 bg-[#21262d] hover:bg-[#30363d] text-white gap-1.5 border border-[#30363d]"
          >
            <Key className="w-3.5 h-3.5 text-[#e3b341]" />
            Reset Password
          </Button>

          <Button
            variant="secondary"
            onClick={() => onDeactivate(user)}
            className={`text-xs py-1.5 px-3 gap-1.5 border ${
              user.status === 'ACTIVE'
                ? 'bg-[#f85149]/10 hover:bg-[#f85149]/20 text-[#ff7b72] border-[#f85149]/30'
                : 'bg-[#238636]/10 hover:bg-[#238636]/20 text-[#3fb950] border-[#238636]/30'
            }`}
          >
            {user.status === 'ACTIVE' ? (
              <>
                <UserX className="w-3.5 h-3.5" />
                Deactivate
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                Reactivate
              </>
            )}
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#30363d] bg-[#0d0e12]/40 px-5 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'OVERVIEW'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Overview & Account
          </button>

          <button
            onClick={() => setActiveTab('MEMBERSHIP')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'MEMBERSHIP'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Membership & Vehicles
            {user.membership?.vehicles && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-[#21262d] text-[10px] text-white">
                {user.membership.vehicles.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'AUDIT'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Audit History
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              {/* Last Admin Banner if applicable */}
              {isOnlyActiveAdmin && (
                <div className="p-3 bg-[#d29922]/15 border border-[#d29922]/30 rounded-xl text-[#e3b341] flex items-start gap-2.5">
                  <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[#e3b341]" />
                  <div className="text-[11px]">
                    <strong>Primary Organization Admin:</strong> This account is currently the sole active Tenant Admin. Demotion and deactivation are locked.
                  </div>
                </div>
              )}

              {/* Profile Card */}
              <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-2xl space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider text-[11px] text-[#8b949e]">
                  User Profile & Authentication
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[#8b949e] text-[11px]">Full Name</span>
                    <p className="font-semibold text-white mt-0.5">{user.name}</p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Email Address</span>
                    <p className="font-mono text-white mt-0.5">{user.email}</p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Username</span>
                    <p className="font-mono text-white mt-0.5">{user.username || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Phone</span>
                    <p className="font-mono text-white mt-0.5">{user.phone || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Organization Role</span>
                    <div className="mt-1">{getRoleBadge()}</div>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Account Status</span>
                    <div className="mt-1">{getStatusBadge()}</div>
                  </div>
                </div>
              </div>

              {/* System & Security Activity */}
              <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-2xl space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider text-[11px] text-[#8b949e]">
                  Sign-In & System Telemetry
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[#8b949e] text-[11px]">Last Sign-In</span>
                    <p className="font-mono text-white mt-0.5">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never logged in'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Created Date</span>
                    <p className="font-mono text-white mt-0.5">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Security Credentials</span>
                    <p className="text-[#3fb950] font-semibold mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Standard Password + MFA
                    </p>
                  </div>

                  <div>
                    <span className="text-[#8b949e] text-[11px]">Organization Facility</span>
                    <p className="text-white font-medium mt-0.5">Main Campus (Dedicated)</p>
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
                  <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white uppercase tracking-wider text-[11px] text-[#8b949e]">
                        Facility Membership Profile
                      </div>
                      <div className="flex items-center gap-2">
                        {user.membership.status === 'ACTIVE' && (
                          <Button
                            variant="secondary"
                            onClick={() => onMembershipAction(user, 'SUSPEND')}
                            className="text-[11px] py-1 px-2.5 bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30 hover:bg-[#d29922]/25"
                          >
                            <Ban className="w-3 h-3" />
                            Suspend Access
                          </Button>
                        )}
                        {user.membership.status === 'SUSPENDED' && (
                          <Button
                            variant="secondary"
                            onClick={() => onMembershipAction(user, 'ACTIVATE')}
                            className="text-[11px] py-1 px-2.5 bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30 hover:bg-[#238636]/25"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Reactivate Access
                          </Button>
                        )}
                        {user.membership.status !== 'ENDED' && (
                          <Button
                            variant="secondary"
                            onClick={() => onMembershipAction(user, 'END')}
                            className="text-[11px] py-1 px-2.5 bg-[#f85149]/10 text-[#ff7b72] border border-[#f85149]/30 hover:bg-[#f85149]/20"
                          >
                            End Membership
                          </Button>
                        )}
                      </div>
                    </div>

                    {user.membership.suspendedReason && (
                      <div className="p-2.5 bg-[#d29922]/15 border border-[#d29922]/30 rounded-xl text-[#e3b341] text-[11px]">
                        <strong>Suspension Reason:</strong> {user.membership.suspendedReason}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <span className="text-[#8b949e] text-[11px]">Member ID Code</span>
                        <p className="font-mono font-bold text-[#58a6ff] mt-0.5">{user.membership.memberCode}</p>
                      </div>

                      <div>
                        <span className="text-[#8b949e] text-[11px]">Membership Type</span>
                        <p className="font-semibold text-white mt-0.5">{user.membership.type}</p>
                      </div>

                      <div>
                        <span className="text-[#8b949e] text-[11px]">Department / Org Unit</span>
                        <p className="text-white mt-0.5">{user.membership.department || '—'}</p>
                      </div>

                      <div>
                        <span className="text-[#8b949e] text-[11px]">Employee ID</span>
                        <p className="font-mono text-white mt-0.5">{user.membership.employeeId || '—'}</p>
                      </div>

                      <div>
                        <span className="text-[#8b949e] text-[11px]">Membership Status</span>
                        <p className="font-semibold text-white mt-0.5">{user.membership.status}</p>
                      </div>

                      <div>
                        <span className="text-[#8b949e] text-[11px]">Member Since</span>
                        <p className="font-mono text-white mt-0.5">
                          {new Date(user.membership.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Linked Vehicles */}
                  <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white uppercase tracking-wider text-[11px] text-[#8b949e]">
                        Registered Vehicles & Whitelist Passes ({user.membership.vehicles.length})
                      </div>
                    </div>

                    {user.membership.vehicles.length === 0 ? (
                      <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-xl text-center text-[#8b949e]">
                        <Car className="w-6 h-6 mx-auto mb-1.5 text-[#8b949e]" />
                        <p>No vehicles currently registered for this member.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {user.membership.vehicles.map((v, i) => (
                          <div
                            key={i}
                            className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-between hover:border-[#58a6ff]/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#58a6ff] flex items-center justify-center">
                                <Car className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-mono font-bold text-xs text-white bg-[#0d0e12] px-2 py-0.5 rounded border border-[#30363d]">
                                  {v.plate}
                                </span>
                                <div className="text-[11px] text-[#8b949e] mt-1">
                                  {v.model} {v.color && `· ${v.color}`} ({v.type})
                                </div>
                              </div>
                            </div>

                            <div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  v.status === 'ACTIVE'
                                    ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                                    : v.status === 'BLOCKED'
                                    ? 'bg-[#f85149]/15 text-[#ff7b72] border border-[#f85149]/30'
                                    : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                                }`}
                              >
                                {v.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 bg-[#0d0e12] border border-[#30363d] rounded-2xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#21262d] text-[#8b949e] flex items-center justify-center mx-auto">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">No Business Membership Profile</h3>
                    <p className="text-[#8b949e] text-xs max-w-sm mx-auto mt-1">
                      This user account is configured for platform access only and does not have an active parking membership or linked vehicle pass.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT HISTORY */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-white uppercase tracking-wider text-[11px] text-[#8b949e]">
                Activity & Role Change Logs ({userLogs.length})
              </div>

              {userLogs.length === 0 ? (
                <div className="p-6 bg-[#0d0e12] border border-[#30363d] rounded-2xl text-center text-[#8b949e]">
                  <History className="w-6 h-6 mx-auto mb-1.5 text-[#8b949e]" />
                  <p>No audit trail records found for this user.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {userLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl space-y-1.5 hover:border-[#58a6ff]/40 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-[#58a6ff] bg-[#58a6ff]/10 px-2 py-0.5 rounded border border-[#58a6ff]/20">
                          {log.action}
                        </span>
                        <span className="text-[11px] font-mono text-[#8b949e]">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-white text-xs leading-relaxed">{log.description}</p>
                      <div className="text-[11px] text-[#8b949e]">
                        Action triggered by: <strong className="text-[#c9d1d9]">{log.actorName}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12] flex items-center justify-end">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
