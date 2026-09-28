import React, { useMemo, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Server,
  Plus,
  Search,
  Edit2,
  Trash2,
  RotateCcw,
  PowerOff,
  RefreshCw,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Button, Input, Pagination } from '../../components/ui';
import { TenantEdgeDevice } from '../../types/tenant';
import { RegisterDeviceModal } from '../../components/tenant/devices/RegisterDeviceModal';
import { EditDeviceModal } from '../../components/tenant/devices/EditDeviceModal';
import {
  RebootDeviceDialog,
  DecommissionDeviceDialog,
  ReactivateDeviceDialog,
  DeleteDeviceDialog
} from '../../components/tenant/devices/DeviceActionDialogs';

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  ONLINE: { dot: 'bg-[#3fb950]', text: 'text-[#3fb950]', bg: 'bg-[#238636]/10 border-[#238636]/30' },
  OFFLINE: { dot: 'bg-[#f85149]', text: 'text-[#f85149]', bg: 'bg-[#f85149]/10 border-[#f85149]/30' },
  DEGRADED: { dot: 'bg-[#e3b341]', text: 'text-[#e3b341]', bg: 'bg-[#d29922]/10 border-[#d29922]/30' },
  PROVISIONING: { dot: 'bg-[#58a6ff]', text: 'text-[#58a6ff]', bg: 'bg-[#58a6ff]/10 border-[#58a6ff]/30' },
  DECOMMISSIONED: { dot: 'bg-[#8b949e]', text: 'text-[#8b949e]', bg: 'bg-[#21262d]/50 border-[#30363d]' }
};

const timeAgo = (iso?: string): string => {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const UsageBar: React.FC<{ label: string; value: number }> = ({ label, value }) => {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 90 ? 'bg-[#f85149]' : pct >= 70 ? 'bg-[#e3b341]' : 'bg-[#3fb950]';
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct.toFixed(0)}%`}>
      <span className="text-[9px] text-[#8b949e] uppercase w-6">{label}</span>
      <div className="w-12 h-1.5 rounded-full bg-[#21262d] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-[#c9d1d9] w-8">{pct.toFixed(0)}%</span>
    </div>
  );
};

export const TenantEdgeDevicesPage: React.FC = () => {
  const { tenantDevices, tenantSites } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantEdgeDevice | null>(null);
  const [rebootTarget, setRebootTarget] = useState<TenantEdgeDevice | null>(null);
  const [decommissionTarget, setDecommissionTarget] = useState<TenantEdgeDevice | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<TenantEdgeDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantEdgeDevice | null>(null);

  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tenantDevices.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (siteFilter !== 'ALL' && d.siteId !== siteFilter) return false;
      if (!q) return true;
      return [d.name, d.deviceSerial, d.mac, d.ipAddress, d.mqttClientId, d.siteName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [tenantDevices, searchQuery, statusFilter, siteFilter]);

  const metrics = useMemo(() => ({
    total: tenantDevices.length,
    online: tenantDevices.filter((d) => d.status === 'ONLINE').length,
    offline: tenantDevices.filter((d) => d.status === 'OFFLINE').length,
    decommissioned: tenantDevices.filter((d) => d.status === 'DECOMMISSIONED').length
  }), [tenantDevices]);

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize));
  const paginatedDevices = filteredDevices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Server className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Edge Device Management
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
              {tenantDevices.length} Devices
            </span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Register, monitor, reboot, and decommission edge gateways powering your barrier gates
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="primary"
            onClick={() => setIsRegisterOpen(true)}
            className="text-xs h-9 bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Register Device
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Total Devices</span>
            <div className="text-xl font-bold text-white mt-1">{metrics.total}</div>
            <span className="text-[10px] text-[#8b949e]">Across all sites</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Online</span>
            <div className="text-xl font-bold text-[#3fb950] mt-1">{metrics.online}</div>
            <span className="text-[10px] text-[#8b949e]">Heartbeat active</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] flex items-center justify-center">
            <Wifi className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Offline</span>
            <div className="text-xl font-bold text-[#f85149] mt-1">{metrics.offline}</div>
            <span className="text-[10px] text-[#8b949e]">Heartbeat stale</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] flex items-center justify-center">
            <WifiOff className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Decommissioned</span>
            <div className="text-xl font-bold text-[#8b949e] mt-1">{metrics.decommissioned}</div>
            <span className="text-[10px] text-[#8b949e]">Retired devices</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#21262d] border border-[#30363d] text-[#8b949e] flex items-center justify-center">
            <PowerOff className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Toolbar */}
      <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search by name, serial, MAC, IP, MQTT client, or site..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 bg-[#0d0e12] border-[#30363d] text-white text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">Status: All</option>
            <option value="ONLINE">Online</option>
            <option value="OFFLINE">Offline</option>
            <option value="DEGRADED">Degraded</option>
            <option value="PROVISIONING">Provisioning</option>
            <option value="DECOMMISSIONED">Decommissioned</option>
          </select>

          <select
            value={siteFilter}
            onChange={(e) => {
              setSiteFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">Site: All</option>
            {tenantSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {(searchQuery || statusFilter !== 'ALL' || siteFilter !== 'ALL') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setSiteFilter('ALL');
                setCurrentPage(1);
              }}
              className="text-[11px] h-8 text-[#8b949e] hover:text-white"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
              <tr>
                <th className="py-3 px-4">Device</th>
                <th className="py-3 px-4">Site</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Resource Usage</th>
                <th className="py-3 px-4">Latency</th>
                <th className="py-3 px-4">Firmware</th>
                <th className="py-3 px-4">Last Heartbeat</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]/60 font-medium">
              {paginatedDevices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#8b949e]">
                    <Server className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                    <p className="font-semibold text-white">No edge devices found</p>
                    <p className="text-xs mt-1">Register a device or reset your filters</p>
                  </td>
                </tr>
              ) : (
                paginatedDevices.map((device) => {
                  const st = STATUS_STYLES[device.status] ?? STATUS_STYLES.OFFLINE;
                  const isDecommissioned = device.status === 'DECOMMISSIONED';

                  return (
                    <tr key={device.id} className="hover:bg-[#21262d]/60 transition-colors">
                      {/* Device */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#58a6ff] flex items-center justify-center shrink-0">
                            <Server className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs">{device.name}</div>
                            <div className="text-[10px] text-[#8b949e] font-mono mt-0.5">
                              {device.deviceSerial || device.deviceKey}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Site */}
                      <td className="py-3.5 px-4 text-[#c9d1d9]">{device.siteName || '—'}</td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {device.status}
                        </span>
                      </td>

                      {/* Resource Usage */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <UsageBar label="CPU" value={device.cpuUsagePct} />
                          <UsageBar label="RAM" value={device.ramUsagePct} />
                          <UsageBar label="DSK" value={device.storageUsagePct} />
                        </div>
                      </td>

                      {/* Latency */}
                      <td className="py-3.5 px-4 font-mono text-[#c9d1d9]">
                        {device.latencyMs != null ? `${device.latencyMs} ms` : '—'}
                      </td>

                      {/* Firmware */}
                      <td className="py-3.5 px-4 font-mono text-[#c9d1d9]">
                        {device.firmwareVersion || '—'}
                      </td>

                      {/* Heartbeat */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-[#c9d1d9]">
                          <Activity className="w-3.5 h-3.5 text-[#8b949e]" />
                          <span className="text-[11px]">{timeAgo(device.lastHeartbeatAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Edit device"
                            onClick={() => setEditTarget(device)}
                            className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!isDecommissioned && (
                            <>
                              <button
                                title="Reboot device"
                                onClick={() => setRebootTarget(device)}
                                className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#e3b341] hover:bg-[#d29922]/10 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                title="Decommission device"
                                onClick={() => setDecommissionTarget(device)}
                                className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#e3b341] hover:bg-[#d29922]/10 transition-colors cursor-pointer"
                              >
                                <PowerOff className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {isDecommissioned && (
                            <>
                              <button
                                title="Reactivate device"
                                onClick={() => setReactivateTarget(device)}
                                className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#3fb950] hover:bg-[#238636]/10 transition-colors cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                title="Delete permanently"
                                onClick={() => setDeleteTarget(device)}
                                className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredDevices.length}
          pageSize={pageSize}
        />
      </div>

      {/* Modals & Dialogs */}
      <RegisterDeviceModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} />
      <EditDeviceModal device={editTarget} isOpen={!!editTarget} onClose={() => setEditTarget(null)} />
      <RebootDeviceDialog device={rebootTarget} isOpen={!!rebootTarget} onClose={() => setRebootTarget(null)} />
      <DecommissionDeviceDialog device={decommissionTarget} isOpen={!!decommissionTarget} onClose={() => setDecommissionTarget(null)} />
      <ReactivateDeviceDialog device={reactivateTarget} isOpen={!!reactivateTarget} onClose={() => setReactivateTarget(null)} />
      <DeleteDeviceDialog device={deleteTarget} isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
};
