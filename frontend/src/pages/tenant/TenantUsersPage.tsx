import React, { useState, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  TenantUser,
  TenantUserRole,
  TenantUserStatus,
  MembershipStatus,
  MembershipType,
  TenantInvitation
} from '../../types/tenant';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Shield,
  ShieldAlert,
  Mail,
  Phone,
  Key,
  Layers,
  Car,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  UserX,
  UserCheck,
  Download,
  Upload,
  RefreshCw,
  MoreVertical,
  ChevronRight,
  Send,
  XCircle,
  FileSpreadsheet,
  History,
  Lock
} from 'lucide-react';
import { Button, Pagination } from '../../components/ui';
import { canManageTenantUsers, canTenantWrite } from '../../lib/permissions';
import { AddUserDialog } from '../../components/tenant/users/AddUserDialog';
import { ChangeRoleDialog } from '../../components/tenant/users/ChangeRoleDialog';
import { DeactivateUserDialog } from '../../components/tenant/users/DeactivateUserDialog';
import { ResetPasswordDialog } from '../../components/tenant/users/ResetPasswordDialog';
import { MembershipActionDialog } from '../../components/tenant/users/MembershipActionDialog';
import { UserDetailDrawer } from '../../components/tenant/users/UserDetailDrawer';
import { ImportUsersModal } from '../../components/tenant/users/ImportUsersModal';
import { useTranslation } from 'react-i18next';

export const TenantUsersPage: React.FC = () => {
  const { t } = useTranslation('tenant');
  const {
    tenantUsers,
    tenantInvitations,
    userAuditLogs,
    resendTenantInvitation,
    cancelTenantInvitation,
    addToast,
    currentUser
  } = usePlatform();

  // Only owner/admin may invite, change roles, reset passwords, deactivate,
  // or manage invitations — mirrors `ADMIN_ROLES` in backend/app/api/deps.py.
  const canManage = canManageTenantUsers(currentUser.rawRole);
  // Membership suspend/reactivate are WRITE_ROLES (owner/admin/operator) —
  // mirrors tenant/memberships.py's `require_roles(*WRITE_ROLES)`.
  const canManageMemberships = canTenantWrite(currentUser.rawRole);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'USERS' | 'MEMBERS' | 'INVITATIONS' | 'AUDIT'>('USERS');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [membershipTypeFilter, setMembershipTypeFilter] = useState<string>('ALL');

  // Pagination State for each Tab
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);

  const [memberPage, setMemberPage] = useState(1);
  const [memberPageSize, setMemberPageSize] = useState(10);

  const [invitationPage, setInvitationPage] = useState(1);
  const [invitationPageSize, setInvitationPageSize] = useState(10);

  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  // Dialog State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Selected User for Modals
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<TenantUser | null>(null);
  const [selectedUserForRole, setSelectedUserForRole] = useState<TenantUser | null>(null);
  const [selectedUserForDeactivate, setSelectedUserForDeactivate] = useState<TenantUser | null>(null);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<TenantUser | null>(null);
  const [selectedUserForMembership, setSelectedUserForMembership] = useState<{
    user: TenantUser;
    action: 'SUSPEND' | 'ACTIVATE' | 'END';
  } | null>(null);

  // Row Action Dropdown Toggle
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Reset pagination when search/filters change
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setUserPage(1);
    setMemberPage(1);
    setInvitationPage(1);
    setAuditPage(1);
  };

  const handleRoleFilterChange = (val: string) => {
    setRoleFilter(val);
    setUserPage(1);
    setMemberPage(1);
    setInvitationPage(1);
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setUserPage(1);
    setMemberPage(1);
    setInvitationPage(1);
  };

  const handleMembershipTypeFilterChange = (val: string) => {
    setMembershipTypeFilter(val);
    setMemberPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setMembershipTypeFilter('ALL');
    setUserPage(1);
    setMemberPage(1);
    setInvitationPage(1);
    setAuditPage(1);
  };

  // Calculations for KPIs
  const totalUsersCount = tenantUsers.length;
  const activeUsersCount = tenantUsers.filter((u) => u.status === 'ACTIVE').length;
  const inactiveUsersCount = tenantUsers.filter((u) => u.status === 'INACTIVE').length;

  const membersWithProfile = tenantUsers.filter((u) => u.membership !== null);
  const activeMembersCount = membersWithProfile.filter((u) => u.membership?.status === 'ACTIVE').length;
  const suspendedMembersCount = membersWithProfile.filter((u) => u.membership?.status === 'SUSPENDED').length;

  const activeAdmins = tenantUsers.filter((u) => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
  const isSingleAdmin = activeAdmins.length === 1;

  const pendingInvitations = tenantInvitations.filter((i) => i.status === 'PENDING');

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return tenantUsers.filter((user) => {
      // Search text matches Name, Email, Username, Phone, or Member ID
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        (user.username && user.username.toLowerCase().includes(query)) ||
        (user.phone && user.phone.includes(query)) ||
        (user.membership && user.membership.memberCode.toLowerCase().includes(query)) ||
        (user.membership?.vehicles &&
          user.membership.vehicles.some((v) => v.plate.toLowerCase().includes(query)));

      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || user.status === statusFilter;
      const matchesMemberType =
        membershipTypeFilter === 'ALL' ||
        (user.membership && user.membership.type === membershipTypeFilter);

      return matchesSearch && matchesRole && matchesStatus && matchesMemberType;
    });
  }, [tenantUsers, searchTerm, roleFilter, statusFilter, membershipTypeFilter]);

  // Paginated Users
  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice((userPage - 1) * userPageSize, userPage * userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  // Filtered Members List (Only users who have a membership profile)
  const filteredMembers = useMemo(() => {
    return filteredUsers.filter((user) => user.membership !== null && user.membership !== undefined);
  }, [filteredUsers]);

  // Paginated Members
  const paginatedMembers = useMemo(() => {
    return filteredMembers.slice((memberPage - 1) * memberPageSize, memberPage * memberPageSize);
  }, [filteredMembers, memberPage, memberPageSize]);

  // Filtered Invitations List
  const filteredInvitations = useMemo(() => {
    return tenantInvitations.filter((inv) => {
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        inv.email.toLowerCase().includes(query) ||
        (inv.fullName && inv.fullName.toLowerCase().includes(query)) ||
        inv.invitedBy.toLowerCase().includes(query);

      const matchesRole = roleFilter === 'ALL' || inv.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || inv.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [tenantInvitations, searchTerm, roleFilter, statusFilter]);

  // Paginated Invitations
  const paginatedInvitations = useMemo(() => {
    return filteredInvitations.slice((invitationPage - 1) * invitationPageSize, invitationPage * invitationPageSize);
  }, [filteredInvitations, invitationPage, invitationPageSize]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return userAuditLogs.filter((log) => {
      const query = searchTerm.toLowerCase().trim();
      return (
        !query ||
        log.actorName.toLowerCase().includes(query) ||
        log.targetUserName.toLowerCase().includes(query) ||
        log.description.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query)
      );
    });
  }, [userAuditLogs, searchTerm]);

  // Paginated Audit Logs
  const paginatedAuditLogs = useMemo(() => {
    return filteredAuditLogs.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);
  }, [filteredAuditLogs, auditPage, auditPageSize]);

  // CSV Export Handler
  const handleExportCsv = () => {
    let csv = 'ID,Name,Email,Username,Phone,Role,Status,Member ID,Member Type,Member Status,Department,Vehicles\n';
    tenantUsers.forEach((u) => {
      const vehiclesStr = u.membership?.vehicles.map((v) => `${v.plate} (${v.model})`).join('; ') || t('None');
      csv += `"${u.id}","${u.name}","${u.email}","${u.username || ''}","${u.phone || ''}","${u.role}","${u.status}","${u.membership?.memberCode || ''}","${u.membership?.type || ''}","${u.membership?.status || ''}","${u.membership?.department || ''}","${vehiclesStr}"\n`;
    });

    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csv);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tenant_users_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'success',
      title: t('Users Exported'),
      description: t('Downloaded user and membership list as CSV.')
    });
  };

  const getRoleLabel = (role: TenantUserRole) => {
    switch (role) {
      case 'TENANT_ADMIN':
        return t('Tenant Admin');
      case 'SITE_MANAGER':
        return t('Site Manager');
      case 'MEMBER':
        return t('Member');
    }
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-[330ms]">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/70 p-5 rounded-2xl border border-border ">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-primary" />
            <h1 className="text-xl md:text-2xl font-medium text-foreground tracking-tight">
              {t('Users & Member Management')}
            </h1>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-muted border border-border text-primary">
              {t('{{count}} Total People', { count: totalUsersCount })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Manage authentication accounts, organization roles, facility memberships, and vehicle access rights.')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {canManage && (
            <Button
              variant="secondary"
              onClick={() => setIsImportOpen(true)}
              className="text-xs bg-muted hover:bg-border text-foreground gap-1.5 border border-border"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('Import CSV')}
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={handleExportCsv}
            className="text-xs bg-muted hover:bg-border text-foreground gap-1.5 border border-border"
          >
            <Download className="w-3.5 h-3.5" />
            {t('Export Users')}
          </Button>

          {canManage && (
            <Button
              variant="primary"
              onClick={() => setIsAddUserOpen(true)}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 font-medium "
            >
              <UserPlus className="w-4 h-4" />
              {t('Add User')}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users KPI */}
        <div className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground">{t('Total User Accounts')}</span>
            <div className="text-2xl font-medium text-foreground mt-1">{totalUsersCount}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <span className="text-success font-medium">{t('{{count}} Active', { count: activeUsersCount })}</span>
              <span>·</span>
              <span>{t('{{count}} Inactive', { count: inactiveUsersCount })}</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Members KPI */}
        <div className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-muted-foreground">{t('Business Members')}</span>
            <div className="text-2xl font-medium text-foreground mt-1">{membersWithProfile.length}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <span className="text-success font-medium">{t('{{count}} Passes Active', { count: activeMembersCount })}</span>
              {suspendedMembersCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-warning font-medium">{t('{{count}} Suspended', { count: suspendedMembersCount })}</span>
                </>
              )}
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-success/15 border border-success/30 text-success flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Tenant Admins KPI with Single Admin Alert */}
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between ${
            isSingleAdmin
              ? 'bg-warning/10 border-warning/40'
              : 'bg-card border-border'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('Tenant Admins')}</span>
              {isSingleAdmin && (
                <span className="text-[11px] font-medium px-1.5 py-0.2 rounded bg-warning/20 text-warning">
                  {t('Single Admin')}
                </span>
              )}
            </div>
            <div className="text-2xl font-medium text-foreground mt-1">{activeAdmins.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {isSingleAdmin ? (
                <span className="text-warning">{t('Protect with backup admin')}</span>
              ) : (
                <span>{t('Distributed Governance')}</span>
              )}
            </div>
          </div>
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              isSingleAdmin
                ? 'bg-warning/20 border border-warning/40 text-warning'
                : 'bg-destructive/15 border border-destructive/30 text-destructive'
            }`}
          >
            <Shield className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Invitations KPI */}
        <div
          onClick={() => setActiveTab('INVITATIONS')}
          className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between cursor-pointer hover:border-primary/50 transition-colors"
        >
          <div>
            <span className="text-xs font-medium text-muted-foreground">{t('Pending Invitations')}</span>
            <div className="text-2xl font-medium text-foreground mt-1">{pendingInvitations.length}</div>
            <div className="text-[11px] text-primary mt-1 flex items-center gap-1">
              <span>{t('Review pending invites')}</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-warning/15 border border-warning/30 text-warning flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Single Admin Governance Advisory Banner */}
      {isSingleAdmin && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-medium text-foreground">{t('Single Administrator Advisory')}</h4>
              <p className="text-[11px] text-warning/90 mt-0.5 leading-relaxed">
                {t('Your organization currently has only 1 active Tenant Admin')} (<span className="text-foreground font-medium">{activeAdmins[0]?.name}</span>). {t('To ensure continuous governance and avoid account lockouts, promote a second administrator.')}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => setIsAddUserOpen(true)}
            className="text-xs py-1.5 px-3 bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 whitespace-nowrap shrink-0"
          >
            {t('+ Add Backup Admin')}
          </Button>
        </div>
      )}

      {/* Tabs & Search Filter Header */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('USERS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'USERS'
                  ? 'bg-primary text-black '
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              {t('Users')}
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/20 text-[11px]">
                {tenantUsers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('MEMBERS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'MEMBERS'
                  ? 'bg-success text-[#fff] '
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {t('Members & Vehicles')}
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/20 text-[11px]">
                {membersWithProfile.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('INVITATIONS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'INVITATIONS'
                  ? 'bg-warning text-black '
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              {t('Invitations')}
              {pendingInvitations.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/30 text-[11px] font-medium">
                  {pendingInvitations.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                activeTab === 'AUDIT'
                  ? 'bg-border text-foreground '
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              {t('Audit Logs')}
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={t('Search by name, email, member ID, plate...')}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
            {/* Role Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground text-[11px]">{t('Role:')}</span>
              <select
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
                className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs focus:outline-hidden focus:border-primary"
              >
                <option value="ALL">{t('All Roles')}</option>
                <option value="TENANT_ADMIN">{t('Tenant Admin')}</option>
                <option value="SITE_MANAGER">{t('Site Manager')}</option>
                <option value="MEMBER">{t('Member')}</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground text-[11px]">{t('Status:')}</span>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs focus:outline-hidden focus:border-primary"
              >
                <option value="ALL">{t('All Statuses')}</option>
                <option value="ACTIVE">{t('Active')}</option>
                <option value="INACTIVE">{t('Inactive')}</option>
                <option value="PENDING">{t('Pending')}</option>
                <option value="SUSPENDED">{t('Suspended')}</option>
              </select>
            </div>

            {/* Membership Type Filter (Only visible on Members tab or all) */}
            {activeTab === 'MEMBERS' && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground text-[11px]">{t('Type:')}</span>
                <select
                  value={membershipTypeFilter}
                  onChange={(e) => handleMembershipTypeFilterChange(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground text-xs focus:outline-hidden focus:border-primary"
                >
                  <option value="ALL">{t('All Types')}</option>
                  <option value="EMPLOYEE">{t('Employee')}</option>
                  <option value="STAFF">{t('Staff / Security')}</option>
                  <option value="RESIDENT">{t('Resident')}</option>
                  <option value="CUSTOMER">{t('Customer / VIP')}</option>
                  <option value="OTHER">{t('Other')}</option>
                </select>
              </div>
            )}

            {(searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL' || membershipTypeFilter !== 'ALL') && (
              <Button
                variant="secondary"
                onClick={handleClearFilters}
                className="text-[11px] py-1 px-2.5 text-muted-foreground hover:text-foreground"
              >
                {t('Clear Filters')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USERS TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'USERS' && (
        <div className="rounded-2xl bg-card border border-border overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background text-muted-foreground border-b border-border font-medium text-[11px] ">
                <tr>
                  <th className="py-3 px-4">{t('User')}</th>
                  <th className="py-3 px-4">{t('Role')}</th>
                  <th className="py-3 px-4">{t('Status')}</th>
                  <th className="py-3 px-4">{t('Business Membership')}</th>
                  <th className="py-3 px-4">{t('Last Sign-In')}</th>
                  <th className="py-3 px-4 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="font-medium text-foreground">{t('No users match the criteria')}</p>
                      <p className="text-xs mt-1">{t('Try adjusting search query or active filters')}</p>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-muted/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedUserForDetail(user)}
                    >
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted border border-border text-primary flex items-center justify-center font-medium text-xs shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-foreground text-xs group-hover:text-primary transition-colors">
                              {user.name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span
                          className={` text-[11px] font-medium px-2 py-0.5 rounded ${
                            user.role === 'TENANT_ADMIN'
                              ? 'bg-destructive/15 text-destructive border border-destructive/30'
                              : user.role === 'SITE_MANAGER'
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-primary/15 text-primary border border-primary/30'
                          }`}
                        >
                          {getRoleLabel(user.role)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                            user.status === 'ACTIVE'
                              ? 'bg-success/15 text-success border border-success/30'
                              : user.status === 'PENDING'
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                          }`}
                        >
                          {user.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3" />}
                          {user.status === 'PENDING' && <Clock className="w-3 h-3" />}
                          {user.status === 'INACTIVE' && <UserX className="w-3 h-3" />}
                          {t(user.status)}
                        </span>
                      </td>

                      {/* Membership & Vehicles */}
                      <td className="py-3 px-4">
                        {user.membership ? (
                          <div className="flex items-center gap-2">
                            <span className=" text-[11px] text-primary bg-background px-2 py-0.5 rounded border border-border">
                              {user.membership.memberCode}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {t('{{count}} vehicle(s)', { count: user.membership.vehicles.length })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">{t('Auth-only (No pass)')}</span>
                        )}
                      </td>

                      {/* Last Sign In */}
                      <td className="py-3 px-4 text-muted-foreground text-[11px]">
                        {user.lastLoginAt ? (
                          new Date(user.lastLoginAt).toLocaleString()
                        ) : (
                          <span className="italic text-muted-foreground/60">{t('Never')}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {canManage ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedUserForRole(user)}
                              className="text-[11px] py-1 px-2 bg-muted hover:bg-border text-foreground border border-border"
                            >
                              <Shield className="w-3 h-3 text-primary" />
                              {t('Role')}
                            </Button>

                            <Button
                              variant="secondary"
                              onClick={() => setSelectedUserForPassword(user)}
                              className="text-[11px] py-1 px-2 bg-muted hover:bg-border text-foreground border border-border"
                              title={t('Reset password')}
                            >
                              <Key className="w-3 h-3 text-warning" />
                            </Button>

                            <Button
                              variant="secondary"
                              onClick={() => setSelectedUserForDeactivate(user)}
                              className={`text-[11px] py-1 px-2 border ${
                                user.status === 'ACTIVE'
                                  ? 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
                                  : 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                              }`}
                            >
                              {user.status === 'ACTIVE' ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">{t('View only')}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={userPage}
            totalPages={Math.ceil(filteredUsers.length / userPageSize) || 1}
            totalItems={filteredUsers.length}
            pageSize={userPageSize}
            onPageChange={setUserPage}
            onPageSizeChange={setUserPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MEMBERS & VEHICLES TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'MEMBERS' && (
        <div className="rounded-2xl bg-card border border-border overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background text-muted-foreground border-b border-border font-medium text-[11px] ">
                <tr>
                  <th className="py-3 px-4">{t('Member ID & Name')}</th>
                  <th className="py-3 px-4">{t('Type & Department')}</th>
                  <th className="py-3 px-4">{t('Membership Status')}</th>
                  <th className="py-3 px-4">{t('Registered Vehicle Plates')}</th>
                  <th className="py-3 px-4">{t('Joined Date')}</th>
                  <th className="py-3 px-4 text-right">{t('Access Controls')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      <Layers className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="font-medium text-foreground">{t('No members match the criteria')}</p>
                    </td>
                  </tr>
                ) : (
                  paginatedMembers.map((user) => {
                    const m = user.membership!;
                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-muted/60 transition-colors group cursor-pointer"
                        onClick={() => setSelectedUserForDetail(user)}
                      >
                        {/* Member ID & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 text-primary flex items-center justify-center font-medium text-xs shrink-0">
                              {m.fullName.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-foreground text-xs group-hover:text-primary transition-colors flex items-center gap-2">
                                <span>{m.fullName}</span>
                                <span className=" text-[11px] text-primary bg-background px-1.5 py-0.2 rounded border border-border">
                                  {m.memberCode}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">{user.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Type & Dept */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">{t(m.type)}</div>
                          <div className="text-[11px] text-muted-foreground">{m.department || t('General')}</div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                              m.status === 'ACTIVE'
                                ? 'bg-success/15 text-success border border-success/30'
                                : m.status === 'SUSPENDED'
                                ? 'bg-warning/15 text-warning border border-warning/30'
                                : 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                            }`}
                          >
                            {m.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3" />}
                            {m.status === 'SUSPENDED' && <Ban className="w-3 h-3" />}
                            {t(m.status)}
                          </span>
                        </td>

                        {/* Registered Vehicles */}
                        <td className="py-3 px-4">
                          {m.vehicles.length === 0 ? (
                            <span className="text-muted-foreground text-[11px] italic">{t('No vehicles registered')}</span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {m.vehicles.map((v, i) => (
                                <span
                                  key={i}
                                  className={` text-[11px] font-medium px-2 py-0.5 rounded border ${
                                    v.status === 'ACTIVE'
                                      ? 'bg-background border-border text-foreground'
                                      : 'bg-destructive/15 border-destructive/30 text-destructive'
                                  }`}
                                  title={`${v.model} (${v.status})`}
                                >
                                  {v.plate}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Joined Date */}
                        <td className="py-3 px-4 text-muted-foreground text-[11px]">
                          {new Date(m.joinedAt).toLocaleDateString()}
                        </td>

                        {/* Access Control Action Buttons */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {canManageMemberships ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {m.status === 'ACTIVE' ? (
                                <Button
                                  variant="secondary"
                                  onClick={() => setSelectedUserForMembership({ user, action: 'SUSPEND' })}
                                  className="text-[11px] py-1 px-2.5 bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25"
                                >
                                  <Ban className="w-3 h-3" />
                                  {t('Suspend Pass')}
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  onClick={() => setSelectedUserForMembership({ user, action: 'ACTIVATE' })}
                                  className="text-[11px] py-1 px-2.5 bg-success/15 text-success border border-success/30 hover:bg-success/25"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  {t('Reactivate')}
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-[11px] italic">{t('View only')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={memberPage}
            totalPages={Math.ceil(filteredMembers.length / memberPageSize) || 1}
            totalItems={filteredMembers.length}
            pageSize={memberPageSize}
            onPageChange={setMemberPage}
            onPageSizeChange={setMemberPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INVITATIONS TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'INVITATIONS' && (
        <div className="rounded-2xl bg-card border border-border overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background text-muted-foreground border-b border-border font-medium text-[11px] ">
                <tr>
                  <th className="py-3 px-4">{t('Invited Email / Name')}</th>
                  <th className="py-3 px-4">{t('Assigned Role')}</th>
                  <th className="py-3 px-4">{t('Status')}</th>
                  <th className="py-3 px-4">{t('Invited By')}</th>
                  <th className="py-3 px-4">{t('Sent At')}</th>
                  <th className="py-3 px-4">{t('Expires')}</th>
                  <th className="py-3 px-4 text-right">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {filteredInvitations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Mail className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="font-medium text-foreground">{t('No invitations found')}</p>
                    </td>
                  </tr>
                ) : (
                  paginatedInvitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/60 transition-colors">
                      {/* Email & Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted border border-border text-warning flex items-center justify-center font-medium text-xs shrink-0">
                            <Mail className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground text-xs">{inv.fullName || inv.email}</div>
                            <div className="text-[11px] text-muted-foreground">{inv.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span className=" text-[11px] font-medium px-2 py-0.5 rounded bg-background border border-border text-primary">
                          {getRoleLabel(inv.role)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                            inv.status === 'ACCEPTED'
                              ? 'bg-success/15 text-success border border-success/30'
                              : inv.status === 'PENDING'
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                          }`}
                        >
                          {t(inv.status)}
                        </span>
                      </td>

                      {/* Invited By */}
                      <td className="py-3 px-4 text-foreground">{inv.invitedBy}</td>

                      {/* Sent At */}
                      <td className="py-3 px-4 text-muted-foreground text-[11px]">
                        {inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Expires At */}
                      <td className="py-3 px-4 text-muted-foreground text-[11px]">
                        {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {inv.status === 'PENDING' && canManage ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              onClick={() => resendTenantInvitation(inv.id)}
                              className="text-[11px] py-1 px-2.5 bg-muted hover:bg-border text-foreground border border-border gap-1"
                            >
                              <Send className="w-3 h-3 text-primary" />
                              {t('Resend')}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => cancelTenantInvitation(inv.id)}
                              className="text-[11px] py-1 px-2.5 bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20"
                            >
                              {t('Revoke')}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">
                            {inv.status === 'PENDING' ? t('View only') : t('Resolved')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={invitationPage}
            totalPages={Math.ceil(filteredInvitations.length / invitationPageSize) || 1}
            totalItems={filteredInvitations.length}
            pageSize={invitationPageSize}
            onPageChange={setInvitationPage}
            onPageSizeChange={setInvitationPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: AUDIT TRAIL LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'AUDIT' && (
        <div className="rounded-2xl bg-card border border-border overflow-hidden ">
          <div className="p-4 bg-background border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-foreground">{t('Governance & User Access Logs')}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {t('{{count}} events logged', { count: filteredAuditLogs.length })}
            </span>
          </div>

          <div className="divide-y divide-border/60">
            {filteredAuditLogs.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <History className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="font-medium text-foreground">{t('No audit records found')}</p>
              </div>
            ) : (
              paginatedAuditLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-muted/50 transition-colors space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className=" text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        {log.action}
                      </span>
                      <span className="font-medium text-foreground">{log.targetUserName}</span>
                    </div>
                    <span className=" text-[11px] text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-foreground text-xs leading-relaxed">{log.description}</p>
                  <div className="text-[11px] text-muted-foreground">
                    {t('Triggered by:')} <strong className="text-foreground">{log.actorName}</strong>
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination
            currentPage={auditPage}
            totalPages={Math.ceil(filteredAuditLogs.length / auditPageSize) || 1}
            totalItems={filteredAuditLogs.length}
            pageSize={auditPageSize}
            onPageChange={setAuditPage}
            onPageSizeChange={setAuditPageSize}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOGS & DRAWERS */}
      {/* ========================================================================= */}
      <AddUserDialog isOpen={isAddUserOpen} onClose={() => setIsAddUserOpen(false)} />
      <ImportUsersModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

      <ChangeRoleDialog
        isOpen={selectedUserForRole !== null}
        onClose={() => setSelectedUserForRole(null)}
        user={selectedUserForRole}
      />

      <DeactivateUserDialog
        isOpen={selectedUserForDeactivate !== null}
        onClose={() => setSelectedUserForDeactivate(null)}
        user={selectedUserForDeactivate}
      />

      <ResetPasswordDialog
        isOpen={selectedUserForPassword !== null}
        onClose={() => setSelectedUserForPassword(null)}
        user={selectedUserForPassword}
      />

      {selectedUserForMembership && (
        <MembershipActionDialog
          isOpen={true}
          onClose={() => setSelectedUserForMembership(null)}
          user={selectedUserForMembership.user}
          actionType={selectedUserForMembership.action}
        />
      )}

      <UserDetailDrawer
        isOpen={selectedUserForDetail !== null}
        onClose={() => setSelectedUserForDetail(null)}
        user={selectedUserForDetail}
        onChangeRole={(u) => {
          setSelectedUserForDetail(null);
          setSelectedUserForRole(u);
        }}
        onDeactivate={(u) => {
          setSelectedUserForDetail(null);
          setSelectedUserForDeactivate(u);
        }}
        onResetPassword={(u) => {
          setSelectedUserForDetail(null);
          setSelectedUserForPassword(u);
        }}
        onMembershipAction={(u, action) => {
          setSelectedUserForDetail(null);
          setSelectedUserForMembership({ user: u, action });
        }}
      />
    </div>
  );
};
