import React, { useState, useEffect } from 'react';
import { TenantVehicle, VehicleType } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Check, Car, Edit2 } from 'lucide-react';
import { Button, Input } from '../../ui';

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
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Edit Vehicle Specifications</h3>
              <p className="text-xs text-[#8b949e]">Update vehicle properties for {vehicle.currentPlate.number}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Make / Manufacturer <span className="text-[#f85149]">*</span>
              </label>
              <Input
                placeholder="e.g. Toyota, Tesla"
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                required
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Model <span className="text-[#f85149]">*</span>
              </label>
              <Input
                placeholder="e.g. Camry, Model Y"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Vehicle Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as VehicleType })}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-[#58a6ff]"
              >
                <option value="CAR">Car / Sedan / SUV</option>
                <option value="MOTORCYCLE">Motorcycle / Scooter</option>
                <option value="VAN">Van / Minivan</option>
                <option value="TRUCK">Truck / Heavy Vehicle</option>
                <option value="BUS">Bus / Shuttle</option>
                <option value="OTHER">Other Category</option>
              </select>
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Year of Manufacture
              </label>
              <Input
                type="number"
                min="1990"
                max={new Date().getFullYear() + 1}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Exterior Color
              </label>
              <Input
                placeholder="e.g. Pearl White, Obsidian Black"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                VIN / Chassis Number
              </label>
              <Input
                placeholder="17-character VIN"
                value={formData.vin}
                onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                className="bg-[#161b22] border-[#30363d] text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Internal Notes / Description
            </label>
            <textarea
              rows={2}
              placeholder="Optional fleet remarks or vehicle notes..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-[#58a6ff]"
            />
          </div>

          <div className="pt-3 border-t border-[#30363d] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
