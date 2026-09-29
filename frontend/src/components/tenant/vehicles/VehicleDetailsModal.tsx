import React, { useState } from 'react';
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
    archiveTenantVehicle
  } = usePlatform();
  const { t } = useTranslation('tenant');

  const [activeTab, setActiveTab] = useState<'overview' | 'plates' | 'assignments' | 'audit'>('overview');

  if (!isOpen || !vehicle) return null;

  const isSuspended = vehicle.status === 'SUSPENDED';
  const isActive = vehicle.status === 'ACTIVE';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#30363d] flex items-center justify-between bg-[#161b22] shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {vehicle.name}
                </h2>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#0d0e12] border border-[#30363d] text-white">
                  {vehicle.currentPlate.number}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    vehicle.status === 'ACTIVE'
                      ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                      : vehicle.status === 'SUSPENDED'
                      ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                      : vehicle.status === 'ARCHIVED'
                      ? 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                      : 'bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30'
                  }`}
                >
                  {vehicle.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {t(vehicle.status)}
                </span>
              </div>
              <p className="text-xs text-[#8b949e] mt-0.5">
                {vehicle.type} · {vehicle.color || t('No color')} · {vehicle.year || t('Year N/A')} · {t('Enrolled')} {new Date(vehicle.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-[#30363d] bg-[#161b22]/50 flex gap-6 text-xs shrink-0">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {t('Overview & Specs')}
          </button>
          <button
            onClick={() => setActiveTab('plates')}
            className={`py-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'plates'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            {t('Plate History')} ({1 + (vehicle.previousPlates?.length || 0)})
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`py-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'assignments'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {t('Member Ownership')}
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-white'
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
                    ? 'bg-[#238636]/10 border-[#238636]/30 text-[#3fb950]'
                    : 'bg-[#da3633]/10 border-[#da3633]/30 text-[#f85149]'
                }`}
              >
                {vehicle.accessStatus === 'ALLOWED' ? (
                  <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-white">
                    <span>{t('Gate Access Decision:')} {t(vehicle.accessStatus)}</span>
                  </div>
                  <p className="text-xs mt-1 text-[#c9d1d9]">
                    {vehicle.accessStatusReason ||
                      (vehicle.accessStatus === 'ALLOWED'
                        ? t('Vehicle is whitelisted for automated barrier access upon ANPR plate match.')
                        : t('Access is denied at edge barrier gates.'))}
                  </p>
                  {isSuspended && vehicle.suspendedReason && (
                    <div className="mt-2 text-xs font-mono bg-[#d29922]/10 border border-[#d29922]/30 text-[#e3b341] p-2 rounded-lg">
                      {t('Suspension Reason:')} {vehicle.suspendedReason}
                    </div>
                  )}
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider text-[#8b949e]">
                  {t('Vehicle Specifications')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <span className="text-[#8b949e] text-[11px] block">{t('Make & Model')}</span>
                    <span className="font-semibold text-white mt-0.5 block">{vehicle.make} {vehicle.model}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <span className="text-[#8b949e] text-[11px] block">{t('Vehicle Category')}</span>
                    <span className="font-semibold text-white mt-0.5 block">{vehicle.type}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <span className="text-[#8b949e] text-[11px] block">{t('Model Year')}</span>
                    <span className="font-semibold text-white mt-0.5 block">{vehicle.year || t('Not specified')}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <span className="text-[#8b949e] text-[11px] block">{t('Exterior Color')}</span>
                    <span className="font-semibold text-white mt-0.5 block">{vehicle.color || t('Not specified')}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <span className="text-[#8b949e] text-[11px] block">{t('VIN / Chassis No.')}</span>
                    <span className="font-mono text-white mt-0.5 block text-[11px]">
                      {vehicle.vin || 'N/A'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]/60">
                    <span className="text-[#8b949e] text-[11px] block">{t('Applied Rules')}</span>
                    <span className="font-medium text-[#58a6ff] mt-0.5 block truncate">
                      {vehicle.appliedRules?.join(', ') || t('Standard 24/7 Access')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Member Assignment Card */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider text-[#8b949e]">
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
                  <div className="flex items-center gap-3.5 p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                    <div className="w-9 h-9 rounded-full bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center font-bold text-xs">
                      {vehicle.member.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{vehicle.member.name}</span>
                        <span className="font-mono text-[10px] text-[#58a6ff] px-1.5 py-0.2 rounded bg-[#58a6ff]/10">
                          {vehicle.member.code}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#21262d] text-[#c9d1d9]">
                          {vehicle.member.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8b949e] mt-0.5">
                        {vehicle.member.email} {vehicle.member.department ? `· ${vehicle.member.department}` : ''}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-[#0d0e12] border border-dashed border-[#30363d] text-center text-[#8b949e]">
                    <User className="w-6 h-6 mx-auto mb-1 text-[#8b949e]/50" />
                    <p className="text-white font-semibold text-xs">{t('Unassigned Pool / Fleet Vehicle')}</p>
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
                  <h3 className="font-bold text-white text-xs">{t('License Plates Registry')}</h3>
                  <p className="text-[11px] text-[#8b949e]">{t('Current active plate and historical replacement records')}</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onUpdatePlate(vehicle)}
                  className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 h-8"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('Replace / Update Plate')}
                </Button>
              </div>

              {/* Current Active Plate */}
              <div className="p-4 rounded-xl bg-[#161b22] border-2 border-[#58a6ff]/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-white px-3 py-1 rounded bg-[#0d0e12] border border-[#30363d] tracking-wider">
                      {vehicle.currentPlate.number}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                      {t('ACTIVE PLATE')}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#8b949e]">
                    {t('Valid From:')} {vehicle.currentPlate.validFrom}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-[#8b949e] pt-1">
                  <span>{t('Region:')} {vehicle.currentPlate.province || 'Ho Chi Minh City'} ({vehicle.currentPlate.country})</span>
                  <span>{t('Registered:')} {new Date(vehicle.currentPlate.registeredAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Previous Plates */}
              {vehicle.previousPlates && vehicle.previousPlates.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#8b949e] uppercase tracking-wider">{t('Previous Historical Plates')}</h4>
                  <div className="space-y-2">
                    {vehicle.previousPlates.map((prevPlate) => (
                      <div
                        key={prevPlate.id}
                        className="p-3 rounded-lg bg-[#161b22] border border-[#30363d] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-[#c9d1d9] px-2 py-0.5 rounded bg-[#0d0e12] border border-[#30363d]">
                            {prevPlate.number}
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
                            {prevPlate.status}
                          </span>
                          {prevPlate.notes && (
                            <span className="text-[11px] text-[#8b949e]">· {prevPlate.notes}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#8b949e]">
                          {prevPlate.validFrom} → {prevPlate.validTo || t('Replaced')}
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
                  <h3 className="font-bold text-white text-xs">{t('Member Assignment Log')}</h3>
                  <p className="text-[11px] text-[#8b949e]">{t('Historical ownership and driver reallocations')}</p>
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
                <div className="p-8 text-center bg-[#161b22] rounded-xl border border-[#30363d] text-[#8b949e]">
                  <User className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/40" />
                  <p className="text-white font-semibold">{t('No Assignment History')}</p>
                  <p className="text-xs mt-0.5">{t('This vehicle has not been formally assigned to specific members.')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vehicle.assignmentHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#58a6ff] font-bold text-xs">
                          {item.memberName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{item.memberName}</span>
                            {item.memberCode && (
                              <span className="text-[10px] font-mono text-[#58a6ff] px-1.5 py-0.2 rounded bg-[#58a6ff]/10">
                                {item.memberCode}
                              </span>
                            )}
                            {idx === 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#238636]/15 text-[#3fb950]">
                                {t('CURRENT')}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8b949e] mt-0.5">
                            {t('Assigned by')} {item.assignedBy}
                          </p>
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-[#8b949e]">
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
              <h3 className="font-bold text-white text-xs">{t('Vehicle Lifecycle Audit Trail')}</h3>
              <p className="text-[11px] text-[#8b949e]">{t('Immutable event history of registrations, status shifts, and policy changes')}</p>

              {(!vehicle.auditHistory || vehicle.auditHistory.length === 0) ? (
                <div className="p-8 text-center bg-[#161b22] rounded-xl border border-[#30363d] text-[#8b949e]">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/40" />
                  <p className="text-white font-semibold">{t('No Audit Entries')}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {vehicle.auditHistory.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-[#161b22] border border-[#30363d] flex items-start gap-3"
                    >
                      <div className="w-7 h-7 rounded-md bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#58a6ff] shrink-0 mt-0.5">
                        <Clock className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white text-xs">{t(log.action.replace('VEHICLE_', ''))}</span>
                          <span className="text-[10px] font-mono text-[#8b949e]">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-[#c9d1d9] mt-0.5">{log.description}</p>
                        {log.reason && (
                          <p className="text-[11px] text-[#e3b341] mt-1 bg-[#d29922]/10 p-1.5 rounded">
                            {t('Reason:')} {log.reason}
                          </p>
                        )}
                        <p className="text-[10px] text-[#8b949e] mt-1">
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
        <div className="px-6 py-4 border-t border-[#30363d] bg-[#161b22] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {isSuspended ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => activateTenantVehicle(vehicle.id)}
                className="text-xs bg-[#238636]/15 text-[#3fb950] border-[#238636]/30 hover:bg-[#238636]/25"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                {t('Reactivate Vehicle')}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSuspend(vehicle)}
                className="text-xs bg-[#d29922]/15 text-[#e3b341] border-[#d29922]/30 hover:bg-[#d29922]/25"
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
                className="text-xs text-[#8b949e] hover:text-[#f85149]"
              >
                {t('Deactivate')}
              </Button>
            )}

            {vehicle.status !== 'ARCHIVED' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => archiveTenantVehicle(vehicle.id)}
                className="text-xs text-[#8b949e] hover:text-[#f85149]"
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
              className="text-xs bg-[#21262d] border border-[#30363d] text-white hover:bg-[#30363d]"
            >
              {t('Close')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
