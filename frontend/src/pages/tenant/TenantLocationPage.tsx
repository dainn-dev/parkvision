import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Building2,
  MapPin,
  Clock,
  Phone,
  Mail,
  User,
  ShieldCheck,
  ShieldAlert,
  Server,
  Camera,
  DoorOpen,
  Car,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  Edit,
  Power,
  Compass,
  Calendar,
  Globe,
  Radio,
  Wifi,
  Sparkles,
  Info,
  Maximize2,
  Copy,
  Check
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
import { EditLocationSheet } from '../../components/tenant/EditLocationSheet';
import { EditOperatingHoursDialog } from '../../components/tenant/EditOperatingHoursDialog';
import { DeactivateLocationDialog } from '../../components/tenant/DeactivateLocationDialog';

export const TenantLocationPage: React.FC = () => {
  const {
    tenantLocation,
    tenantHealth,
    tenantSummary,
    accessActivity,
    registeredVehicles,
    tenantAccessRules,
    updateTenantLocation,
    updateLocationOperatingHours,
    toggleLocationStatus,
    setTenantNavTab,
    addToast
  } = usePlatform();

  // Dialog / Sheet states
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false);
  const [isEditHoursOpen, setIsEditHoursOpen] = useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [showInteractiveMap, setShowInteractiveMap] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [timeRangeFilter, setTimeRangeFilter] = useState<'today' | 'yesterday' | '7d' | '30d'>('today');

  const location = tenantLocation;
  const isHealthy = tenantHealth?.overall === 'HEALTHY';
  const isActive = location?.status === 'ACTIVE';

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    addToast({
      type: 'info',
      title: 'Copied to Clipboard',
      description: `${fieldName} copied.`
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Format operating hours display
  const getOperatingHoursSummary = () => {
    if (!location?.operatingHours || location.operatingHours.isOpen24_7) {
      return {
        mode: '24/7 Mode',
        description: 'Facility is open 24 hours / 7 days continuous'
      };
    }
    const days = location.operatingHours.days || [];
    const mon = days.find((d) => d.day === 'MONDAY');
    const sat = days.find((d) => d.day === 'SATURDAY');
    const sun = days.find((d) => d.day === 'SUNDAY');

    const monText = mon?.enabled ? `${mon.open} – ${mon.close}` : 'Closed';
    const satText = sat?.enabled ? `${sat.open} – ${sat.close}` : 'Closed';
    const sunText = sun?.enabled ? `${sun.open} – ${sun.close}` : 'Closed';

    return {
      mode: 'Scheduled Hours',
      monFri: monText,
      sat: satText,
      sun: sunText
    };
  };

  const hoursSummary = getOperatingHoursSummary();

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#30363d] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">Location</h1>
                <span className="px-2 py-0.5 rounded-full text-xs bg-[#21262d] text-[#c9d1d9] font-medium border border-[#30363d]">
                  {location.name}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] bg-[#161b22] text-[#8b949e] font-mono border border-[#30363d]">
                  {location.code}
                </span>
              </div>
              <p className="text-xs text-[#8b949e]">
                Your organization's physical operating location, hardware topology, and schedule
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsEditLocationOpen(true)}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 font-semibold shadow-xs"
          >
            <Edit className="w-3.5 h-3.5" />
            Edit Location
          </Button>

          {/* Secondary Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className="p-2 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#8b949e] transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMoreMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsMoreMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl py-1.5 z-30 text-xs animate-in zoom-in-95 duration-150">
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setShowInteractiveMap(!showInteractiveMap);
                    }}
                    className="w-full px-3.5 py-2 text-left text-[#c9d1d9] hover:text-white hover:bg-[#21262d] flex items-center gap-2.5 transition-colors"
                  >
                    <Compass className="w-4 h-4 text-[#58a6ff]" />
                    <span>{showInteractiveMap ? 'Hide Map View' : 'View on Map'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsEditHoursOpen(true);
                    }}
                    className="w-full px-3.5 py-2 text-left text-[#c9d1d9] hover:text-white hover:bg-[#21262d] flex items-center gap-2.5 transition-colors"
                  >
                    <Clock className="w-4 h-4 text-[#3fb950]" />
                    <span>Manage Operating Hours</span>
                  </button>

                  <div className="border-t border-[#30363d] my-1" />

                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setIsDeactivateOpen(true);
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center gap-2.5 transition-colors ${
                      isActive
                        ? 'text-[#f85149] hover:bg-[#da3633]/15'
                        : 'text-[#3fb950] hover:bg-[#238636]/15'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                    <span>{isActive ? 'Deactivate Location' : 'Activate Location'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Location Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all ${
          isActive
            ? 'bg-[#238636]/10 border-[#238636]/30 text-white'
            : 'bg-[#da3633]/10 border-[#da3633]/30 text-white'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              isActive ? 'bg-[#3fb950] animate-pulse' : 'bg-[#f85149]'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs">
                {isActive ? 'Active & Operational' : 'Location Deactivated'}
              </span>
              <span className="text-[10px] text-[#8b949e]">
                Last updated: 10 seconds ago
              </span>
            </div>
            <p className="text-xs text-[#8b949e]">
              {isActive
                ? 'Location is fully operational and processing live ANPR camera access events across all lanes.'
                : 'Automated ANPR gate operations are suspended. Hardware telemetry remains in diagnostic mode.'}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDeactivateOpen(true)}
          className={`text-xs self-start sm:self-auto shrink-0 border ${
            isActive
              ? 'border-[#30363d] text-[#8b949e] hover:text-[#f85149] hover:border-[#da3633]/40'
              : 'border-[#238636]/50 bg-[#238636]/20 text-[#3fb950] hover:bg-[#238636]/30'
          }`}
        >
          <Power className="w-3.5 h-3.5 mr-1.5" />
          {isActive ? 'Deactivate' : 'Activate Location'}
        </Button>
      </div>

      {/* 3. Overview Row (2 Columns: Location Info + System Health) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Location Information Card (7 cols) */}
        <div className="lg:col-span-7 bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <MapPin className="w-4 h-4 text-[#58a6ff]" />
                <span>Location Information</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditLocationOpen(true)}
                className="text-[11px] text-[#58a6ff] hover:text-white p-0 h-auto font-medium"
              >
                Edit
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Location Name</span>
                <span className="text-white font-semibold">{location.name}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Location Code</span>
                <span className="font-mono text-white bg-[#0d0e12] px-2 py-0.5 rounded border border-[#30363d]">
                  {location.code}
                </span>
              </div>

              <div className="sm:col-span-2">
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Physical Address</span>
                <div className="flex items-start justify-between gap-2 bg-[#0d0e12] p-2.5 rounded-xl border border-[#30363d]">
                  <p className="text-white text-xs leading-relaxed">
                    {location.address.line1}
                    {location.address.line2 ? `, ${location.address.line2}` : ''}
                    <br />
                    {location.address.city}, {location.address.province || ''}{' '}
                    {location.address.postalCode || ''}, {location.address.country}
                  </p>
                  <button
                    onClick={() =>
                      handleCopy(
                        `${location.address.line1}, ${location.address.city}, ${location.address.country}`,
                        'Address'
                      )
                    }
                    className="p-1 text-[#8b949e] hover:text-white transition-colors"
                  >
                    {copiedField === 'Address' ? (
                      <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Timezone</span>
                <span className="text-white font-mono text-xs flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-[#8b949e]" />
                  {location.timezone} (UTC+07:00)
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Coordinates</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white text-xs">
                    {(Number(location?.latitude) || 10.7769).toFixed(4)}, {(Number(location?.longitude) || 106.7009).toFixed(4)}
                  </span>
                  <button
                    onClick={() => setShowInteractiveMap(!showInteractiveMap)}
                    className="text-[11px] text-[#58a6ff] hover:underline"
                  >
                    {showInteractiveMap ? 'Hide map' : 'View on map'}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Slot Capacity</span>
                <span className="text-white font-semibold text-xs">
                  {location.capacity || 800} Vehicles
                </span>
                <span className="text-[10px] text-[#8b949e] ml-2">
                  (Occupancy: {location.currentOccupancy || 534} / 66.8%)
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Facility Type</span>
                <span className="text-white text-xs">Dedicated Headquarters Campus</span>
              </div>
            </div>
          </div>

          {/* Interactive Map Preview Drawer */}
          {showInteractiveMap && (
            <div className="pt-3 border-t border-[#30363d] space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px] text-[#8b949e]">
                <span className="flex items-center gap-1.5 text-white font-medium">
                  <Compass className="w-3.5 h-3.5 text-[#e3b341]" />
                  Geographic Location Overlay
                </span>
                <span className="font-mono">
                  {location.latitude}, {location.longitude}
                </span>
              </div>

              {/* Styled Mock Map Container */}
              <div className="relative h-44 rounded-xl border border-[#30363d] overflow-hidden bg-[#0a0c10] flex items-center justify-center">
                {/* Visual grid / road simulation */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#58a6ff_1px,transparent_1px)] [background-size:16px_16px]" />
                
                {/* Simulated Road Lines */}
                <div className="absolute top-1/2 left-0 right-0 h-4 bg-[#21262d] -translate-y-1/2" />
                <div className="absolute top-0 bottom-0 left-1/3 w-4 bg-[#21262d]" />
                <div className="absolute top-0 bottom-0 left-2/3 w-3 bg-[#21262d]" />

                {/* Marker */}
                <div className="relative z-10 flex flex-col items-center animate-bounce">
                  <div className="px-2 py-0.5 bg-[#58a6ff] text-black font-bold text-[10px] rounded-full shadow-lg mb-1">
                    {location.name}
                  </div>
                  <div className="p-2 rounded-full bg-[#f85149] text-white shadow-xl ring-4 ring-[#f85149]/30">
                    <MapPin className="w-4 h-4 fill-white text-white" />
                  </div>
                </div>

                <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 text-[10px] text-[#8b949e] border border-[#30363d]">
                  District 1, Ho Chi Minh City
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: System Health Card (5 cols) */}
        <div className="lg:col-span-5 bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Activity className="w-4 h-4 text-[#3fb950]" />
                <span>System Health & Telemetry</span>
              </div>
              <Badge
                variant={isHealthy ? 'healthy' : 'warning'}
                className="text-[10px] uppercase font-mono tracking-wider"
              >
                ● {tenantHealth.overall}
              </Badge>
            </div>

            <div className="divide-y divide-[#21262d] text-xs pt-1">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#8b949e] flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-[#58a6ff]" />
                  ANPR Cameras
                </span>
                <span className="text-white font-mono font-medium">
                  {tenantHealth.cameras.online} / {tenantHealth.cameras.total} Online
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#8b949e] flex items-center gap-2">
                  <DoorOpen className="w-3.5 h-3.5 text-[#3fb950]" />
                  Barrier Gate Relays
                </span>
                <span className="text-white font-mono font-medium">
                  {tenantHealth.gates.online} / {tenantHealth.gates.total} Online
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#8b949e] flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-[#e3b341]" />
                  Edge OCR Nodes
                </span>
                <span className="text-white font-mono font-medium">
                  {tenantHealth.edgeDevices.online} / {tenantHealth.edgeDevices.total} Online
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#8b949e] flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-[#a371f7]" />
                  Cloud API Latency
                </span>
                <span className="text-[#3fb950] font-mono text-xs">
                  {tenantHealth.apiLatencyMs}ms (Optimal)
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#8b949e] flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-[#58a6ff]" />
                  Live Event Stream
                </span>
                <span className="text-[#3fb950] font-mono text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-ping" />
                  WebSocket Active
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d] flex items-center justify-between text-[11px]">
            <span className="text-[#8b949e]">Status sync:</span>
            <span className="text-white font-mono">Continuous Telemetry Poll</span>
          </div>
        </div>
      </div>

      {/* 4. Infrastructure Summary Card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
          <div className="flex items-center gap-2 text-white font-semibold text-xs">
            <Server className="w-4 h-4 text-[#58a6ff]" />
            <span>Infrastructure Hardware Summary</span>
          </div>
          <span className="text-[11px] text-[#8b949e]">
            Installed & configured hardware at this location
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cameras Block */}
          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between hover:border-[#58a6ff]/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#58a6ff]/15 text-[#58a6ff] flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <Badge variant="healthy" className="text-[10px]">
                  All Operational
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e]">ANPR Cameras</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold text-white font-mono">
                    {tenantSummary.cameras.total}
                  </span>
                  <span className="text-xs text-[#3fb950] font-mono">
                    {tenantSummary.cameras.online} online
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#8b949e]">
                Dual-angle optical OCR cameras covering 4 inbound & outbound lanes.
              </p>
            </div>

            <button
              onClick={() => setTenantNavTab('cameras' as any)}
              className="mt-4 pt-3 border-t border-[#21262d] flex items-center justify-between text-xs text-[#58a6ff] hover:text-white font-medium group transition-colors"
            >
              <span>Manage Cameras</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Gates Block */}
          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between hover:border-[#3fb950]/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#3fb950]/15 text-[#3fb950] flex items-center justify-center">
                  <DoorOpen className="w-4 h-4" />
                </div>
                <Badge variant="healthy" className="text-[10px]">
                  4 Relays Synced
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e]">Barrier Gates</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold text-white font-mono">
                    {tenantSummary.gates.total}
                  </span>
                  <span className="text-xs text-[#3fb950] font-mono">
                    {tenantSummary.gates.online} online
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#8b949e]">
                High-speed motorized boom barriers with MQTT relay control & loop sensors.
              </p>
            </div>

            <button
              onClick={() => setTenantNavTab('gates' as any)}
              className="mt-4 pt-3 border-t border-[#21262d] flex items-center justify-between text-xs text-[#3fb950] hover:text-white font-medium group transition-colors"
            >
              <span>Manage Gates</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Edge Devices Block */}
          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-4 flex flex-col justify-between hover:border-[#e3b341]/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-[#e3b341]/15 text-[#e3b341] flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <Badge variant="healthy" className="text-[10px]">
                  3 Active Nodes
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e]">Edge Gateways</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold text-white font-mono">
                    {tenantHealth.edgeDevices.total}
                  </span>
                  <span className="text-xs text-[#3fb950] font-mono">
                    {tenantHealth.edgeDevices.online} online
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#8b949e]">
                NVIDIA Jetson on-premise compute nodes running real-time license plate detection.
              </p>
            </div>

            <button
              onClick={() => setTenantNavTab('edge-devices' as any)}
              className="mt-4 pt-3 border-t border-[#21262d] flex items-center justify-between text-xs text-[#e3b341] hover:text-white font-medium group transition-colors"
            >
              <span>Manage Edge Devices</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. 2-Column Operational Grid (Operating Hours & Contact Information) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operating Hours Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Clock className="w-4 h-4 text-[#3fb950]" />
                <span>Operating Hours</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditHoursOpen(true)}
                className="text-[11px] text-[#58a6ff] hover:text-white p-0 h-auto font-medium"
              >
                Edit Hours
              </Button>
            </div>

            {location.operatingHours.isOpen24_7 ? (
              <div className="p-4 rounded-xl bg-[#238636]/10 border border-[#238636]/30 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#3fb950] shrink-0" />
                <div>
                  <h4 className="text-white font-bold text-xs">24/7 Operations</h4>
                  <p className="text-[11px] text-[#8b949e]">
                    Facility is open and processing registered vehicle entries around the clock.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                  <span className="font-semibold text-white">Monday – Friday</span>
                  <span className="font-mono text-[#3fb950]">
                    {hoursSummary.monFri || '07:00 – 22:00'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                  <span className="font-semibold text-white">Saturday</span>
                  <span className="font-mono text-[#e3b341]">
                    {hoursSummary.sat || '08:00 – 18:00'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                  <span className="font-semibold text-white">Sunday</span>
                  <span className="text-[#8b949e] font-medium">
                    {hoursSummary.sun || 'Closed'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 text-[11px] text-[#8b949e] flex items-center justify-between">
            <span>Enforced Timezone:</span>
            <span className="text-white font-mono">{location.timezone}</span>
          </div>
        </div>

        {/* Contact Information Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Phone className="w-4 h-4 text-[#a371f7]" />
                <span>Facility Contact Information</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditLocationOpen(true)}
                className="text-[11px] text-[#58a6ff] hover:text-white p-0 h-auto font-medium"
              >
                Edit
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Facility Lead</span>
                <span className="text-white font-semibold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#8b949e]" />
                  {location.contactPerson || 'Le Hoang Nam'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Facility Phone</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white">{location.phone}</span>
                  <button
                    onClick={() => handleCopy(location.phone, 'Phone')}
                    className="text-[#8b949e] hover:text-white"
                  >
                    {copiedField === 'Phone' ? (
                      <Check className="w-3 h-3 text-[#3fb950]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Operations Email</span>
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs">{location.email}</span>
                  <button
                    onClick={() => handleCopy(location.email, 'Email')}
                    className="text-[#8b949e] hover:text-white"
                  >
                    {copiedField === 'Email' ? (
                      <Check className="w-3 h-3 text-[#3fb950]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-[#8b949e] block mb-0.5">Emergency Hotline</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[#f85149] font-semibold">
                    {location.emergencyContact || '+84 91 844 5566'}
                  </span>
                  <button
                    onClick={() =>
                      handleCopy(location.emergencyContact || '+84 91 844 5566', 'Hotline')
                    }
                    className="text-[#8b949e] hover:text-white"
                  >
                    {copiedField === 'Hotline' ? (
                      <Check className="w-3 h-3 text-[#3fb950]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d] text-[11px] text-[#8b949e]">
            Hotline personnel receive automatic SMS & MQTT dispatch alerts on gate obstruction.
          </div>
        </div>
      </div>

      {/* 6. Access Overview & Real-Time Traffic Chart */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#30363d] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Activity className="w-4 h-4 text-[#58a6ff]" />
              <h3>Access Overview & Traffic Telemetry</h3>
            </div>
            <p className="text-xs text-[#8b949e]">
              Hourly inbound & outbound ANPR optical recognition activity at {location.name}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Time range selector */}
            <div className="flex items-center bg-[#0d0e12] rounded-lg p-0.5 border border-[#30363d]">
              {(['today', 'yesterday', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRangeFilter(range)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeRangeFilter === range
                      ? 'bg-[#21262d] text-white'
                      : 'text-[#8b949e] hover:text-white'
                  }`}
                >
                  {range === 'today'
                    ? 'Today'
                    : range === 'yesterday'
                    ? 'Yesterday'
                    : range === '7d'
                    ? '7 Days'
                    : '30 Days'}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTenantNavTab('access-events' as any)}
              className="text-xs border-[#30363d] text-[#58a6ff] hover:text-white gap-1.5"
            >
              <span>View Access Events</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* 4 Access KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-3.5">
            <span className="text-[11px] text-[#8b949e]">Total Access Today</span>
            <div className="text-xl font-bold text-white font-mono mt-0.5">
              {tenantSummary.accessToday.total.toLocaleString()}
            </div>
            <span className="text-[10px] text-[#3fb950]">↑ +12.4% vs last week</span>
          </div>

          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-3.5">
            <span className="text-[11px] text-[#8b949e]">Allowed Access</span>
            <div className="text-xl font-bold text-[#3fb950] font-mono mt-0.5">
              {tenantSummary.accessToday.allowed.toLocaleString()}
            </div>
            <span className="text-[10px] text-[#8b949e]">
              {(
                (tenantSummary.accessToday.allowed / (tenantSummary.accessToday.total || 1)) *
                100
              ).toFixed(1)}
              % Success Rate
            </span>
          </div>

          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-3.5">
            <span className="text-[11px] text-[#8b949e]">Denied Attempts</span>
            <div className="text-xl font-bold text-[#f85149] font-mono mt-0.5">
              {tenantSummary.accessToday.denied.toLocaleString()}
            </div>
            <span className="text-[10px] text-[#f85149]">Unregistered / expired</span>
          </div>

          <div className="bg-[#0d0e12] border border-[#30363d] rounded-xl p-3.5">
            <span className="text-[11px] text-[#8b949e]">Unknown / Review</span>
            <div className="text-xl font-bold text-[#e3b341] font-mono mt-0.5">
              {tenantSummary.accessToday.unknown.toLocaleString()}
            </div>
            <span className="text-[10px] text-[#8b949e]">Low confidence OCR</span>
          </div>
        </div>

        {/* Access Volume Area Chart */}
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={accessActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3fb950" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3fb950" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorDenied" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f85149" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f85149" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#8b949e"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#30363d' }}
              />
              <YAxis
                stroke="#8b949e"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#30363d' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  borderColor: '#30363d',
                  borderRadius: '0.75rem',
                  color: '#fff',
                  fontSize: '11px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
                }}
              />
              <Legend
                wrapperStyle={{
                  paddingTop: '10px',
                  fontSize: '11px',
                  color: '#8b949e'
                }}
              />
              <Area
                type="monotone"
                dataKey="allowed"
                name="Allowed Entries"
                stroke="#3fb950"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAllowed)"
              />
              <Area
                type="monotone"
                dataKey="denied"
                name="Denied / Blocked"
                stroke="#f85149"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorDenied)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 7. Vehicles & Access Rules Summary Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicles Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Car className="w-4 h-4 text-[#58a6ff]" />
                <span>Registered Vehicles & Whitelist</span>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                {tenantSummary.vehicles.total} Enrolled
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d]">
                <span className="text-[10px] text-[#8b949e] block">Total</span>
                <span className="text-lg font-bold text-white font-mono">
                  {tenantSummary.vehicles.total}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d]">
                <span className="text-[10px] text-[#3fb950] block">Active Whitelist</span>
                <span className="text-lg font-bold text-[#3fb950] font-mono">
                  {tenantSummary.vehicles.active}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0d0e12] border border-[#30363d]">
                <span className="text-[10px] text-[#f85149] block">Blocked / Expired</span>
                <span className="text-lg font-bold text-[#f85149] font-mono">
                  {tenantSummary.vehicles.inactive}
                </span>
              </div>
            </div>

            <p className="text-xs text-[#8b949e] leading-relaxed">
              Authorized employee vehicles, VIP pass-holders, and permanent delivery trucks mapped
              to this location.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTenantNavTab('vehicles')}
            className="w-full text-xs border-[#30363d] text-[#c9d1d9] hover:text-white justify-between"
          >
            <span>View Vehicles Whitelist</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#8b949e]" />
          </Button>
        </div>

        {/* Access Rules Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 text-[#3fb950]" />
                <span>Access Control Rules</span>
              </div>
              <Badge variant="healthy" className="text-[10px]">
                {tenantAccessRules.filter((r) => r.status === 'ACTIVE').length} Active Rules
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              {tenantAccessRules.slice(0, 3).map((rule) => (
                <div
                  key={rule.id}
                  className="p-2.5 rounded-xl bg-[#0d0e12] border border-[#30363d] flex items-center justify-between"
                >
                  <div>
                    <span className="font-semibold text-white">{rule.name}</span>
                    <span className="text-[10px] text-[#8b949e] block font-mono">
                      {typeof rule.schedule === 'string'
                        ? rule.schedule
                        : rule.schedule?.summaryText || rule.schedule?.type || 'Always Active (24/7)'}
                    </span>
                  </div>
                  <Badge variant={rule.status === 'ACTIVE' ? 'healthy' : 'outline'} className="text-[10px]">
                    {rule.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTenantNavTab('access_rules' as any)}
            className="w-full text-xs border-[#30363d] text-[#c9d1d9] hover:text-white justify-between"
          >
            <span>Manage Access Rules</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#8b949e]" />
          </Button>
        </div>
      </div>

      {/* Modals and Sheets */}
      <EditLocationSheet
        isOpen={isEditLocationOpen}
        onClose={() => setIsEditLocationOpen(false)}
        location={location}
        onSave={updateTenantLocation}
      />

      <EditOperatingHoursDialog
        isOpen={isEditHoursOpen}
        onClose={() => setIsEditHoursOpen(false)}
        schedule={location.operatingHours}
        onSave={updateLocationOperatingHours}
      />

      <DeactivateLocationDialog
        isOpen={isDeactivateOpen}
        onClose={() => setIsDeactivateOpen(false)}
        location={location}
        onConfirm={toggleLocationStatus}
      />
    </div>
  );
};
