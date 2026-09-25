import React, { useState } from 'react';
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
  ArrowLeftRight
} from 'lucide-react';
import { PrimaryTab, PlatformSubTab, MonitoringSubTab, SecuritySubTab } from '../../types/platform';
import { TenantNavTab } from '../../types/tenant';

export const PlatformSidebar: React.FC = () => {
  const {
    appWorkspace,
    setAppWorkspace,
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
    currentUser,
    setSelectedTenantId
  } = usePlatform();

  const [isPlatformOpen, setIsPlatformOpen] = useState(true);
  const [isMonitoringOpen, setIsMonitoringOpen] = useState(true);
  const [isSecurityOpen, setIsSecurityOpen] = useState(true);

  const openIncidentsCount = incidents.filter((i) => i.status !== 'RESOLVED').length;
  const openAlertsCount = securityAlerts.filter((a) => a.status !== 'RESOLVED').length;

  return (
    <aside className="w-64 bg-[#0d0e12] border-r border-[#30363d] flex flex-col shrink-0 select-none">
      {/* Workspace Switcher Header */}
      <div className="p-3 border-b border-[#30363d] bg-[#161b22]/70">
        <div className="text-[10px] uppercase font-bold text-[#8b949e] px-2 mb-1.5 tracking-wider">
          Current Workspace
        </div>
        <div className="grid grid-cols-2 gap-1 bg-[#0d0e12] p-1 rounded-xl border border-[#30363d]">
          <button
            onClick={() => {
              setAppWorkspace('platform');
              setSelectedTenantId(null);
            }}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              appWorkspace === 'platform'
                ? 'bg-[#21262d] text-[#58a6ff] shadow-xs'
                : 'text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Platform
          </button>

          <button
            onClick={() => setAppWorkspace('tenant')}
            className={`py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              appWorkspace === 'tenant'
                ? 'bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30 shadow-xs'
                : 'text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Tenant
          </button>
        </div>
      </div>

      {/* Brand Header */}
      <div className="h-14 px-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
            appWorkspace === 'tenant'
              ? 'bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/30'
              : 'bg-[#161b22] text-[#58a6ff] border border-[#30363d]'
          }`}>
            {appWorkspace === 'tenant' ? <Building2 className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-tight text-white flex items-center gap-1 font-mono">
              {appWorkspace === 'tenant' ? 'ACME PARKING' : 'PLATFORM'} <span className="text-[#58a6ff]">{appWorkspace === 'tenant' ? 'PORTAL' : 'GOV'}</span>
            </h1>
            <p className="text-[9px] text-[#8b949e] font-semibold uppercase tracking-wider">
              {appWorkspace === 'tenant' ? 'Tenant Site Management' : 'Superadmin Control'}
            </p>
          </div>
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
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                tenantNavTab === 'dashboard'
                  ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${tenantNavTab === 'dashboard' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
              <span>Dashboard</span>
            </button>

            {/* ORGANIZATION GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider font-mono">
                Organization
              </div>

              {/* Location */}
              <button
                onClick={() => setTenantNavTab('location')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'location' || tenantNavTab === 'sites'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Building2 className={`w-4 h-4 shrink-0 ${tenantNavTab === 'location' || tenantNavTab === 'sites' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                  <span>Location</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#3fb950] font-mono">
                  Active
                </span>
              </button>

              {/* Users & Members */}
              <button
                onClick={() => setTenantNavTab('team')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'team' || tenantNavTab === 'users'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <Users className={`w-4 h-4 shrink-0 ${tenantNavTab === 'team' || tenantNavTab === 'users' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                <span>Users & Members</span>
              </button>
            </div>

            {/* ACCESS MANAGEMENT GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider font-mono">
                Access Management
              </div>

              {/* Vehicles & Whitelist */}
              <button
                onClick={() => setTenantNavTab('vehicles')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'vehicles'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Car className={`w-4 h-4 shrink-0 ${tenantNavTab === 'vehicles' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                  <span>Vehicles & Whitelist</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e] font-mono">
                  620
                </span>
              </button>

              {/* Access Rules */}
              <button
                onClick={() => setTenantNavTab('access_rules')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'access_rules' || tenantNavTab === 'access-rules'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <ShieldCheck className={`w-4 h-4 shrink-0 ${tenantNavTab === 'access_rules' || tenantNavTab === 'access-rules' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                <span>Access Rules</span>
              </button>
            </div>

            {/* MONITORING GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider font-mono">
                Monitoring
              </div>

              {/* Barrier Map */}
              <button
                onClick={() => setTenantNavTab('gates')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'gates'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <DoorOpen className={`w-4 h-4 shrink-0 ${tenantNavTab === 'gates' ? 'text-[#3fb950]' : 'text-[#8b949e]'}`} />
                  <span>Barrier Map</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 bg-[#3fb950]/20 text-[#3fb950] rounded-full font-bold">
                  Live
                </span>
              </button>

              {/* Access Events */}
              <button
                onClick={() => setTenantNavTab('access_events')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'access_events' || tenantNavTab === 'access-events'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Activity className={`w-4 h-4 shrink-0 ${tenantNavTab === 'access_events' || tenantNavTab === 'access-events' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                  <span>Access Events</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" />
              </button>
            </div>

            {/* ADMINISTRATION GROUP */}
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold text-[#8b949e] uppercase tracking-wider font-mono">
                Administration
              </div>

              {/* Site Settings */}
              <button
                onClick={() => setTenantNavTab('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  tenantNavTab === 'settings'
                    ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <Settings className={`w-4 h-4 shrink-0 ${tenantNavTab === 'settings' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                <span>Site Settings</span>
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                primaryTab === 'dashboard'
                  ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 shrink-0 ${primaryTab === 'dashboard' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
              <span>Dashboard</span>
            </button>

            {/* 2. TENANTS */}
            <button
              onClick={() => {
                setPrimaryTab('tenants');
                setSelectedTenantId(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                primaryTab === 'tenants'
                  ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 className={`w-4 h-4 shrink-0 ${primaryTab === 'tenants' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
                <span>Tenants</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#8b949e] font-mono">
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                  primaryTab === 'platform'
                    ? 'bg-[#161b22] text-[#58a6ff] font-semibold'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Sliders className="w-4 h-4 shrink-0 text-[#8b949e]" />
                  <span>Platform</span>
                </div>
                {isPlatformOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isPlatformOpen && (
                <div className="ml-7 mt-1 pl-2 border-l border-[#30363d] space-y-1">
                  <button
                    onClick={() => {
                      setPrimaryTab('platform');
                      setPlatformSubTab('settings');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'platform' && platformSubTab === 'settings'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('platform');
                      setPlatformSubTab('feature-flags');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'platform' && platformSubTab === 'feature-flags'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5 text-[#3fb950]" />
                    <span>Feature Flags</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('platform');
                      setPlatformSubTab('admins');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'platform' && platformSubTab === 'admins'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-[#a371f7]" />
                    <span>Platform Admins</span>
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                  primaryTab === 'monitoring'
                    ? 'bg-[#161b22] text-[#58a6ff] font-semibold'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 shrink-0 text-[#8b949e]" />
                  <span>Monitoring</span>
                </div>
                {isMonitoringOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isMonitoringOpen && (
                <div className="ml-7 mt-1 pl-2 border-l border-[#30363d] space-y-1">
                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('gates');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'gates'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <DoorOpen className="w-3.5 h-3.5 text-[#3fb950]" />
                      <span>Barrier Map</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.2 bg-[#3fb950]/20 text-[#3fb950] rounded-full font-bold">
                      Live
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('services');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'services'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>Core Services</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('monitoring');
                      setMonitoringSubTab('incidents');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'monitoring' && monitoringSubTab === 'incidents'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#e3b341]" />
                      <span>Incidents</span>
                    </div>
                    {openIncidentsCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-[#d29922]/20 text-[#e3b341] rounded-full font-bold">
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
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5 text-[#58a6ff]" />
                    <span>Edge Gateways</span>
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                  primaryTab === 'security'
                    ? 'bg-[#161b22] text-[#58a6ff] font-semibold'
                    : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 shrink-0 text-[#8b949e]" />
                  <span>Security</span>
                </div>
                {isSecurityOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isSecurityOpen && (
                <div className="ml-7 mt-1 pl-2 border-l border-[#30363d] space-y-1">
                  <button
                    onClick={() => {
                      setPrimaryTab('security');
                      setSecuritySubTab('mfa');
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'security' && securitySubTab === 'mfa'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-[#3fb950]" />
                    <span>MFA Policies</span>
                  </button>

                  <button
                    onClick={() => {
                      setPrimaryTab('security');
                      setSecuritySubTab('alerts');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                      primaryTab === 'security' && securitySubTab === 'alerts'
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#f85149]" />
                      <span>Security Alerts</span>
                    </div>
                    {openAlertsCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-[#da3633]/20 text-[#f85149] rounded-full font-bold">
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
                        ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold'
                        : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#161b22]'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5 text-[#d29922]" />
                    <span>Active Sessions</span>
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer ${
                primaryTab === 'audit'
                  ? 'bg-[#58a6ff]/10 text-[#58a6ff] font-semibold border-l-2 border-[#58a6ff]'
                  : 'text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]'
              }`}
            >
              <FileText className={`w-4 h-4 shrink-0 ${primaryTab === 'audit' ? 'text-[#58a6ff]' : 'text-[#8b949e]'}`} />
              <span>Audit Logs</span>
            </button>
          </>
        )}
      </nav>

      {/* Footer Profile Status */}
      <div className="p-4 border-t border-[#30363d] bg-[#161b22] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#58a6ff]/20 border border-[#58a6ff]/40 flex items-center justify-center font-bold text-[#58a6ff] text-xs font-mono">
            {(currentUser.name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-semibold text-white truncate">{currentUser.name}</h4>
            <p className="text-[10px] text-[#8b949e] truncate font-mono">
              {appWorkspace === 'tenant' ? currentUser.role : currentUser.email}
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse shrink-0" title="Online & Connected" />
        </div>
      </div>
    </aside>
  );
};
