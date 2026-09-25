import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { Car, X, Check, ShieldCheck, UserCheck, AlertCircle } from 'lucide-react';
import { Button, Input } from '../ui';
import { VehicleType } from '../../types/tenant';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ isOpen, onClose }) => {
  const { tenantUsers, createTenantVehicle } = usePlatform();

  const [formData, setFormData] = useState({
    plate: '',
    province: 'Ho Chi Minh City',
    country: 'Vietnam',
    make: '',
    model: '',
    type: 'CAR' as VehicleType,
    year: new Date().getFullYear(),
    color: 'White',
    vin: '',
    memberId: '' as string,
    description: ''
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const plateNumber = formData.plate.toUpperCase().trim();
    if (!plateNumber || !formData.make.trim() || !formData.model.trim()) {
      setErrorMessage('Please provide license plate, make, and model.');
      return;
    }

    setIsLoading(true);

    const result = await createTenantVehicle({
      type: formData.type,
      make: formData.make.trim(),
      model: formData.model.trim(),
      year: Number(formData.year) || undefined,
      color: formData.color.trim() || undefined,
      vin: formData.vin.trim().toUpperCase() || undefined,
      description: formData.description.trim() || undefined,
      memberId: formData.memberId || null,
      licensePlate: {
        number: plateNumber,
        country: formData.country,
        province: formData.province
      }
    });

    setIsLoading(false);

    if (result.success) {
      onClose();
      // Reset form
      setFormData({
        plate: '',
        province: 'Ho Chi Minh City',
        country: 'Vietnam',
        make: '',
        model: '',
        type: 'CAR',
        year: new Date().getFullYear(),
        color: 'White',
        vin: '',
        memberId: '',
        description: ''
      });
    } else {
      setErrorMessage(result.message || 'Failed to register vehicle.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Register & Enroll Vehicle</h3>
              <p className="text-xs text-[#8b949e]">Add new vehicle to whitelist with ANPR automatic barrier access</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* License Plate Section */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                License Plate Number <span className="text-[#f85149]">*</span>
              </label>
              <Input
                placeholder="e.g. 51G-888.99, 29A-12345, 59P1-99882"
                value={formData.plate}
                onChange={(e) => {
                  setFormData({ ...formData, plate: e.target.value.toUpperCase() });
                  setErrorMessage(null);
                }}
                required
                className="bg-[#0d0e12] border-[#30363d] text-white font-mono text-base tracking-wider"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#8b949e] text-[11px] mb-1">
                  Province / City
                </label>
                <Input
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  className="bg-[#0d0e12] border-[#30363d] text-white text-xs h-8"
                />
              </div>
              <div>
                <label className="block text-[#8b949e] text-[11px] mb-1">
                  Country
                </label>
                <Input
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="bg-[#0d0e12] border-[#30363d] text-white text-xs h-8"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Technical Specifications */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Make / Manufacturer <span className="text-[#f85149]">*</span>
              </label>
              <Input
                placeholder="e.g. Toyota, VinFast, Mazda"
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
                placeholder="e.g. Camry, VF8, CX-5"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Vehicle Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as VehicleType })}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-2 text-white focus:outline-hidden"
              >
                <option value="CAR">Car / SUV</option>
                <option value="MOTORCYCLE">Motorcycle</option>
                <option value="VAN">Van / Delivery</option>
                <option value="TRUCK">Truck</option>
                <option value="BUS">Bus</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Model Year
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

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Exterior Color
              </label>
              <Input
                placeholder="e.g. Black, White"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              VIN / Chassis Number (Optional)
            </label>
            <Input
              placeholder="e.g. 1HGCR2F83HA001923"
              value={formData.vin}
              onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
              className="bg-[#161b22] border-[#30363d] text-white font-mono"
            />
          </div>

          {/* Member Assignment Selector */}
          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Assign to Member Profile (Optional)
            </label>
            <select
              value={formData.memberId}
              onChange={(e) => setFormData({ ...formData, memberId: e.target.value })}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-hidden"
            >
              <option value="">-- Unassigned Organization / Pool Vehicle --</option>
              {tenantUsers.map((u) => (
                <option key={u.id} value={u.membership?.id || u.id}>
                  {u.name} ({u.membership?.memberCode || u.email}) {u.membership?.type ? `· ${u.membership.type}` : ''}
                </option>
              ))}
            </select>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-[#da3633]/15 border border-[#da3633]/30 text-[#f85149] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[#3fb950] shrink-0" />
            <div className="text-[11px] text-[#8b949e]">
              Enrolled plate will instantly sync to all site edge cameras and open gates automatically upon 90%+ OCR match.
            </div>
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
              isLoading={isLoading}
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Enroll Vehicle
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
