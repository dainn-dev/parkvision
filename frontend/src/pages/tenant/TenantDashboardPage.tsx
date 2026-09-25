import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Building2,
  Camera,
  DoorOpen,
  Car,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Activity,
  Radio,
  Sliders,
  ShieldCheck,
  ShieldAlert,
  Server,
  Zap,
  ChevronRight,
  Plus,
  UserPlus,
  HardDrive,
  Eye,
  Filter,
  Layers,
  ChevronDown,
  MapPin,
  Phone,
  User,
  Settings,
  Lock,
  Unlock,
  RotateCcw,
  Cpu,
  Check,
  Flame,
  Wifi,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { Button, Card, Badge } from '../../components/ui';
import { AccessEvent, TenantSite } from '../../types/tenant';
import { AccessEventDrawer } from '../../components/tenant/AccessEventDrawer';
import { SiteDetailDrawer } from '../../components/tenant/SiteDetailDrawer';
import { AddVehicleModal } from '../../components/tenant/AddVehicleModal';
import { InviteMemberModal } from '../../components/tenant/InviteMemberModal';
import { CreateAccessRuleModal } from '../../components/tenant/CreateAccessRuleModal';

export const TenantDashboardPage: React.FC = () => {
  const {
    tenantSites,
    tenantSummary,
    tenantHealth,
    tenantAlerts,
    accessEvents,
    accessActivity,
    tenantDateFilter,
    setTenantDateFilter,
    isTenantRefreshing,
    refreshTenantDashboard,
    lastUpdatedTime,
    resolveTenantAlert,
    setTenantNavTab,
    triggerGateCommand,
    simulateNewAccessEvent,
    tenantLanes,
    gates,
    edgeDevices,
    addToast
  } = usePlatform();

  // 1 Tenant = 1 Site constraint: Get the single dedicated site
  const site: TenantSite = tenantSites[0] || {
    id: '',
    name: 'No site configured',
    code: '—',
    tenantId: '',
    tenantName: '',
    address: '—',
    status: 'INACTIVE',
    cameraCount: 0,
    onlineCameraCount: 0,
    gateCount: 0,
    onlineGateCount: 0,
    edgeDeviceCount: 0,
    onlineEdgeDeviceCount: 0,
    vehicleCount: 0,
    todayAccessCount: 0,
    lanesCount: 0,
    operatingHours: '—',
    capacity: 0,
    currentOccupancy: 0,
    coordinates: { lat: 0, lng: 0 },
    createdAt: '',
    description: 'Create a site to activate this dashboard.',
    managerName: '—',
    managerPhone: '—'
  };

  // Drawers & Modals state
  const [selectedEvent, setSelectedEvent] = useState<AccessEvent | null>(null);
  const [isEventDrawerOpen, setIsEventDrawerOpen] = useState<boolean>(false);

  const [selectedSite, setSelectedSite] = useState<TenantSite | null>(null);
  const [isSiteDrawerOpen, setIsSiteDrawerOpen] = useState<boolean>(false);

  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState<boolean>(false);
  const [isInviteMemberOpen, setIsInviteMemberOpen] = useState<boolean>(false);
  const [isCreateRuleOpen, setIsCreateRuleOpen] = useState<boolean>(false);

  // Active critical or warning alert
  const activeAlert = tenantAlerts[0];

  const handleOpenEvent = (event: AccessEvent) => {
    setSelectedEvent(event);
    setIsEventDrawerOpen(true);
  };

  const handleOpenSite = () => {
    setSelectedSite(site);
    setIsSiteDrawerOpen(true);
  };

  const occupancyPercent = site.capacity
    ? Math.round(((site.currentOccupancy || 0) / site.capacity) * 100)
    : 66;

  // Real lanes: gates joined with lane + edge-device + latest access event
  const lanes = gates.map((gate) => {
    const lane = tenantLanes.find((l) => l.id === gate.laneId);
    const edge = edgeDevices.find((d) => d.id === gate.edgeDeviceId);
    const lastEvent = accessEvents.find((e) => e.gateId === gate.id);
    return {
      id: lane?.id ?? gate.id,
      name: lane?.name ?? gate.gateName,
      direction: (lane?.direction ?? 'IN').toUpperCase(),
      gateId: gate.id,
      gateName: gate.gateName,
      barrierState: (gate.rawStatus ?? 'closed').toUpperCase(),
      cameraName: lane?.cameraUrl ? 'ANPR Cam' : 'No camera',
      cameraStatus: gate.status,
      ocrAccuracy: lastEvent ? `${(lastEvent.plateConfidence * 100).toFixed(1)}%` : '-',
      lastEvent,
      lastPlate: lastEvent?.plate ?? '-',
      lastVehicle: '',
      lastStatus: lastEvent?.decision ?? '-',
      lastTime: lastEvent?.timeFormatted ?? '-',
      edgeNode: edge?.deviceName ?? '-'
    };
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* 1. TOP HEADER & SINGLE-FACILITY BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#161b22]/80 p-4 md:p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1f6feb]/30 to-[#58a6ff]/10 border border-[#58a6ff]/30 flex items-center justify-center text-[#58a6ff] shrink-0 shadow-sm">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                {site.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
                {site.code}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
                Dedicated Facility · 100% Operational
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#8b949e] mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#8b949e]" />
                {site.address}
              </span>
              <span className="hidden sm:inline-block text-[#30363d]">•</span>
              <span className="flex items-center gap-1 font-mono text-[#c9d1d9]">
                <Clock className="w-3.5 h-3.5 text-[#58a6ff]" />
                {site.operatingHours}
              </span>
              <span className="hidden sm:inline-block text-[#30363d]">•</span>
              <span className="flex items-center gap-1 text-[#8b949e]">
                <User className="w-3.5 h-3.5 text-[#8b949e]" />
                Manager: {site.managerName} ({site.managerPhone})
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Date Filter */}
        <div className="flex items-center flex-wrap gap-2.5 self-start lg:self-center">
          {/* Live ANPR Simulation button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => simulateNewAccessEvent()}
            className="text-xs bg-[#0d0e12] border-[#30363d] text-[#58a6ff] hover:bg-[#58a6ff]/10 hover:border-[#58a6ff]/50 gap-1.5 font-medium"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#58a6ff]" />
            Simulate Event
          </Button>

          {/* Date Filter Dropdown */}
          <div className="relative">
            <select
              value={tenantDateFilter}
              onChange={(e) => setTenantDateFilter(e.target.value)}
              className="appearance-none bg-[#0d0e12] border border-[#30363d] hover:border-[#58a6ff]/50 rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-[#c9d1d9] focus:outline-hidden focus:border-[#58a6ff] cursor-pointer transition-colors"
            >
              <option value="today">Today (Live)</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#8b949e] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Refresh Action */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              isLoading={isTenantRefreshing}
              onClick={refreshTenantDashboard}
              className="text-xs bg-[#0d0e12] border-[#30363d] text-[#c9d1d9] hover:text-white hover:border-[#58a6ff]/50 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTenantRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <span className="text-[11px] text-[#8b949e] hidden xl:inline-block font-mono">
              Sync: {lastUpdatedTime}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ACTIVE ALERT NOTIFICATION (IF ANY) */}
      {activeAlert && (
        <div className="p-4 rounded-xl bg-[#161b22] border border-[#d29922]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#d29922]/20 border border-[#d29922]/30 text-[#e3b341] flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#e3b341] uppercase tracking-wider">
                  {activeAlert.title}
                </span>
                <span className="text-[10px] text-[#8b949e] font-mono">({activeAlert.timeAgo})</span>
              </div>
              <p className="text-xs text-[#c9d1d9] mt-0.5">
                {activeAlert.message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolveTenantAlert(activeAlert.id)}
              className="text-xs text-[#8b949e] hover:text-white border-[#30363d]"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* 3. 5 KPI SUMMARY CARDS (TAILORED FOR SINGLE FACILITY) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Facility & Lane Status */}
        <div
          onClick={handleOpenSite}
          className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8b949e]">Facility Status</span>
            <div className="w-7 h-7 rounded-lg bg-[#21262d] text-[#3fb950] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
              OPERATIONAL
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#8b949e] pt-2 border-t border-[#30363d]/60">
            <span className="text-[#3fb950] font-medium">4/4 Lanes Live</span>
            <span className="text-[#58a6ff]">24/7 Hours</span>
          </div>
        </div>

        {/* Card 2: Parking Occupancy */}
        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8b949e]">Occupancy</span>
            <div className="w-7 h-7 rounded-lg bg-[#21262d] text-[#58a6ff] flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
          </div>

          <div className="my-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-white font-mono">{site.currentOccupancy}</span>
              <span className="text-xs text-[#8b949e] font-mono">/ {site.capacity} slots</span>
            </div>
            {/* Visual occupancy bar */}
            <div className="w-full h-1.5 rounded-full bg-[#0d0e12] overflow-hidden mt-1.5 border border-[#30363d]">
              <div
                className={`h-full rounded-full ${occupancyPercent > 80 ? 'bg-[#f85149]' : occupancyPercent > 60 ? 'bg-[#58a6ff]' : 'bg-[#3fb950]'}`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#30363d]/60">
            <span className="text-[#58a6ff] font-medium">{occupancyPercent}% Filled</span>
            <span className="text-[#3fb950] font-medium">{(site.capacity || 800) - (site.currentOccupancy || 0)} Free</span>
          </div>
        </div>

        {/* Card 3: ANPR Cameras & Hardware */}
        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8b949e]">ANPR & Gates</span>
            <div className="w-7 h-7 rounded-lg bg-[#21262d] text-[#58a6ff] flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl font-extrabold text-white font-mono">
              {site.onlineCameraCount} / {site.cameraCount}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#30363d]/60">
            <span className="text-[#3fb950] font-medium">{site.onlineGateCount} Gates Online</span>
            <span className="text-[#58a6ff] font-medium">{site.onlineEdgeDeviceCount} Edge Nodes</span>
          </div>
        </div>

        {/* Card 4: Registered Fleet */}
        <div
          onClick={() => setTenantNavTab('vehicles')}
          className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#8b949e]">Registered Fleet</span>
            <div className="w-7 h-7 rounded-lg bg-[#21262d] text-[#58a6ff] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Car className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl font-extrabold text-white font-mono">
              {tenantSummary.vehicles.total.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#30363d]/60">
            <span className="text-[#3fb950] font-medium">{tenantSummary.vehicles.active} Active</span>
            <span className="text-[#58a6ff] font-medium">+{tenantSummary.vehicles.newThisMonth} this mo</span>
          </div>
        </div>

        {/* Card 5: Access Today (Most Prominent) */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-[#161b22] to-[#1f6feb]/15 border-2 border-[#58a6ff]/40 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#58a6ff]" />
              Today's Passes
            </span>
            <span className="text-[10px] font-mono text-[#3fb950] font-bold flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> +{tenantSummary.accessToday.percentChange}%
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {tenantSummary.accessToday.total.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#30363d]/60">
            <span className="text-[#3fb950] font-bold">
              ✓ {tenantSummary.accessToday.total ? ((tenantSummary.accessToday.allowed / tenantSummary.accessToday.total) * 100).toFixed(1) : '0.0'}%
            </span>
            <span className="text-[#f85149] font-bold">
              ✕ {((tenantSummary.accessToday.denied / tenantSummary.accessToday.total) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. REAL-TIME PHYSICAL LANES & BARRIER GATE CONTROLLER */}
      <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center font-bold">
              <DoorOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Facility Lanes & Barrier Gate Controllers
                <span className="text-[10px] font-mono font-bold px-2 py-0.2 rounded-full bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                  4/4 Active
                </span>
              </h3>
              <p className="text-xs text-[#8b949e] mt-0.5">
                Direct hardware telemetry and automated ANPR barrier relay trigger commands
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Interlock Protocol:</span>
            <span className="text-xs font-mono font-bold text-[#3fb950] bg-[#0d0e12] px-2.5 py-1 rounded-lg border border-[#30363d]">
              Safety Loop Armed
            </span>
          </div>
        </div>

        {/* 4 Lanes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="p-4 rounded-xl bg-[#0d0e12] border border-[#30363d] hover:border-[#58a6ff]/40 transition-all flex flex-col justify-between space-y-3"
            >
              {/* Lane Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      lane.direction === 'IN' ? 'bg-[#58a6ff]/20 text-[#58a6ff]' : 'bg-[#a371f7]/20 text-[#a371f7]'
                    }`}>
                      {lane.direction === 'IN' ? '↓ INBOUND' : '↑ OUTBOUND'}
                    </span>
                    <h4 className="text-xs font-bold text-white">{lane.name.split('(')[0]}</h4>
                  </div>
                  <span className="text-[11px] text-[#8b949e] block mt-0.5">{lane.gateName}</span>
                </div>

                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                  {lane.barrierState}
                </span>
              </div>

              {/* Hardware & ANPR Status */}
              <div className="space-y-1.5 text-xs bg-[#161b22] p-2.5 rounded-lg border border-[#30363d]/60">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#8b949e] flex items-center gap-1">
                    <Camera className="w-3 h-3 text-[#58a6ff]" />
                    {lane.cameraName}
                  </span>
                  <span className="text-[#3fb950] font-mono font-semibold">{lane.ocrAccuracy} OCR</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#8b949e] flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-[#8b949e]" />
                    {lane.edgeNode}
                  </span>
                  <span className="text-[#8b949e] font-mono">18ms Latency</span>
                </div>
              </div>

              {/* Last Vehicle Throughput */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#8b949e]">Last Vehicle:</span>
                  <span className="text-[10px] text-[#8b949e] font-mono">{lane.lastTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-xs px-2 py-0.5 rounded bg-[#161b22] border border-[#30363d]">
                    {lane.lastPlate}
                  </span>
                  <span className="text-[11px] text-[#3fb950] font-bold">
                    ✓ Allowed
                  </span>
                </div>
              </div>

              {/* Manual Override Action Controls */}
              <div className="pt-2 border-t border-[#30363d] flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    triggerGateCommand(lane.gateId, 'OPEN');
                  }}
                  className="flex-1 text-[11px] py-1.5 bg-[#238636]/15 hover:bg-[#238636]/30 text-[#3fb950] border-[#238636]/40 gap-1 justify-center"
                >
                  <Unlock className="w-3 h-3" />
                  Open Barrier
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    triggerGateCommand(lane.gateId, 'RESET');
                  }}
                  className="text-[11px] py-1.5 px-2 bg-[#161b22] text-[#8b949e] hover:text-white border-[#30363d]"
                  title="Reset Controller"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. OPERATIONS & ANALYTICS SECTION (8/4 GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Col 8: Access Activity Timeline Chart */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Facility Traffic & ANPR Throughput</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
                  Hourly Distribution
                </span>
              </div>
              <p className="text-xs text-[#8b949e] mt-0.5">
                Real-time throughput comparison of Allowed vs. Denied vs. Unknown plates
              </p>
            </div>

            {/* Series Legend Indicators */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-[#3fb950] font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" /> Allowed
              </span>
              <span className="flex items-center gap-1.5 text-[#f85149] font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f85149]" /> Denied
              </span>
              <span className="flex items-center gap-1.5 text-[#e3b341] font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e3b341]" /> Unknown
              </span>
            </div>
          </div>

          {/* Recharts Area Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={accessActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3fb950" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3fb950" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorDenied" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f85149" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f85149" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorUnknown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e3b341" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#e3b341" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
                <XAxis dataKey="time" stroke="#8b949e" fontSize={11} tickLine={false} />
                <YAxis stroke="#8b949e" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0d0e12',
                    borderColor: '#30363d',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#fff'
                  }}
                  itemStyle={{ padding: '2px 0' }}
                />
                <Area
                  type="monotone"
                  dataKey="allowed"
                  name="Allowed"
                  stroke="#3fb950"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAllowed)"
                />
                <Area
                  type="monotone"
                  dataKey="denied"
                  name="Denied"
                  stroke="#f85149"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDenied)"
                />
                <Area
                  type="monotone"
                  dataKey="unknown"
                  name="Unknown"
                  stroke="#e3b341"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorUnknown)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Access Summary Bar below Chart */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#30363d]">
            <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
              <span className="text-[10px] text-[#8b949e] uppercase font-semibold block">Total Allowed</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold text-white font-mono">
                  {tenantSummary.accessToday.allowed.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#3fb950] font-semibold">
                  (96.3%)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
              <span className="text-[10px] text-[#8b949e] uppercase font-semibold block">Total Denied</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold text-white font-mono">
                  {tenantSummary.accessToday.denied.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#f85149] font-semibold">
                  (3.0%)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
              <span className="text-[10px] text-[#8b949e] uppercase font-semibold block">OCR Flagged Review</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-bold text-white font-mono">
                  {tenantSummary.accessToday.unknown.toLocaleString()}
                </span>
                <span className="text-[11px] text-[#e3b341] font-semibold">
                  (0.7%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Col 4: Facility Hardware & Edge Telemetry Health */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#58a6ff]" />
                <h3 className="text-sm font-bold text-white tracking-tight">Edge AI & Telemetry</h3>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                100% HEALTHY
              </span>
            </div>

            {/* Hardware Health Progress Bars */}
            <div className="space-y-3 mt-3.5 text-xs">
              {/* Cameras */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#8b949e] flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#58a6ff]" /> ANPR Cameras
                  </span>
                  <span className="text-white font-mono font-semibold">
                    {site.onlineCameraCount} / {site.cameraCount} Online
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#0d0e12] overflow-hidden border border-[#30363d]">
                  <div className="h-full rounded-full bg-[#3fb950] w-full" />
                </div>
              </div>

              {/* Gates */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#8b949e] flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-[#58a6ff]" /> Automated Barriers
                  </span>
                  <span className="text-white font-mono font-semibold">
                    {site.onlineGateCount} / {site.gateCount} Online
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#0d0e12] overflow-hidden border border-[#30363d]">
                  <div className="h-full rounded-full bg-[#3fb950] w-full" />
                </div>
              </div>

              {/* Edge Devices */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#8b949e] flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-[#58a6ff]" /> Edge AI Gateways
                  </span>
                  <span className="text-white font-mono font-semibold">
                    {site.onlineEdgeDeviceCount} / {site.edgeDeviceCount} Active
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#0d0e12] overflow-hidden border border-[#30363d]">
                  <div className="h-full rounded-full bg-[#58a6ff] w-full" />
                </div>
              </div>
            </div>

            {/* Edge Compute Metrics */}
            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
              <div className="p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                <span className="text-[#8b949e] block">Edge CPU Load</span>
                <span className="text-white font-mono font-bold text-xs mt-0.5 block">34% (Normal)</span>
              </div>
              <div className="p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                <span className="text-[#8b949e] block">Avg OCR Speed</span>
                <span className="text-[#3fb950] font-mono font-bold text-xs mt-0.5 block">380ms / plate</span>
              </div>
            </div>
          </div>

          {/* Infrastructure Connectivity Badges */}
          <div className="pt-3 border-t border-[#30363d] space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
              <span className="text-[#8b949e] flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#58a6ff]" /> Cloud REST Sync
              </span>
              <span className="text-[#3fb950] font-mono font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                18ms Latency
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
              <span className="text-[#8b949e] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[#58a6ff]" /> WebSocket Telemetry
              </span>
              <span className="text-[#3fb950] font-mono font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
                Live Stream
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. MONITORING SECTION: RECENT ACCESS EVENTS + NEEDS ATTENTION (8/4 GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Col 8: Recent Access Events Table */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-[#161b22] border border-[#30363d] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-bold text-white tracking-tight">Live Facility Access Stream</h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
                Live ANPR Captures
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTenantNavTab('access_events')}
                className="text-xs bg-[#0d0e12] border-[#30363d] text-[#58a6ff] hover:text-white"
              >
                View Full Log →
              </Button>
            </div>
          </div>

          {/* Events Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] text-[#8b949e] border-y border-[#30363d] uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Plate</th>
                  <th className="py-2.5 px-3">Gate & Lane</th>
                  <th className="py-2.5 px-3">Owner / Role</th>
                  <th className="py-2.5 px-3">Decision</th>
                  <th className="py-2.5 px-3">OCR Conf</th>
                  <th className="py-2.5 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]/50 font-medium">
                {accessEvents.slice(0, 6).map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => handleOpenEvent(event)}
                    className="hover:bg-[#21262d]/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3 font-mono text-[#8b949e] text-[11px] whitespace-nowrap">
                      {event.timeFormatted}
                    </td>

                    <td className="py-3 px-3">
                      <span className="font-mono font-bold text-white px-2 py-0.5 rounded bg-[#0d0e12] border border-[#30363d] group-hover:border-[#58a6ff]/40 transition-colors">
                        {event.plate}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-[#8b949e] whitespace-nowrap">
                      <span className="text-white">{event.gateName}</span>
                      <span className="text-[10px] text-[#8b949e] block font-mono">
                        {event.direction === 'IN' ? '↓ Inbound' : '↑ Outbound'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-[#c9d1d9] whitespace-nowrap">
                      <div>{event.ownerName || 'Unregistered'}</div>
                      <span className="text-[10px] text-[#8b949e] font-mono">{event.ownerType}</span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                        event.decision === 'ALLOWED'
                          ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                          : event.decision === 'DENIED'
                          ? 'bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30'
                          : event.decision === 'BLOCKED'
                          ? 'bg-[#da3633]/25 text-[#ff7b72] border border-[#da3633]/50'
                          : 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                      }`}>
                        {event.decision === 'ALLOWED' && <CheckCircle2 className="w-3 h-3" />}
                        {event.decision === 'DENIED' && <XCircle className="w-3 h-3" />}
                        {event.decision === 'BLOCKED' && <XCircle className="w-3 h-3" />}
                        {event.decision === 'UNKNOWN' && <AlertTriangle className="w-3 h-3" />}
                        {event.decision}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-[#8b949e] text-[11px]">
                      {(event.plateConfidence * 100).toFixed(1)}%
                    </td>

                    <td className="py-3 px-3 text-right">
                      <ChevronRight className="w-4 h-4 text-[#8b949e] group-hover:text-white group-hover:translate-x-0.5 transition-all inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Col 4: Facility Profile & Direct Actions Card */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-[#161b22] border border-[#30363d] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#58a6ff]" />
                <h3 className="text-sm font-bold text-white tracking-tight">Facility Details</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSite}
                className="text-[11px] py-1 px-2.5 bg-[#0d0e12] border-[#30363d] text-[#58a6ff] hover:text-white"
              >
                Inspect →
              </Button>
            </div>

            <div className="space-y-3 mt-3 text-xs">
              <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d] space-y-1.5">
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold block">Facility Name & Code</span>
                <div className="text-white font-bold text-sm">{site.name}</div>
                <div className="text-xs text-[#8b949e] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#8b949e]" />
                  {site.address}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                  <span className="text-[#8b949e] block">Operating Hours</span>
                  <span className="text-white font-mono font-semibold mt-0.5 block">{site.operatingHours}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                  <span className="text-[#8b949e] block">Capacity</span>
                  <span className="text-white font-mono font-semibold mt-0.5 block">{site.capacity} Total Slots</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d] space-y-1">
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold block">Facility Manager Contact</span>
                <div className="text-white font-semibold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#58a6ff]" />
                  {site.managerName}
                </div>
                <div className="text-xs text-[#8b949e] font-mono flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#8b949e]" />
                  {site.managerPhone}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#30363d]">
            <Button
              variant="outline"
              onClick={() => setTenantNavTab('sites')}
              className="w-full text-xs bg-[#0d0e12] border-[#30363d] text-white hover:border-[#58a6ff] justify-center py-2.5 gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-[#58a6ff]" />
              Manage Facility Hardware & Config
            </Button>
          </div>
        </div>
      </div>

      {/* 7. QUICK ADMINISTRATIVE ACTIONS */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#161b22] via-[#161b22] to-[#1f6feb]/10 border border-[#30363d]">
        <h3 className="text-sm font-bold text-white tracking-tight mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Button
            variant="outline"
            onClick={() => setIsAddVehicleOpen(true)}
            className="text-xs bg-[#0d0e12] border-[#30363d] text-white hover:border-[#58a6ff] py-3 gap-2 justify-center"
          >
            <Car className="w-4 h-4 text-[#58a6ff]" />
            + Register Vehicle
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsInviteMemberOpen(true)}
            className="text-xs bg-[#0d0e12] border-[#30363d] text-white hover:border-[#58a6ff] py-3 gap-2 justify-center"
          >
            <UserPlus className="w-4 h-4 text-[#3fb950]" />
            + Invite Operator
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsCreateRuleOpen(true)}
            className="text-xs bg-[#0d0e12] border-[#30363d] text-white hover:border-[#58a6ff] py-3 gap-2 justify-center"
          >
            <ShieldCheck className="w-4 h-4 text-[#e3b341]" />
            + Add Access Rule
          </Button>

          <Button
            variant="outline"
            onClick={handleOpenSite}
            className="text-xs bg-[#0d0e12] border-[#30363d] text-white hover:border-[#58a6ff] py-3 gap-2 justify-center"
          >
            <Building2 className="w-4 h-4 text-[#a371f7]" />
            Facility Hardware Details
          </Button>
        </div>
      </div>

      {/* ACCESS EVENT INSPECTION DRAWER */}
      <AccessEventDrawer
        event={selectedEvent}
        isOpen={isEventDrawerOpen}
        onClose={() => setIsEventDrawerOpen(false)}
        onOverride={(evt) => {
          triggerGateCommand(evt.gateId, 'OPEN');
          setIsEventDrawerOpen(false);
        }}
        onBlock={(evt) => {
          addToast({
            type: 'error',
            title: 'Vehicle Blocked',
            description: `Plate ${evt.plate} added to tenant security blacklist.`
          });
          setIsEventDrawerOpen(false);
        }}
      />

      {/* SITE DETAIL DRAWER */}
      <SiteDetailDrawer
        site={selectedSite}
        isOpen={isSiteDrawerOpen}
        onClose={() => setIsSiteDrawerOpen(false)}
      />

      {/* MODALS */}
      <AddVehicleModal isOpen={isAddVehicleOpen} onClose={() => setIsAddVehicleOpen(false)} />
      <InviteMemberModal isOpen={isInviteMemberOpen} onClose={() => setIsInviteMemberOpen(false)} />
      <CreateAccessRuleModal isOpen={isCreateRuleOpen} onClose={() => setIsCreateRuleOpen(false)} />
    </div>
  );
};
