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
  Select,
  Pagination
} from '../../components/ui';
import { useTranslation } from 'react-i18next';
import { canManagePlatformAdmins, canManagePlatformOps, canRevokePlatformSessions } from '../../lib/permissions';

export const SecurityPage: React.FC = () => {
  const { t } = useTranslation('security');
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
    createCredential,
    issuedSecret,
    clearIssuedSecret,
    tenants,
    admins,
    resetAdminMfa,
    openMfaModal,
    currentUser,
    securitySubTab,
    setSecuritySubTab,
    addToast
  } = usePlatform();

  // Reset another admin's MFA is super_admin-only; revoking sessions is
  // super_admin|support; API credential issue/rotate/revoke is super_admin|ops.
  // Mirrors platform.py's per-route `require_platform_admin((...))` role tuples.
  const canResetMfa = canManagePlatformAdmins(currentUser.rawRole);
  const canRevoke = canRevokePlatformSessions(currentUser.rawRole);
  const canManageCredentials = canManagePlatformOps(currentUser.rawRole);

  const [selectedAlertModal, setSelectedAlertModal] = useState<any>(null);
  const [sessionPage, setSessionPage] = useState(1);
  const sessionPageSize = 10;
  const [isCreateCredOpen, setIsCreateCredOpen] = useState(false);
  const [credName, setCredName] = useState('');
  const [credTenantId, setCredTenantId] = useState('');
  const [credExpires, setCredExpires] = useState('365');

  const openAlerts = securityAlerts.filter((a) => a.status !== 'RESOLVED');
  const criticalCount = openAlerts.filter((a) => a.severity === 'CRITICAL').length;
  const highCount = openAlerts.filter((a) => a.severity === 'HIGH').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-[330ms]">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-medium text-foreground tracking-tight flex items-center gap-2">
              <Lock className="w-5 h-5 text-destructive" /> {t('Security Control Center')}
            </h2>
            <Badge
              variant={criticalCount > 0 ? 'red' : highCount > 0 ? 'amber' : 'emerald'}
              dot
            >
              {criticalCount > 0
                ? t('CRITICAL RISK')
                : highCount > 0
                ? t('ELEVATED RISK')
                : t('SECURE')}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Detect dictionary spray attacks, manage active device sessions, and audit platform API key rotations.')}
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <Tabs
        variant="pills"
        tabs={[
          { id: 'overview', label: t('Security Overview'), icon: ShieldCheck },
          { id: 'mfa', label: t('MFA Policies'), icon: KeyRound, badge: admins.filter((a) => !a.mfaEnabled).length },
          { id: 'alerts', label: t('Security Alerts'), icon: ShieldAlert, badge: openAlerts.length },
          { id: 'logins', label: t('Login Activity'), icon: Activity, badge: loginEvents.length },
          { id: 'sessions', label: t('Active Sessions'), icon: Key, badge: sessions.length },
          { id: 'credentials', label: t('API Credentials'), icon: Layers, badge: credentials.length }
        ]}
        activeTab={securitySubTab}
        onChange={(id) => setSecuritySubTab(id as any)}
      />

      {/* 1. SECURITY OVERVIEW TAB */}
      {securitySubTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={t('Critical Threats')}
              value={criticalCount}
              subtitle={t('Active automated attack alerts')}
              badge={<Badge variant="red" dot>CRITICAL</Badge>}
            />
            <StatCard
              title={t('High Severity Alerts')}
              value={highCount}
              subtitle={t('Unusual logins & MFA resets')}
              badge={<Badge variant="amber" dot>HIGH</Badge>}
            />
            <StatCard
              title={t('Failed Logins (24h)')}
              value={loginEvents.filter((l) => l.result === 'FAILED' || l.result === 'BLOCKED').length}
              subtitle={t('Brute-force attempts rate')}
              badge={
                <Badge variant="red">
                  {t('{{count}} Blocked', {
                    count: loginEvents.filter((l) => l.result === 'BLOCKED').length,
                  })}
                </Badge>
              }
            />
            <StatCard
              title={t('Active Sessions')}
              value={sessions.length}
              subtitle={t('Authenticated devices across platform')}
              badge={<Badge variant="indigo">{t('MANAGED')}</Badge>}
            />
          </div>

          <Card>
            <CardHeader title={t('Recent Security Threat Detections')} />
            <CardContent className="space-y-3">
              {securityAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="p-4 rounded-xl bg-background border border-border flex flex-col md:flex-row md:items-center justify-between gap-4"
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
                      {t('Subject:')} {alert.subjectEmail} • {t('Source IP:')} {alert.sourceIp} ({alert.evidence.location})
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" icon={Eye} onClick={() => setSelectedAlertModal(alert)}>
                      {t('View Evidence')}
                    </Button>

                    {alert.status !== 'RESOLVED' && (
                      <Button variant="success" size="sm" onClick={() => resolveAlert(alert.id)}>
                        {t('Resolve Threat')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. MFA POLICIES TAB */}
      {securitySubTab === 'mfa' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title={t('Enrolled Administrators')}
              value={`${admins.filter((a) => a.mfaEnabled).length}/${admins.length}`}
              subtitle={t('Platform admins with TOTP enrolled')}
              badge={
                <Badge variant={admins.every((a) => a.mfaEnabled) ? 'emerald' : 'amber'} dot>
                  {admins.every((a) => a.mfaEnabled) ? t('ENFORCED') : t('PENDING')}
                </Badge>
              }
            />
            <StatCard
              title={t('Unenrolled Administrators')}
              value={admins.filter((a) => !a.mfaEnabled).length}
              subtitle={t('Accounts still able to sign in with password only')}
              badge={<Badge variant={admins.some((a) => !a.mfaEnabled) ? 'amber' : 'emerald'}>{t('MFA')}</Badge>}
            />
            <StatCard
              title={t('Your Account MFA')}
              value={currentUser.mfaEnabled ? t('Enabled') : t('Disabled')}
              subtitle={currentUser.email || t('Signed-in platform account')}
              badge={<Badge variant={currentUser.mfaEnabled ? 'emerald' : 'red'} dot>{currentUser.mfaEnabled ? t('SECURE') : t('AT RISK')}</Badge>}
            />
          </div>

          <Card className="overflow-hidden">
            <CardHeader
              title={t('Multi-Factor Authentication Enrollment')}
              subtitle={t('TOTP state per platform administrator. Resetting a secret revokes their sessions and forces re-enrollment.')}
              action={
                !currentUser.mfaEnabled ? (
                  <Button variant="primary" size="sm" icon={KeyRound} onClick={() => openMfaModal('enroll')}>
                    {t('Enroll My Account')}
                  </Button>
                ) : undefined
              }
            />
            {admins.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">{t('No platform administrators found.')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background border-b border-border text-muted-foreground font-medium">
                    <tr>
                      <th className="py-3.5 px-4">{t('Administrator')}</th>
                      <th className="py-3.5 px-4">{t('Role')}</th>
                      <th className="py-3.5 px-4">{t('MFA State')}</th>
                      <th className="py-3.5 px-4">{t('Last Login')}</th>
                      <th className="py-3.5 px-4 text-right">{t('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/80 text-foreground">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-muted/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-foreground block">{admin.name}</span>
                          <span className="text-[11px] text-muted-foreground">{admin.email}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="indigo" size="sm">{admin.role}</Badge>
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant={admin.mfaEnabled ? 'emerald' : 'amber'} dot>
                            {admin.mfaEnabled ? t('ENROLLED') : t('NOT ENROLLED')}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground">
                          {admin.lastLoginAt && admin.lastLoginAt !== 'Never'
                            ? new Date(admin.lastLoginAt).toLocaleString()
                            : t('Never')}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {canResetMfa && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!admin.mfaEnabled}
                              onClick={() => {
                                if (window.confirm(t('Reset the MFA secret for {{name}}? All their sessions will be revoked.', { name: admin.name }))) {
                                  resetAdminMfa(admin.id);
                                }
                              }}
                            >
                              {t('Reset MFA')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t('Enforcement Policy')} subtitle={t('Current platform authentication baseline')} />
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-foreground">
              <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between">
                <span>{t('TOTP required for platform administrators')}</span>
                <Badge variant={admins.every((a) => a.mfaEnabled) ? 'emerald' : 'amber'} size="sm">
                  {admins.every((a) => a.mfaEnabled) ? t('YES') : t('PARTIAL')}
                </Badge>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between">
                <span>{t('MFA-verified active sessions')}</span>
                <span className=" font-medium text-success">
                  {sessions.filter((s) => s.mfaVerified).length}/{sessions.length}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between">
                <span>{t('Recovery codes issued on enrollment')}</span>
                <Badge variant="indigo" size="sm">{t('10 CODES')}</Badge>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between">
                <span>{t('Session revocation on MFA reset')}</span>
                <Badge variant="emerald" size="sm">{t('ENABLED')}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. SECURITY ALERTS TAB */}
      {securitySubTab === 'alerts' && (
        <Card className="p-5 space-y-4">
          <CardHeader title={t('Detected Security Threat Alerts')} subtitle={t('Automated rate limiting and pattern anomaly detections')} />
          <div className="space-y-3">
            {securityAlerts.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground">{t('No security alerts detected.')}</div>
            )}
            {securityAlerts.map((alert) => (
              <div key={alert.id} className="p-4 rounded-xl bg-background border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={alert.severity === 'CRITICAL' ? 'red' : 'amber'} size="sm">
                      {alert.severity}
                    </Badge>
                    <Badge variant={alert.status === 'OPEN' ? 'red' : 'emerald'} size="sm">
                      {alert.status}
                    </Badge>
                    <span className="text-xs font-medium text-foreground">{alert.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.evidence.details}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'OPEN' && (
                    <Button variant="outline" size="sm" onClick={() => acknowledgeAlert(alert.id)}>
                      {t('Acknowledge')}
                    </Button>
                  )}
                  {alert.status !== 'RESOLVED' && (
                    <Button variant="success" size="sm" onClick={() => resolveAlert(alert.id)}>
                      {t('Mark Resolved')}
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
          <CardHeader title={t('Authentication Activity Log')} subtitle={t('Platform-wide login verification events and rate limiter logs')} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="py-3.5 px-4">{t('Timestamp')}</th>
                  <th className="py-3.5 px-4">{t('Subject User')}</th>
                  <th className="py-3.5 px-4">{t('User Type')}</th>
                  <th className="py-3.5 px-4">{t('Result')}</th>
                  <th className="py-3.5 px-4">{t('Source IP')}</th>
                  <th className="py-3.5 px-4">{t('Client Device')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 text-foreground">
                {loginEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">{t('No login activity recorded.')}</td>
                  </tr>
                )}
                {loginEvents.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3.5 px-4 text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="py-3.5 px-4 font-medium text-foreground">{l.userEmail}</td>
                    <td className="py-3.5 px-4"><Badge variant="indigo" size="sm">{l.userType}</Badge></td>
                    <td className="py-3.5 px-4">
                      <Badge variant={l.result === 'SUCCESS' ? 'emerald' : l.result === 'BLOCKED' ? 'red' : 'amber'} dot>
                        {l.result}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-warning">{l.sourceIp}</td>
                    <td className="py-3.5 px-4 text-muted-foreground">{l.clientDevice}</td>
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
          <CardHeader title={t('Platform Active Device Sessions')} subtitle={t('Terminate unauthorized or compromised authenticated sessions')} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="py-3.5 px-4">{t('User Account')}</th>
                  <th className="py-3.5 px-4">{t('Device & OS')}</th>
                  <th className="py-3.5 px-4">{t('Browser')}</th>
                  <th className="py-3.5 px-4">{t('IP Address')}</th>
                  <th className="py-3.5 px-4">{t('Risk State')}</th>
                  <th className="py-3.5 px-4 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 text-foreground">
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">{t('No active sessions.')}</td>
                  </tr>
                )}
                {sessions
                  .slice((sessionPage - 1) * sessionPageSize, sessionPage * sessionPageSize)
                  .map((s) => (
                  <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-foreground block">{s.userName}</span>
                      <span className="text-muted-foreground">{s.userEmail}</span>
                    </td>
                    <td className="py-3.5 px-4">{s.device} ({s.os})</td>
                    <td className="py-3.5 px-4 ">{s.browser}</td>
                    <td className="py-3.5 px-4 font-mono text-warning">{s.ipAddress}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={s.riskLevel === 'NORMAL' ? 'emerald' : 'amber'} dot>
                        {s.riskLevel}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {canRevoke && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                          onClick={() => {
                            if (window.confirm(t('Revoke the session for {{user}}? They will be signed out immediately.', { user: s.userEmail || s.userName }))) {
                              revokeSession(s.id);
                            }
                          }}
                        >
                          {t('Revoke')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={sessionPage}
            totalPages={Math.max(1, Math.ceil(sessions.length / sessionPageSize))}
            onPageChange={setSessionPage}
            totalItems={sessions.length}
            pageSize={sessionPageSize}
          />
        </Card>
      )}

      {/* 5. API CREDENTIALS TAB */}
      {securitySubTab === 'credentials' && (
        <Card className="overflow-hidden">
          <CardHeader title={t('Edge Hardware & Service API Credentials')} subtitle={t('Issued authentication secrets and rotation lifecycle')} />
          {canManageCredentials && (
            <div className="px-6 pb-3 flex justify-end border-b border-border -mt-2">
              <Button variant="primary" size="sm" icon={Key} onClick={() => { setCredName(''); setCredTenantId(''); setIsCreateCredOpen(true); }}>
                {t('Issue Credential')}
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background border-b border-border text-muted-foreground font-medium">
                <tr>
                  <th className="py-3.5 px-4">{t('Credential Name')}</th>
                  <th className="py-3.5 px-4">{t('Owner')}</th>
                  <th className="py-3.5 px-4">{t('Key Prefix (Secret Masked)')}</th>
                  <th className="py-3.5 px-4">{t('Status')}</th>
                  <th className="py-3.5 px-4">{t('Last Used')}</th>
                  <th className="py-3.5 px-4 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 text-foreground">
                {credentials.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">{t('No API credentials issued.')}</td>
                  </tr>
                )}
                {credentials.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-foreground">{c.name}</td>
                    <td className="py-3.5 px-4">{c.ownerName}</td>
                    <td className="py-3.5 px-4 text-success font-medium">
                      {c.keyPrefix}••••••••••••
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={c.status === 'ACTIVE' ? 'emerald' : c.status === 'EXPIRING' ? 'amber' : 'red'} dot>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground ">{c.lastUsedAt}</td>
                    <td className="py-3.5 px-4 text-right">
                      {c.status === 'REVOKED' ? (
                        <span className="text-[11px] text-muted-foreground">{t('No actions — credential revoked')}</span>
                      ) : !canManageCredentials ? (
                        <span className="text-[11px] text-muted-foreground italic">{t('View only')}</span>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={c.status !== 'ACTIVE'}
                            title={c.status !== 'ACTIVE' ? t('Only active credentials can be rotated') : undefined}
                            onClick={() => {
                              if (window.confirm(t('Rotate the secret for {{name}}? The current key stops working immediately.', { name: c.name }))) {
                                rotateCredential(c.id);
                              }
                            }}
                          >
                            {t('Rotate Secret')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (window.confirm(t('Revoke {{name}}? Any device using this key will lose access.', { name: c.name }))) {
                                revokeCredential(c.id);
                              }
                            }}
                          >
                            {t('Revoke')}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* One-time plaintext key display */}
      {issuedSecret && (
        <Modal isOpen onClose={clearIssuedSecret} title={t('API Key Issued — save now')} subtitle={t('Credential: {{name}}', { name: issuedSecret.name })}>
          <div className="space-y-3">
            <p className="text-xs text-warning flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('The key is shown only once — copy and store it securely before closing.')}
            </p>
            <div className="p-4 bg-background rounded-xl border border-success/50 text-success text-sm break-all select-all">
              {issuedSecret.key}
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard?.writeText(issuedSecret.key); addToast({ type: 'success', title: t('Copied key') }); }}
              >
                {t('Copy')}
              </Button>
              <Button variant="primary" size="sm" onClick={clearIssuedSecret}>{t('Done')}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create credential modal */}
      {isCreateCredOpen && (
        <Modal
          isOpen={isCreateCredOpen}
          onClose={() => setIsCreateCredOpen(false)}
          title={t('Issue API Credential')}
          subtitle={t('Create a pk_* key for edge hardware or service integration')}
        >
          <div className="space-y-4">
            <Input label={t('Credential Name')} value={credName} onChange={(e) => setCredName(e.target.value)} placeholder="edge-gateway-north" />
            <Select
              label={t('Tenant Scope')}
              value={credTenantId}
              onChange={(e) => setCredTenantId(e.target.value)}
              options={[{ value: '', label: t('— Platform-wide (no tenant) —') }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]}
            />
            <Input label={t('Expires In (days)')} type="number" value={credExpires} onChange={(e) => setCredExpires(e.target.value)} />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsCreateCredOpen(false)}>{t('Cancel')}</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (!credName.trim()) { addToast({ type: 'warning', title: t('Name required') }); return; }
                  createCredential({
                    name: credName.trim(),
                    tenantId: credTenantId || null,
                    scopes: ['edge:ingest', 'edge:commands'],
                    expiresInDays: credExpires ? parseInt(credExpires, 10) : null,
                  });
                  setIsCreateCredOpen(false);
                }}
              >
                {t('Issue')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Alert Evidence Modal */}
      {selectedAlertModal && (
        <Modal
          isOpen={Boolean(selectedAlertModal)}
          onClose={() => setSelectedAlertModal(null)}
          title={t('Security Alert Evidence: {{type}}', { type: selectedAlertModal.type })}
          subtitle={t('Subject: {{email}}', { email: selectedAlertModal.subjectEmail })}
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-background rounded-xl border border-border space-y-2 ">
              <div><span className="text-muted-foreground">{t('Alert ID:')}</span> {selectedAlertModal.id}</div>
              <div><span className="text-muted-foreground">{t('Source IP:')}</span> <span className="text-warning">{selectedAlertModal.sourceIp}</span></div>
              <div><span className="text-muted-foreground">{t('Client Agent:')}</span> {selectedAlertModal.clientBrowser}</div>
              <div><span className="text-muted-foreground">{t('Evidence Details:')}</span> <span className="text-foreground">{selectedAlertModal.evidence.details}</span></div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlertModal(null)}>
                {t('Close')}
              </Button>
              <Button variant="success" size="sm" onClick={() => {
                resolveAlert(selectedAlertModal.id);
                setSelectedAlertModal(null);
              }}>
                {t('Resolve Threat')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
