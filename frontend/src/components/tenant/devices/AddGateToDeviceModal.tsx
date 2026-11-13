import React, { useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Select } from '../../ui';
import { TenantSite } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';

interface AddGateToDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  site: Pick<TenantSite, 'id' | 'name'>;
  device: { id: string; name: string };
}

export const AddGateToDeviceModal: React.FC<AddGateToDeviceModalProps> = ({ isOpen, onClose, site, device }) => {
  const { t } = useTranslation('tenant');
  const { createTenantGate } = usePlatform();
  const [name, setName] = useState('');
  const [direction, setDirection] = useState('exit');
  const [isLoading, setIsLoading] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setIsLoading(true);
    createTenantGate(site.id, {
      name: name.trim(), edgeDeviceId: device.id, laneId: null, gateType: 'barrier', modelType: direction,
    });
    setIsLoading(false);
    setName('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={<span className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" />{t('Add gate to Edge Client')}</span>} subtitle={`${device.name} · ${site.name}`}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <Input label={t('Gate name')} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('e.g. Exit gate')} required />
        <Select label={t('Gate direction')} value={direction} onChange={(event) => setDirection(event.target.value)} options={[{ value: 'entry', label: t('Entry') }, { value: 'exit', label: t('Exit') }]} />
        <div className="flex justify-end gap-3"><Button variant="secondary" type="button" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" type="submit" isLoading={isLoading}>{t('Add gate')}</Button></div>
      </form>
    </Modal>
  );
};
