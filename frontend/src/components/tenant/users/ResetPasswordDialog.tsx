import React from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser } from '../../../types/tenant';
import { X, Key, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
}

export const ResetPasswordDialog: React.FC<ResetPasswordDialogProps> = ({ isOpen, onClose, user }) => {
  const { resetTenantUserPassword } = usePlatform();
  const { t } = useTranslation('tenant');

  if (!isOpen || !user) return null;

  const handleConfirm = () => {
    resetTenantUserPassword(user.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-[330ms]">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">{t('Reset Password')}</h2>
              <p className="text-xs text-muted-foreground">{t('Send password reset instructions to user')}</p>
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
          <p className="text-foreground leading-relaxed">
            {t('Are you sure you want to trigger a password reset for')} <strong className="text-foreground">{user.name}</strong>?
          </p>

          <div className="p-3.5 bg-background border border-border rounded-xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted border border-border text-primary flex items-center justify-center font-medium text-xs">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <div className="font-medium text-foreground truncate">{user.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
            </div>
          </div>

          <div className="p-3.5 bg-card border border-border rounded-xl text-muted-foreground text-[11px] leading-relaxed">
            {t('An automated email containing a single-use secure reset link will be dispatched to')} <span className=" text-foreground">{user.email}</span>. {t('Their existing sessions will be revoked immediately.')}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            {t('Cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            className="text-xs bg-primary hover:bg-primary/90 text-black font-medium gap-1.5 "
          >
            <Send className="w-3.5 h-3.5" />
            {t('Send Reset Link')}
          </Button>
        </div>
      </div>
    </div>
  );
};
