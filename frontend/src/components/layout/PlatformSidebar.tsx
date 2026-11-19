import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../../context/PlatformContext';
import {
  LayoutDashboard,
  Building2,
  Sliders,
  Activity,
  ShieldCheck,
  FileText,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Server,
  Settings,
  Flag,
  Users,
  Radio,
  Lock,
  Key,
  Database,
  Layers,
  Car,
  DoorOpen,
  Camera,
  UserPlus,
  ArrowLeftRight,
  MapPinned,
  BadgeCheck,
  Banknote
} from 'lucide-react';
import { PrimaryTab, PlatformSubTab, MonitoringSubTab, SecuritySubTab } from '../../types/platform';
import { TenantNavTab } from '../../types/tenant';

export const PlatformSidebar: React.FC = () => {
  const {
    appWorkspace,
    primaryTab,
    setPrimaryTab,
    platformSubTab,
    setPlatformSubTab,
    monitoringSubTab,
    setMonitoringSubTab,
    securitySubTab,
    setSecuritySubTab,
    tenantNavTab,
    setTenantNavTab,
    incidents,
    securityAlerts,
    tenantAlerts,
    tenantSites,
    tenants,
    tenantVehicles,
    tenantDevices,
    tenantLocation,
    currentUser,
    setSelectedTenantId
  } = usePlatform();
  const { t } = useTranslation('layout');

  const [isPlatformOpen, setIsPlatformOpen] = useState(true);
  const [isMonitoringOpen, setIsMonitoringOpen] = useState(true);
  const [isSecurityOpen, setIsSecurityOpen] = useState(true);

  const openIncidentsCount = incidents.filter((i) => i.status !== 'RESOLVED').length;
  const openAlertsCount = securityAlerts.filter((a) => a.status !== 'RESOLVED').length;

  return (
    <aside className="w-64 bg-background border-r border-border flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-14 px-6 flex items-center shrink-0">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-medium leading-5 tracking-[0.32em] text-foreground">
            {appWorkspace === 'tenant' ? (tenantLocation.tenantName || tenantLocation.name || 'TENANT').toUpperCase() : 'PARKVISION'}
          </h1>
          <p className="truncate text-xs leading-4 text-muted-foreground">
            {appWorkspace === 'tenant' ? t('Tenant Site Management') : t('Superadmin Control')}
          </p>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1 text-xs font-medium">
        {/* ========================================================================= */}
        {/* TENANT WORKSPACE NAVIGATION */}
        {/* ========================================================================= */}
        {appWorkspace === 'tenant' ? (
          <div className="space-y-4">
            {/* Main Dashboard */}
            <button
              onClick={() => setTenantNavTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                tenantNavTab === 'dashboard'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${tenantNavTab === 'dashboard' ? 'text-foreground' : 'text-muted-foreground'}`} />
              <span>{t('Dashboard')}</span>
            </button>

            {/* ORGANIZATION GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[11px] font-medium text-muted-foreground ">
                {t('Organization')}
              </div>

              {/* Location */}
              <button
                onClick={() => setTenantNavTab('location')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'location' || tenantNavTab === 'sites'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className={`w-4 h-4 shrink-0 ${tenantNavTab === 'location' || tenantNavTab === 'sites' ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span>{t('Location')}</span>
                </div>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted border border-border text-success ">
                  {t('Active')}
                </span>
              </button>

              {/* Users & Members */}
              <button
                onClick={() => setTenantNavTab('team')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'team' || tenantNavTab === 'users'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Users className={`w-4 h-4 shrink-0 ${tenantNavTab === 'team' || tenantNavTab === 'users' ? 'text-foreground' : 'text-muted-foreground'}`} />
                <span>{t('Users & Members')}</span>
              </button>
            </div>

            {/* ACCESS MANAGEMENT GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[11px] font-medium text-muted-foreground ">
                {t('Access Management')}
              </div>

              {/* Vehicles & Whitelist */}
              <button
                onClick={() => setTenantNavTab('vehicles')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'vehicles'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Car className={`w-4 h-4 shrink-0 ${tenantNavTab === 'vehicles' ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span>{t('Vehicles & Whitelist')}</span>
                </div>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ">
                  {tenantVehicles.length}
                </span>
              </button>

              {/* Access Rules */}
              <button
                onClick={() => setTenantNavTab('access_rules')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'access_rules' || tenantNavTab === 'access-rules'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <ShieldCheck className={`w-4 h-4 shrink-0 ${tenantNavTab === 'access_rules' || tenantNavTab === 'access-rules' ? 'text-foreground' : 'text-muted-foreground'}`} />
                <span>{t('Access Rules')}</span>
              </button>

              {/* Memberships */}
              <button
                onClick={() => setTenantNavTab('memberships')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'memberships'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <BadgeCheck className={`w-4 h-4 shrink-0 ${tenantNavTab === 'memberships' ? 'text-foreground' : 'text-muted-foreground'}`} />
                <span>{t('Memberships')}</span>
              </button>
            </div>

            {/* MONITORING GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[11px] font-medium text-muted-foreground ">
                {t('Monitoring')}
              </div>

              {/* Barrier Map */}
              <button
                onClick={() => setTenantNavTab('gates')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'gates'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <DoorOpen className={`w-4 h-4 shrink-0 ${tenantNavTab === 'gates' ? 'text-success' : 'text-muted-foreground'}`} />
                  <span>{t('Barrier Map')}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.2 bg-success/20 text-success rounded-[4px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-success " />
                  {t('Live')}
                </span>
              </button>

              {/* Parking Map */}
              <button
                onClick={() => setTenantNavTab('parking-map')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'parking-map'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <MapPinned className={`w-4 h-4 shrink-0 ${tenantNavTab === 'parking-map' ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span>{t('Parking Map')}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.2 bg-success/20 text-success rounded-[4px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-success " />
                  {t('Live')}
                </span>
              </button>

              {/* Edge Devices */}
              <button
                onClick={() => setTenantNavTab('edge-devices')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'edge-devices'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Server className={`w-4 h-4 shrink-0 ${tenantNavTab === 'edge-devices' ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span>{t('Edge Devices')}</span>
                </div>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground ">
                  {tenantDevices.length}
                </span>
              </button>

              {/* Access Events */}
              <button
                onClick={() => setTenantNavTab('access_events')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'access_events' || tenantNavTab === 'access-events'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Activity className={`w-4 h-4 shrink-0 ${tenantNavTab === 'access_events' || tenantNavTab === 'access-events' ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span>{t('Access Events')}</span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.2 bg-success/20 text-success rounded-[4px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-success " />
                  {t('Live')}
                </span>
              </button>

              {/* Walk-in vehicles */}
              <button
                onClick={() => setTenantNavTab('walk-ins')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'walk-ins'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Banknote className={`w-4 h-4 shrink-0 ${tenantNavTab === 'walk-ins' ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span>{t('Walk-in vehicles')}</span>
                </div>
              </button>
            </div>

            {/* ADMINISTRATION GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[11px] font-medium text-muted-foreground ">
                {t('Administration')}
              </div>

              {/* Site Settings */}
              <button
                onClick={() => setTenantNavTab('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  tenantNavTab === 'settings'
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Settings className={`w-4 h-4 shrink-0 ${tenantNavTab === 'settings' ? 'text-foreground' : 'text-muted-foreground'}`} />
                <span>{t('Site Settings')}</span>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* PLATFORM GOVERNANCE NAVIGATION */
          /* ========================================================================= */
          <>
            {/* 1. DASHBOARD */}
            <button
              onClick={() => {
                setPrimaryTab('dashboard');
                setSelectedTenantId(null);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                primaryTab === 'dashboard'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${primaryTab === 'dashboard' ? 'text-foreground' : 'text-muted-foreground'}`} />
              <span>{t('Dashboard')}</span>
            </button>

            {/* 2. TENANTS */}
            <button
              onClick={() => {
                setPrimaryTab('tenants');
                setSelectedTenantId(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                primaryTab === 'tenants'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 className={`w-4 h-4 shrink-0 ${primaryTab === 'tenants' ? 'text-foreground' : 'text-muted-foreground'}`} />
                <span>{t('Tenants')}</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground ">
                {tenants.length}
              </span>
            </button>

            {/* 3. PLATFORM GROUP */}
            <div>
              <button
                onClick={() => {
                  setPrimaryTab('platform');
                  setIsPlatformOpen(!isPlatformOpen);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  primaryTab === 'platform'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Sliders className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>{t('Platform')}</span>
                </div>
                {isPlatformOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isPlatformOpen && (
                <div className="ml-7 mt-1 pl-2 border-l border-border space-y-1">
                  <button
                    onClick={() => {
                      setPrimaryTab('platform');
                      setPlatformSubTab('settings');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'platform' && platformSubTab === 'settings'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{t('Settings')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('platform');
                      setPlatformSubTab('feature-flags');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'platform' && platformSubTab === 'feature-flags'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5 text-success" />
                    <span>{t('Feature Flags')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('platform');
                      setPlatformSubTab('admins');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'platform' && platformSubTab === 'admins'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-chart-5" />
                    <span>{t('Platform Admins')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4. MONITORING GROUP */}
            <div>
              <button
                onClick={() => {
                  setPrimaryTab('monitoring');
                  setIsMonitoringOpen(!isMonitoringOpen);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  primaryTab === 'monitoring'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>{t('Monitoring')}</span>
                </div>
                {isMonitoringOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isMonitoringOpen && (
                <div className="ml-7 mt-1 pl-2 border-l border-border space-y-1">
                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('gates');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'gates'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <DoorOpen className="w-3.5 h-3.5 text-success" />
                      <span>{t('Barrier Map')}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.2 bg-success/20 text-success rounded-[4px] font-medium">
                      <span className="w-1 h-1 rounded-full bg-success " />
                      {t('Live')}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('services');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'services'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>{t('Core Services')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('incidents');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'incidents'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                      <span>{t('Incidents')}</span>
                    </div>
                    {openIncidentsCount > 0 && (
                      <span className="text-[11px] px-1.5 py-0.2 bg-warning/20 text-warning rounded-[4px] font-medium">
                        {openIncidentsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('edge');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'edge'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5 text-primary" />
                    <span>{t('Edge Gateways')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 5. SECURITY GROUP */}
            <div>
              <button
                onClick={() => {
                  setPrimaryTab('security');
                  setIsSecurityOpen(!isSecurityOpen);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                  primaryTab === 'security'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span>{t('Security')}</span>
                </div>
                {isSecurityOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isSecurityOpen && (
                <div className="ml-7 mt-1 pl-2 border-l border-border space-y-1">
                  <button
                    onClick={() => {
                      setPrimaryTab('security');
                      setSecuritySubTab('mfa');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'security' && securitySubTab === 'mfa'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-success" />
                    <span>{t('MFA Policies')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('security');
                      setSecuritySubTab('alerts');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'security' && securitySubTab === 'alerts'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                      <span>{t('Security Alerts')}</span>
                    </div>
                    {openAlertsCount > 0 && (
                      <span className="text-[11px] px-1.5 py-0.2 bg-destructive/20 text-destructive rounded-[4px] font-medium">
                        {openAlertsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('security');
                      setSecuritySubTab('sessions');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'security' && securitySubTab === 'sessions'
                        ? 'bg-muted text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5 text-warning" />
                    <span>{t('Active Sessions')}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 6. AUDIT LOGS */}
            <button
              onClick={() => {
                setPrimaryTab('audit');
                setSelectedTenantId(null);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-[background-color,color,border-color,box-shadow] duration-[330ms] cursor-pointer ${
                primaryTab === 'audit'
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <FileText className={`w-4 h-4 shrink-0 ${primaryTab === 'audit' ? 'text-foreground' : 'text-muted-foreground'}`} />
              <span>{t('Audit Logs')}</span>
            </button>
          </>
        )}
      </nav>

      {/* Footer Profile Status */}
      <div className="p-4 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center font-medium text-primary text-xs ">
            {(currentUser.name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-medium text-foreground truncate">{currentUser.name}</h4>
            <p className="text-[11px] text-muted-foreground truncate ">
              {appWorkspace === 'tenant' ? currentUser.role : currentUser.email}
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-success shrink-0" title={t('Online & Connected')} />
        </div>
      </div>
    </aside>
  );
};
