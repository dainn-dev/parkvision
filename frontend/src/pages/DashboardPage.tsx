import React, { useEffect, useState } from 'react';
import { platformApi } from '../services/api';
import type { components } from '../services/api/schema';
import { usePlatform } from '../context/PlatformContext';
import {
  Building2,
  Users,
  Activity,
  ShieldCheck,
  Server,
  Radio,
  Video,
  DoorOpen,
  ArrowUpRight,
  ShieldAlert,
  FileText,
  Plus,
  Lock,
  Zap,
  TrendingUp,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { StatCard, Card, CardHeader, CardContent, Badge, Button } from '../components/ui';
import { useTranslation } from 'react-i18next';
import { canManagePlatformOps } from '../lib/permissions';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export const DashboardPage: React.FC<{
  onOpenCreateTenantModal: () => void;
}> = ({ onOpenCreateTenantModal }) => {
  const {
    currentUser,
    tenants,
    admins,
    services,
    edgeDevices,
    cameras,
    gates,
    platformFleet,
    incidents,
    securityAlerts,
    auditLogs,
    navigateTo,
    userType
  } = usePlatform();
  const { t } = useTranslation('platform');
  const canCreateTenant = canManagePlatformOps(currentUser.rawRole);

  // Server-aggregated platform metrics + throughput (Phase 2)
  const [metrics, setMetrics] = useState<components['schemas']['MetricsOverviewOut'] | null>(null);
  const [throughput, setThroughput] = useState<components['schemas']['ThroughputPoint'][] | null>(null);
  useEffect(() => {
    if (userType !== 'platform_admin') return;
    platformApi.metricsOverview().then(setMetrics).catch(() => setMetrics(null));
    platformApi.throughputChart(24).then((r) => setThroughput(r.points)).catch(() => setThroughput(null));
  }, [userType]);

  // Aggregate Stats Calculations
  const activeTenants = tenants.filter((t) => t.status === 'ACTIVE').length;
  const trialTenants = tenants.filter((t) => t.status === 'TRIAL').length;
  const suspendedTenants = tenants.filter((t) => t.status === 'SUSPENDED').length;

  const totalUsersCount = metrics?.usersTotal ?? tenants.reduce((acc, t) => acc + t.statistics.usersCount, 0);
  const totalEventsCount = metrics?.eventsToday ?? tenants.reduce((acc, t) => acc + t.statistics.eventsCount, 0);

  const dashboardCameras = userType === 'platform_admin' ? platformFleet.cameras : cameras;
  const dashboardGates = userType === 'platform_admin' ? platformFleet.gates : gates;
  const dashboardEdgeDevices = userType === 'platform_admin' ? platformFleet.edgeDevices : edgeDevices;
  const totalCameras = dashboardCameras.length;
  const onlineCameras = dashboardCameras.filter((c) => c.status === 'ONLINE').length;
  const offlineCameras = totalCameras - onlineCameras;

  const totalGates = dashboardGates.length;
  const onlineGates = dashboardGates.filter((g) => g.status === 'ONLINE').length;

  const totalEdge = dashboardEdgeDevices.length;
  const onlineEdge = dashboardEdgeDevices.filter((d) => d.status === 'ONLINE').length;

  const healthyServices = services.filter((s) => s.status === 'HEALTHY').length;
  const degradedServices = services.length - healthyServices;
  const allServicesHealthy = services.length > 0 && degradedServices === 0;
  const hasServiceData = services.length > 0;

  const openAlerts = securityAlerts.filter((a) => a.status === 'OPEN');
  const criticalAlertsCount = openAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highAlertsCount = openAlerts.filter((a) => a.severity === 'HIGH').length;

  // 24h throughput from server aggregation (fallback: empty series)
  const hourlyThroughputData = (throughput ?? []).map((p) => ({
    time: new Date(p.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    events: p.events,
    commands: p.commands
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-[330ms]">
      {/* 1. Header & Welcome Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-xl border border-border ">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="blue" size="sm">
              {t('GLOBAL PLATFORM GOVERNANCE')}
            </Badge>
            <span className="text-xs text-muted-foreground ">{t('Region: ap-southeast-1')}</span>
          </div>
          <h2 className="text-2xl font-medium text-foreground mt-2 tracking-tight">
            {t('Vehicle Platform Operational Center')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Real-time multi-tenant health, high-precision edge telemetry, and security oversight.')}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canCreateTenant && (
            <Button
              variant="primary"
              icon={Plus}
              onClick={onOpenCreateTenantModal}
              className=""
            >
              {t('Provision Tenant')}
            </Button>
          )}
          <Button
            variant="secondary"
            icon={ShieldAlert}
            onClick={() => navigateTo('security')}
          >
            {t('Security Center')}
          </Button>
        </div>
      </div>

      {/* 2. Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('Total Platform Tenants')}
          value={tenants.length}
          subtitle={t('{{active}} Active • {{trial}} Trial • {{suspended}} Suspended', { active: activeTenants, trial: trialTenants, suspended: suspendedTenants })}
          changeType="neutral"
          icon={Building2}
          onClick={() => navigateTo('tenants')}
        />

        <StatCard
          title={t('Active Platform Users')}
          value={totalUsersCount.toLocaleString()}
          subtitle={t('Across all active enterprise tenant orgs')}
          changeType="neutral"
          icon={Users}
          onClick={() => navigateTo('tenants')}
        />

        <StatCard
          title={t('Recognition Events (24h)')}
          value={totalEventsCount.toLocaleString()}
          subtitle={metrics ? t('Live count today across all tenants') : t('Real-time gate OCR payload throughput')}
          changeType="neutral"
          icon={Activity}
          onClick={() => navigateTo('monitoring')}
        />

        <StatCard
          title={t('Platform Service Health')}
          value={hasServiceData ? `${healthyServices}/${services.length}` : '—'}
          subtitle={t('Core infrastructure services online')}
          change={
            !hasServiceData
              ? t('Health data unavailable')
              : allServicesHealthy
                ? t('● All services healthy')
                : t('{{count}} service(s) degraded or down', { count: degradedServices })
          }
          changeType={!hasServiceData ? 'neutral' : allServicesHealthy ? 'positive' : 'negative'}
          icon={ShieldCheck}
          badge={
            <Badge variant={!hasServiceData ? 'slate' : allServicesHealthy ? 'emerald' : 'red'} dot>
              {!hasServiceData ? t('UNKNOWN') : allServicesHealthy ? t('HEALTHY') : t('DEGRADED')}
            </Badge>
          }
          onClick={() => navigateTo('monitoring')}
        />
      </div>

      {/* 3. System Services & Infrastructure Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Services Health */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('Core Platform Microservices Status')}
            subtitle={t('Live ping latencies and SLA uptime verification')}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateTo('monitoring', 'overview')}
              >
                {t('Detailed Health')} →
              </Button>
            }
          />
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map((srv) => (
              <div
                key={srv.id}
                className="p-3.5 rounded-xl bg-background/80 border border-border/80 flex items-center justify-between hover:border-border transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        srv.status === 'HEALTHY' ? 'bg-success ' : 'bg-destructive'
                      }`}
                    />
                    <span className="text-xs font-medium text-foreground">{srv.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{srv.details}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-primary block">
                    {srv.responseTimeMs} ms
                  </span>
                  <span className="text-[11px] text-success font-medium">
                    {srv.uptimePercent != null ? `${srv.uptimePercent}% ${t('uptime')}` : t('uptime n/a')}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Infrastructure Fleet Summary */}
        <Card>
          <CardHeader
            title={t('Infrastructure Fleet')}
            subtitle={t('Aggregate Edge hardware & camera status')}
          />
          <CardContent className="space-y-4">
            <div className="p-3.5 rounded-xl bg-background border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-success/10 text-success border border-success/50">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-medium text-foreground">{t('Cameras Fleet')}</h4>
                  <p className="text-[11px] text-muted-foreground">{onlineCameras} / {totalCameras} {t('Online')}</p>
                </div>
              </div>
              <Badge variant={offlineCameras > 0 ? 'amber' : 'emerald'} size="sm">
                {totalCameras ? `${((onlineCameras / totalCameras) * 100).toFixed(1)}%` : '—'}
              </Badge>
            </div>

            <div
              onClick={() => navigateTo('monitoring', 'gates')}
              className="p-3.5 rounded-xl bg-background border border-border hover:border-primary/50 transition-colors cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/50 transition-transform">
                  <DoorOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">{t('Gate Controllers & Barriers')}</h4>
                    <span className="w-1.5 h-1.5 rounded-full bg-success " />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{onlineGates} / {totalGates} {t('Active')} · {t('View D3 Map')} →</p>
                </div>
              </div>
              <Badge variant="emerald" size="sm">{totalGates ? `${((onlineGates / totalGates) * 100).toFixed(1)}%` : '—'}</Badge>
            </div>

            <div className="p-3.5 rounded-xl bg-background border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/50">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-medium text-foreground">{t('Edge Processing Nodes')}</h4>
                  <p className="text-[11px] text-muted-foreground">{onlineEdge} / {totalEdge} {t('Connected')}</p>
                </div>
              </div>
              <Badge variant="emerald" size="sm">{totalEdge ? `${((onlineEdge / totalEdge) * 100).toFixed(1)}%` : '—'}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Platform Event Throughput Chart */}
      <Card>
        <CardHeader
          title={t('Platform Event Processing Rate (Payloads / Hour)')}
          subtitle={t('Real-time OCR license plate recognition & gate barrier access decisions')}
          action={
            <div className="flex items-center gap-2">
              <Badge variant="blue" size="sm">{t('24-Hour Range')}</Badge>
              <Badge variant="emerald" size="sm" dot>{t('Live SQL aggregation')}</Badge>
            </div>
          }
        />
        <CardContent>
          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyThroughputData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#58a6ff" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis dataKey="time" stroke="#8b949e" fontSize={11} tickLine={false} />
                <YAxis stroke="#8b949e" fontSize={11} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    borderColor: '#30363d',
                    borderRadius: '0.75rem',
                    color: '#c9d1d9',
                    fontSize: '12px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="events"
                  name={t('Access events')}
                  stroke="#58a6ff"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorEvents)"
                />
                <Area
                  type="monotone"
                  dataKey="commands"
                  name={t('Gate commands')}
                  stroke="#a371f7"
                  strokeWidth={1.5}
                  fillOpacity={0}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 5. Security Threat & Recent Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Security Alerts */}
        <Card>
          <CardHeader
            title={t('Security Threats & Control Center')}
            subtitle={t('Detected authentication anomalies and active security alerts')}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigateTo('security')}>
                {t('Security Center')} →
              </Button>
            }
          />
          <CardContent className="space-y-3">
            {securityAlerts.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
                {t('No unresolved security alerts.')}
              </div>
            ) : (
              securityAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => navigateTo('security', 'alerts')}
                  className="p-3.5 rounded-xl bg-background border border-border hover:border-border transition-colors cursor-pointer flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'CRITICAL' ? 'red' : 'amber'} size="sm">
                        {alert.severity}
                      </Badge>
                      <span className="text-xs font-medium text-foreground">{alert.type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{alert.evidence.details}</p>
                    <div className="text-[11px] text-muted-foreground ">
                      {t('Subject:')} {alert.subjectEmail} • IP: {alert.sourceIp}
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(alert.detectedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Audit Activity */}
        <Card>
          <CardHeader
            title={t('Recent Administrative Activity')}
            subtitle={t('Platform-wide audit trail of governance actions')}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigateTo('audit')}>
                {t('Full Audit Trail')} →
              </Button>
            }
          />
          <CardContent className="space-y-3">
            {auditLogs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                onClick={() => navigateTo('audit')}
                className="p-3 rounded-xl bg-background border border-border/80 hover:border-border transition-colors cursor-pointer flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div>
                    <span className="font-medium text-foreground block">{log.action}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('by')} {log.actorName}
                      {log.actorEmail && log.actorEmail !== log.actorName ? ` (${log.actorEmail})` : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="slate" size="sm">{log.resourceType}</Badge>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
