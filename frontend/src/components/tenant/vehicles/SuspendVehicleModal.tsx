import React, { useState } from 'react';
import { TenantVehicle } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '../../ui';

interface SuspendVehicleModalProps {
  vehicle: TenantVehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SuspendVehicleModal: React.FC<SuspendVehicleModalProps> = ({
  vehicle,
  isOpen,
  onClose
}) => {
  const { suspendTenantVehicle } = usePlatform();

  const [reason, setReason] = useState('Temporary parking policy violation / permit review');

  if (!isOpen || !vehicle) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    suspendTenantVehicle(vehicle.id, reason.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 text-[#e3b341] flex items-center justify-center">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Suspend Vehicle Access</h3>
              <p className="text-xs text-[#8b949e]">Temporarily block barrier access for this plate</p>
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
          <div className="p-3.5 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e3b341] shrink-0 mt-0.5" />
            <div className="text-xs text-[#c9d1d9]">
              Suspended vehicles will trigger an instant <strong className="text-white">DENIED</strong> gate event if detected by ANPR edge cameras at any barrier gate.
            </div>
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Reason for Suspension <span className="text-[#f85149]">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-hidden mb-2"
            >
              <option value="Temporary parking policy violation / permit review">Temporary parking policy violation</option>
              <option value="Unpaid monthly parking subscription">Unpaid monthly parking subscription</option>
              <option value="Security inquiry or pending credential audit">Security inquiry or pending credential audit</option>
              <option value="Driver membership status suspended or ended">Driver membership status suspended or ended</option>
              <option value="Other administrative suspension">Other administrative suspension</option>
            </select>

            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-hidden"
              placeholder="Enter custom suspension note..."
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
              className="text-xs bg-[#d29922] hover:bg-[#bb8419] text-black font-bold gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" />
              Confirm Suspension
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
