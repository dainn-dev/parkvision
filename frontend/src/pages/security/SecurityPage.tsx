import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Lock,
  ShieldCheck,
  ShieldAlert,
  Key,
  KeyRound,
  Users,
  Layers,
  Activity,
  CheckCircle2,
  RefreshCw,
  Eye,
  Trash2,
  AlertTriangle,
  Globe
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Tabs,
  StatCard,
  Modal,
  Input,
  Select
} from '../../components/ui';

export const SecurityPage: React.FC = () => {
  const {
    securityAlerts,
    acknowledgeAlert,
    resolveAlert,
    loginEvents,
    sessions,
    revokeSession,
    revokeAllUserSessions,
    credentials,
    rotateCredential,
    revokeCredential,
    securitySubTab,
    setSecuritySubTab,
    addToast
  } = usePlatform();

  const [selectedAlertModal, setSelectedAlertModal] = useState<any>(null);

  const openAlerts = securityAlerts.filter((a) => a.status !== 'RESOLVED');
  const criticalCount = openAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highCount = openAlerts.filter((a) => a.severity === 'HIGH').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" /> Security Control Center
            </h2>
            <Badge
              variant={criticalCount > 0 ? 'red' : highCount > 0 ? 'amber' : 'emerald'}
              dot
            >
              {criticalCount > 0
                ? 'CRITICAL RISK'
                : highCount > 0
                ? 'ELEVATED RISK'
                : 'SECURE'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Detect dictionary spray attacks, manage active device sessions, and audit platform API key rotations.
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <Tabs
        variant="pills"
        tabs={[
          { id: 'overview', label: 'Security Overview', icon: ShieldCheck },
          { id: 'alerts', label: 'Security Alerts', icon: ShieldAlert, badge: openAlerts.length },
          { id: 'logins', label: 'Login Activity', icon: Activity, badge: loginEvents.length },
          { id: 'sessions', label: 'Active Sessions', icon: Key, badge: sessions.length },
          { id: 'credentials', label: 'API Credentials', icon: Layers, badge: credentials.length }
        ]}
        activeTab={securitySubTab}
        onChange={(id) => setSecuritySubTab(id as any)}
      />

      {/* 1. SECURITY OVERVIEW TAB */}
      {securitySubTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Critical Threats"
              value={criticalCount}
              subtitle="Active automated attack alerts"
              badge={<Badge variant="red" dot>CRITICAL</Badge>}
            />
            <StatCard
              title="High Severity Alerts"
              value={highCount}
              subtitle="Unusual logins & MFA resets"
              badge={<Badge variant="amber" dot>HIGH</Badge>}
            />
            <StatCard
              title="Failed Logins (24h)"
              value={loginEvents.filter((l) => l.result === 'FAILED' || l.result === 'BLOCKED').length}
              subtitle="Brute-force attempts rate"
              badge={<Badge variant="red">48 Blocked</Badge>}
            />
            <StatCard
              title="Active Sessions"
              value={sessions.length}
              subtitle="Authenticated devices across platform"
              badge={<Badge variant="indigo">MANAGED</Badge>}
            />
          </div>

          <Card>
            <CardHeader title="Recent Security Threat Detections" />
            <CardContent className="space-y-3">
              {securityAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'CRITICAL' ? 'red' : 'amber'} size="sm">
                        {alert.severity}
                      </Badge>
                      <span className="text-xs font-bold text-white">{alert.type}</span>
                    </div>
                    <p className="text-xs text-slate-400">{alert.evidence.details}</p>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Subject: {alert.subjectEmail} • Source IP: {alert.sourceIp} ({alert.evidence.location})
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" icon={Eye} onClick={() => setSelectedAlertModal(alert)}>
                      View Evidence
                    </Button>

                    {alert.status !== 'RESOLVED' && (
                      <Button variant="success" size="sm" onClick={() => resolveAlert(alert.id)}>
                        Resolve Threat
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. SECURITY ALERTS TAB */}
      {securitySubTab === 'alerts' && (
        <Card className="p-5 space-y-4">
          <CardHeader title="Detected Security Threat Alerts" subtitle="Automated rate limiting and pattern anomaly detections" />
          <div className="space-y-3">
            {securityAlerts.map((alert) => (
              <div key={alert.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.severity === 'CRITICAL' ? 'red' : 'amber'} size="sm">
                      {alert.severity}
                    </Badge>
                    <Badge variant={alert.status === 'OPEN' ? 'red' : 'emerald'} size="sm">
                      {alert.status}
                    </Badge>
                    <span className="text-xs font-bold text-white">{alert.type}</span>
                  </div>
                  <p className="text-xs text-slate-400">{alert.evidence.details}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'OPEN' && (
                    <Button variant="outline" size="sm" onClick={() => acknowledgeAlert(alert.id)}>
                      Acknowledge
                    </Button>
                  )}
                  {alert.status !== 'RESOLVED' && (
                    <Button variant="success" size="sm" onClick={() => resolveAlert(alert.id)}>
                      Mark Resolved
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 3. LOGIN ACTIVITY TAB */}
      {securitySubTab === 'logins' && (
        <Card className="overflow-hidden">
          <CardHeader title="Authentication Activity Log" subtitle="Platform-wide login verification events and rate limiter logs" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Subject User</th>
                  <th className="py-3.5 px-4">User Type</th>
                  <th className="py-3.5 px-4">Result</th>
                  <th className="py-3.5 px-4">Source IP</th>
                  <th className="py-3.5 px-4">Client Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {loginEvents.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-400">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="py-3.5 px-4 font-bold text-white">{l.userEmail}</td>
                    <td className="py-3.5 px-4"><Badge variant="indigo" size="sm">{l.userType}</Badge></td>
                    <td className="py-3.5 px-4">
                      <Badge variant={l.result === 'SUCCESS' ? 'emerald' : l.result === 'BLOCKED' ? 'red' : 'amber'} dot>
                        {l.result}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-amber-300">{l.sourceIp}</td>
                    <td className="py-3.5 px-4 text-slate-400">{l.clientDevice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4. ACTIVE SESSIONS TAB */}
      {securitySubTab === 'sessions' && (
        <Card className="overflow-hidden">
          <CardHeader title="Platform Active Device Sessions" subtitle="Terminate unauthorized or compromised authenticated sessions" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">User Account</th>
                  <th className="py-3.5 px-4">Device & OS</th>
                  <th className="py-3.5 px-4">Browser</th>
                  <th className="py-3.5 px-4">IP Address</th>
                  <th className="py-3.5 px-4">Risk State</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white block">{s.userName}</span>
                      <span className="text-slate-400">{s.userEmail}</span>
                    </td>
                    <td className="py-3.5 px-4">{s.device} ({s.os})</td>
                    <td className="py-3.5 px-4 font-mono">{s.browser}</td>
                    <td className="py-3.5 px-4 font-mono text-amber-300">{s.ipAddress}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={s.riskLevel === 'NORMAL' ? 'emerald' : 'amber'} dot>
                        {s.riskLevel}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-400 hover:bg-red-950/50 hover:border-red-800"
                        onClick={() => revokeSession(s.id)}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 5. API CREDENTIALS TAB */}
      {securitySubTab === 'credentials' && (
        <Card className="overflow-hidden">
          <CardHeader title="Edge Hardware & Service API Credentials" subtitle="Issued authentication secrets and rotation lifecycle" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Credential Name</th>
                  <th className="py-3.5 px-4">Owner</th>
                  <th className="py-3.5 px-4">Key Prefix (Secret Masked)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Last Used</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {credentials.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">{c.name}</td>
                    <td className="py-3.5 px-4">{c.ownerName}</td>
                    <td className="py-3.5 px-4 font-mono text-emerald-400 font-semibold">
                      {c.keyPrefix}••••••••••••
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={c.status === 'ACTIVE' ? 'emerald' : c.status === 'EXPIRING' ? 'amber' : 'red'} dot>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">{c.lastUsedAt}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => rotateCredential(c.id)}>
                          Rotate Secret
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400"
                          onClick={() => revokeCredential(c.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Alert Evidence Modal */}
      {selectedAlertModal && (
        <Modal
          isOpen={Boolean(selectedAlertModal)}
          onClose={() => setSelectedAlertModal(null)}
          title={`Security Alert Evidence: ${selectedAlertModal.type}`}
          subtitle={`Subject: ${selectedAlertModal.subjectEmail}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono">
              <div><span className="text-slate-500">Alert ID:</span> {selectedAlertModal.id}</div>
              <div><span className="text-slate-500">Source IP:</span> <span className="text-amber-300">{selectedAlertModal.sourceIp}</span></div>
              <div><span className="text-slate-500">Client Agent:</span> {selectedAlertModal.clientBrowser}</div>
              <div><span className="text-slate-500">Evidence Details:</span> <span className="text-slate-200">{selectedAlertModal.evidence.details}</span></div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlertModal(null)}>
                Close
              </Button>
              <Button variant="success" size="sm" onClick={() => {
                resolveAlert(selectedAlertModal.id);
                setSelectedAlertModal(null);
              }}>
                Resolve Threat
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
