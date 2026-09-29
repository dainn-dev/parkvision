import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { Server } from 'lucide-react';
import { Button, Input, Modal, Select } from '../../ui';
import { TenantEdgeDevice } from '../../../types/tenant';
import { useTranslation } from 'react-i18next';

interface EditDeviceModalProps {
  device: TenantEdgeDevice | null;
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

export const EditDeviceModal: React.FC<EditDeviceModalProps> = ({ device, isOpen, onClose }) => {
  const { tenantSites, updateTenantDevice } = usePlatform();
  const { t } = useTranslation('tenant');

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (device && isOpen) {
      setFormData({
        name: device.name,
        siteId: device.siteId,
        deviceSerial: device.deviceSerial || '',
        hardwareModel: device.hardwareModel || '',
        mac: device.mac || '',
        ipAddress: device.ipAddress || '',
        mqttClientId: device.mqttClientId || '',
        firmwareVersion: device.firmwareVersion || ''
      });
      setError(null);
    }
  }, [device, isOpen]);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device || !formData.name.trim() || !formData.siteId) return;

    setIsLoading(true);
    setError(null);
    const result = await updateTenantDevice(device.id, {
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
      onClose();
    } else {
      setError(result.message || t('Failed to update device'));
    }
  };

  return (
    <Modal
      isOpen={isOpen && !!device}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Server className="w-5 h-5 text-[#58a6ff]" />
          {t('Edit Edge Device')}
        </span>
      }
      subtitle={device ? `${device.name} · ${device.deviceKey}` : undefined}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} type="button">{t('Cancel')}</Button>
          <Button variant="primary" type="submit" form="edit-device-form" isLoading={isLoading}>
            {t('Save Changes')}
          </Button>
        </div>
      }
    >
      <form id="edit-device-form" onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-xs text-[#f85149]">
            {error}
          </div>
        )}

        <Input
          label={t('Device Name')}
          value={formData.name}
          onChange={set('name')}
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
          <Input label={t('Serial Number')} value={formData.deviceSerial} onChange={set('deviceSerial')} />
          <Input label={t('Hardware Model')} value={formData.hardwareModel} onChange={set('hardwareModel')} />
          <Input label={t('MAC Address')} value={formData.mac} onChange={set('mac')} />
          <Input label={t('IP Address')} value={formData.ipAddress} onChange={set('ipAddress')} />
          <Input label={t('MQTT Client ID')} value={formData.mqttClientId} onChange={set('mqttClientId')} />
          <Input label={t('Firmware Version')} value={formData.firmwareVersion} onChange={set('firmwareVersion')} />
        </div>
      </form>
    </Modal>
  );
};
