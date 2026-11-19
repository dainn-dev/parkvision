import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, X, ShieldAlert, Power } from 'lucide-react';
import { Button } from '../ui';
import { TenantLocation } from '../../types/tenant';
import { useTranslation } from 'react-i18next';

interface DeactivateLocationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  location: TenantLocation;
  onConfirm: (newStatus: 'ACTIVE' | 'INACTIVE') => void;
}

export const DeactivateLocationDialog: React.FC<DeactivateLocationDialogProps> = ({
  isOpen,
  onClose,
  location,
  onConfirm
}) => {
  const { t } = useTranslation('tenant');
  const [confirmInput, setConfirmInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const isCurrentActive = location.status === 'ACTIVE';
  const targetStatus = isCurrentActive ? 'INACTIVE' : 'ACTIVE';
  const requiredConfirmationText = 'DEACTIVATE';

  const handleAction = () => {
    if (isCurrentActive && confirmInput !== requiredConfirmationText) return;

    setIsProcessing(true);
    setTimeout(() => {
      onConfirm(targetStatus);
      setIsProcessing(false);
      setConfirmInput('');
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Dialog Box */}
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        {/* Header */}
        <div className="p-5 border-b border-border bg-background flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCurrentActive
                  ? 'bg-destructive/15 border border-destructive/30 text-destructive'
                  : 'bg-success/15 border border-success/30 text-success'
              }`}
            >
              {isCurrentActive ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">
                {isCurrentActive ? t('Deactivate Location') : t('Activate Location')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {location.name} ({location.code})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {isCurrentActive ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive space-y-1.5">
                <div className="font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{t('Operational Impact Warning')}</span>
                </div>
                <p className="text-[11px] text-destructive leading-relaxed">
                  {t('Deactivating this location will suspend live ANPR automated gate opening and OCR processing across all 4 lanes.')}
                </p>
              </div>

              <div className="space-y-2 text-foreground">
                <p className="font-medium">{t('What happens when deactivated:')}</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                  <li>{t('Automated gate relay triggers will pause')}</li>
                  <li>{t('Historical event logs & vehicle registries remain intact')}</li>
                  <li>{t('Hardware telemetry remains visible for diagnostic purposes')}</li>
                  <li>{t('You can reactivate this location at any time')}</li>
                </ul>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[11px] font-medium text-foreground">
                  {t('Type')} <span className="text-destructive font-medium">DEACTIVATE</span> {t('to confirm:')}
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="DEACTIVATE"
                  className="w-full bg-background border border-border focus:border-destructive rounded-lg px-3 py-2 text-foreground text-xs focus:outline-hidden"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-foreground">
              <p className="leading-relaxed">
                {t('Activating this location will re-enable ANPR automated barrier gate controls and live access validation for registered vehicles.')}
              </p>
              <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-success text-[11px]">
                {t('✓ All edge cameras and relays will immediately resume real-time operational polling.')}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-border text-muted-foreground hover:text-foreground"
          >
            {t('Cancel')}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isCurrentActive && confirmInput !== requiredConfirmationText}
            isLoading={isProcessing}
            onClick={handleAction}
            className={`text-xs gap-1.5 font-medium ${
              isCurrentActive
                ? 'bg-destructive hover:bg-destructive/90 text-[#fff] disabled:opacity-50'
                : 'bg-primary hover:bg-primary/90 text-[#fff]'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {isCurrentActive ? t('Confirm Deactivation') : t('Activate Location')}
          </Button>
        </div>
      </div>
    </div>
  );
};
