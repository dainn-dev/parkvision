import React, { useState } from 'react';
import { TenantSite } from '../../types/tenant';
import { CameraHealth, GateHealth } from '../../types/platform';
import { usePlatform } from '../../context/PlatformContext';
import { CameraFormModal } from './CameraFormModal';
import { GateFormModal } from './GateFormModal';
import {
  X,
  Building2,
  MapPin,
  Camera,
  DoorOpen,
  HardDrive,
  Users,
  Car,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  Unlock,
  Lock,
  RefreshCw,
  Sliders,
  Phone,
  UserCheck,
  ShieldCheck,
  Zap,
  Plus,
  Pencil,
  Trash2
} from 'lucide-react';
import { Button, Badge } from '../ui';
import { useTranslation } from 'react-i18next';

interface SiteDetailDrawerProps {
  site: TenantSite | null;
  isOpen: boolean;
  onClose: () => void;
  /** Tab selected when the drawer opens (e.g. 'cameras' from the Location page). */
  initialTab?: 'overview' | 'lanes_gates' | 'cameras' | 'edge_nodes';
}

/** Strip embedded userinfo (rtsp://user:pass@host) before display. */
const maskStreamUrl = (u?: string): string =>
  (u ?? '').replace(/^(\w+:\/\/)[^@/]*@/, '$1•••@');

export const SiteDetailDrawer: React.FC<SiteDetailDrawerProps> = ({ site, isOpen, onClose, initialTab = 'overview' }) => {
  const { triggerGateCommand, addToast, cameras, gates, tenantLanes, deleteTenantCamera } = usePlatform();
  const { t } = useTranslation('tenant');
  const [activeTab, setActiveTab] = useState<'overview' | 'lanes_gates' | 'cameras' | 'edge_nodes'>(initialTab);
  const [gateActionStatus, setGateActionStatus] = useState<{ [key: string]: boolean }>({});
  const [cameraModal, setCameraModal] = useState<{ open: boolean; camera: CameraHealth | null }>({
    open: false,
    camera: null,
  });
  const [gateModal, setGateModal] = useState<{ open: boolean; gate: GateHealth | null }>({
    open: false,
    gate: null,
  });

  if (!isOpen || !site) return null;

  const siteCams = cameras.filter((c) => c.siteId === site.id);
  const siteGates = gates.filter((g) => g.siteId === site.id);

  const handleGateOverride = (gateName: string, action: 'OPEN' | 'CLOSE' | 'LOCK') => {
    setGateActionStatus((prev) => ({ ...prev, [gateName]: true }));
    triggerGateCommand(gateName, action);
    setTimeout(() => {
      setGateActionStatus((prev) => ({ ...prev, [gateName]: false }));
    }, 1200);
  };

  const occupancyPercent = site.capacity ? Math.round(((site.currentOccupancy || 0) / site.capacity) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-[330ms]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl bg-background border-l border-border h-full flex flex-col z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-card/80 sticky top-0 z-20 ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center font-medium">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-medium text-foreground tracking-tight">{site.name}</h3>
                <span className=" text-xs px-2 py-0.5 rounded bg-muted border border-border text-primary font-medium">
                  {site.code}
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  site.status === 'HEALTHY'
                    ? 'bg-success/15 text-success border border-success/30'
                    : site.status === 'WARNING'
                    ? 'bg-warning/15 text-warning border border-warning/30'
                    : 'bg-destructive/15 text-destructive border border-destructive/30'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {t(site.status)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> {site.address}
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
        <div className="px-5 border-b border-border flex gap-2 bg-card/40 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('Site Overview')}
          </button>
          <button
            onClick={() => setActiveTab('lanes_gates')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'lanes_gates'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            {t('Lanes & Gates')} ({site.gateCount})
          </button>
          <button
            onClick={() => setActiveTab('cameras')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cameras'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            {t('ANPR Cameras')} ({siteCams.length})
          </button>
          <button
            onClick={() => setActiveTab('edge_nodes')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'edge_nodes'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            {t('Edge Gateways')} ({site.edgeDeviceCount})
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 space-y-6 flex-1 text-xs">
          {activeTab === 'overview' && (
            <>
              {/* Site KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground text-[11px] block">{t("Today's Access")}</span>
                  <span className="text-xl font-medium text-foreground mt-1 block">
                    {site.todayAccessCount.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-success font-medium mt-0.5 flex items-center gap-1">
                    ↑ {t('Active sync')}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground text-[11px] block">{t('Active Vehicles')}</span>
                  <span className="text-xl font-medium text-primary mt-1 block">
                    {site.vehicleCount}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">{t('Enrolled plates')}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground text-[11px] block">{t('Cameras Online')}</span>
                  <span className="text-xl font-medium text-foreground mt-1 block">
                    {site.onlineCameraCount} / {site.cameraCount}
                  </span>
                  <span className={`text-[11px] font-medium mt-0.5 block ${
                    site.onlineCameraCount === site.cameraCount ? 'text-success' : 'text-destructive'
                  }`}>
                    {site.onlineCameraCount === site.cameraCount ? `● 100% ${t('Online')}` : `⚠ ${site.cameraCount - site.onlineCameraCount} ${t('Offline')}`}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground text-[11px] block">{t('Gates Online')}</span>
                  <span className="text-xl font-medium text-foreground mt-1 block">
                    {site.onlineGateCount} / {site.gateCount}
                  </span>
                  <span className="text-[11px] text-success font-medium mt-0.5 block">
                    ● {t('Barrier relays ok')}
                  </span>
                </div>
              </div>

              {/* Occupancy Progress Bar */}
              {site.capacity && (
                <div className="p-4 rounded-xl bg-card border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-primary" />
                      {t('Real-time Facility Occupancy')}
                    </span>
                    <span className="text-foreground font-medium">
                      {t('{{current}} / {{capacity}} bays ({{percent}}%)', { current: site.currentOccupancy, capacity: site.capacity, percent: occupancyPercent })}
                    </span>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-background overflow-hidden border border-border">
                    <div
                      className={`h-full rounded-full transition-colors duration-500 ${
                        occupancyPercent > 85
                          ? 'bg-destructive'
                          : occupancyPercent > 65
                          ? 'bg-warning'
                          : 'bg-success'
                      }`}
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>{t('Available bays: {{count}}', { count: site.capacity - (site.currentOccupancy || 0) })}</span>
                    <span>{t('Schedule:')} {site.operatingHours}</span>
                  </div>
                </div>
              )}

              {/* Facility Details */}
              <div className="p-4 rounded-xl bg-card border border-border space-y-3">
                <h4 className="text-foreground font-medium border-b border-border/60 pb-2">
                  {t('Operations & Facility Profile')}
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11px] text-muted-foreground font-medium">{t('Operating Schedule')}</span>
                    <p className="text-foreground font-medium mt-0.5">{site.operatingHours}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-medium">{t('Lanes Configured')}</span>
                    <p className="text-foreground font-medium mt-0.5">{site.lanesCount} {t('Inbound/Outbound Lanes')}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-medium">{t('Site Manager')}</span>
                    <p className="text-foreground font-medium mt-0.5">{site.managerName || 'Le Hoang Nam'}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground font-medium">{t('Contact Phone')}</span>
                    <p className="text-foreground font-medium mt-0.5">{site.managerPhone || '+84 90 311 2233'}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[11px] text-muted-foreground font-medium">{t('Description / Notes')}</span>
                  <p className="text-muted-foreground mt-1 text-xs">{site.description}</p>
                </div>
              </div>
            </>
          )}

          {activeTab === 'lanes_gates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-foreground font-medium text-xs">{t('Barrier Gates & Relay Telemetry')}</h4>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{t('Protocol: MQTT / Modbus TCP')}</span>
                  <button
                    onClick={() => setGateModal({ open: true, gate: null })}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors cursor-pointer text-[11px] font-medium"
                  >
                    + {t('Add Gate')}
                  </button>
                </div>
              </div>

              {siteGates.map((gate) => {
                const isOffline = gate.status !== 'ONLINE';
                const isOperating = gateActionStatus[gate.id];
                const lane = tenantLanes.find((l) => l.id === gate.laneId);
                const stateLabel = gate.rawStatus ? gate.rawStatus.toUpperCase() : '—';

                return (
                  <div key={gate.id} className="p-4 rounded-xl bg-card border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isOffline ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'
                        }`}>
                          <DoorOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-foreground font-medium text-xs">{gate.gateName}</span>
                          <span className="text-[11px] text-muted-foreground block">
                            {lane ? `${lane.direction === 'exit' ? t('Outbound Exit Lane') : t('Inbound Entry Lane')} · ` : ''}{t('Automatic Barrier')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded ${
                          isOffline ? 'bg-destructive/20 text-destructive' : 'bg-success/20 text-success'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {isOffline ? gate.status : t('ONLINE / ARMED')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px]">
                      <span className="text-muted-foreground">{t('Relay Latency:')} {isOffline ? '--' : `${Math.round(gate.averageLatencyMs)}ms`} · {t('State:')} {stateLabel}</span>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={isOperating}
                          onClick={() => handleGateOverride(gate.id, 'OPEN')}
                          className="text-xs bg-success/10 text-success hover:bg-success/20 border-success/30 gap-1"
                        >
                          <Unlock className="w-3 h-3" />
                          {t('Open Barrier')}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={isOperating}
                          onClick={() => handleGateOverride(gate.id, 'LOCK')}
                          className="text-xs text-destructive hover:bg-destructive/20 border-destructive/30 gap-1"
                        >
                          <Lock className="w-3 h-3" />
                          {t('Lock')}
                        </Button>

                        <button
                          onClick={() => setGateModal({ open: true, gate })}
                          title={t('Edit gate')}
                          className="w-7 h-7 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {siteGates.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  {t('No barrier gates bound to this site yet.')}
                </p>
              )}
            </div>
          )}

          {activeTab === 'cameras' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-foreground font-medium text-xs">{t('ANPR Video Feeds & OCR Sensors')}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCameraModal({ open: true, camera: null })}
                  className="text-xs gap-1 text-primary border-primary/40 hover:bg-primary/10"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('Add Camera')}
                </Button>
              </div>

              {siteCams.length === 0 ? (
                <div className="p-6 rounded-xl bg-card border border-dashed border-border text-center space-y-2">
                  <Camera className="w-6 h-6 mx-auto text-muted-foreground opacity-60" />
                  <p className="text-muted-foreground text-xs">
                    {t('No cameras registered — use')} <span className="text-primary">{t('Add Camera')}</span> {t('to register the first ANPR feed.')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {siteCams.map((cam) => {
                    const laneName = cam.laneId
                      ? tenantLanes.find((l) => l.id === cam.laneId)?.name
                      : undefined;
                    const tileLabel =
                      cam.status === 'ONLINE'
                        ? t('STREAM REGISTERED')
                        : cam.status === 'DEGRADED'
                          ? t('AWAITING EDGE')
                          : t('DISABLED');
                    const tileCls =
                      cam.status === 'ONLINE'
                        ? 'text-success'
                        : cam.status === 'DEGRADED'
                          ? 'text-warning'
                          : 'text-destructive';

                    return (
                      <div key={cam.id} className="p-3 rounded-xl bg-card border border-border space-y-2">
                        <div className="relative rounded-lg bg-background border border-border h-24 flex items-center justify-center overflow-hidden">
                          <div className={`text-center space-y-1 ${tileCls}`}>
                            {cam.status === 'OFFLINE' ? (
                              <AlertTriangle className="w-5 h-5 mx-auto" />
                            ) : (
                              <Camera className="w-6 h-6 mx-auto text-primary opacity-70" />
                            )}
                            <span className="text-[11px] block">{tileLabel}</span>
                          </div>

                          <div className="absolute top-1.5 left-2 text-[11px] text-foreground bg-black/60 px-1.5 py-0.5 rounded">
                            {cam.code ?? cam.cameraName}
                          </div>
                          <div className="absolute top-1.5 right-2 text-[11px] text-muted-foreground bg-black/60 px-1.5 py-0.5 rounded">
                            {cam.purpose === 'overview'
                              ? t('OVERVIEW')
                              : cam.purpose === 'monitor'
                                ? t('MONITOR')
                                : t('PLATE')}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <div className="min-w-0">
                            <span className="text-foreground font-medium block truncate">{cam.cameraName}</span>
                            <span className="text-muted-foreground text-[11px] block truncate">
                              {maskStreamUrl(cam.streamUrl) || '—'}
                              {laneName ? ` · ${laneName}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setCameraModal({ open: true, camera: cam })}
                              className="w-6 h-6 rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer"
                              title={t('Edit camera')}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(t('Delete camera {{name}}?', { name: cam.cameraName }))) {
                                  deleteTenantCamera(cam.id);
                                }
                              }}
                              className="w-6 h-6 rounded-md bg-muted border border-border text-muted-foreground hover:text-destructive flex items-center justify-center cursor-pointer"
                              title={t('Delete camera')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'edge_nodes' && (
            <div className="space-y-4">
              <h4 className="text-foreground font-medium text-xs">{t('Edge AI Inference Compute Nodes')}</h4>
              
              {Array.from({ length: site.edgeDeviceCount }).map((_, idx) => {
                const nodeId = `EDGE-${site.code}-0${idx + 1}`;
                const isHighCpu = site.name.includes('Warehouse') && nodeId.includes('03');

                return (
                  <div key={idx} className="p-4 rounded-xl bg-card border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-foreground font-medium text-xs">{nodeId}</span>
                          <span className="text-[11px] text-muted-foreground block">NVIDIA Jetson Orin 64GB · Docker v26.1</span>
                        </div>
                      </div>

                      <span className={`text-[11px] px-2 py-0.5 rounded ${
                        isHighCpu ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                      }`}>
                        {isHighCpu ? t('HIGH LOAD') : t('ONLINE')}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                      <div className="p-2 rounded bg-background border border-border">
                        <span className="text-muted-foreground block text-[11px]">{t('CPU Load')}</span>
                        <span className={` font-medium ${isHighCpu ? 'text-destructive' : 'text-foreground'}`}>
                          {isHighCpu ? '91%' : '34%'}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-background border border-border">
                        <span className="text-muted-foreground block text-[11px]">GPU / NPU</span>
                        <span className=" font-medium text-foreground">48%</span>
                      </div>
                      <div className="p-2 rounded bg-background border border-border">
                        <span className="text-muted-foreground block text-[11px]">{t('Temp')}</span>
                        <span className=" font-medium text-foreground">46°C</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card/90 flex items-center justify-between sticky bottom-0 z-20">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            {t('Close Panel')}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              addToast({
                type: 'success',
                title: t('Diagnostics Dispatched'),
                description: t('Running remote heartbeat & sensor self-test on {{name}}.', { name: site.name })
              });
            }}
            className="text-xs bg-primary hover:bg-primary/90 text-[#fff] font-medium gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            {t('Run Site Self-Test')}
          </Button>
        </div>
      </div>

      {/* Camera create/edit modal */}
      <CameraFormModal
        site={site}
        camera={cameraModal.camera}
        isOpen={cameraModal.open}
        onClose={() => setCameraModal({ open: false, camera: null })}
      />

      {/* Gate create/edit modal */}
      <GateFormModal
        site={site}
        gate={gateModal.gate}
        isOpen={gateModal.open}
        onClose={() => setGateModal({ open: false, gate: null })}
      />
    </div>
  );
};
