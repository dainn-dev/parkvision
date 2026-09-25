import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { UserPlus, X, Check, Mail, Shield, Building2 } from 'lucide-react';
import { Button, Input } from '../ui';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ isOpen, onClose }) => {
  const { tenantSites, inviteTenantMember } = usePlatform();

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
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Invite Tenant Team Member</h3>
              <p className="text-xs text-[#8b949e]">Assign access control operational roles and site permissions</p>
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
          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Full Name <span className="text-[#f85149]">*</span>
            </label>
            <Input
              placeholder="e.g. Tran Quoc Toan"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="bg-[#161b22] border-[#30363d] text-white"
            />
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Email Address <span className="text-[#f85149]">*</span>
            </label>
            <Input
              type="email"
              placeholder="toan.tran@tenant-corp.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="bg-[#161b22] border-[#30363d] text-white"
            />
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Tenant Portal Role
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-[#58a6ff]"
            >
              <option value="TENANT_ADMIN">Tenant Admin (Full Control)</option>
              <option value="OPERATOR">Gate Operator (Live Monitor & Overrides)</option>
              <option value="SECURITY_GUARD">Security Guard (Gate Viewport Only)</option>
              <option value="AUDITOR">Auditor / Viewer (Read Only)</option>
            </select>
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Permitted Sites & Facilities
            </label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-[#161b22] border border-[#30363d]">
              {tenantSites.map((site) => (
                <label key={site.id} className="flex items-center gap-2 cursor-pointer hover:bg-[#21262d] p-1.5 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.siteAccess.includes(site.id)}
                    onChange={() => handleToggleSite(site.id)}
                    className="rounded border-[#30363d] text-[#58a6ff] focus:ring-0"
                  />
                  <span className="text-white font-medium">{site.name}</span>
                  <span className="text-[10px] text-[#8b949e] font-mono">({site.code})</span>
                </label>
              ))}
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
              Send Invitation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
