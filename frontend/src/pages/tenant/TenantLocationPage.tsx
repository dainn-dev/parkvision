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
import { canTenantWrite } from '../../lib/permissions';
import { EditLocationSheet } from '../../components/tenant/EditLocationSheet';
import { EditOperatingHoursDialog } from '../../components/tenant/EditOperatingHoursDialog';
import { DeactivateLocationDialog } from '../../components/tenant/DeactivateLocationDialog';
import { SiteDetailDrawer } from '../../components/tenant/SiteDetailDrawer';
import { useTranslation } from 'react-i18next';

export const TenantLocationPage: React.FC = () => {
  const { t } = useTranslation('tenant');
  const {
    tenantLocation,
    tenantHealth,
    tenantSummary,
    accessActivity,
    registeredVehicles,
    tenantAccessRules,
    tenantSites,
    updateTenantLocation,
    updateLocationOperatingHours,
    toggleLocationStatus,
    setTenantNavTab,
    addToast,
    currentUser
  } = usePlatform();

  // Edit location/hours and activate/deactivate are WRITE_ROLES
  // (owner/admin/operator) — mirrors tenant/sites.py's `require_roles(*WRITE_ROLES)`.
  const canManage = canTenantWrite(currentUser.rawRole);

  // Dialog / Sheet states
  const [isEditLocationOpen, setIsEditLocationOpen] = useState(false);
  const [isEditHoursOpen, setIsEditHoursOpen] = useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [showInteractiveMap, setShowInteractiveMap] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [timeRangeFilter, setTimeRangeFilter] = useState<'today' | 'yesterday' | '7d' | '30d'>('today');
  const [isCameraDrawerOpen, setIsCameraDrawerOpen] = useState(false);

  const location = tenantLocation;
  const isHealthy = tenantHealth?.overall === 'HEALTHY';
  const isActive = location?.status === 'ACTIVE';

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    addToast({
      type: 'info',
      title: t('Copied to Clipboard'),
      description: t('{{field}} copied.', { field: fieldName })
    });
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Format operating hours display
  const getOperatingHoursSummary = () => {
    if (!location?.operatingHours || location.operatingHours.isOpen24_7) {
      return {
        mode: t('24/7 Mode'),
        description: t('Facility is open 24 hours / 7 days continuous')
      };
    }
    const days = location.operatingHours.days || [];
    const mon = days.find((d) => d.day === 'MONDAY');
    const sat = days.find((d) => d.day === 'SATURDAY');
    const sun = days.find((d) => d.day === 'SUNDAY');

    const monText = mon?.enabled ? `${mon.open} – ${mon.close}` : t('Closed');
    const satText = sat?.enabled ? `${sat.open} – ${sat.close}` : t('Closed');
    const sunText = sun?.enabled ? `${sun.open} – ${sun.close}` : t('Closed');

    return {
      mode: t('Scheduled Hours'),
      monFri: monText,
      sat: satText,
      sun: sunText
    };
  };

  const hoursSummary = getOperatingHoursSummary();

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-[330ms]">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/30 text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-medium text-foreground tracking-tight">{t('Location')}</h1>
                <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-foreground font-medium border border-border">
                  {location.name}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] bg-card text-muted-foreground border border-border">
                  {location.code}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("Your organization's physical operating location, hardware topology, and schedule")}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsEditLocationOpen(true)}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 font-medium "
            >
              <Edit className="w-3.5 h-3.5" />
              {t('Edit Location')}
            </Button>
          )}

          {/* Secondary Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
              className="p-2 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMoreMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsMoreMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl py-1.5 z-30 text-xs animate-in zoom-in-95 duration-[330ms]">
                  <button
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      setShowInteractiveMap(!showInteractiveMap);
                    }}
                    className="w-full px-3.5 py-2 text-left text-foreground hover:text-foreground hover:bg-muted flex items-center gap-2.5 transition-colors"
                  >
                    <Compass className="w-4 h-4 text-primary" />
                    <span>{showInteractiveMap ? t('Hide Map View') : t('View on Map')}</span>
                  </button>

                  {canManage && (
                    <>
                      <button
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setIsEditHoursOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-left text-foreground hover:text-foreground hover:bg-muted flex items-center gap-2.5 transition-colors"
                      >
                        <Clock className="w-4 h-4 text-success" />
                        <span>{t('Manage Operating Hours')}</span>
                      </button>

                      <div className="border-t border-border my-1" />

                      <button
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          setIsDeactivateOpen(true);
                        }}
                        className={`w-full px-3.5 py-2 text-left flex items-center gap-2.5 transition-colors ${
                          isActive
                            ? 'text-destructive hover:bg-destructive/15'
                            : 'text-success hover:bg-success/15'
                        }`}
                      >
                        <Power className="w-4 h-4" />
                        <span>{isActive ? t('Deactivate Location') : t('Activate Location')}</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Location Status Banner */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors ${
          isActive
            ? 'bg-success/10 border-success/30 text-foreground'
            : 'bg-destructive/10 border-destructive/30 text-foreground'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              isActive ? 'bg-success ' : 'bg-destructive'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs">
                {isActive ? t('Active & Operational') : t('Location Deactivated')}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('Last updated: 10 seconds ago')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isActive
                ? t('Location is fully operational and processing live ANPR camera access events across all lanes.')
                : t('Automated ANPR gate operations are suspended. Hardware telemetry remains in diagnostic mode.')}
            </p>
          </div>
        </div>

        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeactivateOpen(true)}
            className={`text-xs self-start sm:self-auto shrink-0 border ${
              isActive
                ? 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/40'
                : 'border-success/50 bg-success/20 text-success hover:bg-success/30'
            }`}
          >
            <Power className="w-3.5 h-3.5 mr-1.5" />
            {isActive ? t('Deactivate') : t('Activate Location')}
          </Button>
        )}
      </div>

      {/* 3. Overview Row (2 Columns: Location Info + System Health) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Location Information Card (7 cols) */}
        <div className="lg:col-span-7 bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <MapPin className="w-4 h-4 text-primary" />
                <span>{t('Location Information')}</span>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditLocationOpen(true)}
                  className="text-[11px] text-primary hover:text-foreground p-0 h-auto font-medium"
                >
                  {t('Edit')}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Location Name')}</span>
                <span className="text-foreground font-medium">{location.name}</span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Location Code')}</span>
                <span className=" text-foreground bg-background px-2 py-0.5 rounded border border-border">
                  {location.code}
                </span>
              </div>

              <div className="sm:col-span-2">
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Physical Address')}</span>
                <div className="flex items-start justify-between gap-2 bg-background p-2.5 rounded-xl border border-border">
                  <p className="text-foreground text-xs leading-relaxed">
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
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copiedField === 'Address' ? (
                      <Check className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Timezone')}</span>
                <span className="text-foreground text-xs flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  {location.timezone} (UTC+07:00)
                </span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Coordinates')}</span>
                <div className="flex items-center gap-2">
                  <span className=" text-foreground text-xs">
                    {(Number(location?.latitude) || 10.7769).toFixed(4)}, {(Number(location?.longitude) || 106.7009).toFixed(4)}
                  </span>
                  <button
                    onClick={() => setShowInteractiveMap(!showInteractiveMap)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    {showInteractiveMap ? t('Hide map') : t('View on map')}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Slot Capacity')}</span>
                <span className="text-foreground font-medium text-xs">
                  {location.capacity || 0} {t('Vehicles')}
                </span>
                <span className="text-[11px] text-muted-foreground ml-2">
                  ({t('Occupancy:')} {location.currentOccupancy || 0}{location.capacity ? ` / ${Math.round((location.currentOccupancy || 0) / location.capacity * 100)}%` : ''})
                </span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Facility Type')}</span>
                <span className="text-foreground text-xs">{t('Dedicated Headquarters Campus')}</span>
              </div>
            </div>
          </div>

          {/* Interactive Map Preview Drawer */}
          {showInteractiveMap && (
            <div className="pt-3 border-t border-border space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5 text-foreground font-medium">
                  <Compass className="w-3.5 h-3.5 text-warning" />
                  {t('Geographic Location Overlay')}
                </span>
                <span className="">
                  {location.latitude}, {location.longitude}
                </span>
              </div>

              {/* Styled Mock Map Container */}
              <div className="relative h-44 rounded-xl border border-border overflow-hidden bg-background flex items-center justify-center">
                {/* Visual grid / road simulation */}
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#58a6ff_1px,transparent_1px)] [background-size:16px_16px]" />
                
                {/* Simulated Road Lines */}
                <div className="absolute top-1/2 left-0 right-0 h-4 bg-muted -translate-y-1/2" />
                <div className="absolute top-0 bottom-0 left-1/3 w-4 bg-muted" />
                <div className="absolute top-0 bottom-0 left-2/3 w-3 bg-muted" />

                {/* Marker */}
                <div className="relative z-10 flex flex-col items-center ">
                  <div className="px-2 py-0.5 bg-primary text-black font-medium text-[11px] rounded-full mb-1">
                    {location.name}
                  </div>
                  <div className="p-2 rounded-full bg-destructive text-[#fff] ring-4 ring-destructive/30">
                    <MapPin className="w-4 h-4 fill-white text-foreground" />
                  </div>
                </div>

                <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/80 text-[11px] text-muted-foreground border border-border">
                  {t('District 1, Ho Chi Minh City')}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: System Health Card (5 cols) */}
        <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <Activity className="w-4 h-4 text-success" />
                <span>{t('System Health & Telemetry')}</span>
              </div>
              <Badge
                variant={isHealthy ? 'emerald' : 'amber'}
                className="text-[11px] "
              >
                ● {t(tenantHealth.overall)}
              </Badge>
            </div>

            <div className="divide-y divide-muted text-xs pt-1">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-primary" />
                  {t('ANPR Cameras')}
                </span>
                <span className="text-foreground font-medium">
                  {tenantHealth.cameras.online} / {tenantHealth.cameras.total} {t('Online')}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <DoorOpen className="w-3.5 h-3.5 text-success" />
                  {t('Barrier Gate Relays')}
                </span>
                <span className="text-foreground font-medium">
                  {tenantHealth.gates.online} / {tenantHealth.gates.total} {t('Online')}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-warning" />
                  {t('Edge OCR Nodes')}
                </span>
                <span className="text-foreground font-medium">
                  {tenantHealth.edgeDevices.online} / {tenantHealth.edgeDevices.total} {t('Online')}
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-chart-5" />
                  {t('Cloud API Latency')}
                </span>
                <span className="text-success text-xs">
                  {tenantHealth.apiLatencyMs}ms ({t('Optimal')})
                </span>
              </div>

              <div className="py-2.5 flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-primary" />
                  {t('Live Event Stream')}
                </span>
                <span className="text-success text-xs flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success " />
                  {t('WebSocket Active')}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t('Status sync:')}</span>
            <span className="text-foreground ">{t('Continuous Telemetry Poll')}</span>
          </div>
        </div>
      </div>

      {/* 4. Infrastructure Summary Card */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4 ">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-foreground font-medium text-xs">
            <Server className="w-4 h-4 text-primary" />
            <span>{t('Infrastructure Hardware Summary')}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {t('Installed & configured hardware at this location')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cameras Block */}
          <div className="bg-background border border-border rounded-xl p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <Badge variant="emerald" className="text-[11px]">
                  {t('All Operational')}
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground">{t('ANPR Cameras')}</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-medium text-foreground ">
                    {tenantSummary.cameras.total}
                  </span>
                  <span className="text-xs text-success ">
                    {tenantSummary.cameras.online} {t('online')}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {t('Dual-angle optical OCR cameras covering 4 inbound & outbound lanes.')}
              </p>
            </div>

            <button
              onClick={() => setIsCameraDrawerOpen(true)}
              className="mt-4 pt-3 border-t border-muted flex items-center justify-between text-xs text-primary hover:text-foreground font-medium group transition-colors"
            >
              <span>{t('Manage Cameras')}</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Gates Block */}
          <div className="bg-background border border-border rounded-xl p-4 flex flex-col justify-between hover:border-success/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-success/15 text-success flex items-center justify-center">
                  <DoorOpen className="w-4 h-4" />
                </div>
                <Badge variant="emerald" className="text-[11px]">
                  {t('4 Relays Synced')}
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground">{t('Barrier Gates')}</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-medium text-foreground ">
                    {tenantSummary.gates.total}
                  </span>
                  <span className="text-xs text-success ">
                    {tenantSummary.gates.online} {t('online')}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {t('High-speed motorized boom barriers with MQTT relay control & loop sensors.')}
              </p>
            </div>

            <button
              onClick={() => setTenantNavTab('gates' as any)}
              className="mt-4 pt-3 border-t border-muted flex items-center justify-between text-xs text-success hover:text-foreground font-medium group transition-colors"
            >
              <span>{t('Manage Gates')}</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Edge Devices Block */}
          <div className="bg-background border border-border rounded-xl p-4 flex flex-col justify-between hover:border-warning/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-warning/15 text-warning flex items-center justify-center">
                  <Server className="w-4 h-4" />
                </div>
                <Badge variant="emerald" className="text-[11px]">
                  {t('3 Active Nodes')}
                </Badge>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground">{t('Edge Gateways')}</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-medium text-foreground ">
                    {tenantHealth.edgeDevices.total}
                  </span>
                  <span className="text-xs text-success ">
                    {tenantHealth.edgeDevices.online} {t('online')}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {t('NVIDIA Jetson on-premise compute nodes running real-time license plate detection.')}
              </p>
            </div>

            <button
              onClick={() => setTenantNavTab('edge-devices')}
              className="mt-4 pt-3 border-t border-muted flex items-center justify-between text-xs text-warning hover:text-foreground font-medium group transition-colors"
            >
              <span>{t('Manage Edge Devices')}</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. 2-Column Operational Grid (Operating Hours & Contact Information) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operating Hours Card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <Clock className="w-4 h-4 text-success" />
                <span>{t('Operating Hours')}</span>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditHoursOpen(true)}
                  className="text-[11px] text-primary hover:text-foreground p-0 h-auto font-medium"
                >
                  {t('Edit Hours')}
                </Button>
              )}
            </div>

            {location.operatingHours.isOpen24_7 ? (
              <div className="p-4 rounded-xl bg-success/10 border border-success/30 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                <div>
                  <h4 className="text-foreground font-medium text-xs">{t('24/7 Operations')}</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {t('Facility is open and processing registered vehicle entries around the clock.')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border">
                  <span className="font-medium text-foreground">{t('Monday – Friday')}</span>
                  <span className=" text-success">
                    {hoursSummary.monFri || '07:00 – 22:00'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border">
                  <span className="font-medium text-foreground">{t('Saturday')}</span>
                  <span className=" text-warning">
                    {hoursSummary.sat || '08:00 – 18:00'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border">
                  <span className="font-medium text-foreground">{t('Sunday')}</span>
                  <span className="text-muted-foreground font-medium">
                    {hoursSummary.sun || t('Closed')}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{t('Enforced Timezone:')}</span>
            <span className="text-foreground ">{location.timezone}</span>
          </div>
        </div>

        {/* Contact Information Card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <Phone className="w-4 h-4 text-chart-5" />
                <span>{t('Facility Contact Information')}</span>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditLocationOpen(true)}
                  className="text-[11px] text-primary hover:text-foreground p-0 h-auto font-medium"
                >
                  {t('Edit')}
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Facility Lead')}</span>
                <span className="text-foreground font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  {location.contactPerson || '—'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Facility Phone')}</span>
                <div className="flex items-center gap-2">
                  <span className=" text-foreground">{location.phone}</span>
                  <button
                    onClick={() => handleCopy(location.phone, 'Phone')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedField === 'Phone' ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Operations Email')}</span>
                <div className="flex items-center gap-2">
                  <span className="text-foreground text-xs">{location.email}</span>
                  <button
                    onClick={() => handleCopy(location.email, 'Email')}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedField === 'Email' ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-muted-foreground block mb-0.5">{t('Emergency Hotline')}</span>
                <div className="flex items-center gap-2">
                  <span className=" text-destructive font-medium">
                    {location.emergencyContact || '+84 91 844 5566'}
                  </span>
                  <button
                    onClick={() =>
                      handleCopy(location.emergencyContact || '+84 91 844 5566', 'Hotline')
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copiedField === 'Hotline' ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-background border border-border text-[11px] text-muted-foreground">
            {t('Hotline personnel receive automatic SMS & MQTT dispatch alerts on gate obstruction.')}
          </div>
        </div>
      </div>

      {/* 6. Access Overview & Real-Time Traffic Chart */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5 ">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-foreground font-medium text-sm">
              <Activity className="w-4 h-4 text-primary" />
              <h3>{t('Access Overview & Traffic Telemetry')}</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Hourly inbound & outbound ANPR optical recognition activity at {{name}}', { name: location.name })}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Time range selector */}
            <div className="flex items-center bg-background rounded-lg p-0.5 border border-border">
              {(['today', 'yesterday', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRangeFilter(range)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    timeRangeFilter === range
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {range === 'today'
                    ? t('Today')
                    : range === 'yesterday'
                    ? t('Yesterday')
                    : range === '7d'
                    ? t('7 Days')
                    : t('30 Days')}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTenantNavTab('access-events' as any)}
              className="text-xs border-border text-primary hover:text-foreground gap-1.5"
            >
              <span>{t('View Access Events')}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* 4 Access KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-background border border-border rounded-xl p-3.5">
            <span className="text-[11px] text-muted-foreground">{t('Total Access Today')}</span>
            <div className="text-xl font-medium text-foreground mt-0.5">
              {tenantSummary.accessToday.total.toLocaleString()}
            </div>
            <span className="text-[11px] text-success">{t('↑ +12.4% vs last week')}</span>
          </div>

          <div className="bg-background border border-border rounded-xl p-3.5">
            <span className="text-[11px] text-muted-foreground">{t('Allowed Access')}</span>
            <div className="text-xl font-medium text-success mt-0.5">
              {tenantSummary.accessToday.allowed.toLocaleString()}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {(
                (tenantSummary.accessToday.allowed / (tenantSummary.accessToday.total || 1)) *
                100
              ).toFixed(1)}
              % {t('Success Rate')}
            </span>
          </div>

          <div className="bg-background border border-border rounded-xl p-3.5">
            <span className="text-[11px] text-muted-foreground">{t('Denied Attempts')}</span>
            <div className="text-xl font-medium text-destructive mt-0.5">
              {tenantSummary.accessToday.denied.toLocaleString()}
            </div>
            <span className="text-[11px] text-destructive">{t('Unregistered / expired')}</span>
          </div>

          <div className="bg-background border border-border rounded-xl p-3.5">
            <span className="text-[11px] text-muted-foreground">{t('Unknown / Review')}</span>
            <div className="text-xl font-medium text-warning mt-0.5">
              {tenantSummary.accessToday.unknown.toLocaleString()}
            </div>
            <span className="text-[11px] text-muted-foreground">{t('Low confidence OCR')}</span>
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
                name={t('Allowed Entries')}
                stroke="#3fb950"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorAllowed)"
              />
              <Area
                type="monotone"
                dataKey="denied"
                name={t('Denied / Blocked')}
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
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <Car className="w-4 h-4 text-primary" />
                <span>{t('Registered Vehicles & Whitelist')}</span>
              </div>
              <Badge variant="slate" className="text-[11px] ">
                {t('{{count}} Enrolled', { count: tenantSummary.vehicles.total })}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-background border border-border">
                <span className="text-[11px] text-muted-foreground block">{t('Total')}</span>
                <span className="text-lg font-medium text-foreground ">
                  {tenantSummary.vehicles.total}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <span className="text-[11px] text-success block">{t('Active Whitelist')}</span>
                <span className="text-lg font-medium text-success ">
                  {tenantSummary.vehicles.active}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <span className="text-[11px] text-destructive block">{t('Blocked / Expired')}</span>
                <span className="text-lg font-medium text-destructive ">
                  {tenantSummary.vehicles.inactive}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('Authorized employee vehicles, VIP pass-holders, and permanent delivery trucks mapped to this location.')}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTenantNavTab('vehicles')}
            className="w-full text-xs border-border text-foreground hover:text-foreground justify-between"
          >
            <span>{t('View Vehicles Whitelist')}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>

        {/* Access Rules Card */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <ShieldCheck className="w-4 h-4 text-success" />
                <span>{t('Access Control Rules')}</span>
              </div>
              <Badge variant="emerald" className="text-[11px]">
                {t('{{count}} Active Rules', { count: tenantAccessRules.filter((r) => r.status === 'ACTIVE').length })}
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              {tenantAccessRules.slice(0, 3).map((rule) => (
                <div
                  key={rule.id}
                  className="p-2.5 rounded-xl bg-background border border-border flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-foreground">{rule.name}</span>
                    <span className="text-[11px] text-muted-foreground block ">
                      {typeof rule.schedule === 'string'
                        ? rule.schedule
                        : rule.schedule?.summaryText || rule.schedule?.type || t('Always Active (24/7)')}
                    </span>
                  </div>
                  <Badge variant={rule.status === 'ACTIVE' ? 'emerald' : 'slate'} className="text-[11px]">
                    {t(rule.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setTenantNavTab('access_rules' as any)}
            className="w-full text-xs border-border text-foreground hover:text-foreground justify-between"
          >
            <span>{t('Manage Access Rules')}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
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

      {/* Cameras live in the site detail drawer — open it on the cameras tab */}
      <SiteDetailDrawer
        site={tenantSites[0] ?? null}
        isOpen={isCameraDrawerOpen}
        onClose={() => setIsCameraDrawerOpen(false)}
        initialTab="cameras"
      />
    </div>
  );
};
