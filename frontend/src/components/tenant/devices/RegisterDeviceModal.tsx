import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { Server } from 'lucide-react';
import { Button, Input, Modal, Select } from '../../ui';
import { useTranslation } from 'react-i18next';

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EMPTY_FORM = {
  name: '',
  siteId: '',
  deviceSerial: '',
  hardwareModel: '',
  mac: '',
  ipAddress: '',
  mqttClientId: '',
  firmwareVersion: ''
};

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({ isOpen, onClose }) => {
  const { tenantSites, createTenantDevice } = usePlatform();
  const { t } = useTranslation('tenant');

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.siteId) return;

    setIsLoading(true);
    setError(null);
    const result = await createTenantDevice({
      siteId: formData.siteId,
      name: formData.name.trim(),
      deviceSerial: formData.deviceSerial.trim() || undefined,
      hardwareModel: formData.hardwareModel.trim() || undefined,
      mac: formData.mac.trim() || undefined,
      ipAddress: formData.ipAddress.trim() || undefined,
      mqttClientId: formData.mqttClientId.trim() || undefined,
      firmwareVersion: formData.firmwareVersion.trim() || undefined
    });
    setIsLoading(false);

    if (result.success) {
      setFormData(EMPTY_FORM);
      onClose();
    } else {
      setError(result.message || t('Failed to register device'));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Server className="w-5 h-5 text-[#58a6ff]" />
          {t('Register Edge Device')}
        </span>
      }
      subtitle={t('Provision a new edge gateway on a site')}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button variant="primary" type="submit" form="register-device-form" isLoading={isLoading}>
            {t('Register Device')}
          </Button>
        </div>
      }
    >
      <form id="register-device-form" onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-xs text-[#f85149]">
            {error}
          </div>
        )}

        <Input
          label={t('Device Name')}
          value={formData.name}
          onChange={set('name')}
          placeholder={t('e.g. Barrier Gateway 01')}
          required
        />

        <Select
          label={t('Site')}
          value={formData.siteId}
          onChange={set('siteId')}
          required
          options={[
            { value: '', label: t('Select a site…') },
            ...tenantSites.map((s) => ({ value: s.id, label: s.name }))
          ]}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input label={t('Serial Number')} value={formData.deviceSerial} onChange={set('deviceSerial')} placeholder="SN-0000" />
          <Input label={t('Hardware Model')} value={formData.hardwareModel} onChange={set('hardwareModel')} placeholder={t('e.g. PV-Edge-2U')} />
          <Input label={t('MAC Address')} value={formData.mac} onChange={set('mac')} placeholder="00:1B:44:11:3A:B7" />
          <Input label={t('IP Address')} value={formData.ipAddress} onChange={set('ipAddress')} placeholder="10.0.0.12" />
          <Input label={t('MQTT Client ID')} value={formData.mqttClientId} onChange={set('mqttClientId')} placeholder="edge-gw-01" />
          <Input label={t('Firmware Version')} value={formData.firmwareVersion} onChange={set('firmwareVersion')} placeholder="1.4.2" />
        </div>
      </form>
    </Modal>
  );
};
