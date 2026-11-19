import React, { useState, useEffect } from 'react';
import { TenantVehicle, VehicleType } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Check, Car, Edit2 } from 'lucide-react';
import { Button, Input } from '../../ui';
import { useTranslation } from 'react-i18next';

interface EditVehicleModalProps {
  vehicle: TenantVehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditVehicleModal: React.FC<EditVehicleModalProps> = ({
  vehicle,
  isOpen,
  onClose
}) => {
  const { updateTenantVehicle } = usePlatform();
  const { t } = useTranslation('tenant');

  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    vin: '',
    type: 'CAR' as VehicleType,
    description: ''
  });

  useEffect(() => {
    if (vehicle) {
      setFormData({
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || new Date().getFullYear(),
        color: vehicle.color || '',
        vin: vehicle.vin || '',
        type: vehicle.type || 'CAR',
        description: vehicle.description || ''
      });
    }
  }, [vehicle]);

  if (!isOpen || !vehicle) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.make.trim() || !formData.model.trim()) return;

    updateTenantVehicle(vehicle.id, {
      make: formData.make.trim(),
      model: formData.model.trim(),
      name: `${formData.make.trim()} ${formData.model.trim()}`,
      year: Number(formData.year) || undefined,
      color: formData.color.trim() || undefined,
      vin: formData.vin.trim().toUpperCase() || undefined,
      type: formData.type,
      description: formData.description.trim() || undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-md bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">{t('Edit Vehicle Specifications')}</h3>
              <p className="text-xs text-muted-foreground">{t('Update vehicle properties for')} {vehicle.currentPlate.number}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Make / Manufacturer')} <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder={t('e.g. Toyota, Tesla')}
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                required
                className="bg-card border-border text-foreground"
              />
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Model')} <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder={t('e.g. Camry, Model Y')}
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Vehicle Type')}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as VehicleType })}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-hidden focus:border-primary"
              >
                <option value="CAR">{t('Car / Sedan / SUV')}</option>
                <option value="MOTORCYCLE">{t('Motorcycle / Scooter')}</option>
                <option value="VAN">{t('Van / Minivan')}</option>
                <option value="TRUCK">{t('Truck / Heavy Vehicle')}</option>
                <option value="BUS">{t('Bus / Shuttle')}</option>
                <option value="OTHER">{t('Other Category')}</option>
              </select>
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Year of Manufacture')}
              </label>
              <Input
                type="number"
                min="1990"
                max={new Date().getFullYear() + 1}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('Exterior Color')}
              </label>
              <Input
                placeholder={t('e.g. Pearl White, Obsidian Black')}
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="bg-card border-border text-foreground"
              />
            </div>

            <div>
              <label className="block text-foreground font-medium mb-1.5">
                {t('VIN / Chassis Number')}
              </label>
              <Input
                placeholder={t('17-character VIN')}
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                className="bg-card border-border text-foreground "
              />
            </div>
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Internal Notes / Description')}
            </label>
            <textarea
              rows={2}
              placeholder={t('Optional fleet remarks or vehicle notes...')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-hidden focus:border-primary"
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
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
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t('Save Changes')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
