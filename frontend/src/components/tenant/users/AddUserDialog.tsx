import React, { useState } from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUserRole, MembershipType } from '../../../types/tenant';
import {
  X,
  UserPlus,
  Mail,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Send,
  UserCheck,
  Building,
  Phone,
  Briefcase,
  Key,
  Info,
  Layers
} from 'lucide-react';
import { Button } from '../../ui';

interface AddUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddUserDialog: React.FC<AddUserDialogProps> = ({ isOpen, onClose }) => {
  const { inviteTenantUser, createTenantUserManually, tenantUsers } = usePlatform();
  const [tab, setTab] = useState<'INVITE' | 'MANUAL'>('INVITE');

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteRole, setInviteRole] = useState<TenantUserRole>('MEMBER');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteCreateMember, setInviteCreateMember] = useState(true);
  const [inviteMemberType, setInviteMemberType] = useState<MembershipType>('EMPLOYEE');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteDepartment, setInviteDepartment] = useState('');
  const [inviteEmployeeId, setInviteEmployeeId] = useState('');

  // Manual Form State
  const [manualFullName, setManualFullName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualRole, setManualRole] = useState<TenantUserRole>('MEMBER');
  const [manualTempPassword, setManualTempPassword] = useState('Welcome@2026!');
  const [manualForcePasswordChange, setManualForcePasswordChange] = useState(true);
  const [manualCreateMember, setManualCreateMember] = useState(true);
  const [manualMemberType, setManualMemberType] = useState<MembershipType>('EMPLOYEE');
  const [manualDepartment, setManualDepartment] = useState('');
  const [manualEmployeeId, setManualEmployeeId] = useState('');

  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!inviteEmail || !inviteEmail.includes('@')) {
      setFormError('Please provide a valid email address.');
      return;
    }

    inviteTenantUser({
      email: inviteEmail.trim(),
      fullName: inviteFullName.trim() || undefined,
      role: inviteRole,
      personalMessage: inviteMessage.trim() || undefined,
      createMemberProfile: inviteCreateMember,
      membershipType: inviteCreateMember ? inviteMemberType : undefined,
      phone: invitePhone.trim() || undefined,
      department: inviteDepartment.trim() || undefined,
      employeeId: inviteEmployeeId.trim() || undefined
    });

    onClose();
    resetForm();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!manualFullName.trim()) {
      setFormError('Full name is required.');
      return;
    }
    if (!manualEmail.trim() || !manualEmail.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }

    createTenantUserManually({
      fullName: manualFullName.trim(),
      email: manualEmail.trim(),
      username: manualUsername.trim() || undefined,
      phone: manualPhone.trim() || undefined,
      role: manualRole,
      tempPassword: manualTempPassword,
      forcePasswordChange: manualForcePasswordChange,
      createMemberProfile: manualCreateMember,
      membershipType: manualCreateMember ? manualMemberType : undefined,
      department: manualDepartment.trim() || undefined,
      employeeId: manualEmployeeId.trim() || undefined
    });

    onClose();
    resetForm();
  };

  const resetForm = () => {
    setInviteEmail('');
    setInviteFullName('');
    setInviteRole('MEMBER');
    setInviteMessage('');
    setInviteCreateMember(true);
    setInvitePhone('');
    setInviteDepartment('');
    setInviteEmployeeId('');
    setManualFullName('');
    setManualEmail('');
    setManualUsername('');
    setManualPhone('');
    setManualRole('MEMBER');
    setFormError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Add User to Organization</h2>
              <p className="text-xs text-[#8b949e]">Invite via email or provision account manually</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="px-5 pt-4 pb-2 bg-[#161b22] border-b border-[#30363d]/60 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTab('INVITE');
              setFormError(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'INVITE'
                ? 'bg-[#238636] text-white shadow-sm'
                : 'bg-[#21262d] text-[#8b949e] hover:text-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            Invite by Email (Recommended)
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('MANUAL');
              setFormError(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === 'MANUAL'
                ? 'bg-[#58a6ff] text-black font-bold shadow-sm'
                : 'bg-[#21262d] text-[#8b949e] hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Create Manually
          </button>
        </div>

        {/* Form Body with Scroll */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-[#f85149]/15 border border-[#f85149]/30 rounded-xl text-[#ff7b72] flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {tab === 'INVITE' ? (
            <form id="invite-form" onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-[#8b949e] font-semibold mb-1">
                  Email Address <span className="text-[#f85149]">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#8b949e] absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl pl-9 pr-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8b949e] font-semibold mb-1">Full Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[#8b949e] font-semibold mb-1">Phone Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="+84 90 123 4567"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-[#8b949e] font-semibold mb-1">
                  Organization Role <span className="text-[#f85149]">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteRole('MEMBER')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      inviteRole === 'MEMBER'
                        ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]'
                    }`}
                  >
                    <div className="font-bold text-xs text-white">Member</div>
                    <div className="text-[11px] text-[#8b949e] mt-0.5">Vehicle access pass & self-service</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole('SITE_MANAGER')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      inviteRole === 'SITE_MANAGER'
                        ? 'bg-[#d29922]/10 border-[#d29922] text-white'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]'
                    }`}
                  >
                    <div className="font-bold text-xs text-[#d29922]">Site Manager</div>
                    <div className="text-[11px] text-[#8b949e] mt-0.5">Manage gates, lanes & camera alerts</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole('TENANT_ADMIN')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      inviteRole === 'TENANT_ADMIN'
                        ? 'bg-[#f85149]/10 border-[#f85149] text-white'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]'
                    }`}
                  >
                    <div className="font-bold text-xs text-[#f85149]">Tenant Admin</div>
                    <div className="text-[11px] text-[#8b949e] mt-0.5">Full organization & user control</div>
                  </button>
                </div>

                {inviteRole === 'TENANT_ADMIN' && (
                  <div className="mt-2 p-2.5 bg-[#f85149]/10 border border-[#f85149]/30 rounded-xl text-[#ff7b72] flex items-start gap-2 text-[11px]">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Caution:</strong> Tenant Admins have full administrative authority over all organization data, location settings, access policies, and member credentials.
                    </span>
                  </div>
                )}
              </div>

              {/* Member Profile Toggle */}
              <div className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#58a6ff]" />
                    <span className="font-semibold text-white">Create Business Membership Profile</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={inviteCreateMember}
                    onChange={(e) => setInviteCreateMember(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-[#30363d] bg-[#161b22] text-[#238636] focus:ring-0 focus:outline-hidden"
                  />
                </label>

                {inviteCreateMember && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#30363d]/60">
                    <div>
                      <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Membership Type</label>
                      <select
                        value={inviteMemberType}
                        onChange={(e) => setInviteMemberType(e.target.value as MembershipType)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-hidden focus:border-[#58a6ff]"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="STAFF">Staff / Guard</option>
                        <option value="RESIDENT">Resident</option>
                        <option value="CUSTOMER">Customer / VIP</option>
                        <option value="VISITOR">Visitor</option>
                        <option value="OTHER">Other / Contractor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Department</label>
                      <input
                        type="text"
                        placeholder="e.g. Engineering"
                        value={inviteDepartment}
                        onChange={(e) => setInviteDepartment(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-[#8b949e]/60 focus:outline-hidden focus:border-[#58a6ff]"
                      />
                    </div>

                    <div>
                      <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Employee ID</label>
                      <input
                        type="text"
                        placeholder="EMP-102"
                        value={inviteEmployeeId}
                        onChange={(e) => setInviteEmployeeId(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-[#8b949e]/60 focus:outline-hidden focus:border-[#58a6ff]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[#8b949e] font-semibold mb-1">Personal Message (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Add a welcoming note with instructions..."
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden resize-none"
                />
              </div>
            </form>
          ) : (
            <form id="manual-form" onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8b949e] font-semibold mb-1">
                    Full Name <span className="text-[#f85149]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Robert Smith"
                    value={manualFullName}
                    onChange={(e) => setManualFullName(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[#8b949e] font-semibold mb-1">
                    Email Address <span className="text-[#f85149]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="rsmith@example.com"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#8b949e] font-semibold mb-1">Username (Optional)</label>
                  <input
                    type="text"
                    placeholder="rsmith"
                    value={manualUsername}
                    onChange={(e) => setManualUsername(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[#8b949e] font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+84 90 987 6543"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Role Select */}
              <div>
                <label className="block text-[#8b949e] font-semibold mb-1">Organization Role</label>
                <select
                  value={manualRole}
                  onChange={(e) => setManualRole(e.target.value as TenantUserRole)}
                  className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl px-3 py-2 text-white focus:border-[#58a6ff] focus:outline-hidden"
                >
                  <option value="MEMBER">Member (Vehicle whitelist access)</option>
                  <option value="SITE_MANAGER">Site Manager (Gate & lane operations)</option>
                  <option value="TENANT_ADMIN">Tenant Admin (Full administrative privileges)</option>
                </select>
              </div>

              {/* Temporary Password & Security */}
              <div className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#58a6ff]" />
                  <span className="font-semibold text-white">Temporary Credentials</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Temporary Password</label>
                    <input
                      type="text"
                      value={manualTempPassword}
                      onChange={(e) => setManualTempPassword(e.target.value)}
                      className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-hidden focus:border-[#58a6ff]"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualForcePasswordChange}
                        onChange={(e) => setManualForcePasswordChange(e.target.checked)}
                        className="w-4 h-4 rounded-sm border-[#30363d] bg-[#161b22] text-[#238636] focus:ring-0 focus:outline-hidden"
                      />
                      <span className="text-xs text-[#c9d1d9]">Require password change on first sign-in</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Member Profile Toggle for Manual */}
              <div className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#58a6ff]" />
                    <span className="font-semibold text-white">Create Business Membership Profile</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={manualCreateMember}
                    onChange={(e) => setManualCreateMember(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-[#30363d] bg-[#161b22] text-[#238636] focus:ring-0 focus:outline-hidden"
                  />
                </label>

                {manualCreateMember && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[#30363d]/60">
                    <div>
                      <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Membership Type</label>
                      <select
                        value={manualMemberType}
                        onChange={(e) => setManualMemberType(e.target.value as MembershipType)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-hidden focus:border-[#58a6ff]"
                      >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="STAFF">Staff / Guard</option>
                        <option value="RESIDENT">Resident</option>
                        <option value="CUSTOMER">Customer / VIP</option>
                        <option value="VISITOR">Visitor</option>
                        <option value="OTHER">Other / Contractor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Department</label>
                      <input
                        type="text"
                        placeholder="e.g. Logistics"
                        value={manualDepartment}
                        onChange={(e) => setManualDepartment(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-[#8b949e]/60 focus:outline-hidden focus:border-[#58a6ff]"
                      />
                    </div>

                    <div>
                      <label className="block text-[#8b949e] text-[11px] font-semibold mb-1">Employee ID</label>
                      <input
                        type="text"
                        placeholder="EMP-303"
                        value={manualEmployeeId}
                        onChange={(e) => setManualEmployeeId(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-[#8b949e]/60 focus:outline-hidden focus:border-[#58a6ff]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12]/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          {tab === 'INVITE' ? (
            <Button
              type="submit"
              form="invite-form"
              variant="primary"
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 font-bold shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              Send Invitation
            </Button>
          ) : (
            <Button
              type="submit"
              form="manual-form"
              variant="primary"
              className="text-xs bg-[#58a6ff] hover:bg-[#79b8ff] text-black gap-1.5 font-bold shadow-sm"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Create Account
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
