import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { AlertTriangle, PowerOff, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
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
    <div className="p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-xs text-[#f85149]">{error}</div>
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
          <RotateCcw className="w-5 h-5 text-[#e3b341]" />
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
          <div className="text-xs text-[#3fb950]">
            {t('Reboot command issued to {{count}} gate(s) bound to this device.', { count: sentCount })}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e3b341] shrink-0 mt-0.5" />
            <div className="text-xs text-[#c9d1d9]">
              {t('A')} <strong className="text-white">reboot</strong> {t('command will be sent to every barrier gate bound to this edge device.')}
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
          <PowerOff className="w-5 h-5 text-[#e3b341]" />
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
        <div className="p-3.5 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#e3b341] shrink-0 mt-0.5" />
          <div className="text-xs text-[#c9d1d9]">
            {t('The device will be marked')} <strong className="text-white">DECOMMISSIONED</strong> {t('and any barrier gates bound to it will be unbound. Heartbeats from this device will no longer mark it online. It can be reactivated later.')}
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
          <RefreshCw className="w-5 h-5 text-[#3fb950]" />
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
        <div className="text-xs text-[#c9d1d9]">
          {t('The device will return to')} <strong className="text-white">PROVISIONING</strong> {t('status and can come back online once it heartbeats.')}
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
          <Trash2 className="w-5 h-5 text-[#f85149]" />
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
        <div className="p-3.5 rounded-xl bg-[#f85149]/10 border border-[#f85149]/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#f85149] shrink-0 mt-0.5" />
          <div className="text-xs text-[#c9d1d9]">
            {t('This permanently removes the device record. Only')} <strong className="text-white">decommissioned</strong> {t('devices with no bound gates can be deleted.')}
          </div>
        </div>
      </div>
    </Modal>
  );
};
