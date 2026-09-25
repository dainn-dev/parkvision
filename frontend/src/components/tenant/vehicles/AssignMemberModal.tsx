import React, { useState } from 'react';
import { TenantVehicle } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Check, UserCheck, Search, User, ShieldAlert } from 'lucide-react';
import { Button, Input } from '../../ui';

interface AssignMemberModalProps {
  vehicle: TenantVehicle | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AssignMemberModal: React.FC<AssignMemberModalProps> = ({
  vehicle,
  isOpen,
  onClose
}) => {
  const { tenantUsers, assignVehicleMember } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    vehicle?.memberId || null
  );

  if (!isOpen || !vehicle) return null;

  const eligibleUsers = tenantUsers.filter((u) => {
    const term = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.membership?.memberCode && u.membership.memberCode.toLowerCase().includes(term))
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignVehicleMember(vehicle.id, selectedMemberId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Assign Vehicle Member</h3>
              <p className="text-xs text-[#8b949e]">Link {vehicle.name} ({vehicle.currentPlate.number}) to an authorized member</p>
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
          {/* Unassigned Pool Option */}
          <div
            onClick={() => setSelectedMemberId(null)}
            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
              selectedMemberId === null
                ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white'
                : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#58a6ff]/50'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center text-[#8b949e]">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-white block">Unassigned Organization Fleet</span>
              <span className="text-[11px] text-[#8b949e]">Not associated with any specific member profile</span>
            </div>
            {selectedMemberId === null && (
              <Check className="w-4 h-4 text-[#58a6ff]" />
            )}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search members by name, email, or member code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[#161b22] border-[#30363d] text-white text-xs"
            />
          </div>

          {/* Member List */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {eligibleUsers.map((u) => {
              const mem = u.membership;
              const memId = mem?.id || u.id;
              const isSelected = selectedMemberId === memId;
              const isSuspended = mem?.status === 'SUSPENDED' || u.status === 'SUSPENDED';

              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedMemberId(memId)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-[#58a6ff]/10 border-[#58a6ff]'
                      : 'bg-[#161b22] border-[#30363d] hover:border-[#58a6ff]/40'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#21262d] flex items-center justify-center text-[#58a6ff] font-bold text-xs">
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white truncate">{u.name}</span>
                      {mem?.memberCode && (
                        <span className="text-[10px] font-mono text-[#58a6ff] px-1.5 py-0.2 rounded bg-[#58a6ff]/10">
                          {mem.memberCode}
                        </span>
                      )}
                      {isSuspended && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#da3633]/15 text-[#f85149]">
                          SUSPENDED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8b949e] truncate mt-0.5">
                      {u.email} {mem?.department ? `· ${mem.department}` : ''}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#58a6ff] shrink-0" />}
                </div>
              );
            })}
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
              Confirm Assignment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
