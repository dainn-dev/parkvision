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
import { useTranslation } from 'react-i18next';

interface ChangeRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
}

export const ChangeRoleDialog: React.FC<ChangeRoleDialogProps> = ({ isOpen, onClose, user }) => {
  const { changeTenantUserRole, tenantUsers } = usePlatform();
  const { t } = useTranslation('tenant');
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
      setErrorMessage(res.message || t('Failed to update role.'));
    }
  };

  const getRoleLabel = (role: TenantUserRole) => {
    switch (role) {
      case 'TENANT_ADMIN':
        return t('Tenant Admin');
      case 'SITE_MANAGER':
        return t('Site Manager');
      case 'MEMBER':
        return t('Member');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-[330ms]">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">{t('Change User Role')}</h2>
              <p className="text-xs text-muted-foreground">{t('Modify organization permissions and access level')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-5 border-b border-border/60 bg-background/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-muted border border-border text-primary font-medium flex items-center justify-center text-xs">
              {user.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium text-foreground text-xs">{user.name}</div>
              <div className="text-[11px] text-muted-foreground">{user.email}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t('Current:')}</span>
            <span className=" text-[11px] font-medium px-2 py-0.5 rounded bg-muted border border-border text-primary">
              {getRoleLabel(user.role)}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Last Admin Guard Warning */}
          {isOnlyActiveAdmin && (
            <div className="p-3.5 bg-warning/15 border border-warning/30 rounded-xl text-warning flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
              <div>
                <div className="font-medium">{t('Sole Active Tenant Administrator')}</div>
                <div className="text-[11px] text-warning/90 mt-0.5 leading-relaxed">
                  {t('This user is currently the only active Tenant Admin in your organization. To change their role, you must first promote another active member to Tenant Admin.')}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <label className="block text-muted-foreground font-medium">{t('Select New Role')}</label>

            {/* Member Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selectedRole === 'MEMBER'
                  ? 'bg-primary/10 border-primary text-foreground'
                  : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="MEMBER"
                checked={selectedRole === 'MEMBER'}
                onChange={() => setSelectedRole('MEMBER')}
                className="mt-0.5 text-primary focus:ring-0"
              />
              <div className="flex-1">
                <div className="font-medium text-foreground text-xs">{t('Member')}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t('Business member profile, personal vehicle registration, and automatic whitelist gate entry passes.')}
                </div>
              </div>
            </label>

            {/* Site Manager Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selectedRole === 'SITE_MANAGER'
                  ? 'bg-warning/10 border-warning text-foreground'
                  : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="SITE_MANAGER"
                checked={selectedRole === 'SITE_MANAGER'}
                onChange={() => setSelectedRole('SITE_MANAGER')}
                className="mt-0.5 text-warning focus:ring-0"
              />
              <div className="flex-1">
                <div className="font-medium text-warning text-xs">{t('Site Manager')}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t('Operational supervision of location gates, lanes, live monitoring, gate overrides, and camera alerts.')}
                </div>
              </div>
            </label>

            {/* Tenant Admin Option */}
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                selectedRole === 'TENANT_ADMIN'
                  ? 'bg-destructive/10 border-destructive text-foreground'
                  : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="TENANT_ADMIN"
                checked={selectedRole === 'TENANT_ADMIN'}
                onChange={() => setSelectedRole('TENANT_ADMIN')}
                className="mt-0.5 text-destructive focus:ring-0"
              />
              <div className="flex-1">
                <div className="font-medium text-destructive text-xs">{t('Tenant Admin')}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {t('Unrestricted access across all organization settings, location configurations, user accounts, and billing.')}
                </div>
              </div>
            </label>
          </div>

          {/* Promotion / Demotion Summary Callout */}
          {user.role !== selectedRole && (
            <div className="p-3 bg-card border border-border rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{getRoleLabel(user.role)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium text-foreground">{getRoleLabel(selectedRole)}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">{t('Audit log will record this change')}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" onClick={onClose} className="text-xs">
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={user.role === selectedRole || (isOnlyActiveAdmin && selectedRole !== 'TENANT_ADMIN')}
              className="text-xs bg-primary hover:bg-primary/90 text-black font-medium gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('Confirm Role Change')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
