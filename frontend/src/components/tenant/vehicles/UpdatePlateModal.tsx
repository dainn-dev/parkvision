import React, { useState } from 'react';
import { TenantVehicle } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Check, Tag, AlertCircle } from 'lucide-react';
import { Button, Input } from '../../ui';

interface UpdatePlateModalProps {
  vehicle: TenantVehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdatePlateModal: React.FC<UpdatePlateModalProps> = ({
  vehicle,
  isOpen,
  onClose
}) => {
  const { registerVehicleLicensePlate } = usePlatform();

  const [newPlateNumber, setNewPlateNumber] = useState('');
  const [province, setProvince] = useState('Ho Chi Minh City');
  const [country, setCountry] = useState('Vietnam');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !vehicle) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const formatted = newPlateNumber.toUpperCase().trim();
    if (!formatted) return;

    const res = registerVehicleLicensePlate(vehicle.id, {
      number: formatted,
      country,
      province
    });

    if (res.success) {
      setNewPlateNumber('');
      onClose();
    } else {
      setErrorMessage(res.message || 'Failed to update plate.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Replace License Plate</h3>
              <p className="text-xs text-[#8b949e]">Update active plate for {vehicle.name}</p>
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
          <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
            <span className="text-[#8b949e] text-[11px] block">Current Active Plate</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono font-bold text-white text-sm px-2.5 py-0.5 rounded bg-[#0d0e12] border border-[#30363d]">
                {vehicle.currentPlate.number}
              </span>
              <span className="text-[11px] text-[#8b949e]">
                (Will be archived into historical records)
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              New License Plate Number <span className="text-[#f85149]">*</span>
            </label>
            <Input
              placeholder="e.g. 51H-999.88 or 30E-12345"
              value={newPlateNumber}
              onChange={(e) => {
                setNewPlateNumber(e.target.value.toUpperCase());
                setErrorMessage(null);
              }}
              required
              className="bg-[#161b22] border-[#30363d] text-white font-mono text-base tracking-wider"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Province / City
              </label>
              <Input
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Country
              </label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-[#da3633]/15 border border-[#da3633]/30 text-[#f85149] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

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
              Update Plate
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
