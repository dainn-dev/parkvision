import React, { useState } from 'react';
import { TenantVehicle } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface SuspendVehicleModalProps {
  vehicle: TenantVehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SuspendVehicleModal: React.FC<SuspendVehicleModalProps> = ({
  vehicle,
  isOpen,
  onClose
}) => {
  const { suspendTenantVehicle } = usePlatform();
  const { t } = useTranslation('tenant');

  const [reason, setReason] = useState('Temporary parking policy violation / permit review');

  if (!isOpen || !vehicle) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    suspendTenantVehicle(vehicle.id, reason.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/30 text-warning flex items-center justify-center">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">{t('Suspend Vehicle Access')}</h3>
              <p className="text-xs text-muted-foreground">{t('Temporarily block barrier access for this plate')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-foreground">
              {t('Suspended vehicles will trigger an instant')} <strong className="text-foreground">DENIED</strong> {t('gate event if detected by ANPR edge cameras at any barrier gate.')}
            </div>
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Reason for Suspension')} <span className="text-destructive">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-hidden mb-2"
            >
              <option value="Temporary parking policy violation / permit review">{t('Temporary parking policy violation')}</option>
              <option value="Unpaid monthly parking subscription">{t('Unpaid monthly parking subscription')}</option>
              <option value="Security inquiry or pending credential audit">{t('Security inquiry or pending credential audit')}</option>
              <option value="Driver membership status suspended or ended">{t('Driver membership status suspended or ended')}</option>
              <option value="Other administrative suspension">{t('Other administrative suspension')}</option>
            </select>

            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-hidden"
              placeholder={t('Enter custom suspension note...')}
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs"
            >
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="text-xs bg-warning hover:bg-warning/90 text-black font-medium gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" />
              {t('Confirm Suspension')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
