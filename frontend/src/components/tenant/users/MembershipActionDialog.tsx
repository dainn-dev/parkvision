import React, { useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser } from '../../../types/tenant';
import {
  X,
  Ban,
  CheckCircle2,
  StopCircle,
  AlertTriangle,
  Layers,
  Car,
  Info
} from 'lucide-react';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface MembershipActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
  actionType: 'SUSPEND' | 'ACTIVATE' | 'END';
}

export const MembershipActionDialog: React.FC<MembershipActionDialogProps> = ({
  isOpen,
  onClose,
  user,
  actionType
}) => {
  const { suspendTenantMembership, activateTenantMembership, endTenantMembership } = usePlatform();
  const { t } = useTranslation('tenant');
  const [suspendReason, setSuspendReason] = useState(
    'Temporary pass suspension pending compliance / invoice review.'
  );
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen || !user || !user.membership) return null;

  const handleConfirm = () => {
    setFormError(null);
    if (actionType === 'SUSPEND') {
      if (!suspendReason.trim()) {
        setFormError(t('Please specify a reason for suspending this membership.'));
        return;
      }
      suspendTenantMembership(user.id, suspendReason.trim());
    } else if (actionType === 'ACTIVATE') {
      activateTenantMembership(user.id);
    } else if (actionType === 'END') {
      endTenantMembership(user.id);
    }
    onClose();
  };

  const getTitle = () => {
    switch (actionType) {
      case 'SUSPEND':
        return t('Suspend Member Access');
      case 'ACTIVATE':
        return t('Reactivate Member Access');
      case 'END':
        return t('End Membership Profile');
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
                actionType === 'SUSPEND'
                  ? 'bg-warning/15 border border-warning/30 text-warning'
                  : actionType === 'ACTIVATE'
                  ? 'bg-success/15 border border-success/30 text-success'
                  : 'bg-destructive/15 border border-destructive/30 text-destructive'
              }`}
            >
              {actionType === 'SUSPEND' && <Ban className="w-5 h-5" />}
              {actionType === 'ACTIVATE' && <CheckCircle2 className="w-5 h-5" />}
              {actionType === 'END' && <StopCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">{getTitle()}</h2>
              <p className="text-xs text-muted-foreground">
                {actionType === 'SUSPEND' && t('Temporarily block automatic gate access')}
                {actionType === 'ACTIVATE' && t('Restore vehicle whitelist access privileges')}
                {actionType === 'END' && t('Permanently retire membership and release passes')}
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
          {formError && (
            <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Member Profile Badge */}
          <div className="p-3.5 bg-background border border-border rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 text-primary flex items-center justify-center font-medium text-xs">
                {user.membership.fullName.charAt(0)}
              </div>
              <div>
                <div className="font-medium text-foreground text-xs">{user.membership.fullName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {user.membership.memberCode} · {user.membership.department || user.membership.type}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
                <Car className="w-3 h-3 text-primary" />
                <span>{t('{{count}} Vehicles', { count: user.membership.vehicles.length })}</span>
              </div>
              <span
                className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${
                  user.membership.status === 'ACTIVE'
                    ? 'bg-success/15 text-success border border-success/30'
                    : user.membership.status === 'SUSPENDED'
                    ? 'bg-warning/15 text-warning border border-warning/30'
                    : 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                }`}
              >
                {t(user.membership.status)}
              </span>
            </div>
          </div>

          {actionType === 'SUSPEND' && (
            <div className="space-y-3">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  {t('Reason for Suspension')} <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={t('Provide detailed explanation for this suspension...')}
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-warning focus:outline-hidden resize-none"
                />
              </div>

              <div className="p-3 bg-card border border-border rounded-xl text-[11px] text-muted-foreground flex items-start gap-2">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  {t('The user can still sign in to check their status, but their linked license plates will be rejected at all automated gates with a')} <strong className="text-foreground">&quot;MEMBERSHIP_SUSPENDED&quot;</strong> {t('notice.')}
                </span>
              </div>
            </div>
          )}

          {actionType === 'ACTIVATE' && (
            <div className="space-y-3">
              <p className="text-foreground leading-relaxed">
                {t('Restore full access for')} <strong className="text-foreground">{user.membership.fullName}</strong>?
              </p>
              <div className="p-3 bg-success/10 border border-success/30 rounded-xl text-[11px] text-success flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t('All {{count}} registered vehicle plates will be immediately re-synced with the edge ANPR gateway policies.', { count: user.membership.vehicles.length })}
                </span>
              </div>
            </div>
          )}

          {actionType === 'END' && (
            <div className="space-y-3">
              <p className="text-foreground leading-relaxed">
                {t('Are you sure you want to end membership for')} <strong className="text-foreground">{user.membership.fullName}</strong>?
              </p>
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-[11px] text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t('This marks the membership as Ended and expires all linked vehicle gate passes. Historical logs will remain intact.')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            {t('Cancel')}
          </Button>
          {actionType === 'SUSPEND' && (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              className="text-xs bg-warning hover:bg-warning/90 text-black font-medium gap-1.5 "
            >
              <Ban className="w-3.5 h-3.5" />
              {t('Confirm Suspension')}
            </Button>
          )}
          {actionType === 'ACTIVATE' && (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] font-medium gap-1.5 "
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('Reactivate Membership')}
            </Button>
          )}
          {actionType === 'END' && (
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirm}
              className="text-xs bg-destructive hover:bg-destructive/90 text-[#fff] font-medium gap-1.5 "
            >
              <StopCircle className="w-3.5 h-3.5" />
              {t('End Membership')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
