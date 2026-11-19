import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { platformApi } from '../../services/api';
import {
  Activity,
  Server,
  Radio,
  Video,
  DoorOpen,
  Layers,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Cpu,
  HardDrive
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Tabs,
  StatCard,
  Modal,
  Input,
  Select
} from '../../components/ui';
import { BarrierMapVisualization } from '../../components/monitoring/BarrierMapVisualization';
import { useTranslation } from 'react-i18next';
import { canManagePlatformOps } from '../../lib/permissions';

export const MonitoringPage: React.FC = () => {
  const { t } = useTranslation('monitoring');
  const {
    services,
    edgeDevices,
    cameras,
    gates,
    incidents,
    platformFleet,
    acknowledgeIncident,
    resolveIncident,
    bulkResolveIncidents,
    monitoringSubTab,
    setMonitoringSubTab,
    userType,
    tenantSites,
    addToast,
    currentUser
  } = usePlatform();
  // Edge reboot is super_admin/ops only (platform.py) — hidden for support.
  const canRebootEdge = userType === 'platform_admin' && canManagePlatformOps(currentUser.rawRole);

  const rebootEdge = (deviceId: string) => {
    platformApi
      .rebootEdgeDevice(deviceId)
      .then((r) =>
        addToast({ type: 'success', title: t('Reboot dispatched'), description: t('{{count}} command(s) queued', { count: r.commandIds.length }) })
      )
      .catch(() => addToast({ type: 'error', title: t('Reboot failed') }));
  };

  // Resolution modal
  const [resolveModal, setActionModal] = useState<{
    isOpen: boolean;
    incidentId: string | null;
    note: string;
  }>({
    isOpen: false,
    incidentId: null,
    note: ''
  });

  const degradedServices = services.filter((s) => s.status !== 'HEALTHY').length;
  const allSystemsNormal = services.length > 0 && degradedServices === 0;

  const fleetEdgeDevices = userType === 'platform_admin' ? platformFleet.edgeDevices : edgeDevices;
  const fleetCameras = userType === 'platform_admin' ? platformFleet.cameras : cameras;
  const fleetGates = userType === 'platform_admin' ? platformFleet.gates : gates;
  const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED');

  const handleConfirmResolve = () => {
    if (resolveModal.incidentId) {
      resolveIncident(resolveModal.incidentId, resolveModal.note);
    }
    setActionModal({ isOpen: false, incidentId: null, note: '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-[330ms]">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-medium text-foreground tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> {t('Platform Infrastructure Observability')}
            </h2>
            <Badge
              variant={services.length === 0 ? 'slate' : allSystemsNormal ? 'emerald' : 'red'}
              dot
            >
              {services.length === 0
                ? t('● HEALTH DATA UNAVAILABLE')
                : allSystemsNormal
                  ? t('● ALL SYSTEMS NORMAL')
                  : t('● {{count}} SERVICE(S) DEGRADED', { count: degradedServices })}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Real-time infrastructure health, microservices SLA meters, edge processing telemetry, and active incident queue.')}
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <Tabs
        variant="pills"
        tabs={[
          { id: 'gates', label: t('Barrier Map & Station Locations (D3.js)'), icon: DoorOpen, badge: 'Live' },
          { id: 'overview', label: t('System Health Services'), icon: Server },
          { id: 'edge', label: t('Edge Devices Fleet'), icon: Radio, badge: fleetEdgeDevices.length },
          { id: 'cameras', label: t('Cameras & Streams'), icon: Video, badge: fleetCameras.length },
          { id: 'incidents', label: t('Operational Incidents'), icon: ShieldAlert, badge: openIncidents.length }
        ]}
        activeTab={monitoringSubTab}
        onChange={(id) => setMonitoringSubTab(id as any)}
      />

      {/* 1. SYSTEM HEALTH SERVICES TAB */}
      {monitoringSubTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((srv) => (
              <Card key={srv.id} className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        srv.status === 'HEALTHY'
                          ? 'bg-success '
                          : srv.status === 'DEGRADED'
                            ? 'bg-warning'
                            : 'bg-destructive'
                      }`}
                    />
                    <h3 className="text-sm font-medium text-foreground">{srv.name}</h3>
                  </div>
                  <Badge
                    variant={srv.status === 'HEALTHY' ? 'emerald' : srv.status === 'DEGRADED' ? 'amber' : 'red'}
                    size="sm"
                  >
                    {srv.status}
                  </Badge>
                </div>

                <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block">{t('Latency:')}</span>
                    <span className=" font-medium text-primary">{srv.responseTimeMs} ms</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{t('SLA Uptime:')}</span>
                    <span className=" font-medium text-success">
                      {srv.uptimePercent != null ? `${srv.uptimePercent}%` : t('uptime n/a')}
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-muted-foreground ">
                  {srv.details}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 2. EDGE DEVICES FLEET TAB */}
      {monitoringSubTab === 'edge' && (
        <Card className="overflow-hidden">
          <CardHeader title={t('Edge Hardware Processing Nodes')} subtitle={t('YOLOv11 NPU acceleration boxes deployed across tenant gates')} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="py-3.5 px-4">{t('Edge Device Name')}</th>
                  <th className="py-3.5 px-4">{t('Organization')}</th>
                  <th className="py-3.5 px-4">{t('Status')}</th>
                  <th className="py-3.5 px-4">{t('CPU Load')}</th>
                  <th className="py-3.5 px-4">{t('RAM Load')}</th>
                  <th className="py-3.5 px-4 text-center">{t('Cameras')}</th>
                  <th className="py-3.5 px-4 text-center">{t('Events/Min')}</th>
                  <th className="py-3.5 px-4">{t('Heartbeat')}</th>
                  <th className="py-3.5 px-4 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 text-foreground">
                {fleetEdgeDevices.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">{t('No edge devices registered.')}</td></tr>
                ) : fleetEdgeDevices.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-primary">
                      {e.deviceName}
                    </td>
                    <td className="py-3.5 px-4">{e.tenantName}</td>
                    <td className="py-3.5 px-4">
                      <Badge
                        variant={e.status === 'ONLINE' ? 'emerald' : e.status === 'DEGRADED' ? 'amber' : 'red'}
                        dot
                      >
                        {e.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 ">
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-right">{e.cpuPercent}%</span>
                        <div className="w-16 bg-background h-2 rounded-full overflow-hidden border border-border">
                          <div
                            className={`h-full rounded-full ${e.cpuPercent > 80 ? 'bg-destructive' : 'bg-primary'}`}
                            style={{ width: `${e.cpuPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 ">{e.memoryPercent}%</td>
                    <td className="py-3.5 px-4 text-center font-medium">{e.connectedCameras}</td>
                    <td className="py-3.5 px-4 text-center text-success font-medium">{e.eventsPerMin}</td>
                    <td className="py-3.5 px-4 text-muted-foreground ">
                      {e.lastHeartbeat ? new Date(e.lastHeartbeat).toLocaleString() : t('Never')}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {canRebootEdge && (
                        <Button variant="outline" size="sm" onClick={() => rebootEdge(e.id)}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />
                          {t('Reboot')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 3. CAMERAS TAB */}
      {monitoringSubTab === 'cameras' && (
        <Card className="overflow-hidden">
          <CardHeader
            title={t('Registered ANPR Cameras')}
            subtitle={t('Camera endpoints and lane assignments. Live stream health requires edge telemetry (not yet available).')}
          />
          {fleetCameras.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Video className="w-6 h-6 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {t('No cameras registered. Manage cameras per site from the tenant Site panel.')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-background border-b border-border text-muted-foreground font-medium">
                  <tr>
                    <th className="py-3.5 px-4">{t('Camera')}</th>
                    <th className="py-3.5 px-4">{t('Organization')}</th>
                    <th className="py-3.5 px-4">{t('Site')}</th>
                    <th className="py-3.5 px-4 text-center">{t('Purpose')}</th>
                    <th className="py-3.5 px-4">{t('Stream URL')}</th>
                    <th className="py-3.5 px-4">{t('Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80 text-foreground">
                  {fleetCameras.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-foreground block">{c.cameraName}</span>
                        {c.code && (
                          <span className="font-mono text-[11px] text-primary">{c.code}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{c.tenantName}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {c.siteName ?? tenantSites.find((s) => s.id === c.siteId)?.name ?? '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={c.purpose === 'overview' ? 'slate' : c.purpose === 'monitor' ? 'blue' : 'blue'}
                          size="sm"
                        >
                          {c.purpose === 'overview' ? 'OVERVIEW' : c.purpose === 'monitor' ? 'MONITOR' : 'PLATE'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground max-w-[220px] truncate">
                        {(c.streamUrl ?? '').replace(/^(\w+:\/\/)[^@/]*@/, '$1•••@') || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={c.status === 'ONLINE' ? 'emerald' : c.status === 'DEGRADED' ? 'amber' : 'red'}
                          dot
                        >
                          {c.status === 'ONLINE' ? t('ACTIVE') : c.status === 'DEGRADED' ? t('PROVISIONING') : t('DISABLED')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 4. GATES & BARRIER STATUS MAP TAB */}
      {monitoringSubTab === 'gates' && (
        <BarrierMapVisualization />
      )}

      {/* 5. INCIDENTS QUEUE TAB */}
      {monitoringSubTab === 'incidents' && (
        <Card className="p-5 space-y-4">
          <CardHeader
            title={t('Operational Incidents Queue')}
            subtitle={t('Track and acknowledge infrastructure alerts requiring engineering response')}
            action={
              openIncidents.length > 0 ? (
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => bulkResolveIncidents(openIncidents.map((i) => i.id), 'resolved_bulk')}
                >
                  {t('Resolve all')} ({openIncidents.length})
                </Button>
              ) : undefined
            }
          />
          <div className="space-y-3">
            {incidents.length === 0 && (
              <div className="p-8 text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 mx-auto text-success" />
                <p className="text-xs text-muted-foreground">{t('No operational incidents recorded.')}</p>
              </div>
            )}
            {incidents.map((inc) => (
              <div key={inc.id} className="p-4 rounded-xl bg-background border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={inc.severity === 'CRITICAL' ? 'red' : inc.severity === 'HIGH' ? 'red' : 'amber'} size="sm">
                      {inc.severity}
                    </Badge>
                    <Badge variant={inc.status === 'OPEN' ? 'red' : inc.status === 'ACKNOWLEDGED' ? 'amber' : 'emerald'} size="sm">
                      {inc.status}
                    </Badge>
                    <span className="text-xs font-medium text-foreground">{inc.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{inc.description}</p>
                  <div className="text-[11px] text-muted-foreground ">
                    {t('Resource:')} {inc.resourceType} ({inc.resourceId}) • {t('Started:')} {new Date(inc.startedAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {inc.status === 'OPEN' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => acknowledgeIncident(inc.id)}
                    >
                      {t('Acknowledge')}
                    </Button>
                  )}

                  {inc.status !== 'RESOLVED' && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => setActionModal({ isOpen: true, incidentId: inc.id, note: '' })}
                    >
                      {t('Resolve Incident')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Incident Resolution Modal */}
      <Modal
        isOpen={resolveModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, incidentId: null, note: '' })}
        title={t('Resolve Operational Incident')}
        subtitle={t('Incident Ref: {{id}}', { id: resolveModal.incidentId })}
      >
        <div className="space-y-4 text-xs">
          <Input
            label={t('Resolution Summary & Post-Mortem Note *')}
            placeholder={t('e.g. Restarted RTSP stream proxy worker and re-initialized network socket.')}
            value={resolveModal.note}
            onChange={(e) => setActionModal((prev) => ({ ...prev, note: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setActionModal({ isOpen: false, incidentId: null, note: '' })}>
              {t('Cancel')}
            </Button>
            <Button variant="success" size="sm" onClick={handleConfirmResolve}>
              {t('Mark as Resolved')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
