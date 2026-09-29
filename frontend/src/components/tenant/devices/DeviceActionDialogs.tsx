import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { AlertTriangle, Ban, Check, Copy, KeyRound, PowerOff, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Modal } from '../../ui';
import { TenantEdgeDevice } from '../../../types/tenant';

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
    else setError(result.message || 'Action failed');
    return result;
  };
  return { isLoading, error, run };
};

const ErrorBanner: React.FC<{ error: string | null }> = ({ error }) =>
  error ? (
    <div className="p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-xs text-[#f85149]">{error}</div>
  ) : null;

export const RebootDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
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
          <RotateCcw className="w-5 h-5 text-[#e3b341]" />
          Reboot Device
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
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
            Reboot
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        {sentCount !== null ? (
          <div className="text-xs text-[#3fb950]">
            Reboot command issued to {sentCount} gate{sentCount === 1 ? '' : 's'} bound to this device.
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e3b341] shrink-0 mt-0.5" />
            <div className="text-xs text-[#c9d1d9]">
              A <strong className="text-white">reboot</strong> command will be sent to every barrier gate bound to this edge device.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export const DecommissionDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { decommissionTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <PowerOff className="w-5 h-5 text-[#e3b341]" />
          Decommission Device
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button
            variant="danger"
            isLoading={isLoading}
            onClick={() => device && run(() => decommissionTenantDevice(device.id), onClose)}
          >
            Decommission
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="p-3.5 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#e3b341] shrink-0 mt-0.5" />
          <div className="text-xs text-[#c9d1d9]">
            The device will be marked <strong className="text-white">DECOMMISSIONED</strong> and any barrier gates bound to it will be unbound. Heartbeats from this device will no longer mark it online. It can be reactivated later.
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const ReactivateDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { reactivateTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-[#3fb950]" />
          Reactivate Device
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button
            variant="success"
            isLoading={isLoading}
            onClick={() => device && run(() => reactivateTenantDevice(device.id), onClose)}
          >
            Reactivate
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="text-xs text-[#c9d1d9]">
          The device will return to <strong className="text-white">PROVISIONING</strong> status and can come back online once it heartbeats.
        </div>
      </div>
    </Modal>
  );
};

export const ActivationCodeDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
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
    if (!isV4 && !isV6) return 'Enter a valid IP address or CIDR (e.g. 203.0.113.10 or 203.0.113.0/24)';
    if (prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || +prefix > (isV6 ? 128 : 32)))
      return 'Invalid CIDR prefix length';
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
          <KeyRound className="w-5 h-5 text-[#58a6ff]" />
          Activation Code
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">
            {issued ? 'Done' : 'Cancel'}
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
              Generate Code
            </Button>
          )}
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        {issued ? (
          <>
            <div className="rounded-xl bg-[#238636]/10 border border-[#238636]/30 p-4 text-center">
              <div className="font-mono text-2xl font-bold tracking-[0.2em] text-white select-all">
                {issued.code}
              </div>
              <button
                onClick={copy}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#30363d] px-3 py-1.5 text-xs text-[#c9d1d9] hover:bg-[#21262d]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#3fb950]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <div className="text-xs text-[#8b949e] space-y-1">
              <p>
                This code is shown <strong className="text-white">once</strong> — share it with whoever sets up the edge client.
                {issued.expiresAt && (
                  <> It expires at <strong className="text-white">{new Date(issued.expiresAt).toLocaleString()}</strong>.</>
                )}
              </p>
              <p>Generating a new code supersedes any unused code for this device.</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-3.5 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#58a6ff] shrink-0 mt-0.5" />
              <div className="text-xs text-[#c9d1d9]">
                Generates a <strong className="text-white">one-time activation code</strong> (valid 24h). The edge client
                exchanges it for its gate, lane, camera, and credential configuration.
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#8b949e] uppercase tracking-wider mb-1.5">
                Restrict to IP / CIDR (optional)
              </label>
              <input
                type="text"
                value={allowedIp}
                onChange={(e) => setAllowedIp(e.target.value)}
                placeholder="e.g. 203.0.113.10 or 203.0.113.0/24"
                className="w-full rounded-lg bg-[#0d0e12] border border-[#30363d] px-3 py-2 text-xs font-mono text-white focus:outline-hidden focus:border-[#58a6ff]"
              />
              {ipError ? (
                <p className="mt-1.5 text-[11px] text-[#f85149]">{ipError}</p>
              ) : (
                <p className="mt-1.5 text-[11px] text-[#8b949e]">
                  When set, the code can only be redeemed by a client connecting from this address —
                  e.g. the site's public IP.
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
  const { revokeDeviceToken } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-[#f85149]" />
          Revoke Device Token
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button
            variant="danger"
            isLoading={isLoading}
            onClick={() => device && run(() => revokeDeviceToken(device.id), onClose)}
          >
            Revoke Token
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="p-3.5 rounded-xl bg-[#f85149]/10 border border-[#f85149]/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#f85149] shrink-0 mt-0.5" />
          <div className="text-xs text-[#c9d1d9]">
            The device's API credential is revoked immediately — its <strong className="text-white">REST and MQTT access stop working</strong> and
            the client deprovisions itself. Issue a new activation code to reconnect it.
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const DeleteDeviceDialog: React.FC<DialogProps> = ({ device, isOpen, onClose }) => {
  const { deleteTenantDevice } = usePlatform();
  const { isLoading, error, run } = useAction(isOpen);

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      maxWidth="sm"
      title={
        <span className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-[#f85149]" />
          Delete Device
        </span>
      }
      subtitle={device?.name}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button
            variant="danger"
            isLoading={isLoading}
            onClick={() => device && run(() => deleteTenantDevice(device.id), onClose)}
          >
            Delete Permanently
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        <ErrorBanner error={error} />
        <div className="p-3.5 rounded-xl bg-[#f85149]/10 border border-[#f85149]/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#f85149] shrink-0 mt-0.5" />
          <div className="text-xs text-[#c9d1d9]">
            This permanently removes the device record. Only <strong className="text-white">decommissioned</strong> devices with no bound gates can be deleted.
          </div>
        </div>
      </div>
    </Modal>
  );
};
