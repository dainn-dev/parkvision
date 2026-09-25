import React, { useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser } from '../../../types/tenant';
import {
  X,
  UserX,
  UserCheck,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ShieldAlert,
  Info
} from 'lucide-react';
import { Button } from '../../ui';

interface DeactivateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
}

export const DeactivateUserDialog: React.FC<DeactivateUserDialogProps> = ({ isOpen, onClose, user }) => {
  const { toggleTenantUserStatus, tenantUsers } = usePlatform();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const isCurrentlyActive = user.status === 'ACTIVE';
  const targetStatus = isCurrentlyActive ? 'INACTIVE' : 'ACTIVE';

  // Guard check: is last active admin?
  const activeAdmins = tenantUsers.filter((u) => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
  const isOnlyActiveAdmin = user.role === 'TENANT_ADMIN' && isCurrentlyActive && activeAdmins.length <= 1;

  const handleConfirm = () => {
    setErrorMessage(null);
    const res = toggleTenantUserStatus(user.id, targetStatus);
    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.message || 'Action prohibited.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCurrentlyActive
                  ? 'bg-[#f85149]/15 border border-[#f85149]/30 text-[#f85149]'
                  : 'bg-[#238636]/15 border border-[#238636]/30 text-[#3fb950]'
              }`}
            >
              {isCurrentlyActive ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {isCurrentlyActive ? 'Deactivate User Account' : 'Reactivate User Account'}
              </h2>
              <p className="text-xs text-[#8b949e]">
                {isCurrentlyActive
                  ? 'Revoke authentication and login permissions'
                  : 'Restore portal sign-in and access'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-[#f85149]/15 border border-[#f85149]/30 rounded-xl text-[#ff7b72] flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* User Card */}
          <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#21262d] border border-[#30363d] text-white font-bold flex items-center justify-center text-xs">
                {user.name.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-white text-xs">{user.name}</div>
                <div className="text-[11px] font-mono text-[#8b949e]">{user.email}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-mono text-[#8b949e]">{user.role.replace('_', ' ')}</div>
              <span
                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                  user.status === 'ACTIVE'
                    ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                    : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                }`}
              >
                {user.status}
              </span>
            </div>
          </div>

          {/* Last Admin Guard Warning */}
          {isOnlyActiveAdmin ? (
            <div className="p-3.5 bg-[#f85149]/15 border border-[#f85149]/30 rounded-xl text-[#ff7b72] flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[#f85149]" />
              <div>
                <div className="font-bold">Sole Active Tenant Administrator</div>
                <div className="text-[11px] text-[#ff7b72]/90 mt-0.5 leading-relaxed">
                  This user is the only active Tenant Admin for the organization. You cannot deactivate this account until another active user is promoted to Tenant Admin.
                </div>
              </div>
            </div>
          ) : isCurrentlyActive ? (
            <div className="space-y-3">
              <p className="text-[#c9d1d9] leading-relaxed">
                Are you sure you want to deactivate <strong className="text-white">{user.name}</strong>?
              </p>

              <div className="p-3.5 bg-[#161b22] border border-[#30363d] rounded-xl space-y-2 text-[11px] text-[#8b949e]">
                <div className="flex items-center gap-2 text-white font-semibold">
                  <Info className="w-4 h-4 text-[#58a6ff]" />
                  What happens when deactivated?
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[#8b949e]">
                  <li>The user is immediately logged out and blocked from signing in.</li>
                  <li>Their historical access events, audits, and records remain fully preserved.</li>
                  <li>Existing vehicle whitelist registrations and business memberships remain intact.</li>
                  <li>You can reactivate this user account at any time.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[#c9d1d9] leading-relaxed">
                Reactivating <strong className="text-white">{user.name}</strong> will restore their login access and portal permissions immediately.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12]/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          {isCurrentlyActive ? (
            <Button
              type="button"
              variant="danger"
              disabled={isOnlyActiveAdmin}
              onClick={handleConfirm}
              className="text-xs bg-[#da3633] hover:bg-[#f85149] text-white font-bold gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserX className="w-3.5 h-3.5" />
              Deactivate User
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white font-bold gap-1.5 shadow-sm"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Reactivate User
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
