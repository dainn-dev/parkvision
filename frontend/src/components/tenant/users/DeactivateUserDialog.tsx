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
import { useTranslation } from 'react-i18next';

interface DeactivateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
}

export const DeactivateUserDialog: React.FC<DeactivateUserDialogProps> = ({ isOpen, onClose, user }) => {
  const { toggleTenantUserStatus, tenantUsers } = usePlatform();
  const { t } = useTranslation('tenant');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const isCurrentlyActive = user.status === 'ACTIVE';
  const targetStatus = isCurrentlyActive ? 'INACTIVE' : 'ACTIVE';

  // Guard check: is last active admin?
  const activeAdmins = tenantUsers.filter((u) => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
  const isOnlyActiveAdmin = user.role === 'TENANT_ADMIN' && isCurrentlyActive && activeAdmins.length <= 1;

  const handleConfirm = async () => {
    setErrorMessage(null);
    const res = await toggleTenantUserStatus(user.id, targetStatus);
    if (res.success) {
      onClose();
    } else {
      setErrorMessage(res.message || t('Action prohibited.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-[330ms]">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCurrentlyActive
                  ? 'bg-destructive/15 border border-destructive/30 text-destructive'
                  : 'bg-success/15 border border-success/30 text-success'
              }`}
            >
              {isCurrentlyActive ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">
                {isCurrentlyActive ? t('Deactivate User Account') : t('Reactivate User Account')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isCurrentlyActive
                  ? t('Revoke authentication and login permissions')
                  : t('Restore portal sign-in and access')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-start gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* User Card */}
          <div className="p-4 bg-background border border-border rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted border border-border text-foreground font-medium flex items-center justify-center text-xs">
                {user.name.charAt(0)}
              </div>
              <div>
                <div className="font-medium text-foreground text-xs">{user.name}</div>
                <div className="text-[11px] text-muted-foreground">{user.email}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">{user.role.replace('_', ' ')}</div>
              <span
                className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${
                  user.status === 'ACTIVE'
                    ? 'bg-success/15 text-success border border-success/30'
                    : 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                }`}
              >
                {t(user.status)}
              </span>
            </div>
          </div>

          {/* Last Admin Guard Warning */}
          {isOnlyActiveAdmin ? (
            <div className="p-3.5 bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-start gap-2.5">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
              <div>
                <div className="font-medium">{t('Sole Active Tenant Administrator')}</div>
                <div className="text-[11px] text-destructive/90 mt-0.5 leading-relaxed">
                  {t('This user is the only active Tenant Admin for the organization. You cannot deactivate this account until another active user is promoted to Tenant Admin.')}
                </div>
              </div>
            </div>
          ) : isCurrentlyActive ? (
            <div className="space-y-3">
              <p className="text-foreground leading-relaxed">
                {t('Are you sure you want to deactivate')} <strong className="text-foreground">{user.name}</strong>?
              </p>

              <div className="p-3.5 bg-card border border-border rounded-xl space-y-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2 text-foreground font-medium">
                  <Info className="w-4 h-4 text-primary" />
                  {t('What happens when deactivated?')}
                </div>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>{t('The user is immediately logged out and blocked from signing in.')}</li>
                  <li>{t('Their historical access events, audits, and records remain fully preserved.')}</li>
                  <li>{t('Existing vehicle whitelist registrations and business memberships remain intact.')}</li>
                  <li>{t('You can reactivate this user account at any time.')}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-foreground leading-relaxed">
                {t('Reactivating')} <strong className="text-foreground">{user.name}</strong> {t('will restore their login access and portal permissions immediately.')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            {t('Cancel')}
          </Button>
          {isCurrentlyActive ? (
            <Button
              type="button"
              variant="danger"
              disabled={isOnlyActiveAdmin}
              onClick={handleConfirm}
              className="text-xs bg-destructive hover:bg-destructive/90 text-[#fff] font-medium gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserX className="w-3.5 h-3.5" />
              {t('Deactivate User')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] font-medium gap-1.5 "
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t('Reactivate User')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
