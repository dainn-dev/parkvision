import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  CheckCircle2,
  Trash2,
  Building2,
  Key
} from 'lucide-react';
import { Button } from '../../components/ui';
import { InviteMemberModal } from '../../components/tenant/InviteMemberModal';

export const TenantTeamPage: React.FC = () => {
  const { tenantMembers, tenantSites, deleteTenantMember } = usePlatform();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Tenant Team & Access RBAC
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
              {tenantMembers.length} Active Operators
            </span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Manage site operators, security guards, gate controllers, and audit viewers
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsInviteModalOpen(true)}
          className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Invite Team Member
        </Button>
      </div>

      <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
              <tr>
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Portal Role</th>
                <th className="py-3 px-4">Site Facilities Access</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]/60 font-medium">
              {tenantMembers.map((member) => (
                <tr key={member.id} className="hover:bg-[#21262d]/60 transition-colors">
                  <td className="py-3.5 px-4 text-white font-bold">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#58a6ff]/20 border border-[#58a6ff]/40 text-[#58a6ff] flex items-center justify-center font-bold text-xs">
                        {member.name.charAt(0)}
                      </div>
                      <span>{member.name}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[#8b949e]">
                    {member.email}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#0d0e12] border border-[#30363d] text-[#58a6ff]">
                      {member.role}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-[#c9d1d9]">
                    {member.siteAccess.includes('ALL') || member.siteAccess.length >= tenantSites.length
                      ? 'All Facility Sites'
                      : `${member.siteAccess.length} Assigned Sites`}
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
                      <CheckCircle2 className="w-3 h-3" />
                      {member.status}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[#8b949e] text-[11px]">
                    {member.createdAt}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => deleteTenantMember(member.id)}
                      className="p-1.5 rounded hover:bg-[#da3633]/20 text-[#8b949e] hover:text-[#f85149] transition-colors cursor-pointer"
                      title="Remove Member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />
    </div>
  );
};
