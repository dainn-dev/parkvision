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
import { useTranslation } from 'react-i18next';

interface AddUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddUserDialog: React.FC<AddUserDialogProps> = ({ isOpen, onClose }) => {
  const { inviteTenantUser, createTenantUserManually, tenantUsers } = usePlatform();
  const { t } = useTranslation('tenant');
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
      setFormError(t('Please provide a valid email address.'));
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
      setFormError(t('Full name is required.'));
      return;
    }
    if (!manualEmail.trim() || !manualEmail.includes('@')) {
      setFormError(t('Please enter a valid email address.'));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-[330ms]">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">{t('Add User to Organization')}</h2>
              <p className="text-xs text-muted-foreground">{t('Invite via email or provision account manually')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="px-5 pt-4 pb-2 bg-card border-b border-border/60 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setTab('INVITE');
              setFormError(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === 'INVITE'
                ? 'bg-success text-[#fff] '
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            {t('Invite by Email (Recommended)')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('MANUAL');
              setFormError(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              tab === 'MANUAL'
                ? 'bg-primary text-black font-medium '
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {t('Create Manually')}
          </button>
        </div>

        {/* Form Body with Scroll */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {formError && (
            <div className="p-3 bg-destructive/15 border border-destructive/30 rounded-xl text-destructive flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {tab === 'INVITE' ? (
            <form id="invite-form" onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  {t('Email Address')} <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{t('Full Name (Optional)')}</label>
                  <input
                    type="text"
                    placeholder={t('e.g. John Doe')}
                    value={inviteFullName}
                    onChange={(e) => setInviteFullName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{t('Phone Number (Optional)')}</label>
                  <input
                    type="text"
                    placeholder="+84 90 123 4567"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  {t('Organization Role')} <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteRole('MEMBER')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      inviteRole === 'MEMBER'
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <div className="font-medium text-xs text-foreground">{t('Member')}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{t('Vehicle access pass & self-service')}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole('SITE_MANAGER')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      inviteRole === 'SITE_MANAGER'
                        ? 'bg-warning/10 border-warning text-foreground'
                        : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <div className="font-medium text-xs text-warning">{t('Site Manager')}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{t('Manage gates, lanes & camera alerts')}</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole('TENANT_ADMIN')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      inviteRole === 'TENANT_ADMIN'
                        ? 'bg-destructive/10 border-destructive text-foreground'
                        : 'bg-background border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <div className="font-medium text-xs text-destructive">{t('Tenant Admin')}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{t('Full organization & user control')}</div>
                  </button>
                </div>

                {inviteRole === 'TENANT_ADMIN' && (
                  <div className="mt-2 p-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive flex items-start gap-2 text-[11px]">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('Caution:')}</strong> {t('Tenant Admins have full administrative authority over all organization data, location settings, access policies, and member credentials.')}
                    </span>
                  </div>
                )}
              </div>

              {/* Member Profile Toggle */}
              <div className="p-3.5 bg-background border border-border rounded-xl space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="font-medium text-foreground">{t('Create Business Membership Profile')}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={inviteCreateMember}
                    onChange={(e) => setInviteCreateMember(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-border bg-card text-success focus:ring-0 focus:outline-hidden"
                  />
                </label>

                {inviteCreateMember && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/60">
                    <div>
                      <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Membership Type')}</label>
                      <select
                        value={inviteMemberType}
                        onChange={(e) => setInviteMemberType(e.target.value as MembershipType)}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs focus:outline-hidden focus:border-primary"
                      >
                        <option value="EMPLOYEE">{t('Employee')}</option>
                        <option value="STAFF">{t('Staff / Guard')}</option>
                        <option value="RESIDENT">{t('Resident')}</option>
                        <option value="CUSTOMER">{t('Customer / VIP')}</option>
                        <option value="VISITOR">{t('Visitor')}</option>
                        <option value="OTHER">{t('Other / Contractor')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Department')}</label>
                      <input
                        type="text"
                        placeholder={t('e.g. Engineering')}
                        value={inviteDepartment}
                        onChange={(e) => setInviteDepartment(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs placeholder-muted-foreground/60 focus:outline-hidden focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Employee ID')}</label>
                      <input
                        type="text"
                        placeholder={t('EMP-102')}
                        value={inviteEmployeeId}
                        onChange={(e) => setInviteEmployeeId(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs placeholder-muted-foreground/60 focus:outline-hidden focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">{t('Personal Message (Optional)')}</label>
                <textarea
                  rows={2}
                  placeholder={t('Add a welcoming note with instructions...')}
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden resize-none"
                />
              </div>
            </form>
          ) : (
            <form id="manual-form" onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    {t('Full Name')} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('e.g. Robert Smith')}
                    value={manualFullName}
                    onChange={(e) => setManualFullName(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">
                    {t('Email Address')} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="rsmith@example.com"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{t('Username (Optional)')}</label>
                  <input
                    type="text"
                    placeholder="rsmith"
                    value={manualUsername}
                    onChange={(e) => setManualUsername(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{t('Phone Number')}</label>
                  <input
                    type="text"
                    placeholder="+84 90 987 6543"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Role Select */}
              <div>
                <label className="block text-muted-foreground font-medium mb-1">{t('Organization Role')}</label>
                <select
                  value={manualRole}
                  onChange={(e) => setManualRole(e.target.value as TenantUserRole)}
                  className="w-full bg-background border border-border rounded-xl px-3 py-2 text-foreground focus:border-primary focus:outline-hidden"
                >
                  <option value="MEMBER">{t('Member (Vehicle whitelist access)')}</option>
                  <option value="SITE_MANAGER">{t('Site Manager (Gate & lane operations)')}</option>
                  <option value="TENANT_ADMIN">{t('Tenant Admin (Full administrative privileges)')}</option>
                </select>
              </div>

              {/* Temporary Password & Security */}
              <div className="p-3.5 bg-background border border-border rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">{t('Temporary Credentials')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Temporary Password')}</label>
                    <input
                      type="text"
                      value={manualTempPassword}
                      onChange={(e) => setManualTempPassword(e.target.value)}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualForcePasswordChange}
                        onChange={(e) => setManualForcePasswordChange(e.target.checked)}
                        className="w-4 h-4 rounded-sm border-border bg-card text-success focus:ring-0 focus:outline-hidden"
                      />
                      <span className="text-xs text-foreground">{t('Require password change on first sign-in')}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Member Profile Toggle for Manual */}
              <div className="p-3.5 bg-background border border-border rounded-xl space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="font-medium text-foreground">{t('Create Business Membership Profile')}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={manualCreateMember}
                    onChange={(e) => setManualCreateMember(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-border bg-card text-success focus:ring-0 focus:outline-hidden"
                  />
                </label>

                {manualCreateMember && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border/60">
                    <div>
                      <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Membership Type')}</label>
                      <select
                        value={manualMemberType}
                        onChange={(e) => setManualMemberType(e.target.value as MembershipType)}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs focus:outline-hidden focus:border-primary"
                      >
                        <option value="EMPLOYEE">{t('Employee')}</option>
                        <option value="STAFF">{t('Staff / Guard')}</option>
                        <option value="RESIDENT">{t('Resident')}</option>
                        <option value="CUSTOMER">{t('Customer / VIP')}</option>
                        <option value="VISITOR">{t('Visitor')}</option>
                        <option value="OTHER">{t('Other / Contractor')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Department')}</label>
                      <input
                        type="text"
                        placeholder={t('e.g. Logistics')}
                        value={manualDepartment}
                        onChange={(e) => setManualDepartment(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs placeholder-muted-foreground/60 focus:outline-hidden focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-muted-foreground text-[11px] font-medium mb-1">{t('Employee ID')}</label>
                      <input
                        type="text"
                        placeholder={t('EMP-303')}
                        value={manualEmployeeId}
                        onChange={(e) => setManualEmployeeId(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs placeholder-muted-foreground/60 focus:outline-hidden focus:border-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            {t('Cancel')}
          </Button>
          {tab === 'INVITE' ? (
            <Button
              type="submit"
              form="invite-form"
              variant="primary"
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 font-medium "
            >
              <Send className="w-3.5 h-3.5" />
              {t('Send Invitation')}
            </Button>
          ) : (
            <Button
              type="submit"
              form="manual-form"
              variant="primary"
              className="text-xs bg-primary hover:bg-primary/90 text-black gap-1.5 font-medium "
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t('Create Account')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
