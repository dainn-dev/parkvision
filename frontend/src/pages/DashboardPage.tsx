import React from 'react';
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
    tenants,
    admins,
    services,
    edgeDevices,
    cameras,
    gates,
    incidents,
    securityAlerts,
    auditLogs,
    navigateTo
  } = usePlatform();

  // Aggregate Stats Calculations
  const activeTenants = tenants.filter((t) => t.status === 'ACTIVE').length;
  const trialTenants = tenants.filter((t) => t.status === 'TRIAL').length;
  const suspendedTenants = tenants.filter((t) => t.status === 'SUSPENDED').length;

  const totalUsersCount = tenants.reduce((acc, t) => acc + t.statistics.usersCount, 0);
  const totalEventsCount = tenants.reduce((acc, t) => acc + t.statistics.eventsCount, 0);

  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter((c) => c.status === 'ONLINE').length;
  const offlineCameras = totalCameras - onlineCameras;

  const totalGates = gates.length;
  const onlineGates = gates.filter((g) => g.status === 'ONLINE').length;

  const totalEdge = edgeDevices.length;
  const onlineEdge = edgeDevices.filter((d) => d.status === 'ONLINE').length;

  const openAlerts = securityAlerts.filter((a) => a.status === 'OPEN');
  const criticalAlertsCount = openAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highAlertsCount = openAlerts.filter((a) => a.severity === 'HIGH').length;

  // Chart Mock Data for 24 hours throughput
  const hourlyThroughputData = [
    { time: '00:00', events: 42000, latency: 45 },
    { time: '02:00', events: 28000, latency: 38 },
    { time: '04:00', events: 19000, latency: 35 },
    { time: '06:00', events: 68000, latency: 42 },
    { time: '08:00', events: 184000, latency: 58 },
    { time: '10:00', events: 245000, latency: 62 },
    { time: '12:00', events: 210000, latency: 52 },
    { time: '14:00', events: 238000, latency: 55 },
    { time: '16:00', events: 260000, latency: 64 },
    { time: '18:00', events: 215000, latency: 48 },
    { time: '20:00', events: 142000, latency: 41 },
    { time: '22:00', events: 88000, latency: 39 }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header & Welcome Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22] p-6 rounded-xl border border-[#30363d] shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="blue" size="sm">
              GLOBAL PLATFORM GOVERNANCE
            </Badge>
            <span className="text-xs text-[#8b949e] font-mono">Region: ap-southeast-1</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white mt-2 tracking-tight">
            Vehicle Platform Operational Center
          </h2>
          <p className="text-xs text-[#8b949e] mt-1">
            Real-time multi-tenant health, high-precision edge telemetry, and security oversight.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="primary"
            icon={Plus}
            onClick={onOpenCreateTenantModal}
            className="shadow-sm"
          >
            Provision Tenant
          </Button>
          <Button
            variant="secondary"
            icon={ShieldAlert}
            onClick={() => navigateTo('security')}
          >
            Security Center
          </Button>
        </div>
      </div>

      {/* 2. Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Platform Tenants"
          value={tenants.length}
          subtitle={`${activeTenants} Active • ${trialTenants} Trial • ${suspendedTenants} Suspended`}
          changeType="neutral"
          icon={Building2}
          onClick={() => navigateTo('tenants')}
        />

        <StatCard
          title="Active Platform Users"
          value={totalUsersCount.toLocaleString()}
          subtitle="Across all active enterprise tenant orgs"
          changeType="neutral"
          icon={Users}
          onClick={() => navigateTo('tenants')}
        />

        <StatCard
          title="Recognition Events (24h)"
          value={`${(totalEventsCount / 1000000).toFixed(2)}M`}
          subtitle="Real-time gate OCR payload throughput"
          changeType="neutral"
          icon={Activity}
          onClick={() => navigateTo('monitoring')}
        />

        <StatCard
          title="Platform Service Health"
          value={services.length ? `${services.filter((s) => s.status === 'HEALTHY').length}/${services.length}` : '—'}
          subtitle="Core infrastructure services online"
          change="● Live infra health"
          changeType="positive"
          icon={ShieldCheck}
          badge={<Badge variant="emerald" dot>HEALTHY</Badge>}
          onClick={() => navigateTo('monitoring')}
        />
      </div>

      {/* 3. System Services & Infrastructure Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Services Health */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Core Platform Microservices Status"
            subtitle="Live ping latencies and SLA uptime verification"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateTo('monitoring', 'overview')}
              >
                Detailed Health →
              </Button>
            }
          />
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map((srv) => (
              <div
                key={srv.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-100">{srv.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{srv.details}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-indigo-300 block">
                    {srv.responseTimeMs} ms
                  </span>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {srv.uptimePercent != null ? `${srv.uptimePercent}% uptime` : 'uptime n/a'}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Infrastructure Fleet Summary */}
        <Card>
          <CardHeader
            title="Infrastructure Fleet"
            subtitle="Aggregate Edge hardware & camera status"
          />
          <CardContent className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Cameras Fleet</h4>
                  <p className="text-[11px] text-slate-400">{onlineCameras} / {totalCameras} Online</p>
                </div>
              </div>
              <Badge variant={offlineCameras > 0 ? 'amber' : 'emerald'} size="sm">
                {totalCameras ? `${((onlineCameras / totalCameras) * 100).toFixed(1)}%` : '—'}
              </Badge>
            </div>

            <div
              onClick={() => navigateTo('monitoring', 'gates')}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/50 transition-colors cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-800/50 group-hover:scale-105 transition-transform">
                  <DoorOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">Gate Controllers & Barriers</h4>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <p className="text-[11px] text-slate-400">{onlineGates} / {totalGates} Active · Xem Bản Đồ D3 →</p>
                </div>
              </div>
              <Badge variant="emerald" size="sm">{totalGates ? `${((onlineGates / totalGates) * 100).toFixed(1)}%` : '—'}</Badge>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-indigo-950/80 text-indigo-400 border border-indigo-800/50">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Edge Processing Nodes</h4>
                  <p className="text-[11px] text-slate-400">{onlineEdge} / {totalEdge} Connected</p>
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
          title="Platform Event Processing Rate (Payloads / Hour)"
          subtitle="Real-time OCR license plate recognition & gate barrier access decisions"
          action={
            <div className="flex items-center gap-2">
              <Badge variant="blue" size="sm">24-Hour Range</Badge>
              <Badge variant="emerald" size="sm" dot>Sub-50ms Latency</Badge>
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
                  stroke="#58a6ff"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorEvents)"
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
            title="Security Threats & Control Center"
            subtitle="Detected authentication anomalies and active security alerts"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigateTo('security')}>
                Security Center →
              </Button>
            }
          />
          <CardContent className="space-y-3">
            {securityAlerts.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                No unresolved security alerts.
              </div>
            ) : (
              securityAlerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => navigateTo('security', 'alerts')}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer flex items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'CRITICAL' ? 'red' : 'amber'} size="sm">
                        {alert.severity}
                      </Badge>
                      <span className="text-xs font-bold text-slate-100">{alert.type}</span>
                    </div>
                    <p className="text-xs text-slate-400">{alert.evidence.details}</p>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Subject: {alert.subjectEmail} • IP: {alert.sourceIp}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
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
            title="Recent Administrative Activity"
            subtitle="Platform-wide audit trail of governance actions"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigateTo('audit')}>
                Full Audit Trail →
              </Button>
            }
          />
          <CardContent className="space-y-3">
            {auditLogs.slice(0, 4).map((log) => (
              <div
                key={log.id}
                onClick={() => navigateTo('audit')}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-all cursor-pointer flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <div>
                    <span className="font-bold text-slate-200 block">{log.action}</span>
                    <span className="text-[11px] text-slate-400">
                      by {log.actorName} ({log.actorEmail})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="slate" size="sm">{log.resourceType}</Badge>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
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
