import React, { useState } from 'react';
import { TenantVehicle } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Check, UserCheck, Search, User, ShieldAlert } from 'lucide-react';
import { Button, Input } from '../../ui';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('tenant');

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
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-lg bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">{t('Assign Vehicle Member')}</h3>
              <p className="text-xs text-muted-foreground">{t('Link {{name}} ({{plate}}) to an authorized member', { name: vehicle.name, plate: vehicle.currentPlate.number })}</p>
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
          {/* Unassigned Pool Option */}
          <div
            onClick={() => setSelectedMemberId(null)}
            className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-center gap-3 ${
              selectedMemberId === null
                ? 'bg-primary/10 border-primary text-foreground'
                : 'bg-card border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <span className="font-medium text-foreground block">{t('Unassigned Organization Fleet')}</span>
              <span className="text-[11px] text-muted-foreground">{t('Not associated with any specific member profile')}</span>
            </div>
            {selectedMemberId === null && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
            <Input
              placeholder={t('Search members by name, email, or member code...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card border-border text-foreground text-xs"
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
                  className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-center gap-3 ${
                    isSelected
                      ? 'bg-primary/10 border-primary'
                      : 'bg-card border-border hover:border-primary/40'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-primary font-medium text-xs">
                    {u.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{u.name}</span>
                      {mem?.memberCode && (
                        <span className="text-[11px] text-primary px-1.5 py-0.2 rounded bg-primary/10">
                          {mem.memberCode}
                        </span>
                      )}
                      {isSuspended && (
                        <span className="text-[11px] font-medium px-1.5 py-0.2 rounded bg-destructive/15 text-destructive">
                          {t('SUSPENDED')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {u.email} {mem?.department ? `· ${mem.department}` : ''}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
              );
            })}
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
              {t('Confirm Assignment')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
