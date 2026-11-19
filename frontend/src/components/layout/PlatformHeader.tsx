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
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { canManagePlatformOps } from '../../lib/permissions';

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
    tenants,
    admins,
    auditLogs,
    refreshPlatformData,
    navigateTo,
    addToast
  } = usePlatform();
  const { t } = useTranslation('layout');

  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const activeAlerts = securityAlerts.filter((a) => a.status === 'OPEN');
  const activeIncidents = incidents.filter((i) => i.status !== 'RESOLVED');
  const totalNotifications = activeAlerts.length + activeIncidents.length;

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshPlatformData();
      addToast({
        type: 'success',
        title: t('Refreshed'),
        description: t('Platform data re-synchronized from the API.')
      });
    } catch {
      addToast({ type: 'error', title: t('Refresh failed'), description: t('Could not reload platform data.') });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const tenant = tenants.find(
      (x) =>
        x.name.toLowerCase().includes(query) ||
        x.code.toLowerCase().includes(query) ||
        x.email.toLowerCase().includes(query)
    );
    if (tenant) {
      navigateTo('tenants', undefined, tenant.id);
      addToast({ type: 'info', title: t('Tenant found'), description: tenant.name });
      setSearchQuery('');
      return;
    }

    const admin = admins.find(
      (a) => a.name.toLowerCase().includes(query) || a.email.toLowerCase().includes(query)
    );
    if (admin) {
      navigateTo('platform');
      addToast({ type: 'info', title: t('Administrator found'), description: `${admin.name} (${admin.email})` });
      setSearchQuery('');
      return;
    }

    const alert = securityAlerts.find(
      (a) =>
        a.type.toLowerCase().includes(query) ||
        a.subjectEmail.toLowerCase().includes(query) ||
        (a.evidence.details ?? '').toLowerCase().includes(query)
    );
    if (alert) {
      navigateTo('security', 'alerts');
      addToast({ type: 'info', title: t('Security alert found'), description: alert.type });
      setSearchQuery('');
      return;
    }

    const log = auditLogs.find(
      (l) =>
        l.action.toLowerCase().includes(query) ||
        (l.actorEmail ?? '').toLowerCase().includes(query) ||
        (l.resourceType ?? '').toLowerCase().includes(query)
    );
    if (log) {
      navigateTo('audit');
      addToast({ type: 'info', title: t('Audit event found'), description: log.action });
      setSearchQuery('');
      return;
    }

    addToast({
      type: 'warning',
      title: t('No matching records'),
      description: t('Nothing matched "{{query}}".', { query: searchQuery.trim() })
    });
  };

  return (
    <header className="h-16 border-b border-border bg-background px-6 flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Search Input */}
      <form onSubmit={handleGlobalSearch} className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('Search tenants, admins, alerts, or audit logs... (Enter)')}
          className="w-full bg-card border border-border hover:border-muted-foreground/50 text-xs text-foreground placeholder-muted-foreground rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
        />
      </form>

      {/* Center/Right Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Live Simulation Indicator Toggle */}
        <button
          onClick={() => setIsLiveSimulationActive(!isLiveSimulationActive)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isLiveSimulationActive
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-card border-border text-muted-foreground'
          }`}
          title={t('Click to toggle real-time live telemetry polling simulation')}
        >
          <span className={`w-2 h-2 rounded-full ${isLiveSimulationActive ? 'bg-success ' : 'bg-muted-foreground'}`} />
          <span>{isLiveSimulationActive ? t('LIVE TELEMETRY') : t('PAUSED')}</span>
          <span className="text-[11px] opacity-70 ">({lastUpdatedTime})</span>
        </button>

        {/* Manual Refresh Button */}
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="p-2 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-lg border border-border transition-colors cursor-pointer disabled:opacity-60"
          title={t('Force refresh platform metrics')}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Dark / Light Mode Switch Button */}
        <button
          onClick={() => {
            toggleTheme();
            addToast({
              type: 'info',
              title: t('Theme Toggled'),
              description: t('Switched to {{mode}} Mode.', { mode: theme === 'dark' ? t('Light') : t('Dark') })
            });
          }}
          className="p-2 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-lg border border-border transition-colors cursor-pointer flex items-center"
          title={t('Switch to {{mode}} Mode', { mode: theme === 'dark' ? t('Light') : t('Dark') })}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-warning" />
          ) : (
            <Moon className="w-4 h-4 text-primary" />
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
            {t('View Landing Page')}
          </Button>
        )}

        {/* Quick Action Button — opens Create Tenant (super_admin/ops only) */}
        {canManagePlatformOps(currentUser?.rawRole ?? '') && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onOpenQuickActionModal}
            className=""
          >
            {t('Quick Action')}
          </Button>
        )}

        {/* Notifications Drawer Toggle */}
        <div className="relative">
          <button
            onClick={() => {
              setIsNotificationOpen(!isNotificationOpen);
              setIsProfileOpen(false);
            }}
            className="p-2 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-lg border border-border transition-colors relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {totalNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-[#fff] text-[11px] font-medium flex items-center justify-center ">
                {totalNotifications}
              </span>
            )}
          </button>

          {/* Notifications Popover */}
          {isNotificationOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl z-50 overflow-hidden animate-in fade-in duration-[330ms]">
              <div className="p-4 border-b border-border flex items-center justify-between bg-background">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-destructive" />
                  <h4 className="text-xs font-medium text-foreground ">
                    {t('Platform Notifications ({{count}})', { count: totalNotifications })}
                  </h4>
                </div>
                <button
                  onClick={() => setIsNotificationOpen(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 max-h-80 overflow-y-auto space-y-2 text-xs divide-y divide-border">
                {activeAlerts.length === 0 && activeIncidents.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
                    <p className="font-medium">{t('No unresolved platform alerts')}</p>
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
                        className="pt-2.5 first:pt-0 hover:bg-muted p-2 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between font-medium text-foreground">
                          <span className="text-destructive flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                            {alert.type}
                          </span>
                          <span className="text-[11px] text-muted-foreground ">
                            {new Date(alert.detectedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{alert.evidence.details}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('Subject: {{email}}', { email: alert.subjectEmail })}</p>
                      </div>
                    ))}

                    {activeIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        onClick={() => {
                          navigateTo('monitoring', 'incidents');
                          setIsNotificationOpen(false);
                        }}
                        className="pt-2.5 hover:bg-muted/50 p-2 rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between font-medium text-foreground">
                          <span className="text-warning flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                            {inc.title}
                          </span>
                          <Badge variant="red" size="sm">
                            {inc.severity}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{inc.description}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-3 bg-background border-t border-border text-center">
                <button
                  onClick={() => {
                    navigateTo('security', 'alerts');
                    setIsNotificationOpen(false);
                  }}
                  className="text-xs text-primary hover:text-primary font-medium cursor-pointer"
                >
                  {t('View Security Control Center →')}
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
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg bg-card hover:bg-muted border border-border transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-primary text-[#fff] font-medium flex items-center justify-center text-xs ">
              {currentUser?.name ? currentUser.name.slice(0, 2) : 'AN'}
            </div>
            <div className="text-left hidden sm:block">
              <span className="text-xs font-medium text-foreground block leading-none">{currentUser?.name || 'Anthony N.'}</span>
              <span className="text-[11px] text-primary block leading-tight font-medium ">{appWorkspace === 'platform' ? t('PLATFORM GOV') : t('TENANT PORTAL')}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-xl z-50 overflow-hidden py-1 text-xs">
              <div className="px-4 py-3 border-b border-border bg-background">
                <p className="font-medium text-foreground">{currentUser?.name || 'Anthony Nguyen'}</p>
                <p className="text-muted-foreground text-[11px] truncate ">{currentUser?.email || 'anh.nh@kyanon.digital'}</p>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => {
                      // Already-enrolled accounts have nothing to re-verify here;
                      // only offer enrollment when MFA is off.
                      if (!currentUser?.mfaEnabled) openMfaModal('enroll');
                      setIsProfileOpen(false);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] hover:opacity-80 transition-colors cursor-pointer ${
                      currentUser?.mfaEnabled
                        ? 'bg-success/20 text-success border border-success/30'
                        : 'bg-warning/20 text-warning border border-warning/30'
                    }`}
                    title={currentUser?.mfaEnabled ? t('TOTP Active') : t('Set up multi-factor authentication')}
                  >
                    <UserCheck className="w-3 h-3" />
                    {currentUser?.mfaEnabled ? t('MFA Verified') : t('MFA Off')}
                  </button>
                  <span className="text-[11px] text-muted-foreground ">
                    {currentUser?.mfaEnabled ? t('TOTP Active') : t('Password Only')}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  openMfaModal('enroll');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-success" />
                <span>{t('Configure MFA / TOTP')}</span>
              </button>

              <button
                onClick={() => {
                  navigateTo('platform', 'settings');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-primary" />
                <span>{t('Platform Settings')}</span>
              </button>

              {appWorkspace === 'platform' && (
              <button
                onClick={() => {
                  navigateTo('security', 'sessions');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-4 py-2.5 text-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-warning" />
                <span>{t('My Active Sessions')}</span>
              </button>
              )}

              <div className="border-t border-border my-1" />

              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  logout();
                  addToast({
                    type: 'info',
                    title: t('Signed Out'),
                    description: t('Your session has ended. Please sign in again.')
                  });
                }}
                className="w-full text-left px-4 py-2.5 text-destructive hover:bg-destructive/20 flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('Sign Out')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
