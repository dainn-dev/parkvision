import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { Building2, X, MapPin, Camera, DoorOpen, HardDrive, Clock, Check } from 'lucide-react';
import { Button, Input } from '../ui';
import { useTranslation } from 'react-i18next';

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateSiteModal: React.FC<CreateSiteModalProps> = ({ isOpen, onClose }) => {
  const { addTenantSite } = usePlatform();
  const { t } = useTranslation('tenant');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    operatingHours: '24/7 Operations',
    capacity: 500,
    lanesCount: 4,
    cameraCount: 8,
    gateCount: 4,
    edgeDeviceCount: 2,
    managerName: '',
    managerPhone: '',
    description: ''
  });

  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsLoading(true);
    setTimeout(() => {
      addTenantSite({
        name: formData.name,
        code: formData.code || formData.name.substring(0, 4).toUpperCase() + '-SITE',
        address: formData.address,
        operatingHours: formData.operatingHours,
        capacity: Number(formData.capacity) || 500,
        lanesCount: Number(formData.lanesCount) || 2,
        cameraCount: Number(formData.cameraCount) || 4,
        onlineCameraCount: Number(formData.cameraCount) || 4,
        gateCount: Number(formData.gateCount) || 2,
        onlineGateCount: Number(formData.gateCount) || 2,
        edgeDeviceCount: Number(formData.edgeDeviceCount) || 1,
        onlineEdgeDeviceCount: Number(formData.edgeDeviceCount) || 1,
        managerName: formData.managerName,
        managerPhone: formData.managerPhone,
        description: formData.description,
        status: 'HEALTHY'
      });
      setIsLoading(false);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 " onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">{t('Add New Site Facility')}</h3>
              <p className="text-xs text-muted-foreground">{t('Deploy ANPR access gates and edge controllers for a new location')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Site Name')} <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder={t('e.g. West Campus Innovation Hub')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="bg-card border-border text-foreground"
              />
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Site Code Identifier')}
              </label>
              <Input
                placeholder={t('e.g. SITE-WEST-01')}
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="bg-card border-border text-foreground "
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Physical Street Address')} <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder={t('e.g. 88 Vo Van Kiet Blvd, District 5, Ho Chi Minh City')}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
              className="bg-card border-border text-foreground"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Operating Schedule')}
              </label>
              <Input
                placeholder={t('e.g. 24/7 Operations')}
                value={formData.operatingHours}
                onChange={(e) => setFormData({ ...formData, operatingHours: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Vehicle Capacity')}
              </label>
              <Input
                type="number"
                placeholder="500"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                className="bg-card border-border text-foreground "
              />
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Number of Lanes')}
              </label>
              <Input
                type="number"
                placeholder="4"
                value={formData.lanesCount}
                onChange={(e) => setFormData({ ...formData, lanesCount: Number(e.target.value) })}
                className="bg-card border-border text-foreground "
              />
            </div>
          </div>

          {/* Hardware Initial Provisioning */}
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <h4 className="text-foreground font-medium text-xs flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-primary" />
              {t('Provisioned Hardware Gateways')}
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-muted-foreground text-[11px] mb-1">{t('ANPR Cameras')}</label>
                <Input
                  type="number"
                  value={formData.cameraCount}
                  onChange={(e) => setFormData({ ...formData, cameraCount: Number(e.target.value) })}
                  className="bg-background border-border text-foreground "
                />
              </div>

              <div>
                <label className="block text-muted-foreground text-[11px] mb-1">{t('Barrier Gates')}</label>
                <Input
                  type="number"
                  value={formData.gateCount}
                  onChange={(e) => setFormData({ ...formData, gateCount: Number(e.target.value) })}
                  className="bg-background border-border text-foreground "
                />
              </div>

              <div>
                <label className="block text-muted-foreground text-[11px] mb-1">{t('Edge Compute Nodes')}</label>
                <Input
                  type="number"
                  value={formData.edgeDeviceCount}
                  onChange={(e) => setFormData({ ...formData, edgeDeviceCount: Number(e.target.value) })}
                  className="bg-background border-border text-foreground "
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Site Manager Name')}
              </label>
              <Input
                placeholder={t('e.g. Tran Van B')}
                value={formData.managerName}
                onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Manager Contact Phone')}
              </label>
              <Input
                placeholder="+84 90 123 4567"
                value={formData.managerPhone}
                onChange={(e) => setFormData({ ...formData, managerPhone: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs"
            >
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t('Provision & Create Site')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
