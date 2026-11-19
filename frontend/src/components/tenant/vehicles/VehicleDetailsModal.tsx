import React, { useState } from 'react';
import { tenantApi } from '../../../services/api';
import {
  TenantVehicle,
  VehicleLicensePlate,
  VehicleAssignmentHistoryItem,
  VehicleAuditItem
} from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import {
  X,
  Car,
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  History,
  Tag,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Hash,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
  Plus,
  Edit2,
  UserCheck,
  Ban,
  Archive,
  RefreshCw
} from 'lucide-react';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface VehicleDetailsModalProps {
  vehicle: TenantVehicle | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (vehicle: TenantVehicle) => void;
  onUpdatePlate: (vehicle: TenantVehicle) => void;
  onAssignMember: (vehicle: TenantVehicle) => void;
  onSuspend: (vehicle: TenantVehicle) => void;
}

export const VehicleDetailsModal: React.FC<VehicleDetailsModalProps> = ({
  vehicle,
  isOpen,
  onClose,
  onEdit,
  onUpdatePlate,
  onAssignMember,
  onSuspend
}) => {
  const {
    activateTenantVehicle,
    deactivateTenantVehicle,
    archiveTenantVehicle,
    activeTenantId
  } = usePlatform();
  const { t } = useTranslation('tenant');

  const [activeTab, setActiveTab] = useState<'overview' | 'plates' | 'assignments' | 'audit'>('overview');
  // Archived plates live server-side (vehicle_plate_history) — fetched when
  // the plates tab is opened, not carried on the vehicle object.
  const [plateHistory, setPlateHistory] = useState<Array<{ plateNumber: string; replacedAt: string }>>([]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== 'plates' || !activeTenantId || !vehicle) return;
    let cancelled = false;
    tenantApi
      .plateHistory(activeTenantId, vehicle.id)
      .then((rows: Array<{ plateNumber: string; replacedAt: string }>) => {
        if (!cancelled) setPlateHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setPlateHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, activeTenantId, vehicle]);

  if (!isOpen || !vehicle) return null;

  const isSuspended = vehicle.status === 'SUSPENDED';
  const isActive = vehicle.status === 'ACTIVE';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium text-foreground tracking-tight">
                  {vehicle.name}
                </h2>
                <span className=" text-xs font-medium px-2 py-0.5 rounded bg-background border border-border text-foreground">
                  {vehicle.currentPlate.number}
                </span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    vehicle.status === 'ACTIVE'
                      ? 'bg-success/15 text-success border border-success/30'
                      : vehicle.status === 'SUSPENDED'
                      ? 'bg-warning/15 text-warning border border-warning/30'
                      : vehicle.status === 'ARCHIVED'
                      ? 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                      : 'bg-destructive/15 text-destructive border border-destructive/30'
                  }`}
                >
                  {vehicle.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {t(vehicle.status)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {vehicle.type} · {vehicle.color || t('No color')} · {vehicle.year || t('Year N/A')} · {t('Enrolled')} {new Date(vehicle.createdAt).toLocaleDateString()}
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

        {/* Tab Navigation */}
        <div className="px-6 border-b border-border bg-card/50 flex gap-6 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {t('Overview & Specs')}
          </button>
          <button
            onClick={() => setActiveTab('plates')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'plates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            {t('Plate History')} ({1 + plateHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'assignments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {t('Member Ownership')}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            {t('Audit Trail')} ({vehicle.auditHistory?.length || 0})
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Access Decision Banner */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                  vehicle.accessStatus === 'ALLOWED'
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                {vehicle.accessStatus === 'ALLOWED' ? (
                  <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                    <span>{t('Gate Access Decision:')} {t(vehicle.accessStatus)}</span>
                  </div>
                  <p className="text-xs mt-1 text-foreground">
                    {vehicle.accessStatusReason ||
                      (vehicle.accessStatus === 'ALLOWED'
                        ? t('Vehicle is whitelisted for automated barrier access upon ANPR plate match.')
                        : t('Access is denied at edge barrier gates.'))}
                  </p>
                  {isSuspended && vehicle.suspendedReason && (
                    <div className="mt-2 text-xs bg-warning/10 border border-warning/30 text-warning p-2 rounded-lg">
                      {t('Suspension Reason:')} {vehicle.suspendedReason}
                    </div>
                  )}
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-medium text-foreground text-muted-foreground">
                  {t('Vehicle Specifications')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <span className="text-muted-foreground text-[11px] block">{t('Make & Model')}</span>
                    <span className="font-medium text-foreground mt-0.5 block">{vehicle.make} {vehicle.model}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <span className="text-muted-foreground text-[11px] block">{t('Vehicle Category')}</span>
                    <span className="font-medium text-foreground mt-0.5 block">{vehicle.type}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <span className="text-muted-foreground text-[11px] block">{t('Model Year')}</span>
                    <span className="font-medium text-foreground mt-0.5 block">{vehicle.year || t('Not specified')}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <span className="text-muted-foreground text-[11px] block">{t('Exterior Color')}</span>
                    <span className="font-medium text-foreground mt-0.5 block">{vehicle.color || t('Not specified')}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <span className="text-muted-foreground text-[11px] block">{t('VIN / Chassis No.')}</span>
                    <span className=" text-foreground mt-0.5 block text-[11px]">
                      {vehicle.vin || 'N/A'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/60">
                    <span className="text-muted-foreground text-[11px] block">{t('Applied Rules')}</span>
                    <span className="font-medium text-primary mt-0.5 block truncate">
                      {vehicle.appliedRules?.join(', ') || t('Standard 24/7 Access')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Member Assignment Card */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-foreground text-muted-foreground">
                    {t('Assigned Member / Driver')}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAssignMember(vehicle)}
                    className="text-[11px] h-7 gap-1"
                  >
                    <UserCheck className="w-3 h-3" />
                    {vehicle.member ? t('Change Member') : t('Assign Member')}
                  </Button>
                </div>

                {vehicle.member ? (
                  <div className="flex items-center gap-3.5 p-3 rounded-lg bg-background border border-border">
                    <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 text-primary flex items-center justify-center font-medium text-xs">
                      {vehicle.member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-xs">{vehicle.member.name}</span>
                        <span className=" text-[11px] text-primary px-1.5 py-0.2 rounded bg-primary/10">
                          {vehicle.member.code}
                        </span>
                        <span className="text-[11px] px-1.5 py-0.2 rounded bg-muted text-foreground">
                          {vehicle.member.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {vehicle.member.email} {vehicle.member.department ? `· ${vehicle.member.department}` : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-background border border-dashed border-border text-center text-muted-foreground">
                    <User className="w-6 h-6 mx-auto mb-1 text-muted-foreground/50" />
                    <p className="text-foreground font-medium text-xs">{t('Unassigned Pool / Fleet Vehicle')}</p>
                    <p className="text-[11px] mt-0.5">{t('This vehicle is not directly tied to an individual member profile.')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PLATES TAB */}
          {activeTab === 'plates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground text-xs">{t('License Plates Registry')}</h3>
                  <p className="text-[11px] text-muted-foreground">{t('Current active plate and historical replacement records')}</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onUpdatePlate(vehicle)}
                  className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 h-8"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('Replace / Update Plate')}
                </Button>
              </div>

              {/* Current Active Plate */}
              <div className="p-4 rounded-xl bg-card border border-primary/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className=" text-base font-medium text-foreground px-3 py-1 rounded bg-background border border-border tracking-wider">
                      {vehicle.currentPlate.number}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-success/15 text-success border border-success/30">
                      {t('ACTIVE PLATE')}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {t('Valid From:')} {vehicle.currentPlate.validFrom}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1">
                  <span>{t('Region:')} {vehicle.currentPlate.province || 'Ho Chi Minh City'} ({vehicle.currentPlate.country})</span>
                  <span>{t('Registered:')} {new Date(vehicle.currentPlate.registeredAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Previous Plates — archived server-side on every replacement */}
              {plateHistory.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground ">{t('Previous Historical Plates')}</h4>
                  <div className="space-y-2">
                    {plateHistory.map((prevPlate) => (
                      <div
                        key={prevPlate.plateNumber + prevPlate.replacedAt}
                        className="p-3 rounded-lg bg-card border border-border flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className=" font-medium text-foreground px-2 py-0.5 rounded bg-background border border-border">
                            {prevPlate.plateNumber}
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {t('ARCHIVED')}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {t('Replaced:')} {new Date(prevPlate.replacedAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ASSIGNMENTS TAB */}
          {activeTab === 'assignments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground text-xs">{t('Member Assignment Log')}</h3>
                  <p className="text-[11px] text-muted-foreground">{t('Historical ownership and driver reallocations')}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAssignMember(vehicle)}
                  className="text-xs h-8 gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  {t('Assign / Reassign')}
                </Button>
              </div>

              {(!vehicle.assignmentHistory || vehicle.assignmentHistory.length === 0) ? (
                <div className="p-8 text-center bg-card rounded-xl border border-border text-muted-foreground">
                  <User className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-foreground font-medium">{t('No Assignment History')}</p>
                  <p className="text-xs mt-0.5">{t('This vehicle has not been formally assigned to specific members.')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vehicle.assignmentHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-xl bg-card border border-border flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-primary font-medium text-xs">
                          {item.memberName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground text-xs">{item.memberName}</span>
                            {item.memberCode && (
                              <span className="text-[11px] text-primary px-1.5 py-0.2 rounded bg-primary/10">
                                {item.memberCode}
                              </span>
                            )}
                            {idx === 0 && (
                              <span className="text-[11px] font-medium px-1.5 py-0.2 rounded bg-success/15 text-success">
                                {t('CURRENT')}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {t('Assigned by')} {item.assignedBy}
                          </p>
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-muted-foreground">
                        <div>{new Date(item.assignedAt).toLocaleDateString()}</div>
                        {item.unassignedAt && <div>{t('Ended:')} {new Date(item.unassignedAt).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AUDIT TAB */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground text-xs">{t('Vehicle Lifecycle Audit Trail')}</h3>
              <p className="text-[11px] text-muted-foreground">{t('Immutable event history of registrations, status shifts, and policy changes')}</p>

              {(!vehicle.auditHistory || vehicle.auditHistory.length === 0) ? (
                <div className="p-8 text-center bg-card rounded-xl border border-border text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-foreground font-medium">{t('No Audit Entries')}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {vehicle.auditHistory.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-card border border-border flex items-start gap-3"
                    >
                      <div className="w-7 h-7 rounded-md bg-muted border border-border flex items-center justify-center text-primary shrink-0 mt-0.5">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground text-xs">{t(log.action.replace('VEHICLE_', ''))}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-foreground mt-0.5">{log.description}</p>
                        {log.reason && (
                          <p className="text-[11px] text-warning mt-1 bg-warning/10 p-1.5 rounded">
                            {t('Reason:')} {log.reason}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {t('Actor:')} {log.actorName} {log.actorRole ? `(${t(log.actorRole)})` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {isSuspended ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => activateTenantVehicle(vehicle.id)}
                className="text-xs bg-success/15 text-success border-success/30 hover:bg-success/25"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {t('Reactivate Vehicle')}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSuspend(vehicle)}
                className="text-xs bg-warning/15 text-warning border-warning/30 hover:bg-warning/25"
              >
                <Ban className="w-3.5 h-3.5 mr-1" />
                {t('Suspend Access')}
              </Button>
            )}

            {isActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => deactivateTenantVehicle(vehicle.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                {t('Deactivate')}
              </Button>
            )}

            {vehicle.status !== 'ARCHIVED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => archiveTenantVehicle(vehicle.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <Archive className="w-3.5 h-3.5 mr-1" />
                {t('Archive')}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(vehicle)}
              className="text-xs"
            >
              <Edit2 className="w-3.5 h-3.5 mr-1" />
              {t('Edit Specs')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onClose}
              className="text-xs bg-muted border border-border text-foreground hover:bg-border"
            >
              {t('Close')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
