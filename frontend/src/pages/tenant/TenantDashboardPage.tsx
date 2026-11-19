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
import { canManageTenantUsers, canTenantWrite } from '../../lib/permissions';
import { AccessEvent, TenantSite } from '../../types/tenant';
import { AccessEventDrawer } from '../../components/tenant/AccessEventDrawer';
import { SiteDetailDrawer } from '../../components/tenant/SiteDetailDrawer';
import { AddVehicleModal } from '../../components/tenant/AddVehicleModal';
import { InviteMemberModal } from '../../components/tenant/InviteMemberModal';
import { CreateAccessRuleModal } from '../../components/tenant/CreateAccessRuleModal';
import { useTranslation } from 'react-i18next';

export const TenantDashboardPage: React.FC = () => {
  const { t } = useTranslation('tenant');
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
    addToast,
    currentUser
  } = usePlatform();

  // Register vehicle / create rule are WRITE_ROLES (owner/admin/operator);
  // inviting a user is ADMIN_ROLES (owner/admin only) — mirrors
  // tenant/{vehicles,rules}.py vs. tenant/users.py's `require_roles(*ADMIN_ROLES)`.
  const canManage = canTenantWrite(currentUser.rawRole);
  const canInvite = canManageTenantUsers(currentUser.rawRole);

  // 1 Tenant = 1 Site constraint: Get the single dedicated site
  const site: TenantSite = tenantSites[0] || {
    id: '',
    name: t('No site configured'),
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
    description: t('Create a site to activate this dashboard.'),
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
    : 0;

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
      cameraName: lane?.cameraUrl ? 'ANPR Cam' : t('No camera'),
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
    <div className="space-y-6 pb-12 animate-in fade-in duration-[330ms]">
      {/* 1. TOP HEADER & SINGLE-FACILITY BANNER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card/80 p-4 md:p-5 rounded-2xl border border-border ">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-card border border-primary/30 flex items-center justify-center text-primary shrink-0 ">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl md:text-2xl font-medium text-foreground tracking-tight">
                {site.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border border-border text-primary">
                {site.code}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-success/15 text-success border border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-success " />
                {t('Dedicated Facility · 100% Operational')}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                {site.address}
              </span>
              <span className="hidden sm:inline-block text-border">•</span>
              <span className="flex items-center gap-1 text-foreground">
                <Clock className="w-3.5 h-3.5 text-primary" />
                {site.operatingHours}
              </span>
              <span className="hidden sm:inline-block text-border">•</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {t('Manager:')} {site.managerName} ({site.managerPhone})
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls & Date Filter */}
        <div className="flex items-center flex-wrap gap-2.5 self-start lg:self-center">
          {/* Live ANPR Simulation button — dev/demo only; writes a real
              source:manual event, so hidden in production builds. */}
          {import.meta.env.DEV && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => simulateNewAccessEvent()}
              className="text-xs bg-background border-border text-primary hover:bg-primary/10 hover:border-primary/50 gap-1.5 font-medium"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {t('Simulate Event')}
            </Button>
          )}

          {/* Date Filter Dropdown */}
          <div className="relative">
            <select
              value={tenantDateFilter}
              onChange={(e) => setTenantDateFilter(e.target.value)}
              className="appearance-none bg-background border border-border hover:border-primary/50 rounded-xl px-3.5 py-2 pr-8 text-xs font-medium text-foreground focus:outline-hidden focus:border-primary cursor-pointer transition-colors"
            >
              <option value="today">{t('Today (Live)')}</option>
              <option value="yesterday">{t('Yesterday')}</option>
              <option value="7d">{t('Last 7 days')}</option>
              <option value="30d">{t('Last 30 days')}</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Refresh Action */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              isLoading={isTenantRefreshing}
              onClick={refreshTenantDashboard}
              className="text-xs bg-background border-border text-foreground hover:text-foreground hover:border-primary/50 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTenantRefreshing ? 'animate-spin' : ''}`} />
              {t('Refresh')}
            </Button>
            <span className="text-[11px] text-muted-foreground hidden xl:inline-block ">
              {t('Sync:')} {lastUpdatedTime}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ACTIVE ALERT NOTIFICATION (IF ANY) */}
      {activeAlert && (
        <div className="p-4 rounded-xl bg-card border border-warning/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top duration-[330ms]">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/20 border border-warning/30 text-warning flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-warning ">
                  {activeAlert.title}
                </span>
                <span className="text-[11px] text-muted-foreground ">({activeAlert.timeAgo})</span>
              </div>
              <p className="text-xs text-foreground mt-0.5">
                {activeAlert.message}
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => resolveTenantAlert(activeAlert.id)}
                className="text-xs text-muted-foreground hover:text-foreground border-border"
              >
                {t('Dismiss')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 3. 5 KPI SUMMARY CARDS (TAILORED FOR SINGLE FACILITY) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Facility & Lane Status */}
        <div
          onClick={handleOpenSite}
          className="p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('Facility Status')}</span>
            <div className="w-7 h-7 rounded-lg bg-muted text-success flex items-center justify-center transition-transform">
              <Building2 className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-xl font-medium text-foreground flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-success" />
              {t('OPERATIONAL')}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60">
            <span className="text-success font-medium">
              {tenantLanes.length > 0
                ? t('{{live}}/{{total}} Lanes Live', {
                    live: tenantLanes.filter((l) => (l.status ?? '').toLowerCase() === 'active').length,
                    total: tenantLanes.length,
                  })
                : t('Lanes not configured')}
            </span>
            <span className="text-primary">{t('{{count}} Site(s)', { count: tenantSites.length })}</span>
          </div>
        </div>

        {/* Card 2: Parking Occupancy */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('Occupancy')}</span>
            <div className="w-7 h-7 rounded-lg bg-muted text-primary flex items-center justify-center">
              <Car className="w-4 h-4" />
            </div>
          </div>

          <div className="my-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-medium text-foreground ">{site.currentOccupancy}</span>
              <span className="text-xs text-muted-foreground ">/ {site.capacity} {t('slots')}</span>
            </div>
            {/* Visual occupancy bar */}
            <div className="w-full h-1.5 rounded-full bg-background overflow-hidden mt-1.5 border border-border">
              <div
                className={`h-full rounded-full ${occupancyPercent > 80 ? 'bg-destructive' : occupancyPercent > 60 ? 'bg-primary' : 'bg-success'}`}
                style={{ width: `${occupancyPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/60">
            <span className="text-primary font-medium">{t('{{pct}}% Filled', { pct: occupancyPercent })}</span>
            <span className="text-success font-medium">{t('{{count}} Free', { count: (site.capacity || 0) - (site.currentOccupancy || 0) })}</span>
          </div>
        </div>

        {/* Card 3: ANPR Cameras & Hardware */}
        <div className="p-4 rounded-xl bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('ANPR & Gates')}</span>
            <div className="w-7 h-7 rounded-lg bg-muted text-primary flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl font-medium text-foreground ">
              {site.onlineCameraCount} / {site.cameraCount}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60">
            <span className="text-success font-medium">{t('{{count}} Gates Online', { count: site.onlineGateCount })}</span>
            <span className="text-primary font-medium">{t('{{count}} Edge Nodes', { count: site.onlineEdgeDeviceCount })}</span>
          </div>
        </div>

        {/* Card 4: Registered Fleet */}
        <div
          onClick={() => setTenantNavTab('vehicles')}
          className="p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{t('Registered Fleet')}</span>
            <div className="w-7 h-7 rounded-lg bg-muted text-primary flex items-center justify-center transition-transform">
              <Car className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="text-2xl font-medium text-foreground ">
              {tenantSummary.vehicles.total.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60">
            <span className="text-success font-medium">{t('{{count}} Active', { count: tenantSummary.vehicles.active })}</span>
            <span className="text-primary font-medium">{t('+{{count}} this mo', { count: tenantSummary.vehicles.newThisMonth })}</span>
          </div>
        </div>

        {/* Card 5: Access Today (Most Prominent) */}
        <div className="p-4 rounded-xl bg-card border border-primary/40 flex flex-col justify-between ">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              {t("Today's Passes")}
            </span>
            <span className="text-[11px] text-success font-medium flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> +{tenantSummary.accessToday.percentChange}%
            </span>
          </div>

          <div className="my-2">
            <div className="text-2xl font-medium text-foreground tracking-tight">
              {tenantSummary.accessToday.total.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/60">
            <span className="text-success font-medium">
              ✓ {tenantSummary.accessToday.total ? ((tenantSummary.accessToday.allowed / tenantSummary.accessToday.total) * 100).toFixed(1) : '0.0'}%
            </span>
            <span className="text-destructive font-medium">
              ✕ {tenantSummary.accessToday.total ? ((tenantSummary.accessToday.denied / tenantSummary.accessToday.total) * 100).toFixed(1) : '0.0'}%
            </span>
          </div>
        </div>
      </div>

      {/* 4. REAL-TIME PHYSICAL LANES & BARRIER GATE CONTROLLER */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 text-primary flex items-center justify-center font-medium">
              <DoorOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground tracking-tight flex items-center gap-2">
                {t('Facility Lanes & Barrier Gate Controllers')}
                <span className="text-[11px] font-medium px-2 py-0.2 rounded-full bg-success/15 text-success border border-success/30">
                  {t('{{count}} Active', { count: lanes.length })}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('Direct hardware telemetry and automated ANPR barrier relay trigger commands')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('Interlock Protocol:')}</span>
            <span className="text-xs font-medium text-success bg-background px-2.5 py-1 rounded-lg border border-border">
              {t('Safety Loop Armed')}
            </span>
          </div>
        </div>

        {/* 4 Lanes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {lanes.map((lane) => (
            <div
              key={lane.id}
              className="p-4 rounded-xl bg-background border border-border hover:border-primary/40 transition-colors flex flex-col justify-between space-y-3"
            >
              {/* Lane Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-medium px-1.5 py-0.2 rounded ${
                      lane.direction === 'IN' ? 'bg-primary/20 text-primary' : 'bg-chart-5/20 text-chart-5'
                    }`}>
                      {lane.direction === 'IN' ? t('↓ INBOUND') : t('↑ OUTBOUND')}
                    </span>
                    <h4 className="text-xs font-medium text-foreground">{lane.name.split('(')[0]}</h4>
                  </div>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">{lane.gateName}</span>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-success/15 text-success border border-success/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  {t(lane.barrierState)}
                </span>
              </div>

              {/* Hardware & ANPR Status */}
              <div className="space-y-1.5 text-xs bg-card p-2.5 rounded-lg border border-border/60">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Camera className="w-3 h-3 text-primary" />
                    {lane.cameraName}
                  </span>
                  <span className="text-success font-medium">{lane.ocrAccuracy} OCR</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-muted-foreground" />
                    {lane.edgeNode}
                  </span>
                  <span className="text-muted-foreground ">18ms {t('Latency')}</span>
                </div>
              </div>

              {/* Last Vehicle Throughput */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{t('Last Vehicle:')}</span>
                  <span className="text-[11px] text-muted-foreground ">{lane.lastTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className=" font-medium text-foreground text-xs px-2 py-0.5 rounded bg-card border border-border">
                    {lane.lastPlate}
                  </span>
                  <span className="text-[11px] text-success font-medium">
                    ✓ {t('Allowed')}
                  </span>
                </div>
              </div>

              {/* Manual Override Action Controls */}
              {canManage ? (
                <div className="pt-2 border-t border-border flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      triggerGateCommand(lane.gateId, 'OPEN');
                    }}
                    className="flex-1 text-[11px] py-1.5 bg-success/15 hover:bg-success/30 text-success border-success/40 gap-1 justify-center"
                  >
                    <Unlock className="w-3 h-3" />
                    {t('Open Barrier')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      triggerGateCommand(lane.gateId, 'RESET');
                    }}
                    className="text-[11px] py-1.5 px-2 bg-card text-muted-foreground hover:text-foreground border-border"
                    title={t('Reset Controller')}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="pt-2 border-t border-border text-[11px] text-muted-foreground italic text-center">
                  {t('View only')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 5. OPERATIONS & ANALYTICS SECTION (8/4 GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Col 8: Access Activity Timeline Chart */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground tracking-tight">{t('Facility Traffic & ANPR Throughput')}</h3>
                <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {t('Hourly Distribution')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('Real-time throughput comparison of Allowed vs. Denied vs. Unknown plates')}
              </p>
            </div>

            {/* Series Legend Indicators */}
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-success font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-success" /> {t('Allowed')}
              </span>
              <span className="flex items-center gap-1.5 text-destructive font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-destructive" /> {t('Denied')}
              </span>
              <span className="flex items-center gap-1.5 text-warning font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" /> {t('Unknown')}
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
                  name={t('Allowed')}
                  stroke="#3fb950"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAllowed)"
                />
                <Area
                  type="monotone"
                  dataKey="denied"
                  name={t('Denied')}
                  stroke="#f85149"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDenied)"
                />
                <Area
                  type="monotone"
                  dataKey="unknown"
                  name={t('Unknown')}
                  stroke="#e3b341"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorUnknown)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Access Summary Bar below Chart */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
            <div className="p-2.5 rounded-lg bg-background border border-border">
              <span className="text-[11px] text-muted-foreground font-medium block">{t('Total Allowed')}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-medium text-foreground ">
                  {tenantSummary.accessToday.allowed.toLocaleString()}
                </span>
                <span className="text-[11px] text-success font-medium">
                  (96.3%)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-background border border-border">
              <span className="text-[11px] text-muted-foreground font-medium block">{t('Total Denied')}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-medium text-foreground ">
                  {tenantSummary.accessToday.denied.toLocaleString()}
                </span>
                <span className="text-[11px] text-destructive font-medium">
                  (3.0%)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-background border border-border">
              <span className="text-[11px] text-muted-foreground font-medium block">{t('OCR Flagged Review')}</span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-medium text-foreground ">
                  {tenantSummary.accessToday.unknown.toLocaleString()}
                </span>
                <span className="text-[11px] text-warning font-medium">
                  (0.7%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Col 4: Facility Hardware & Edge Telemetry Health */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground tracking-tight">{t('Edge AI & Telemetry')}</h3>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-success/15 text-success border border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {t('100% HEALTHY')}
              </span>
            </div>

            {/* Hardware Health Progress Bars */}
            <div className="space-y-3 mt-3.5 text-xs">
              {/* Cameras */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-primary" /> {t('ANPR Cameras')}
                  </span>
                  <span className="text-foreground font-medium">
                    {site.onlineCameraCount} / {site.cameraCount} {t('Online')}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-background overflow-hidden border border-border">
                  <div className="h-full rounded-full bg-success w-full" />
                </div>
              </div>

              {/* Gates */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-primary" /> {t('Automated Barriers')}
                  </span>
                  <span className="text-foreground font-medium">
                    {site.onlineGateCount} / {site.gateCount} {t('Online')}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-background overflow-hidden border border-border">
                  <div className="h-full rounded-full bg-success w-full" />
                </div>
              </div>

              {/* Edge Devices */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-primary" /> {t('Edge AI Gateways')}
                  </span>
                  <span className="text-foreground font-medium">
                    {site.onlineEdgeDeviceCount} / {site.edgeDeviceCount} {t('Active')}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-background overflow-hidden border border-border">
                  <div className="h-full rounded-full bg-primary w-full" />
                </div>
              </div>
            </div>

            {/* Edge Compute Metrics */}
            <div className="grid grid-cols-2 gap-2 mt-4 text-[11px]">
              <div className="p-2 rounded-lg bg-background border border-border">
                <span className="text-muted-foreground block">{t('Edge CPU Load')}</span>
                <span className="text-foreground font-medium text-xs mt-0.5 block">34% ({t('Normal')})</span>
              </div>
              <div className="p-2 rounded-lg bg-background border border-border">
                <span className="text-muted-foreground block">{t('Avg OCR Speed')}</span>
                <span className="text-success font-mono font-medium text-xs mt-0.5 block">380ms / {t('plate')}</span>
              </div>
            </div>
          </div>

          {/* Infrastructure Connectivity Badges */}
          <div className="pt-3 border-t border-border space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-background border border-border">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-primary" /> Cloud REST Sync
              </span>
              <span className="text-success font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                18ms {t('Latency')}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-background border border-border">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-primary" /> WebSocket Telemetry
              </span>
              <span className="text-success font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success " />
                {t('Live Stream')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. MONITORING SECTION: RECENT ACCESS EVENTS + NEEDS ATTENTION (8/4 GRID) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Col 8: Recent Access Events Table */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-medium text-foreground tracking-tight">{t('Live Facility Access Stream')}</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-success/15 text-success border border-success/30">
                <span className="w-1.5 h-1.5 rounded-full bg-success " />
                {t('Live ANPR Captures')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTenantNavTab('access_events')}
                className="text-xs bg-background border-border text-primary hover:text-foreground"
              >
                {t('View Full Log')} →
              </Button>
            </div>
          </div>

          {/* Events Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background text-muted-foreground border-y border-border font-medium text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">{t('Time')}</th>
                  <th className="py-2.5 px-3">{t('Plate')}</th>
                  <th className="py-2.5 px-3">{t('Gate & Lane')}</th>
                  <th className="py-2.5 px-3">{t('Owner / Role')}</th>
                  <th className="py-2.5 px-3">{t('Decision')}</th>
                  <th className="py-2.5 px-3">{t('OCR Conf')}</th>
                  <th className="py-2.5 px-3 text-right">{t('Inspect')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-medium">
                {accessEvents.slice(0, 6).map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => handleOpenEvent(event)}
                    className="hover:bg-muted/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3 text-muted-foreground text-[11px] whitespace-nowrap">
                      {event.timeFormatted}
                    </td>

                    <td className="py-3 px-3">
                      <span className=" font-medium text-foreground px-2 py-0.5 rounded bg-background border border-border group-hover:border-primary/40 transition-colors">
                        {event.plate}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                      <span className="text-foreground">{event.gateName}</span>
                      <span className="text-[11px] text-muted-foreground block ">
                        {event.direction === 'IN' ? t('↓ Inbound') : t('↑ Outbound')}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-foreground whitespace-nowrap">
                      <div>{event.ownerName || t('Unregistered')}</div>
                      <span className="text-[11px] text-muted-foreground ">{event.ownerType}</span>
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                        event.decision === 'ALLOWED'
                          ? 'bg-success/15 text-success border border-success/30'
                          : event.decision === 'DENIED'
                          ? 'bg-destructive/15 text-destructive border border-destructive/30'
                          : event.decision === 'BLOCKED'
                          ? 'bg-destructive/25 text-destructive border border-destructive/50'
                          : 'bg-warning/15 text-warning border border-warning/30'
                      }`}>
                        {event.decision === 'ALLOWED' && <CheckCircle2 className="w-3 h-3" />}
                        {event.decision === 'DENIED' && <XCircle className="w-3 h-3" />}
                        {event.decision === 'BLOCKED' && <XCircle className="w-3 h-3" />}
                        {event.decision === 'UNKNOWN' && <AlertTriangle className="w-3 h-3" />}
                        {t(event.decision)}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-muted-foreground text-[11px]">
                      {(event.plateConfidence * 100).toFixed(1)}%
                    </td>

                    <td className="py-3 px-3 text-right">
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-colors inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Col 4: Facility Profile & Direct Actions Card */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-card border border-border space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground tracking-tight">{t('Facility Details')}</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenSite}
                className="text-[11px] py-1 px-2.5 bg-background border-border text-primary hover:text-foreground"
              >
                {t('Inspect')} →
              </Button>
            </div>

            <div className="space-y-3 mt-3 text-xs">
              <div className="p-3 rounded-xl bg-background border border-border space-y-1.5">
                <span className="text-[11px] text-muted-foreground font-medium block">{t('Facility Name & Code')}</span>
                <div className="text-foreground font-medium text-sm">{site.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  {site.address}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block">{t('Operating Hours')}</span>
                  <span className="text-foreground font-medium mt-0.5 block">{site.operatingHours}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block">{t('Capacity')}</span>
                  <span className="text-foreground font-medium mt-0.5 block">{t('{{count}} Total Slots', { count: site.capacity })}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-background border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground font-medium block">{t('Facility Manager Contact')}</span>
                <div className="text-foreground font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-primary" />
                  {site.managerName}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  {site.managerPhone}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setTenantNavTab('sites')}
              className="w-full text-xs bg-background border-border text-foreground hover:border-primary justify-center py-2.5 gap-1.5"
            >
              <Settings className="w-3.5 h-3.5 text-primary" />
              {t('Manage Facility Hardware & Config')}
            </Button>
          </div>
        </div>
      </div>

      {/* 7. QUICK ADMINISTRATIVE ACTIONS */}
      <div className="p-5 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-medium text-foreground tracking-tight mb-3">{t('Quick Actions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {canManage && (
            <Button
              variant="outline"
              onClick={() => setIsAddVehicleOpen(true)}
              className="text-xs bg-background border-border text-foreground hover:border-primary py-3 gap-2 justify-center"
            >
              <Car className="w-4 h-4 text-primary" />
              {t('+ Register Vehicle')}
            </Button>
          )}

          {canInvite && (
            <Button
              variant="outline"
              onClick={() => setIsInviteMemberOpen(true)}
              className="text-xs bg-background border-border text-foreground hover:border-primary py-3 gap-2 justify-center"
            >
              <UserPlus className="w-4 h-4 text-success" />
              {t('+ Invite Operator')}
            </Button>
          )}

          {canManage && (
            <Button
              variant="outline"
              onClick={() => setIsCreateRuleOpen(true)}
              className="text-xs bg-background border-border text-foreground hover:border-primary py-3 gap-2 justify-center"
            >
              <ShieldCheck className="w-4 h-4 text-warning" />
              {t('+ Add Access Rule')}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleOpenSite}
            className="text-xs bg-background border-border text-foreground hover:border-primary py-3 gap-2 justify-center"
          >
            <Building2 className="w-4 h-4 text-chart-5" />
            {t('Facility Hardware Details')}
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
            title: t('Vehicle Blocked'),
            description: t('Plate {{plate}} added to tenant security blacklist.', { plate: evt.plate })
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
