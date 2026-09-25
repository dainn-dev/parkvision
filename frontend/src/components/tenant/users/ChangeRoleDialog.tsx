import React, { useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser, TenantUserRole } from '../../../types/tenant';
import {
  X,
  Shield,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Lock,
  User,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../ui';

interface ChangeRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
}

export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({ isOpen, onClose, user }) => {
  const { changeTenantUserRole, tenantUsers } = usePlatform();
  const [selectedRole, setSelectedRole] = useState<TenantUserRole>(user?.role || 'MEMBER');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync role when user changes
  React.useEffect(() => {
    if (user) {
      setSelectedRole(user.role);
      setErrorMessage(null);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  // Active admin check
  const activeAdmins = tenantUsers.filter((u) => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
  const isOnlyActiveAdmin = user.role === 'TENANT_ADMIN' && user.status === 'ACTIVE' && activeAdmins.length <= 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const res = await changeTenantUserRole(user.id, selectedRole);
    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.message || 'Failed to update role.');
    }
  };

  const getRoleLabel = (role: TenantUserRole) => {
    switch (role) {
      case 'TENANT_ADMIN':
        return 'Tenant Admin';
      case 'SITE_MANAGER':
        return 'Site Manager';
      case 'MEMBER':
        return 'Member';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Change User Role</h2>
              <p className="text-xs text-[#8b949e]">Modify organization permissions and access level</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-5 border-b border-[#30363d]/60 bg-[#0d0e12]/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff] font-bold flex items-center justify-center text-xs">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-white text-xs">{user.name}</div>
              <div className="text-[11px] font-mono text-[#8b949e]">{user.email}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-[#8b949e]">Current:</span>
            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
              {getRoleLabel(user.role)}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-[#f85149]/15 border border-[#f85149]/30 rounded-xl text-[#ff7b72] flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Last Admin Guard Warning */}
          {isOnlyActiveAdmin && (
            <div className="p-3.5 bg-[#d29922]/15 border border-[#d29922]/30 rounded-xl text-[#e3b341] flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[#e3b341]" />
              <div>
                <div className="font-bold">Sole Active Tenant Administrator</div>
                <div className="text-[11px] text-[#e3b341]/90 mt-0.5 leading-relaxed">
                  This user is currently the only active Tenant Admin in your organization. To change their role, you must first promote another active member to Tenant Admin.
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <label className="block text-[#8b949e] font-semibold">Select New Role</label>

            {/* Member Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selectedRole === 'MEMBER'
                  ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white'
                  : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="MEMBER"
                checked={selectedRole === 'MEMBER'}
                onChange={() => setSelectedRole('MEMBER')}
                className="mt-0.5 text-[#58a6ff] focus:ring-0"
              />
              <div className="flex-1">
                <div className="font-bold text-white text-xs">Member</div>
                <div className="text-[11px] text-[#8b949e] mt-0.5">
                  Business member profile, personal vehicle registration, and automatic whitelist gate entry passes.
                </div>
              </div>
            </label>

            {/* Site Manager Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selectedRole === 'SITE_MANAGER'
                  ? 'bg-[#d29922]/10 border-[#d29922] text-white'
                  : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="SITE_MANAGER"
                checked={selectedRole === 'SITE_MANAGER'}
                onChange={() => setSelectedRole('SITE_MANAGER')}
                className="mt-0.5 text-[#d29922] focus:ring-0"
              />
              <div className="flex-1">
                <div className="font-bold text-[#d29922] text-xs">Site Manager</div>
                <div className="text-[11px] text-[#8b949e] mt-0.5">
                  Operational supervision of location gates, lanes, live monitoring, gate overrides, and camera alerts.
                </div>
              </div>
            </label>

            {/* Tenant Admin Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selectedRole === 'TENANT_ADMIN'
                  ? 'bg-[#f85149]/10 border-[#f85149] text-white'
                  : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="TENANT_ADMIN"
                checked={selectedRole === 'TENANT_ADMIN'}
                onChange={() => setSelectedRole('TENANT_ADMIN')}
                className="mt-0.5 text-[#f85149] focus:ring-0"
              />
              <div className="flex-1">
                <div className="font-bold text-[#f85149] text-xs">Tenant Admin</div>
                <div className="text-[11px] text-[#8b949e] mt-0.5">
                  Unrestricted access across all organization settings, location configurations, user accounts, and billing.
                </div>
              </div>
            </label>
          </div>

          {/* Promotion / Demotion Summary Callout */}
          {user.role !== selectedRole && (
            <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#8b949e]">{getRoleLabel(user.role)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#58a6ff]" />
                <span className="font-bold text-white">{getRoleLabel(selectedRole)}</span>
              </div>
              <span className="text-[11px] font-mono text-[#8b949e]">Audit log will record this change</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-[#30363d] flex items-center justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={user.role === selectedRole || (isOnlyActiveAdmin && selectedRole !== 'TENANT_ADMIN')}
              className="text-xs bg-[#58a6ff] hover:bg-[#79b8ff] text-black font-bold gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirm Role Change
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
