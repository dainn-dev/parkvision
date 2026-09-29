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

export const MonitoringPage: React.FC = () => {
  const { t } = useTranslation('monitoring');
  const {
    services,
    edgeDevices,
    cameras,
    gates,
    incidents,
    acknowledgeIncident,
    resolveIncident,
    bulkResolveIncidents,
    monitoringSubTab,
    setMonitoringSubTab,
    userType,
    tenantSites,
    addToast
  } = usePlatform();

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

  const openIncidents = incidents.filter((i) => i.status !== 'RESOLVED');

  const handleConfirmResolve = () => {
    if (resolveModal.incidentId) {
      resolveIncident(resolveModal.incidentId, resolveModal.note);
    }
    setActionModal({ isOpen: false, incidentId: null, note: '' });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-400" /> {t('Platform Infrastructure Observability')}
            </h2>
            <Badge variant="emerald" dot>
              {t('● ALL SYSTEMS NORMAL')}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
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
          { id: 'edge', label: t('Edge Devices Fleet'), icon: Radio, badge: edgeDevices.length },
          { id: 'cameras', label: t('Cameras & Streams'), icon: Video, badge: cameras.length },
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
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-white">{srv.name}</h3>
                  </div>
                  <Badge variant="emerald" size="sm">
                    {srv.status}
                  </Badge>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">{t('Latency:')}</span>
                    <span className="font-mono font-bold text-indigo-300">{srv.responseTimeMs} ms</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">{t('SLA Uptime:')}</span>
                    <span className="font-mono font-bold text-emerald-400">{srv.uptimePercent}%</span>
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-slate-400 font-mono">
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
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
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
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {edgeDevices.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-300">
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
                    <td className="py-3.5 px-4 font-mono">
                      <div className="flex items-center gap-2">
                        <span className="w-12 text-right">{e.cpuPercent}%</span>
                        <div className="w-16 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full ${e.cpuPercent > 80 ? 'bg-red-500' : 'bg-indigo-500'}`}
                            style={{ width: `${e.cpuPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono">{e.memoryPercent}%</td>
                    <td className="py-3.5 px-4 text-center font-mono font-semibold">{e.connectedCameras}</td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-400 font-bold">{e.eventsPerMin}</td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">{e.lastHeartbeat}</td>
                    <td className="py-3.5 px-4 text-right">
                      {userType === 'platform_admin' && (
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
          {cameras.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Video className="w-6 h-6 mx-auto text-slate-500" />
              <p className="text-xs text-slate-500">
                {t('No cameras registered. Manage cameras per site from the tenant Site panel.')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">{t('Camera')}</th>
                    <th className="py-3.5 px-4">{t('Organization')}</th>
                    <th className="py-3.5 px-4">{t('Site')}</th>
                    <th className="py-3.5 px-4 text-center">{t('Purpose')}</th>
                    <th className="py-3.5 px-4">{t('Stream URL')}</th>
                    <th className="py-3.5 px-4">{t('Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {cameras.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-100 block">{c.cameraName}</span>
                        {c.code && (
                          <span className="font-mono text-[10px] text-sky-400">{c.code}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{c.tenantName}</td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {tenantSites.find((s) => s.id === c.siteId)?.name ?? '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <Badge variant={c.purpose === 'overview' ? 'slate' : 'blue'} size="sm">
                          {c.purpose === 'overview' ? 'OVERVIEW' : 'PLATE'}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 max-w-[220px] truncate">
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
            {incidents.map((inc) => (
              <div key={inc.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={inc.severity === 'CRITICAL' ? 'red' : inc.severity === 'HIGH' ? 'red' : 'amber'} size="sm">
                      {inc.severity}
                    </Badge>
                    <Badge variant={inc.status === 'OPEN' ? 'red' : inc.status === 'ACKNOWLEDGED' ? 'amber' : 'emerald'} size="sm">
                      {inc.status}
                    </Badge>
                    <span className="text-xs font-bold text-white">{inc.title}</span>
                  </div>
                  <p className="text-xs text-slate-400">{inc.description}</p>
                  <div className="text-[10px] text-slate-500 font-mono">
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
