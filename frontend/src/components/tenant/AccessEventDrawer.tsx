import React from 'react';
import { AccessEvent } from '../../types/tenant';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  MapPin,
  Camera,
  Car,
  User,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Ban,
  Radio,
  FileText,
  Activity,
  Maximize2
} from 'lucide-react';
import { Button, Badge } from '../ui';

interface AccessEventDrawerProps {
  event: AccessEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onOverride?: (event: AccessEvent) => void;
  onBlock?: (event: AccessEvent) => void;
}

export const AccessEventDrawer: React.FC<AccessEventDrawerProps> = ({
  event,
  isOpen,
  onClose,
  onOverride,
  onBlock
}) => {
  if (!isOpen || !event) return null;

  const getDecisionBadge = (decision: AccessEvent['decision']) => {
    switch (decision) {
      case 'ALLOWED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3fb950]" />
            ALLOWED
          </span>
        );
      case 'DENIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30">
            <XCircle className="w-3.5 h-3.5 text-[#f85149]" />
            DENIED
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#da3633]/25 text-[#ff7b72] border border-[#da3633]/50">
            <Ban className="w-3.5 h-3.5 text-[#ff7b72]" />
            BLOCKED LIST
          </span>
        );
      case 'UNKNOWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30">
            <AlertTriangle className="w-3.5 h-3.5 text-[#e3b341]" />
            UNKNOWN PLATE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#8b949e]/15 text-[#8b949e] border border-[#30363d]">
            {decision}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl bg-[#0d0e12] border-l border-[#30363d] shadow-2xl h-full flex flex-col z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]/70 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-center text-[#58a6ff]">
              <FileText className="w-4 h-4 text-[#58a6ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Access Verification Inspection</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] border border-[#30363d] text-[#8b949e]">
                  {event.id}
                </span>
              </div>
              <p className="text-xs text-[#8b949e] flex items-center gap-1.5 mt-0.5">
                <Clock className="w-3 h-3 text-[#8b949e]" /> {event.timestamp} ({event.timeFormatted})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1 text-xs">
          {/* Top Banner: Plate & Decision */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider mb-1">
                Detected License Plate
              </div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xl font-extrabold text-white px-3 py-1 rounded bg-[#0d0e12] border-2 border-[#58a6ff]/40 shadow-inner tracking-wider">
                  {event.plate}
                </span>
                <button
                  onClick={() => navigator.clipboard?.writeText(event.plate)}
                  className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                  title="Copy plate number"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-[#8b949e] font-semibold uppercase tracking-wider mb-1">
                Gate Decision
              </div>
              {getDecisionBadge(event.decision)}
            </div>
          </div>

          {/* AI Vision & OCR Sensor Card */}
          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#30363d]/60 pb-2">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Camera className="w-4 h-4 text-[#58a6ff]" />
                <span>ANPR Camera & Edge Vision Capture</span>
              </div>
              <span className="text-[10px] text-[#3fb950] font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-ping" />
                AI Inference Verified
              </span>
            </div>

            {/* Simulated Plate Crop Viewport */}
            <div className="relative rounded-lg bg-[#0d0e12] border border-[#30363d] h-32 flex flex-col items-center justify-center p-4 overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              
              {/* Plate frame representation */}
              <div className="z-10 bg-amber-100 text-slate-900 border-2 border-slate-900 rounded-md px-6 py-2 shadow-lg font-mono text-2xl font-black tracking-widest text-center">
                {event.plate}
                <div className="text-[9px] font-sans font-bold text-slate-600 tracking-normal uppercase border-t border-slate-400 mt-0.5 pt-0.5">
                  VIETNAM · AUTOMATED ANPR
                </div>
              </div>

              <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-[#8b949e] z-10 font-mono">
                <span>Cam: {event.siteName.split(' ')[0]}-ANPR-01</span>
                <span>FPS: 30 · Res: 4K UHD</span>
              </div>
            </div>

            {/* OCR Accuracy Metric Gauges */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="text-[#8b949e]">OCR Confidence</span>
                  <span className="text-[#3fb950] font-mono font-bold">
                    {(event.plateConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#21262d] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#3fb950]"
                    style={{ width: `${event.plateConfidence * 100}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                <div className="flex items-center justify-between mb-1 text-[11px]">
                  <span className="text-[#8b949e]">Detection Confidence</span>
                  <span className="text-[#58a6ff] font-mono font-bold">
                    {(event.detectionConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[#21262d] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#58a6ff]"
                    style={{ width: `${event.detectionConfidence * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Location & Lane Topology */}
          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d]/60 pb-2">
              <MapPin className="w-4 h-4 text-[#d29922]" />
              <span>Location & Gate Topology</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Site Facility</span>
                <p className="text-white font-medium mt-0.5">{event.siteName}</p>
              </div>

              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Gate Identifier</span>
                <p className="text-white font-medium mt-0.5">{event.gateName}</p>
              </div>

              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Lane & Direction</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-white font-medium">{event.laneName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                    event.direction === 'IN' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#1f6feb]/20 text-[#58a6ff]'
                  }`}>
                    {event.direction}BOUND
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Verification Engine</span>
                <p className="text-[#8b949e] font-mono text-[11px] mt-0.5">{event.verifiedBy || 'Edge AI v4.2'}</p>
              </div>
            </div>
          </div>

          {/* Vehicle & Owner Profile */}
          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-4 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d]/60 pb-2">
              <Car className="w-4 h-4 text-[#a371f7]" />
              <span>Vehicle Specifications & Registry</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Make & Model</span>
                <p className="text-white font-medium mt-0.5">{event.vehicleModel || 'Standard Passenger Vehicle'}</p>
              </div>

              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Body Type & Color</span>
                <p className="text-white font-medium mt-0.5">{event.vehicleType || 'Sedan'} · {event.vehicleColor || 'Standard'}</p>
              </div>

              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Owner / Driver</span>
                <p className="text-white font-medium mt-0.5">{event.ownerName || 'Unregistered Driver'}</p>
              </div>

              <div>
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Affiliation Category</span>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#21262d] text-[#58a6ff] border border-[#30363d]">
                  {event.ownerType || 'VISITOR'}
                </span>
              </div>
            </div>

            {event.ownerDepartment && (
              <div className="pt-1">
                <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Department</span>
                <p className="text-[#c9d1d9] mt-0.5">{event.ownerDepartment}</p>
              </div>
            )}
          </div>

          {/* Applied Access Rule & Audit Note */}
          <div className="rounded-xl bg-[#161b22] border border-[#30363d] p-4 space-y-2">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d]/60 pb-2">
              <ShieldCheck className="w-4 h-4 text-[#3fb950]" />
              <span>Policy Evaluation & Rule Triggered</span>
            </div>

            <div>
              <span className="text-[10px] text-[#8b949e] uppercase font-semibold">Enforced Access Rule</span>
              <p className="text-[#58a6ff] font-medium font-mono text-[11px] mt-0.5">
                {event.accessRule || 'Default Standard Multi-Site Access Policy'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#0d0e12] border border-[#30363d] text-[#8b949e] text-[11px]">
              <span className="text-white font-semibold">Decision Reason: </span>
              {event.reason || 'Verification logic evaluated without anomalies.'}
            </div>
          </div>
        </div>

        {/* Footer Quick Actions */}
        <div className="p-4 border-t border-[#30363d] bg-[#161b22]/90 flex items-center justify-between gap-3 sticky bottom-0 z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Close Sheet
          </Button>

          <div className="flex items-center gap-2">
            {event.decision !== 'ALLOWED' && onOverride && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onOverride(event)}
                className="bg-[#238636] hover:bg-[#2ea043] text-white text-xs gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Override & Open Gate
              </Button>
            )}

            {event.decision !== 'BLOCKED' && onBlock && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBlock(event)}
                className="text-[#f85149] hover:bg-[#da3633]/20 border-[#da3633]/40 text-xs gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                Add to Blocklist
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
