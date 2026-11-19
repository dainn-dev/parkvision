import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { UserPlus, X, Check, Mail, Shield, Building2 } from 'lucide-react';
import { Button, Input } from '../ui';
import { useTranslation } from 'react-i18next';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ isOpen, onClose }) => {
  const { tenantSites, inviteTenantMember } = usePlatform();
  const { t } = useTranslation('tenant');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'OPERATOR',
    siteAccess: [tenantSites[0]?.id || '']
  });

  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.name.trim()) return;

    setIsLoading(true);
    setTimeout(() => {
      inviteTenantMember(formData);
      setIsLoading(false);
      onClose();
    }, 400);
  };

  const handleToggleSite = (siteId: string) => {
    setFormData((prev) => ({
      ...prev,
      siteAccess: prev.siteAccess.includes(siteId)
        ? prev.siteAccess.filter((s) => s !== siteId)
        : [...prev.siteAccess, siteId]
    }));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 " onClick={onClose} />

      <div className="relative w-full max-w-lg bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">{t('Invite Tenant Team Member')}</h3>
              <p className="text-xs text-muted-foreground">{t('Assign access control operational roles and site permissions')}</p>
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
          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Full Name')} <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Tran Quoc Toan"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="bg-card border-border text-foreground"
            />
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Email Address')} <span className="text-destructive">*</span>
            </label>
            <Input
              type="email"
              placeholder="toan.tran@tenant-corp.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="bg-card border-border text-foreground"
            />
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Tenant Portal Role')}
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-hidden focus:border-primary"
            >
              <option value="TENANT_ADMIN">{t('Tenant Admin (Full Control)')}</option>
              <option value="OPERATOR">{t('Gate Operator (Live Monitor & Overrides)')}</option>
              <option value="SECURITY_GUARD">{t('Security Guard (Gate Viewport Only)')}</option>
              <option value="AUDITOR">{t('Auditor / Viewer (Read Only)')}</option>
            </select>
          </div>

          <div>
            <label className="block text-foreground font-medium mb-1.5">
              {t('Permitted Sites & Facilities')}
            </label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-card border border-border">
              {tenantSites.map((site) => (
                <label key={site.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1.5 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.siteAccess.includes(site.id)}
                    onChange={() => handleToggleSite(site.id)}
                    className="rounded border-border text-primary focus:ring-0"
                  />
                  <span className="text-foreground font-medium">{site.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">({site.code})</span>
                </label>
              ))}
            </div>
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
              isLoading={isLoading}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t('Send Invitation')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
