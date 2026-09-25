import React, { useState } from 'react';
import { TenantSite } from '../../types/tenant';
import { usePlatform } from '../../context/PlatformContext';
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
  Zap
} from 'lucide-react';
import { Button, Badge } from '../ui';

interface SiteDetailDrawerProps {
  site: TenantSite | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SiteDetailDrawer: React.FC<SiteDetailDrawerProps> = ({ site, isOpen, onClose }) => {
  const { triggerGateCommand, addToast } = usePlatform();
  const [activeTab, setActiveTab] = useState<'overview' | 'lanes_gates' | 'cameras' | 'edge_nodes'>('overview');
  const [gateActionStatus, setGateActionStatus] = useState<{ [key: string]: boolean }>({});

  if (!isOpen || !site) return null;

  const handleGateOverride = (gateName: string, action: 'OPEN' | 'CLOSE' | 'LOCK') => {
    setGateActionStatus((prev) => ({ ...prev, [gateName]: true }));
    triggerGateCommand(gateName, action);
    setTimeout(() => {
      setGateActionStatus((prev) => ({ ...prev, [gateName]: false }));
    }, 1200);
  };

  const occupancyPercent = site.capacity ? Math.round(((site.currentOccupancy || 0) / site.capacity) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-2xl bg-[#0d0e12] border-l border-[#30363d] shadow-2xl h-full flex flex-col z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]/80 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white tracking-tight">{site.name}</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#58a6ff] font-bold">
                  {site.code}
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                  site.status === 'HEALTHY'
                    ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                    : site.status === 'WARNING'
                    ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                    : 'bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {site.status}
                </span>
              </div>
              <p className="text-xs text-[#8b949e] flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5 text-[#8b949e]" /> {site.address}
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
        <div className="px-5 border-b border-[#30363d] flex gap-2 bg-[#161b22]/40 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            Site Overview
          </button>
          <button
            onClick={() => setActiveTab('lanes_gates')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'lanes_gates'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            Lanes & Gates ({site.gateCount})
          </button>
          <button
            onClick={() => setActiveTab('cameras')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cameras'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            ANPR Cameras ({site.cameraCount})
          </button>
          <button
            onClick={() => setActiveTab('edge_nodes')}
            className={`py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'edge_nodes'
                ? 'border-[#58a6ff] text-[#58a6ff]'
                : 'border-transparent text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            Edge Gateways ({site.edgeDeviceCount})
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 space-y-6 flex-1 text-xs">
          {activeTab === 'overview' && (
            <>
              {/* Site KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d]">
                  <span className="text-[#8b949e] text-[11px] block">Today's Access</span>
                  <span className="text-xl font-bold text-white font-mono mt-1 block">
                    {site.todayAccessCount.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-[#3fb950] font-medium mt-0.5 flex items-center gap-1">
                    ↑ Active sync
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d]">
                  <span className="text-[#8b949e] text-[11px] block">Active Vehicles</span>
                  <span className="text-xl font-bold text-[#58a6ff] font-mono mt-1 block">
                    {site.vehicleCount}
                  </span>
                  <span className="text-[10px] text-[#8b949e] mt-0.5 block">Enrolled plates</span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d]">
                  <span className="text-[#8b949e] text-[11px] block">Cameras Online</span>
                  <span className="text-xl font-bold text-white font-mono mt-1 block">
                    {site.onlineCameraCount} / {site.cameraCount}
                  </span>
                  <span className={`text-[10px] font-medium mt-0.5 block ${
                    site.onlineCameraCount === site.cameraCount ? 'text-[#3fb950]' : 'text-[#f85149]'
                  }`}>
                    {site.onlineCameraCount === site.cameraCount ? '● 100% Online' : `⚠ ${site.cameraCount - site.onlineCameraCount} Offline`}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#161b22] border border-[#30363d]">
                  <span className="text-[#8b949e] text-[11px] block">Gates Online</span>
                  <span className="text-xl font-bold text-white font-mono mt-1 block">
                    {site.onlineGateCount} / {site.gateCount}
                  </span>
                  <span className="text-[10px] text-[#3fb950] font-medium mt-0.5 block">
                    ● Barrier relays ok
                  </span>
                </div>
              </div>

              {/* Occupancy Progress Bar */}
              {site.capacity && (
                <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-semibold flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-[#58a6ff]" />
                      Real-time Facility Occupancy
                    </span>
                    <span className="text-white font-mono font-bold">
                      {site.currentOccupancy} / {site.capacity} bays ({occupancyPercent}%)
                    </span>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-[#0d0e12] overflow-hidden border border-[#30363d]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        occupancyPercent > 85
                          ? 'bg-[#f85149]'
                          : occupancyPercent > 65
                          ? 'bg-[#d29922]'
                          : 'bg-[#3fb950]'
                      }`}
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#8b949e] pt-1">
                    <span>Available bays: {(site.capacity - (site.currentOccupancy || 0))}</span>
                    <span>Schedule: {site.operatingHours}</span>
                  </div>
                </div>
              )}

              {/* Facility Details */}
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                <h4 className="text-white font-semibold border-b border-[#30363d]/60 pb-2">
                  Operations & Facility Profile
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Operating Schedule</span>
                    <p className="text-white font-medium mt-0.5">{site.operatingHours}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Lanes Configured</span>
                    <p className="text-white font-medium mt-0.5">{site.lanesCount} Inbound/Outbound Lanes</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Site Manager</span>
                    <p className="text-white font-medium mt-0.5">{site.managerName || 'Le Hoang Nam'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Contact Phone</span>
                    <p className="text-white font-medium mt-0.5">{site.managerPhone || '+84 90 311 2233'}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Description / Notes</span>
                  <p className="text-[#8b949e] mt-1 text-xs">{site.description}</p>
                </div>
              </div>
            </>
          )}

          {activeTab === 'lanes_gates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-semibold text-xs">Barrier Gates & Relay Telemetry</h4>
                <span className="text-[11px] text-[#8b949e]">Protocol: MQTT / Modbus TCP</span>
              </div>

              {Array.from({ length: site.gateCount }).map((_, idx) => {
                const isOutGate = idx % 2 === 1;
                const gateId = `${site.code}-GATE-${isOutGate ? 'OUT' : 'IN'}-0${Math.floor(idx / 2) + 1}`;
                const isOffline = site.name.includes('Warehouse') && gateId.includes('OUT-02');
                const isOperating = gateActionStatus[gateId];

                return (
                  <div key={idx} className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isOffline ? 'bg-[#da3633]/20 text-[#f85149]' : 'bg-[#238636]/20 text-[#3fb950]'
                        }`}>
                          <DoorOpen className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-white font-bold font-mono text-xs">{gateId}</span>
                          <span className="text-[11px] text-[#8b949e] block">
                            {isOutGate ? 'Outbound Exit Lane' : 'Inbound Entry Lane'} · Automatic Barrier
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded ${
                          isOffline ? 'bg-[#da3633]/20 text-[#f85149]' : 'bg-[#238636]/20 text-[#3fb950]'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {isOffline ? 'OFFLINE' : 'ONLINE / ARMED'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#30363d]/60 text-[11px]">
                      <span className="text-[#8b949e]">Relay Latency: {isOffline ? '--' : '18ms'} · State: CLOSED</span>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={isOperating}
                          onClick={() => handleGateOverride(gateId, 'OPEN')}
                          className="text-xs bg-[#238636]/10 text-[#3fb950] hover:bg-[#238636]/20 border-[#238636]/30 gap-1"
                        >
                          <Unlock className="w-3 h-3" />
                          Open Barrier
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={isOperating}
                          onClick={() => handleGateOverride(gateId, 'LOCK')}
                          className="text-xs text-[#f85149] hover:bg-[#da3633]/20 border-[#da3633]/30 gap-1"
                        >
                          <Lock className="w-3 h-3" />
                          Lock
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'cameras' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-white font-semibold text-xs">ANPR Video Feeds & OCR Sensors</h4>
                <span className="text-[11px] text-[#3fb950] font-mono">4K UHD · 30 FPS · H.265</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: Math.min(site.cameraCount, 6) }).map((_, idx) => {
                  const camId = `${site.code}-CAM-0${idx + 1}`;
                  const isCamOffline = site.name.includes('Main') && camId.includes('CAM-03');

                  return (
                    <div key={idx} className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] space-y-2">
                      <div className="relative rounded-lg bg-[#0d0e12] border border-[#30363d] h-24 flex items-center justify-center overflow-hidden">
                        {isCamOffline ? (
                          <div className="text-center text-[#f85149] space-y-1">
                            <AlertTriangle className="w-5 h-5 mx-auto" />
                            <span className="text-[10px] font-mono block">RTSP SIGNAL LOST</span>
                          </div>
                        ) : (
                          <div className="text-center text-[#8b949e] space-y-1">
                            <Camera className="w-6 h-6 mx-auto text-[#58a6ff] opacity-70" />
                            <span className="text-[9px] font-mono block text-[#3fb950]">LIVE STREAMING</span>
                          </div>
                        )}

                        <div className="absolute top-1.5 left-2 text-[9px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded">
                          {camId}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#8b949e]">OCR Model: v4.2 Turbo</span>
                        <span className="text-white font-mono font-bold">98.5% Acc</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'edge_nodes' && (
            <div className="space-y-4">
              <h4 className="text-white font-semibold text-xs">Edge AI Inference Compute Nodes</h4>
              
              {Array.from({ length: site.edgeDeviceCount }).map((_, idx) => {
                const nodeId = `EDGE-${site.code}-0${idx + 1}`;
                const isHighCpu = site.name.includes('Warehouse') && nodeId.includes('03');

                return (
                  <div key={idx} className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#58a6ff]/10 text-[#58a6ff] flex items-center justify-center font-mono text-xs">
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-white font-mono font-bold text-xs">{nodeId}</span>
                          <span className="text-[11px] text-[#8b949e] block">NVIDIA Jetson Orin 64GB · Docker v26.1</span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        isHighCpu ? 'bg-[#d29922]/20 text-[#e3b341]' : 'bg-[#238636]/20 text-[#3fb950]'
                      }`}>
                        {isHighCpu ? 'HIGH LOAD' : 'ONLINE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                      <div className="p-2 rounded bg-[#0d0e12] border border-[#30363d]">
                        <span className="text-[#8b949e] block text-[10px]">CPU Load</span>
                        <span className={`font-mono font-bold ${isHighCpu ? 'text-[#f85149]' : 'text-white'}`}>
                          {isHighCpu ? '91%' : '34%'}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-[#0d0e12] border border-[#30363d]">
                        <span className="text-[#8b949e] block text-[10px]">GPU / NPU</span>
                        <span className="font-mono font-bold text-white">48%</span>
                      </div>
                      <div className="p-2 rounded bg-[#0d0e12] border border-[#30363d]">
                        <span className="text-[#8b949e] block text-[10px]">Temp</span>
                        <span className="font-mono font-bold text-white">46°C</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#161b22]/90 flex items-center justify-between sticky bottom-0 z-20">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close Panel
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              addToast({
                type: 'success',
                title: 'Diagnostics Dispatched',
                description: `Running remote heartbeat & sensor self-test on ${site.name}.`
              });
            }}
            className="text-xs bg-[#58a6ff] hover:bg-[#58a6ff]/90 text-slate-950 font-bold gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" />
            Run Site Self-Test
          </Button>
        </div>
      </div>
    </div>
  );
};
