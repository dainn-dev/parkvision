import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { AlertTriangle, Ban, Check, Copy, KeyRound, PowerOff, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { TenantEdgeDevice } from '../../../types/tenant';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

interface DialogProps {
  device: TenantEdgeDevice | null;
  isOpen: boolean;
  onClose: () => void;
}

const useAction = (isOpen: boolean) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);
  const run = async <T extends { success: boolean; message?: string }>(fn: () => Promise<T>, onClose: () => void): Promise<T> => {
    setIsLoading(true);
    setError(null);
    const result = await fn();
    setIsLoading(false);
    if (result.success) onClose();
    else setError(result.message || i18n.t('Action failed', { ns: 'tenant' }));
    return result;
  };
  return { isLoading, error, run };
};

const ErrorBanner: React.FC<{ error: string | null }> = ({ error }) =>
  error ? (
    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">{error}</div>
  ) : null;

export const RebootDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { rebootTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);
  const [sentCount, setSentCount] = useState<number | null>(null);
  useEffect(() => {
    if (isOpen) setSentCount(null);
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-warning" />
          {t('Reboot Device')}
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button
            variant="primary"
            isLoading={isLoading}
            onClick={async () => {
              if (!device) return;
              const r = await run(() => rebootTenantDevice(device.id), () => {});
              if (r.success) {
                setSentCount(r.commandIds?.length ?? 0);
                setTimeout(onClose, 1200);
              }
            }}
          >
            {t('Reboot')}
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        {sentCount !== null ? (
          <div className="text-xs text-success">
            {t('Reboot command issued to {{count}} gate(s) bound to this device.', { count: sentCount })}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="text-xs text-foreground">
              {t('A')} <strong className="text-foreground">reboot</strong> {t('command will be sent to every barrier gate bound to this edge device.')}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export const DecommissionDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { decommissionTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <PowerOff className="w-5 h-5 text-warning" />
          {t('Decommission Device')}
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button
            variant="danger"
            isLoading={isLoading}
            onClick={() => device && run(() => decommissionTenantDevice(device.id), onClose)}
          >
            {t('Decommission')}
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            {t('The device will be marked')} <strong className="text-foreground">DECOMMISSIONED</strong> {t('and any barrier gates bound to it will be unbound. Heartbeats from this device will no longer mark it online. It can be reactivated later.')}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const ReactivateDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { reactivateTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-success" />
          {t('Reactivate Device')}
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button
            variant="success"
            isLoading={isLoading}
            onClick={() => device && run(() => reactivateTenantDevice(device.id), onClose)}
          >
            {t('Reactivate')}
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="text-xs text-foreground">
          {t('The device will return to')} <strong className="text-foreground">PROVISIONING</strong> {t('status and can come back online once it heartbeats.')}
        </div>
      </div>
    </Modal>
  );
};

export const ActivationCodeDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { generateDeviceActivationCode } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);
  const [allowedIp, setAllowedIp] = useState('');
  const [issued, setIssued] = useState<{ code: string; expiresAt?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setIssued(null);
      setCopied(false);
      setAllowedIp('');
    }
  }, [isOpen]);

  // Light client-side check (server validates too): IPv4/IPv6 or CIDR.
  const ipError = (() => {
    const v = allowedIp.trim();
    if (!v) return null;
    const [addr, prefix] = v.split('/');
    const isV4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(addr) && addr.split('.').every((o) => +o <= 255);
    const isV6 = /^[0-9a-fA-F:]+$/.test(addr) && addr.includes(':');
    if (!isV4 && !isV6) return t('Enter a valid IP address or CIDR (e.g. 203.0.113.10 or 203.0.113.0/24)');
    if (prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || +prefix > (isV6 ? 128 : 32)))
      return t('Invalid CIDR prefix length');
    return null;
  })();

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is still visible for manual copy
    }
  };

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          {t('Activation Code')}
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">
            {issued ? t('Done') : t('Cancel')}
          </Button>
          {!issued && (
            <Button
              variant="primary"
              isLoading={isLoading}
              disabled={!!ipError}
              onClick={async () => {
                if (!device) return;
                const r = await run(() => generateDeviceActivationCode(device.id, allowedIp.trim() || undefined), () => {});
                if (r.success && r.code) setIssued({ code: r.code, expiresAt: r.expiresAt });
              }}
            >
              {t('Generate Code')}
            </Button>
          )}
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        {issued ? (
          <>
            <div className="rounded-xl bg-success/10 border border-success/30 p-4 text-center">
              <div className=" text-2xl font-medium tracking-[0.2em] text-foreground select-all">
                {issued.code}
              </div>
              <button
                onClick={copy}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t('Copied') : t('Copy code')}
              </button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                {t('This code is shown')} <strong className="text-foreground">{t('once')}</strong> — {t('share it with whoever sets up the edge client.')}
                {issued.expiresAt && (
                  <> {t('It expires at')} <strong className="text-foreground">{new Date(issued.expiresAt).toLocaleString()}</strong>.</>
                )}
              </p>
              <p>{t('Generating a new code supersedes any unused code for this device.')}</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-foreground">
                {t('Generates a')} <strong className="text-foreground">{t('one-time activation code')}</strong> {t('(valid 24h). The edge client exchanges it for its gate, lane, camera, and credential configuration.')}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
                {t('Restrict to IP / CIDR (optional)')}
              </label>
              <input
                type="text"
                value={allowedIp}
                onChange={(e) => setAllowedIp(e.target.value)}
                placeholder={t('e.g. 203.0.113.10 or 203.0.113.0/24')}
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-xs text-foreground focus:outline-hidden focus:border-primary"
              />
              {ipError ? (
                <p className="mt-1.5 text-[11px] text-destructive">{ipError}</p>
              ) : (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {t("When set, the code can only be redeemed by a client connecting from this address — e.g. the site's public IP.")}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export const RevokeTokenDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { revokeDeviceToken } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-destructive" />
          {t('Revoke Device Token')}
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button
            variant="danger"
            isLoading={isLoading}
            onClick={() => device && run(() => revokeDeviceToken(device.id), onClose)}
          >
            {t('Revoke Token')}
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            {t("The device's API credential is revoked immediately — its")} <strong className="text-foreground">{t('REST and MQTT access stop working')}</strong> {t('and the client deprovisions itself. Issue a new activation code to reconnect it.')}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const DeleteDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { deleteTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-destructive" />
          {t('Delete Device')}
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button
            variant="danger"
            isLoading={isLoading}
            onClick={() => device && run(() => deleteTenantDevice(device.id), onClose)}
          >
            {t('Delete Permanently')}
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-foreground">
            {t('This permanently removes the device record. Only')} <strong className="text-foreground">decommissioned</strong> {t('devices with no bound gates can be deleted.')}
          </div>
        </div>
      </div>
    </Modal>
  );
};
