import React, { useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser } from '../../../types/tenant';
import {
  X,
  Ban,
  CheckCircle2,
  StopCircle,
  AlertTriangle,
  Layers,
  Car,
  Info
} from 'lucide-react';
import { Button } from '../../ui';

interface MembershipActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
  actionType: 'SUSPEND' | 'ACTIVATE' | 'END';
}

export const MembershipActionDialog: React.FC<MembershipActionDialogProps> = ({
  isOpen,
  onClose,
  user,
  actionType
}) => {
  const { suspendTenantMembership, activateTenantMembership, endTenantMembership } = usePlatform();
  const [suspendReason, setSuspendReason] = useState(
    'Temporary pass suspension pending compliance / invoice review.'
  );
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen || !user || !user.membership) return null;

  const handleConfirm = () => {
    setFormError(null);
    if (actionType === 'SUSPEND') {
      if (!suspendReason.trim()) {
        setFormError('Please specify a reason for suspending this membership.');
        return;
      }
      suspendTenantMembership(user.id, suspendReason.trim());
    } else if (actionType === 'ACTIVATE') {
      activateTenantMembership(user.id);
    } else if (actionType === 'END') {
      endTenantMembership(user.id);
    }
    onClose();
  };

  const getTitle = () => {
    switch (actionType) {
      case 'SUSPEND':
        return 'Suspend Member Access';
      case 'ACTIVATE':
        return 'Reactivate Member Access';
      case 'END':
        return 'End Membership Profile';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                actionType === 'SUSPEND'
                  ? 'bg-[#d29922]/15 border border-[#d29922]/30 text-[#d29922]'
                  : actionType === 'ACTIVATE'
                  ? 'bg-[#238636]/15 border border-[#238636]/30 text-[#3fb950]'
                  : 'bg-[#f85149]/15 border border-[#f85149]/30 text-[#f85149]'
              }`}
            >
              {actionType === 'SUSPEND' && <Ban className="w-5 h-5" />}
              {actionType === 'ACTIVATE' && <CheckCircle2 className="w-5 h-5" />}
              {actionType === 'END' && <StopCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">{getTitle()}</h2>
              <p className="text-xs text-[#8b949e]">
                {actionType === 'SUSPEND' && 'Temporarily block automatic gate access'}
                {actionType === 'ACTIVATE' && 'Restore vehicle whitelist access privileges'}
                {actionType === 'END' && 'Permanently retire membership and release passes'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-[#f85149]/15 border border-[#f85149]/30 rounded-xl text-[#ff7b72] flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Member Profile Badge */}
          <div className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center font-bold text-xs">
                {user.membership.fullName.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-white text-xs">{user.membership.fullName}</div>
                <div className="text-[11px] font-mono text-[#8b949e]">
                  {user.membership.memberCode} · {user.membership.department || user.membership.type}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-[#8b949e] flex items-center gap-1 justify-end">
                <Car className="w-3 h-3 text-[#58a6ff]" />
                <span>{user.membership.vehicles.length} Vehicles</span>
              </div>
              <span
                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                  user.membership.status === 'ACTIVE'
                    ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                    : user.membership.status === 'SUSPENDED'
                    ? 'bg-[#d29922]/15 text-[#d29922] border border-[#d29922]/30'
                    : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                }`}
              >
                {user.membership.status}
              </span>
            </div>
          </div>

          {actionType === 'SUSPEND' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[#8b949e] font-semibold mb-1">
                  Reason for Suspension <span className="text-[#f85149]">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide detailed explanation for this suspension..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#d29922] focus:outline-hidden resize-none"
                />
              </div>

              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded-xl text-[11px] text-[#8b949e] flex items-start gap-2">
                <Info className="w-4 h-4 text-[#58a6ff] shrink-0 mt-0.5" />
                <span>
                  The user can still sign in to check their status, but their linked license plates will be rejected at all automated gates with a <strong className="text-white">&quot;MEMBERSHIP_SUSPENDED&quot;</strong> notice.
                </span>
              </div>
            </div>
          )}

          {actionType === 'ACTIVATE' && (
            <div className="space-y-3">
              <p className="text-[#c9d1d9] leading-relaxed">
                Restore full access for <strong className="text-white">{user.membership.fullName}</strong>?
              </p>
              <div className="p-3 bg-[#238636]/10 border border-[#238636]/30 rounded-xl text-[11px] text-[#3fb950] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  All {user.membership.vehicles.length} registered vehicle plates will be immediately re-synced with the edge ANPR gateway policies.
                </span>
              </div>
            </div>
          )}

          {actionType === 'END' && (
            <div className="space-y-3">
              <p className="text-[#c9d1d9] leading-relaxed">
                Are you sure you want to end membership for <strong className="text-white">{user.membership.fullName}</strong>?
              </p>
              <div className="p-3 bg-[#f85149]/10 border border-[#f85149]/30 rounded-xl text-[11px] text-[#ff7b72] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  This marks the membership as Ended and expires all linked vehicle gate passes. Historical logs will remain intact.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12]/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          {actionType === 'SUSPEND' && (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              className="text-xs bg-[#d29922] hover:bg-[#e3b341] text-black font-bold gap-1.5 shadow-sm"
            >
              <Ban className="w-3.5 h-3.5" />
              Confirm Suspension
            </Button>
          )}
          {actionType === 'ACTIVATE' && (
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white font-bold gap-1.5 shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Reactivate Membership
            </Button>
          )}
          {actionType === 'END' && (
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirm}
              className="text-xs bg-[#da3633] hover:bg-[#f85149] text-white font-bold gap-1.5 shadow-sm"
            >
              <StopCircle className="w-3.5 h-3.5" />
              End Membership
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
