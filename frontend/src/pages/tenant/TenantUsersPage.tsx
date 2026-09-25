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
import { AddUserDialog } from '../../components/tenant/users/AddUserDialog';
import { ChangeRoleDialog } from '../../components/tenant/users/ChangeRoleDialog';
import { DeactivateUserDialog } from '../../components/tenant/users/DeactivateUserDialog';
import { ResetPasswordDialog } from '../../components/tenant/users/ResetPasswordDialog';
import { MembershipActionDialog } from '../../components/tenant/users/MembershipActionDialog';
import { UserDetailDrawer } from '../../components/tenant/users/UserDetailDrawer';
import { ImportUsersModal } from '../../components/tenant/users/ImportUsersModal';

export const TenantUsersPage: React.FC = () => {
  const {
    tenantUsers,
    tenantInvitations,
    userAuditLogs,
    resendTenantInvitation,
    cancelTenantInvitation,
    addToast
  } = usePlatform();

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
      const vehiclesStr = u.membership?.vehicles.map((v) => `${v.plate} (${v.model})`).join('; ') || 'None';
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
      title: 'Users Exported',
      description: 'Downloaded user and membership list as CSV.'
    });
  };

  const getRoleLabel = (role: TenantUserRole) => {
    switch (role) {
      case 'TENANT_ADMIN':
        return 'Tenant Admin';
      case 'SITE_MANAGER':
        return 'Site Manager';
      case 'MEMBER':
        return 'Member';
    }
  };

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Users &amp; Member Management
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
              {totalUsersCount} Total People
            </span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Manage authentication accounts, organization roles, facility memberships, and vehicle access rights.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => setIsImportOpen(true)}
            className="text-xs bg-[#21262d] hover:bg-[#30363d] text-white gap-1.5 border border-[#30363d]"
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportCsv}
            className="text-xs bg-[#21262d] hover:bg-[#30363d] text-white gap-1.5 border border-[#30363d]"
          >
            <Download className="w-3.5 h-3.5" />
            Export Users
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsAddUserOpen(true)}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 font-bold shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users KPI */}
        <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#8b949e]">Total User Accounts</span>
            <div className="text-2xl font-bold text-white mt-1">{totalUsersCount}</div>
            <div className="flex items-center gap-2 text-[11px] text-[#8b949e] mt-1">
              <span className="text-[#3fb950] font-semibold">{activeUsersCount} Active</span>
              <span>·</span>
              <span>{inactiveUsersCount} Inactive</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Members KPI */}
        <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[#8b949e]">Business Members</span>
            <div className="text-2xl font-bold text-white mt-1">{membersWithProfile.length}</div>
            <div className="flex items-center gap-2 text-[11px] text-[#8b949e] mt-1">
              <span className="text-[#3fb950] font-semibold">{activeMembersCount} Passes Active</span>
              {suspendedMembersCount > 0 && (
                <>
                  <span>·</span>
                  <span className="text-[#d29922] font-semibold">{suspendedMembersCount} Suspended</span>
                </>
              )}
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#238636]/15 border border-[#238636]/30 text-[#3fb950] flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        {/* Tenant Admins KPI with Single Admin Alert */}
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between ${
            isSingleAdmin
              ? 'bg-[#d29922]/10 border-[#d29922]/40'
              : 'bg-[#161b22] border-[#30363d]'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#8b949e]">Tenant Admins</span>
              {isSingleAdmin && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#d29922]/20 text-[#e3b341]">
                  Single Admin
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-white mt-1">{activeAdmins.length}</div>
            <div className="text-[11px] text-[#8b949e] mt-1">
              {isSingleAdmin ? (
                <span className="text-[#e3b341]">Protect with backup admin</span>
              ) : (
                <span>Distributed Governance</span>
              )}
            </div>
          </div>
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              isSingleAdmin
                ? 'bg-[#d29922]/20 border border-[#d29922]/40 text-[#e3b341]'
                : 'bg-[#f85149]/15 border border-[#f85149]/30 text-[#ff7b72]'
            }`}
          >
            <Shield className="w-5 h-5" />
          </div>
        </div>

        {/* Pending Invitations KPI */}
        <div
          onClick={() => setActiveTab('INVITATIONS')}
          className="p-4 bg-[#161b22] border border-[#30363d] rounded-2xl flex items-center justify-between cursor-pointer hover:border-[#58a6ff]/50 transition-colors"
        >
          <div>
            <span className="text-xs font-medium text-[#8b949e]">Pending Invitations</span>
            <div className="text-2xl font-bold text-white mt-1">{pendingInvitations.length}</div>
            <div className="text-[11px] text-[#58a6ff] mt-1 flex items-center gap-1">
              <span>Review pending invites</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#d29922]/15 border border-[#d29922]/30 text-[#d29922] flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Single Admin Governance Advisory Banner */}
      {isSingleAdmin && (
        <div className="p-4 bg-[#d29922]/10 border border-[#d29922]/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#e3b341] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-white">Single Administrator Advisory</h4>
              <p className="text-[11px] text-[#e3b341]/90 mt-0.5 leading-relaxed">
                Your organization currently has only 1 active Tenant Admin (<span className="text-white font-semibold">{activeAdmins[0]?.name}</span>). To ensure continuous governance and avoid account lockouts, promote a second administrator.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => setIsAddUserOpen(true)}
            className="text-xs py-1.5 px-3 bg-[#d29922]/20 hover:bg-[#d29922]/30 text-[#e3b341] border border-[#d29922]/40 whitespace-nowrap shrink-0"
          >
            + Add Backup Admin
          </Button>
        </div>
      )}

      {/* Tabs & Search Filter Header */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-[#30363d]/80 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('USERS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'USERS'
                  ? 'bg-[#58a6ff] text-black shadow-sm'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Users
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/20 text-[10px]">
                {tenantUsers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('MEMBERS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'MEMBERS'
                  ? 'bg-[#238636] text-white shadow-sm'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Members &amp; Vehicles
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/20 text-[10px]">
                {membersWithProfile.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('INVITATIONS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'INVITATIONS'
                  ? 'bg-[#d29922] text-black shadow-sm'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Invitations
              {pendingInvitations.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-bold">
                  {pendingInvitations.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'AUDIT'
                  ? 'bg-[#30363d] text-white shadow-sm'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Audit Logs
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, email, member ID, plate..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-[#0d0e12] border border-[#30363d] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-[#8b949e]/60 focus:border-[#58a6ff] focus:outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-2 text-[#8b949e] hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
            {/* Role Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[#8b949e] text-[11px]">Role:</span>
              <select
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
                className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-hidden focus:border-[#58a6ff]"
              >
                <option value="ALL">All Roles</option>
                <option value="TENANT_ADMIN">Tenant Admin</option>
                <option value="SITE_MANAGER">Site Manager</option>
                <option value="MEMBER">Member</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[#8b949e] text-[11px]">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-hidden focus:border-[#58a6ff]"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="PENDING">Pending</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>

            {/* Membership Type Filter (Only visible on Members tab or all) */}
            {activeTab === 'MEMBERS' && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-[#8b949e] text-[11px]">Type:</span>
                <select
                  value={membershipTypeFilter}
                  onChange={(e) => handleMembershipTypeFilterChange(e.target.value)}
                  className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-hidden focus:border-[#58a6ff]"
                >
                  <option value="ALL">All Types</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="STAFF">Staff / Security</option>
                  <option value="RESIDENT">Resident</option>
                  <option value="CUSTOMER">Customer / VIP</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            )}

            {(searchTerm || roleFilter !== 'ALL' || statusFilter !== 'ALL' || membershipTypeFilter !== 'ALL') && (
              <Button
                variant="secondary"
                onClick={handleClearFilters}
                className="text-[11px] py-1 px-2.5 text-[#8b949e] hover:text-white"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USERS TABLE */}
      {/* ========================================================================= */}
      {activeTab === 'USERS' && (
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Business Membership</th>
                  <th className="py-3 px-4">Last Sign-In</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]/60 font-medium">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#8b949e]">
                      <Users className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                      <p className="font-semibold text-white">No users match the criteria</p>
                      <p className="text-xs mt-1">Try adjusting search query or active filters</p>
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-[#21262d]/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedUserForDetail(user)}
                    >
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff] flex items-center justify-center font-bold text-xs shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-white text-xs group-hover:text-[#58a6ff] transition-colors">
                              {user.name}
                            </div>
                            <div className="text-[11px] font-mono text-[#8b949e]">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span
                          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded ${
                            user.role === 'TENANT_ADMIN'
                              ? 'bg-[#f85149]/15 text-[#ff7b72] border border-[#f85149]/30'
                              : user.role === 'SITE_MANAGER'
                              ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                              : 'bg-[#58a6ff]/15 text-[#58a6ff] border border-[#58a6ff]/30'
                          }`}
                        >
                          {getRoleLabel(user.role)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            user.status === 'ACTIVE'
                              ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                              : user.status === 'PENDING'
                              ? 'bg-[#d29922]/15 text-[#d29922] border border-[#d29922]/30'
                              : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                          }`}
                        >
                          {user.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3" />}
                          {user.status === 'PENDING' && <Clock className="w-3 h-3" />}
                          {user.status === 'INACTIVE' && <UserX className="w-3 h-3" />}
                          {user.status}
                        </span>
                      </td>

                      {/* Membership & Vehicles */}
                      <td className="py-3 px-4">
                        {user.membership ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-[#58a6ff] bg-[#0d0e12] px-2 py-0.5 rounded border border-[#30363d]">
                              {user.membership.memberCode}
                            </span>
                            <span className="text-[11px] text-[#8b949e]">
                              {user.membership.vehicles.length} vehicle(s)
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#8b949e] text-[11px] italic">Auth-only (No pass)</span>
                        )}
                      </td>

                      {/* Last Sign In */}
                      <td className="py-3 px-4 font-mono text-[#8b949e] text-[11px]">
                        {user.lastLoginAt ? (
                          new Date(user.lastLoginAt).toLocaleString()
                        ) : (
                          <span className="italic text-[#8b949e]/60">Never</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            onClick={() => setSelectedUserForRole(user)}
                            className="text-[11px] py-1 px-2 bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]"
                          >
                            <Shield className="w-3 h-3 text-[#58a6ff]" />
                            Role
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => setSelectedUserForPassword(user)}
                            className="text-[11px] py-1 px-2 bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]"
                            title="Reset password"
                          >
                            <Key className="w-3 h-3 text-[#e3b341]" />
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => setSelectedUserForDeactivate(user)}
                            className={`text-[11px] py-1 px-2 border ${
                              user.status === 'ACTIVE'
                                ? 'bg-[#f85149]/10 text-[#ff7b72] border-[#f85149]/30 hover:bg-[#f85149]/20'
                                : 'bg-[#238636]/10 text-[#3fb950] border-[#238636]/30 hover:bg-[#238636]/20'
                            }`}
                          >
                            {user.status === 'ACTIVE' ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                          </Button>
                        </div>
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
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Member ID &amp; Name</th>
                  <th className="py-3 px-4">Type &amp; Department</th>
                  <th className="py-3 px-4">Membership Status</th>
                  <th className="py-3 px-4">Registered Vehicle Plates</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-right">Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]/60 font-medium">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#8b949e]">
                      <Layers className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                      <p className="font-semibold text-white">No members match the criteria</p>
                    </td>
                  </tr>
                ) : (
                  paginatedMembers.map((user) => {
                    const m = user.membership!;
                    return (
                      <tr
                        key={user.id}
                        className="hover:bg-[#21262d]/60 transition-colors group cursor-pointer"
                        onClick={() => setSelectedUserForDetail(user)}
                      >
                        {/* Member ID & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center font-bold text-xs shrink-0">
                              {m.fullName.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-white text-xs group-hover:text-[#58a6ff] transition-colors flex items-center gap-2">
                                <span>{m.fullName}</span>
                                <span className="font-mono text-[10px] text-[#58a6ff] bg-[#0d0e12] px-1.5 py-0.2 rounded border border-[#30363d]">
                                  {m.memberCode}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-[#8b949e]">{user.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Type & Dept */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{m.type}</div>
                          <div className="text-[11px] text-[#8b949e]">{m.department || 'General'}</div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                              m.status === 'ACTIVE'
                                ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                                : m.status === 'SUSPENDED'
                                ? 'bg-[#d29922]/15 text-[#d29922] border border-[#d29922]/30'
                                : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                            }`}
                          >
                            {m.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3" />}
                            {m.status === 'SUSPENDED' && <Ban className="w-3 h-3" />}
                            {m.status}
                          </span>
                        </td>

                        {/* Registered Vehicles */}
                        <td className="py-3 px-4">
                          {m.vehicles.length === 0 ? (
                            <span className="text-[#8b949e] text-[11px] italic">No vehicles registered</span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {m.vehicles.map((v, i) => (
                                <span
                                  key={i}
                                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                                    v.status === 'ACTIVE'
                                      ? 'bg-[#0d0e12] border-[#30363d] text-white'
                                      : 'bg-[#f85149]/15 border-[#f85149]/30 text-[#ff7b72]'
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
                        <td className="py-3 px-4 font-mono text-[#8b949e] text-[11px]">
                          {new Date(m.joinedAt).toLocaleDateString()}
                        </td>

                        {/* Access Control Action Buttons */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {m.status === 'ACTIVE' ? (
                              <Button
                                variant="secondary"
                                onClick={() => setSelectedUserForMembership({ user, action: 'SUSPEND' })}
                                className="text-[11px] py-1 px-2.5 bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30 hover:bg-[#d29922]/25"
                              >
                                <Ban className="w-3 h-3" />
                                Suspend Pass
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => setSelectedUserForMembership({ user, action: 'ACTIVATE' })}
                                className="text-[11px] py-1 px-2.5 bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30 hover:bg-[#238636]/25"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Reactivate
                              </Button>
                            )}
                          </div>
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
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Invited Email / Name</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Invited By</th>
                  <th className="py-3 px-4">Sent At</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]/60 font-medium">
                {filteredInvitations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#8b949e]">
                      <Mail className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                      <p className="font-semibold text-white">No invitations found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedInvitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#21262d]/60 transition-colors">
                      {/* Email & Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#21262d] border border-[#30363d] text-[#d29922] flex items-center justify-center font-bold text-xs shrink-0">
                            <Mail className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-white text-xs">{inv.fullName || inv.email}</div>
                            <div className="text-[11px] font-mono text-[#8b949e]">{inv.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#0d0e12] border border-[#30363d] text-[#58a6ff]">
                          {getRoleLabel(inv.role)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            inv.status === 'ACCEPTED'
                              ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                              : inv.status === 'PENDING'
                              ? 'bg-[#d29922]/15 text-[#d29922] border border-[#d29922]/30'
                              : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>

                      {/* Invited By */}
                      <td className="py-3 px-4 text-[#c9d1d9]">{inv.invitedBy}</td>

                      {/* Sent At */}
                      <td className="py-3 px-4 font-mono text-[#8b949e] text-[11px]">
                        {inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Expires At */}
                      <td className="py-3 px-4 font-mono text-[#8b949e] text-[11px]">
                        {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {inv.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              onClick={() => resendTenantInvitation(inv.id)}
                              className="text-[11px] py-1 px-2.5 bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] gap-1"
                            >
                              <Send className="w-3 h-3 text-[#58a6ff]" />
                              Resend
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => cancelTenantInvitation(inv.id)}
                              className="text-[11px] py-1 px-2.5 bg-[#f85149]/10 text-[#ff7b72] border border-[#f85149]/30 hover:bg-[#f85149]/20"
                            >
                              Revoke
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[#8b949e] text-[11px] italic">Resolved</span>
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
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden shadow-sm">
          <div className="p-4 bg-[#0d0e12] border-b border-[#30363d] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#58a6ff]" />
              <span className="text-xs font-bold text-white">Governance &amp; User Access Logs</span>
            </div>
            <span className="text-[11px] font-mono text-[#8b949e]">
              {filteredAuditLogs.length} events logged
            </span>
          </div>

          <div className="divide-y divide-[#30363d]/60">
            {filteredAuditLogs.length === 0 ? (
              <div className="p-12 text-center text-[#8b949e]">
                <History className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                <p className="font-semibold text-white">No audit records found</p>
              </div>
            ) : (
              paginatedAuditLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-[#21262d]/50 transition-colors space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-[#58a6ff] bg-[#58a6ff]/10 px-2 py-0.5 rounded border border-[#58a6ff]/20">
                        {log.action}
                      </span>
                      <span className="font-bold text-white">{log.targetUserName}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#8b949e]">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[#c9d1d9] text-xs leading-relaxed">{log.description}</p>
                  <div className="text-[11px] text-[#8b949e]">
                    Triggered by: <strong className="text-white">{log.actorName}</strong>
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
