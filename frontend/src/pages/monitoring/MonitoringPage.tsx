import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
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

export const MonitoringPage: React.FC = () => {
  const {
    services,
    edgeDevices,
    cameras,
    gates,
    incidents,
    acknowledgeIncident,
    resolveIncident,
    monitoringSubTab,
    setMonitoringSubTab
  } = usePlatform();

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
              <Activity className="w-5 h-5 text-sky-400" /> Platform Infrastructure Observability
            </h2>
            <Badge variant="emerald" dot>
              ● ALL SYSTEMS NORMAL
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time infrastructure health, microservices SLA meters, edge processing telemetry, and active incident queue.
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <Tabs
        variant="pills"
        tabs={[
          { id: 'gates', label: 'Bản Đồ Barrier & Vị Trí Trạm (D3.js)', icon: DoorOpen, badge: 'Live' },
          { id: 'overview', label: 'System Health Services', icon: Server },
          { id: 'edge', label: 'Edge Devices Fleet', icon: Radio, badge: edgeDevices.length },
          { id: 'cameras', label: 'Cameras & Streams', icon: Video, badge: cameras.length },
          { id: 'incidents', label: 'Operational Incidents', icon: ShieldAlert, badge: openIncidents.length }
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
                    <span className="text-slate-500 block">Latency:</span>
                    <span className="font-mono font-bold text-indigo-300">{srv.responseTimeMs} ms</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">SLA Uptime:</span>
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
          <CardHeader title="Edge Hardware Processing Nodes" subtitle="YOLOv11 NPU acceleration boxes deployed across tenant gates" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Edge Device Name</th>
                  <th className="py-3.5 px-4">Organization</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">CPU Load</th>
                  <th className="py-3.5 px-4">RAM Load</th>
                  <th className="py-3.5 px-4 text-center">Cameras</th>
                  <th className="py-3.5 px-4 text-center">Events/Min</th>
                  <th className="py-3.5 px-4">Heartbeat</th>
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
          <CardHeader title="Camera Feeds & Video Stream Health" subtitle="RTSP video stream decoding and license plate recognition stats" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Camera Identifier</th>
                  <th className="py-3.5 px-4">Organization</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-center">FPS</th>
                  <th className="py-3.5 px-4 text-center">Frame Drop</th>
                  <th className="py-3.5 px-4 text-center">OCR Rate/Min</th>
                  <th className="py-3.5 px-4">Last Frame</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {cameras.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-100">{c.cameraName}</td>
                    <td className="py-3.5 px-4">{c.tenantName}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={c.status === 'ONLINE' ? 'emerald' : 'red'} dot>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-sky-400">{c.fps} FPS</td>
                    <td className="py-3.5 px-4 text-center font-mono">{c.frameDropPercent}%</td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-400 font-bold">{c.recognitionRatePerMin}</td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">{c.lastFrameTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4. GATES & BARRIER STATUS MAP TAB */}
      {monitoringSubTab === 'gates' && (
        <BarrierMapVisualization />
      )}

      {/* 5. INCIDENTS QUEUE TAB */}
      {monitoringSubTab === 'incidents' && (
        <Card className="p-5 space-y-4">
          <CardHeader title="Operational Incidents Queue" subtitle="Track and acknowledge infrastructure alerts requiring engineering response" />
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
                    Resource: {inc.resourceType} ({inc.resourceId}) • Started: {new Date(inc.startedAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {inc.status === 'OPEN' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => acknowledgeIncident(inc.id)}
                    >
                      Acknowledge
                    </Button>
                  )}

                  {inc.status !== 'RESOLVED' && (
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => setActionModal({ isOpen: true, incidentId: inc.id, note: '' })}
                    >
                      Resolve Incident
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
        title="Resolve Operational Incident"
        subtitle={`Incident Ref: ${resolveModal.incidentId}`}
      >
        <div className="space-y-4 text-xs">
          <Input
            label="Resolution Summary & Post-Mortem Note *"
            placeholder="e.g. Restarted RTSP stream proxy worker and re-initialized network socket."
            value={resolveModal.note}
            onChange={(e) => setActionModal((prev) => ({ ...prev, note: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setActionModal({ isOpen: false, incidentId: null, note: '' })}>
              Cancel
            </Button>
            <Button variant="success" size="sm" onClick={handleConfirmResolve}>
              Mark as Resolved
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
