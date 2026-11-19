import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { tenantApi } from '../../services/api';
import { AccessEvent } from '../../types/tenant';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  MapPin,
  Camera,
  Car,
  User,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Ban,
  Radio,
  FileText,
  Activity,
  Maximize2,
  ImageOff
} from 'lucide-react';
import { Button, Badge } from '../ui';
import { canTenantWrite } from '../../lib/permissions';
import { useTranslation } from 'react-i18next';

interface AccessEventDrawerProps {
  event: AccessEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onOverride?: (event: AccessEvent) => void;
  onBlock?: (event: AccessEvent) => void;
}

export const AccessEventDrawer: React.FC<AccessEventDrawerProps> = ({
  event,
  isOpen,
  onClose,
  onOverride,
  onBlock
}) => {
  const { activeTenantId, addToast, currentUser } = usePlatform();

  // Plate correction and gate override/block are WRITE_ROLES
  // (owner/admin/operator) — mirrors tenant/events.py's `require_roles(*WRITE_ROLES)`.
  const canManage = canTenantWrite(currentUser.rawRole);
  const { t } = useTranslation('tenant');
  const [correctionInput, setCorrectionInput] = useState('');
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [plateImageFailed, setPlateImageFailed] = useState(false);
  const [overviewImageFailed, setOverviewImageFailed] = useState(false);

  // Reset image error state when viewing a different event.
  useEffect(() => {
    setPlateImageFailed(false);
    setOverviewImageFailed(false);
  }, [event?.id]);

  if (!isOpen || !event) return null;

  const submitCorrection = () => {
    const plate = correctionInput.trim().toUpperCase().replace(/[\s.-]/g, '');
    if (!plate || !activeTenantId || isCorrecting) return;
    setIsCorrecting(true);
    tenantApi
      .correctPlate(activeTenantId, event.id, plate)
      .then(() => {
        addToast({ type: 'success', title: t('Plate corrected'), description: `${event.plate} → ${plate}` });
        setCorrectionInput('');
      })
      .catch(() => addToast({ type: 'error', title: t('Correction failed') }))
      .finally(() => setIsCorrecting(false));
  };

  const getDecisionBadge = (decision: AccessEvent['decision']) => {
    switch (decision) {
      case 'ALLOWED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-success/15 text-success border border-success/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            {t('ALLOWED')}
          </span>
        );
      case 'DENIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-destructive/15 text-destructive border border-destructive/30">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            {t('DENIED')}
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-destructive/25 text-destructive border border-destructive/50">
            <Ban className="w-3.5 h-3.5 text-destructive" />
            {t('BLOCKED LIST')}
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-warning/15 text-warning border border-warning/30">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            {t('UNKNOWN PLATE')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted-foreground/15 text-muted-foreground border border-border">
            {t(decision)}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-[330ms]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl bg-background border-l border-border h-full flex flex-col z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-card/70 sticky top-0 z-20 ">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-primary">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground tracking-tight">{t('Access Verification Inspection')}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                  {event.id}
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3 h-3 text-muted-foreground" /> {event.timestamp} ({event.timeFormatted})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1 text-xs">
          {/* Top Banner: Plate & Decision */}
          <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground font-medium mb-1">
                {t('Detected License Plate')}
              </div>
              <div className="flex items-center gap-2.5">
                <span className=" text-xl font-medium text-foreground px-3 py-1 rounded bg-background border border-primary/40 tracking-wider">
                  {event.plate}
                </span>
                <button
                  onClick={() => navigator.clipboard?.writeText(event.plate)}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={t('Copy plate number')}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-muted-foreground font-medium mb-1">
                {t('Gate Decision')}
              </div>
              {getDecisionBadge(event.decision)}
            </div>
          </div>

          {/* Plate Correction */}
          <div className="p-3 rounded-xl bg-card border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-medium ">
                {t('OCR Correction')}
              </span>
              {event.correctedPlate && (
                <span className="text-[11px] text-warning ">
                  {t('corrected')} → {event.correctedPlate} {t('by')} {event.verifiedBy ?? 'operator'}
                </span>
              )}
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={correctionInput}
                  onChange={(e) => setCorrectionInput(e.target.value.toUpperCase())}
                  placeholder={t('Correct plate (e.g. 30F12345)')}
                  className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-[11px] text-foreground focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={submitCorrection}
                  disabled={isCorrecting || !correctionInput.trim()}
                  className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-[11px] font-medium hover:bg-primary/30 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {isCorrecting ? t('Saving…') : t('Correct')}
                </button>
              </div>
            ) : (
              <span className="text-muted-foreground text-[11px] italic">{t('View only')}</span>
            )}
          </div>

          {/* AI Vision & OCR Sensor Card */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Camera className="w-4 h-4 text-primary" />
                <span>{t('ANPR Camera & Edge Vision Capture')}</span>
              </div>
              <span className="text-[11px] text-success flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success " />
                {t('AI Inference Verified')}
              </span>
            </div>

            {/* Plate close-up & overview images */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative rounded-lg bg-background border border-border h-32 flex flex-col items-center justify-center overflow-hidden">
                <span className="text-[11px] text-muted-foreground font-medium absolute top-2 left-2 z-10">{t('Plate close-up (ANPR)')}</span>
                {event.plateImageCrop && !plateImageFailed ? (
                  <img
                    src={event.plateImageCrop}
                    alt={event.plate}
                    className="w-full h-full object-cover"
                    onError={() => setPlateImageFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-border">
                    <ImageOff className="w-6 h-6" />
                    <span className="text-[11px] ">{t('Image not available')}</span>
                  </div>
                )}
              </div>
              <div className="relative rounded-lg bg-background border border-border h-32 flex flex-col items-center justify-center overflow-hidden">
                <span className="text-[11px] text-muted-foreground font-medium absolute top-2 left-2 z-10">{t('Overview / context')}</span>
                {event.overviewImage && !overviewImageFailed ? (
                  <img
                    src={event.overviewImage}
                    alt={t('Overview / context')}
                    className="w-full h-full object-cover"
                    onError={() => setOverviewImageFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-border">
                    <ImageOff className="w-6 h-6" />
                    <span className="text-[11px] ">{t('Image not available')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Plate badge */}
            <div className="relative rounded-lg bg-background border border-border h-16 flex items-center justify-center overflow-hidden">
              <div className="bg-warning text-[#fff] border border-border rounded-md px-6 py-1.5 text-xl font-medium tracking-widest text-center">
                {event.plate}
                <div className="text-[8px] font-sans font-medium text-muted-foreground tracking-normal border-t border-border mt-0.5 pt-0.5">
                  VIETNAM · AUTOMATED ANPR
                </div>
              </div>
              <div className="absolute bottom-1.5 left-3 right-3 flex items-center justify-between text-[11px] text-muted-foreground ">
                <span>Cam: {event.siteName.split(' ')[0]}-ANPR-01</span>
                <span>FPS: 30 · Res: 4K UHD</span>
              </div>
            </div>

            {/* OCR Accuracy Metric Gauges */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-background border border-border">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="text-muted-foreground">{t('OCR Confidence')}</span>
                  <span className="text-success font-medium">
                    {(event.plateConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${event.plateConfidence * 100}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-background border border-border">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="text-muted-foreground">{t('Detection Confidence')}</span>
                  <span className="text-primary font-medium">
                    {(event.detectionConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${event.detectionConfidence * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Location & Lane Topology */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border/60 pb-2">
              <MapPin className="w-4 h-4 text-warning" />
              <span>{t('Location & Gate Topology')}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Site Facility')}</span>
                <p className="text-foreground font-medium mt-0.5">{event.siteName}</p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Gate Identifier')}</span>
                <p className="text-foreground font-medium mt-0.5">{event.gateName}</p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Lane & Direction')}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-foreground font-medium">{event.laneName}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    event.direction === 'IN' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                  }`}>
                    {event.direction === 'IN' ? t('INBOUND') : t('OUTBOUND')}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Verification Engine')}</span>
                <p className="text-muted-foreground text-[11px] mt-0.5">{event.verifiedBy || 'Edge AI v4.2'}</p>
              </div>
            </div>
          </div>

          {/* Vehicle & Owner Profile */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border/60 pb-2">
              <Car className="w-4 h-4 text-chart-5" />
              <span>{t('Vehicle Specifications & Registry')}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Make & Model')}</span>
                <p className="text-foreground font-medium mt-0.5">{event.vehicleModel || t('Standard Passenger Vehicle')}</p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Body Type & Color')}</span>
                <p className="text-foreground font-medium mt-0.5">{event.vehicleType || 'Sedan'} · {event.vehicleColor || 'Standard'}</p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Owner / Driver')}</span>
                <p className="text-foreground font-medium mt-0.5">{event.ownerName || t('Unregistered Driver')}</p>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground font-medium">{t('Affiliation Category')}</span>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-primary border border-border">
                  {t(event.ownerType || 'VISITOR')}
                </span>
              </div>
            </div>

            {event.ownerDepartment && (
              <div className="pt-1">
                <span className="text-[11px] text-muted-foreground font-medium">{t('Department')}</span>
                <p className="text-foreground mt-0.5">{event.ownerDepartment}</p>
              </div>
            )}
          </div>

          {/* Applied Access Rule & Audit Note */}
          <div className="rounded-xl bg-card border border-border p-4 space-y-2">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border/60 pb-2">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span>{t('Policy Evaluation & Rule Triggered')}</span>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground font-medium">{t('Enforced Access Rule')}</span>
              <p className="text-primary font-medium text-[11px] mt-0.5">
                {event.accessRule || t('Default Standard Multi-Site Access Policy')}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-background border border-border text-muted-foreground text-[11px]">
              <span className="text-foreground font-medium">{t('Decision Reason:')} </span>
              {event.reason || t('Verification logic evaluated without anomalies.')}
            </div>
          </div>
        </div>

        {/* Footer Quick Actions */}
        <div className="p-4 border-t border-border bg-card/90 flex items-center justify-between gap-3 sticky bottom-0 z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            {t('Close Sheet')}
          </Button>

          {canManage && (
            <div className="flex items-center gap-2">
              {event.decision !== 'ALLOWED' && onOverride && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onOverride(event)}
                  className="bg-primary hover:bg-primary/90 text-[#fff] text-xs gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('Override & Open Gate')}
                </Button>
              )}

              {event.decision !== 'BLOCKED' && onBlock && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onBlock(event)}
                  className="text-destructive hover:bg-destructive/20 border-destructive/40 text-xs gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  {t('Add to Blocklist')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
