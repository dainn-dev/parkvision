import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, X, ShieldAlert, Power } from 'lucide-react';
import { Button } from '../ui';
import { TenantLocation } from '../../types/tenant';

interface DeactivateLocationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  location: TenantLocation;
  onConfirm: (newStatus: 'ACTIVE' | 'INACTIVE') => void;
}

export const DeactivateLocationDialog: React.FC<DeactivateLocationDialogProps> = ({
  isOpen,
  onClose,
  location,
  onConfirm
}) => {
  const [confirmInput, setConfirmInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const isCurrentActive = location.status === 'ACTIVE';
  const targetStatus = isCurrentActive ? 'INACTIVE' : 'ACTIVE';
  const requiredConfirmationText = 'DEACTIVATE';

  const handleAction = () => {
    if (isCurrentActive && confirmInput !== requiredConfirmationText) return;

    setIsProcessing(true);
    setTimeout(() => {
      onConfirm(targetStatus);
      setIsProcessing(false);
      setConfirmInput('');
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Dialog Box */}
      <div className="relative w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] bg-[#0d0e12] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCurrentActive
                  ? 'bg-[#da3633]/15 border border-[#da3633]/30 text-[#f85149]'
                  : 'bg-[#238636]/15 border border-[#238636]/30 text-[#3fb950]'
              }`}
            >
              {isCurrentActive ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <CheckCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isCurrentActive ? 'Deactivate Location' : 'Activate Location'}
              </h3>
              <p className="text-xs text-[#8b949e]">
                {location.name} ({location.code})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {isCurrentActive ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] space-y-1.5">
                <div className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Operational Impact Warning</span>
                </div>
                <p className="text-[11px] text-[#ff7b72] leading-relaxed">
                  Deactivating this location will suspend live ANPR automated gate opening and OCR
                  processing across all 4 lanes.
                </p>
              </div>

              <div className="space-y-2 text-[#c9d1d9]">
                <p className="font-medium">What happens when deactivated:</p>
                <ul className="list-disc list-inside space-y-1 text-[#8b949e] text-[11px]">
                  <li>Automated gate relay triggers will pause</li>
                  <li>Historical event logs & vehicle registries remain intact</li>
                  <li>Hardware telemetry remains visible for diagnostic purposes</li>
                  <li>You can reactivate this location at any time</li>
                </ul>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[11px] font-medium text-[#c9d1d9]">
                  Type <span className="text-[#f85149] font-mono font-bold">DEACTIVATE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="DEACTIVATE"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#f85149] rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-hidden"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-[#c9d1d9]">
              <p className="leading-relaxed">
                Activating this location will re-enable ANPR automated barrier gate controls and live
                access validation for registered vehicles.
              </p>
              <div className="p-3 rounded-xl bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] text-[11px]">
                ✓ All edge cameras and relays will immediately resume real-time operational polling.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12] flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs border-[#30363d] text-[#8b949e] hover:text-white"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={isCurrentActive && confirmInput !== requiredConfirmationText}
            isLoading={isProcessing}
            onClick={handleAction}
            className={`text-xs gap-1.5 font-semibold ${
              isCurrentActive
                ? 'bg-[#da3633] hover:bg-[#f85149] text-white disabled:opacity-50'
                : 'bg-[#238636] hover:bg-[#2ea043] text-white'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            {isCurrentActive ? 'Confirm Deactivation' : 'Activate Location'}
          </Button>
        </div>
      </div>
    </div>
  );
};
