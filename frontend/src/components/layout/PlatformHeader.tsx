import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Search,
  Bell,
  RefreshCw,
  Zap,
  Plus,
  ShieldAlert,
  X,
  UserCheck,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  LogOut,
  Sliders,
  Sun,
  Moon
} from 'lucide-react';
import { Button, Badge } from '../ui';

export const PlatformHeader: React.FC<{
  onOpenQuickActionModal: () => void;
  onViewLandingPage?: () => void;
}> = ({ onOpenQuickActionModal, onViewLandingPage }) => {
  const {
    theme,
    toggleTheme,
    openMfaModal,
    logout,
    currentUser,
    appWorkspace,
    primaryTab,
    isLiveSimulationActive,
    setIsLiveSimulationActive,
    lastUpdatedTime,
    incidents,
    securityAlerts,
    navigateTo,
    addToast
  } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const activeAlerts = securityAlerts.filter((a) => a.status === 'OPEN');
  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const totalNotifications = activeAlerts.length + activeIncidents.length;

  const handleManualRefresh = () => {
    addToast({
      type: 'info',
      title: 'Manual Refresh Triggered',
      description: 'Platform metrics & operational telemetry re-synchronized.'
    });
  };

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    addToast({
      type: 'info',
      title: 'Platform Query Result',
      description: `Searched for "${searchQuery}". Navigated to matching Governance records.`
    });

    if (searchQuery.toLowerCase().includes('tenant') || searchQuery.toLowerCase().includes('abc')) {
      navigateTo('tenants');
    } else if (searchQuery.toLowerCase().includes('security') || searchQuery.toLowerCase().includes('alert')) {
      navigateTo('security');
    } else if (searchQuery.toLowerCase().includes('audit') || searchQuery.toLowerCase().includes('log')) {
      navigateTo('audit');
    } else {
      navigateTo('dashboard');
    }
    setSearchQuery('');
  };

  return (
    <header className="h-16 border-b border-[#30363d] bg-[#0d0e12] px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Search Input */}
      <form onSubmit={handleGlobalSearch} className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tenants, admins, alerts, or audit logs... (Enter)"
          className="w-full bg-[#161b22] border border-[#30363d] hover:border-[#484f58] text-xs text-[#c9d1d9] placeholder-[#8b949e] rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#58a6ff] focus:border-[#58a6ff] transition-colors"
        />
      </form>

      {/* Center/Right Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Live Simulation Indicator Toggle */}
        <button
          onClick={() => setIsLiveSimulationActive(!isLiveSimulationActive)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
            isLiveSimulationActive
              ? 'bg-[#238636]/10 border-[#3fb950]/30 text-[#3fb950]'
              : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
          }`}
          title="Click to toggle real-time live telemetry polling simulation"
        >
          <span className={`w-2 h-2 rounded-full ${isLiveSimulationActive ? 'bg-[#3fb950] animate-pulse' : 'bg-[#8b949e]'}`} />
          <span>{isLiveSimulationActive ? 'LIVE TELEMETRY' : 'PAUSED'}</span>
          <span className="text-[10px] opacity-70 font-mono">({lastUpdatedTime})</span>
        </button>

        {/* Manual Refresh Button */}
        <button
          onClick={handleManualRefresh}
          className="p-2 text-[#8b949e] hover:text-white bg-[#161b22] hover:bg-[#21262d] rounded-lg border border-[#30363d] transition-colors cursor-pointer"
          title="Force refresh platform metrics"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Dark / Light Mode Switch Button */}
        <button
          onClick={() => {
            toggleTheme();
            addToast({
              type: 'info',
              title: 'Theme Toggled',
              description: `Switched to ${theme === 'dark' ? 'Light' : 'Dark'} Mode.`
            });
          }}
          className="p-2 px-2.5 text-[#8b949e] hover:text-white bg-[#161b22] hover:bg-[#21262d] rounded-lg border border-[#30363d] transition-colors cursor-pointer flex items-center gap-1.5"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold hidden sm:inline text-[#c9d1d9]">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-sky-500" />
              <span className="text-xs font-semibold hidden sm:inline text-[#c9d1d9]">Dark Mode</span>
            </>
          )}
        </button>

        {/* View Public Landing Page */}
        {onViewLandingPage && (
          <Button
            variant="outline"
            size="sm"
            icon={ExternalLink}
            onClick={onViewLandingPage}
            className="hidden lg:inline-flex text-xs"
          >
            Xem Landing Page
          </Button>
        )}

        {/* Quick Action Button */}
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={onOpenQuickActionModal}
          className="shadow-sm"
        >
          Quick Action
        </Button>

        {/* Notifications Drawer Toggle */}
        <div className="relative">
          <button
            onClick={() => {
              setIsNotificationOpen(!isNotificationOpen);
              setIsProfileOpen(false);
            }}
            className="p-2 text-[#8b949e] hover:text-white bg-[#161b22] hover:bg-[#21262d] rounded-lg border border-[#30363d] transition-colors relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {totalNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#f85149] text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {totalNotifications}
              </span>
            )}
          </button>

          {/* Notifications Popover */}
          {isNotificationOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in duration-150">
              <div className="p-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#f85149]" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Platform Notifications ({totalNotifications})
                  </h4>
                </div>
                <button
                  onClick={() => setIsNotificationOpen(false)}
                  className="text-[#8b949e] hover:text-white p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 max-h-80 overflow-y-auto space-y-2 text-xs divide-y divide-[#30363d]">
                {activeAlerts.length === 0 && activeIncidents.length === 0 ? (
                  <div className="py-8 text-center text-[#8b949e]">
                    <CheckCircle2 className="w-8 h-8 text-[#3fb950] mx-auto mb-2" />
                    <p className="font-medium">No unresolved platform alerts</p>
                  </div>
                ) : (
                  <>
                    {activeAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        onClick={() => {
                          navigateTo('security', 'alerts');
                          setIsNotificationOpen(false);
                        }}
                        className="pt-2.5 first:pt-0 hover:bg-[#21262d] p-2 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between font-semibold text-[#c9d1d9]">
                          <span className="text-[#f85149] flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#f85149]" />
                            {alert.type}
                          </span>
                          <span className="text-[10px] text-[#8b949e] font-mono">
                            {new Date(alert.detectedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8b949e] mt-1">{alert.evidence.details}</p>
                        <p className="text-[10px] text-[#8b949e] mt-0.5">Subject: {alert.subjectEmail}</p>
                      </div>
                    ))}

                    {activeIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        onClick={() => {
                          navigateTo('monitoring', 'incidents');
                          setIsNotificationOpen(false);
                        }}
                        className="pt-2.5 hover:bg-slate-800/50 p-2 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-200">
                          <span className="text-amber-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#d29922]" />
                            {inc.title}
                          </span>
                          <Badge variant="red" size="sm">
                            {inc.severity}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-[#8b949e] mt-1">{inc.description}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-3 bg-[#0d0e12] border-t border-[#30363d] text-center">
                <button
                  onClick={() => {
                    navigateTo('security', 'alerts');
                    setIsNotificationOpen(false);
                  }}
                  className="text-xs text-[#58a6ff] hover:text-[#388bfd] font-semibold cursor-pointer"
                >
                  View Security Control Center →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotificationOpen(false);
            }}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-[#58a6ff] text-slate-950 font-bold flex items-center justify-center text-xs font-mono uppercase">
              {currentUser?.name ? currentUser.name.slice(0, 2) : 'AN'}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-xs font-bold text-white block leading-none">{currentUser?.name || 'Anthony N.'}</span>
              <span className="text-[10px] text-[#58a6ff] block leading-tight font-semibold font-mono">{appWorkspace === 'platform' ? 'PLATFORM GOV' : 'TENANT PORTAL'}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#8b949e]" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl z-50 overflow-hidden py-1 text-xs">
              <div className="px-4 py-3 border-b border-[#30363d] bg-[#0d0e12]">
                <p className="font-bold text-white">{currentUser?.name || 'Anthony Nguyen'}</p>
                <p className="text-[#8b949e] text-[11px] truncate font-mono">{currentUser?.email || 'anh.nh@kyanon.digital'}</p>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      openMfaModal('challenge');
                      setIsProfileOpen(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono hover:opacity-80 transition-all cursor-pointer ${
                      currentUser?.mfaEnabled
                        ? 'bg-[#238636]/20 text-[#3fb950] border border-[#3fb950]/30'
                        : 'bg-[#d29922]/20 text-[#d29922] border border-[#d29922]/30'
                    }`}
                    title="Click to verify TOTP passcode"
                  >
                    <UserCheck className="w-3 h-3" />
                    {currentUser?.mfaEnabled ? 'MFA Verified' : 'MFA Off'}
                  </button>
                  <span className="text-[10px] text-[#8b949e] font-mono">
                    {currentUser?.mfaEnabled ? 'TOTP Active' : 'Password Only'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  openMfaModal('enroll');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-[#c9d1d9] hover:bg-[#21262d] hover:text-white flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-[#3fb950]" />
                <span>Configure MFA / TOTP</span>
              </button>

              <button
                onClick={() => {
                  navigateTo('platform', 'settings');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-[#c9d1d9] hover:bg-[#21262d] hover:text-white flex items-center gap-2 cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-[#58a6ff]" />
                <span>Platform Settings</span>
              </button>

              <button
                onClick={() => {
                  navigateTo('security', 'sessions');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-[#c9d1d9] hover:bg-[#21262d] hover:text-white flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-[#d29922]" />
                <span>My Active Sessions</span>
              </button>

              <div className="border-t border-[#30363d] my-1" />

              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  logout();
                  addToast({
                    type: 'info',
                    title: 'Đã đăng xuất',
                    description: 'Phiên làm việc đã kết thúc. Vui lòng đăng nhập lại.'
                  });
                }}
                className="w-full text-left px-4 py-2.5 text-[#f85149] hover:bg-[#da3633]/20 flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất Trang Quản trị (Sign Out)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
