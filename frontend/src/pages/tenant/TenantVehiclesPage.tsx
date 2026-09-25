import React, { useState, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Car,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Building2,
  Trash2,
  Edit2,
  ShieldCheck,
  ShieldAlert,
  User,
  Tag,
  History,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  Filter,
  UserCheck,
  Ban,
  Eye,
  Archive,
  RefreshCw
} from 'lucide-react';
import { Button, Input, Pagination } from '../../components/ui';
import { TenantVehicle, VehicleType, VehicleStatus, VehicleAccessStatus } from '../../types/tenant';
import { AddVehicleModal } from '../../components/tenant/AddVehicleModal';
import { VehicleDetailsModal } from '../../components/tenant/vehicles/VehicleDetailsModal';
import { EditVehicleModal } from '../../components/tenant/vehicles/EditVehicleModal';
import { UpdatePlateModal } from '../../components/tenant/vehicles/UpdatePlateModal';
import { AssignMemberModal } from '../../components/tenant/vehicles/AssignMemberModal';
import { SuspendVehicleModal } from '../../components/tenant/vehicles/SuspendVehicleModal';
import { ImportVehiclesModal } from '../../components/tenant/vehicles/ImportVehiclesModal';

export const TenantVehiclesPage: React.FC = () => {
  const {
    tenantVehicles,
    activateTenantVehicle,
    deactivateTenantVehicle,
    archiveTenantVehicle
  } = usePlatform();

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [accessFilter, setAccessFilter] = useState<string>('ALL');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedVehicleForDetails, setSelectedVehicleForDetails] = useState<TenantVehicle | null>(null);
  const [selectedVehicleForEdit, setSelectedVehicleForEdit] = useState<TenantVehicle | null>(null);
  const [selectedVehicleForPlate, setSelectedVehicleForPlate] = useState<TenantVehicle | null>(null);
  const [selectedVehicleForAssign, setSelectedVehicleForAssign] = useState<TenantVehicle | null>(null);
  const [selectedVehicleForSuspend, setSelectedVehicleForSuspend] = useState<TenantVehicle | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filtered dataset
  const filteredVehicles = useMemo(() => {
    return tenantVehicles.filter((v) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        v.currentPlate.number.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.vin && v.vin.toLowerCase().includes(q)) ||
        (v.member && v.member.name.toLowerCase().includes(q)) ||
        (v.member && v.member.code.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || v.type === typeFilter;
      const matchesAccess = accessFilter === 'ALL' || v.accessStatus === accessFilter;
      const matchesAssignment =
        assignmentFilter === 'ALL' ||
        (assignmentFilter === 'ASSIGNED' && Boolean(v.memberId)) ||
        (assignmentFilter === 'UNASSIGNED' && !v.memberId);

      return matchesSearch && matchesStatus && matchesType && matchesAccess && matchesAssignment;
    });
  }, [tenantVehicles, searchQuery, statusFilter, typeFilter, accessFilter, assignmentFilter]);

  // Keep selected vehicle in details modal in sync with context
  const activeDetailsVehicle = useMemo(() => {
    if (!selectedVehicleForDetails) return null;
    return tenantVehicles.find((v) => v.id === selectedVehicleForDetails.id) || selectedVehicleForDetails;
  }, [tenantVehicles, selectedVehicleForDetails]);

  // Paginated subset
  const paginatedVehicles = useMemo(() => {
    return filteredVehicles.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredVehicles, currentPage, pageSize]);

  // Metrics KPI calculations
  const metrics = useMemo(() => {
    const total = tenantVehicles.length;
    const active = tenantVehicles.filter((v) => v.status === 'ACTIVE').length;
    const suspended = tenantVehicles.filter((v) => v.status === 'SUSPENDED').length;
    const allowed = tenantVehicles.filter((v) => v.accessStatus === 'ALLOWED').length;
    const assigned = tenantVehicles.filter((v) => Boolean(v.memberId)).length;
    const unassigned = total - assigned;

    return { total, active, suspended, allowed, assigned, unassigned };
  }, [tenantVehicles]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Car className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Vehicle Whitelist & Registry
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
              {tenantVehicles.length} Enrolled Vehicles
            </span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Manage authorized vehicles, license plate updates, member vehicle assignments, and ANPR barrier policies
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="text-xs h-9 gap-1.5 border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:text-white"
          >
            <UploadCloud className="w-4 h-4" />
            Bulk CSV Import
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsAddModalOpen(true)}
            className="text-xs h-9 bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Enroll Vehicle
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Total Enrolled</span>
            <div className="text-xl font-bold text-white mt-1">{metrics.total}</div>
            <span className="text-[10px] text-[#8b949e]">Registered in whitelist</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
            <Car className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Gate Allowed</span>
            <div className="text-xl font-bold text-[#3fb950] mt-1">{metrics.allowed}</div>
            <span className="text-[10px] text-[#8b949e]">Active whitelist pass</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#238636]/10 border border-[#238636]/30 text-[#3fb950] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Suspended</span>
            <div className="text-xl font-bold text-[#e3b341] mt-1">{metrics.suspended}</div>
            <span className="text-[10px] text-[#8b949e]">Access blocked</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 text-[#e3b341] flex items-center justify-center">
            <Ban className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
          <div>
            <span className="text-[11px] text-[#8b949e] font-medium block uppercase tracking-wider">Member Assigned</span>
            <div className="text-xl font-bold text-[#58a6ff] mt-1">{metrics.assigned}</div>
            <span className="text-[10px] text-[#8b949e]">{metrics.unassigned} unassigned fleet</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Toolbar */}
      <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Search by license plate, make, model, VIN, or owner name..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-[#0d0e12] border-[#30363d] text-white text-xs h-9"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">Status: All</option>
            <option value="ACTIVE">Status: Active</option>
            <option value="SUSPENDED">Status: Suspended</option>
            <option value="INACTIVE">Status: Inactive</option>
            <option value="ARCHIVED">Status: Archived</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">Category: All</option>
            <option value="CAR">Car / SUV</option>
            <option value="MOTORCYCLE">Motorcycle</option>
            <option value="VAN">Van</option>
            <option value="TRUCK">Truck</option>
            <option value="BUS">Bus</option>
          </select>

          {/* Access Filter */}
          <select
            value={accessFilter}
            onChange={(e) => {
              setAccessFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">Gate Access: All</option>
            <option value="ALLOWED">Gate Allowed</option>
            <option value="DENIED">Gate Denied</option>
          </select>

          {/* Assignment Filter */}
          <select
            value={assignmentFilter}
            onChange={(e) => {
              setAssignmentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">Ownership: All</option>
            <option value="ASSIGNED">Member Assigned</option>
            <option value="UNASSIGNED">Unassigned Fleet</option>
          </select>

          {(searchQuery || statusFilter !== 'ALL' || typeFilter !== 'ALL' || accessFilter !== 'ALL' || assignmentFilter !== 'ALL') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setTypeFilter('ALL');
                setAccessFilter('ALL');
                setAssignmentFilter('ALL');
                setCurrentPage(1);
              }}
              className="text-[11px] h-8 text-[#8b949e] hover:text-white"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
              <tr>
                <th className="py-3 px-4">License Plate</th>
                <th className="py-3 px-4">Vehicle Specs</th>
                <th className="py-3 px-4">Assigned Member / Owner</th>
                <th className="py-3 px-4">Gate Authorization</th>
                <th className="py-3 px-4">Lifecycle Status</th>
                <th className="py-3 px-4">Plates History</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]/60 font-medium">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#8b949e]">
                    <Car className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                    <p className="font-semibold text-white">No vehicles match your search</p>
                    <p className="text-xs mt-1">Try resetting your search query or filters</p>
                  </td>
                </tr>
              ) : (
                paginatedVehicles.map((vehicle) => {
                  const isSuspended = vehicle.status === 'SUSPENDED';

                  return (
                    <tr
                      key={vehicle.id}
                      className="hover:bg-[#21262d]/60 transition-colors cursor-pointer"
                      onClick={() => setSelectedVehicleForDetails(vehicle)}
                    >
                      {/* Plate */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white px-2.5 py-1 rounded bg-[#0d0e12] border border-[#30363d] text-xs tracking-wider">
                            {vehicle.currentPlate.number}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#8b949e] block mt-0.5">
                          {vehicle.currentPlate.province || 'Ho Chi Minh City'} ({vehicle.currentPlate.country})
                        </span>
                      </td>

                      {/* Specs */}
                      <td className="py-3.5 px-4 text-white">
                        <div className="font-semibold text-white">{vehicle.name}</div>
                        <div className="text-[11px] text-[#8b949e]">
                          {vehicle.type} · {vehicle.color || 'White'} {vehicle.year ? `· ${vehicle.year}` : ''}
                        </div>
                      </td>

                      {/* Assigned Member */}
                      <td className="py-3.5 px-4">
                        {vehicle.member ? (
                          <div>
                            <div className="flex items-center gap-1.5 font-semibold text-white">
                              <span>{vehicle.member.name}</span>
                              <span className="text-[10px] font-mono text-[#58a6ff] px-1 py-0.2 rounded bg-[#58a6ff]/10">
                                {vehicle.member.code}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#8b949e] block mt-0.5">
                              {vehicle.member.department || vehicle.member.type}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#21262d] text-[#8b949e]">
                            <User className="w-3 h-3" />
                            Unassigned Fleet
                          </span>
                        )}
                      </td>

                      {/* Access Decision */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            vehicle.accessStatus === 'ALLOWED'
                              ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                              : 'bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30'
                          }`}
                          title={vehicle.accessStatusReason}
                        >
                          {vehicle.accessStatus === 'ALLOWED' ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5" />
                          )}
                          {vehicle.accessStatus}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                            vehicle.status === 'ACTIVE'
                              ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                              : vehicle.status === 'SUSPENDED'
                              ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                              : vehicle.status === 'ARCHIVED'
                              ? 'bg-[#8b949e]/15 text-[#8b949e] border border-[#8b949e]/30'
                              : 'bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30'
                          }`}
                        >
                          {vehicle.status}
                        </span>
                      </td>

                      {/* Plate history count */}
                      <td className="py-3.5 px-4 text-[#8b949e] text-[11px]">
                        <span className="font-mono">
                          {1 + (vehicle.previousPlates?.length || 0)} plates
                        </span>
                        {vehicle.previousPlates && vehicle.previousPlates.length > 0 && (
                          <span className="text-[10px] text-[#58a6ff] block">
                            ({vehicle.previousPlates.length} previous)
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedVehicleForDetails(vehicle)}
                            className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                            title="View Details & History"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedVehicleForEdit(vehicle)}
                            className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-white transition-colors cursor-pointer"
                            title="Edit Vehicle Specs"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedVehicleForPlate(vehicle)}
                            className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-[#58a6ff] transition-colors cursor-pointer"
                            title="Update License Plate"
                          >
                            <Tag className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedVehicleForAssign(vehicle)}
                            className="p-1.5 rounded hover:bg-[#21262d] text-[#8b949e] hover:text-[#58a6ff] transition-colors cursor-pointer"
                            title="Assign / Reassign Member"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                          {isSuspended ? (
                            <button
                              onClick={() => activateTenantVehicle(vehicle.id)}
                              className="p-1.5 rounded hover:bg-[#238636]/20 text-[#3fb950] transition-colors cursor-pointer"
                              title="Reactivate Vehicle"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setSelectedVehicleForSuspend(vehicle)}
                              className="p-1.5 rounded hover:bg-[#d29922]/20 text-[#8b949e] hover:text-[#e3b341] transition-colors cursor-pointer"
                              title="Suspend Access"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
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

        {/* Pagination Bar */}
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filteredVehicles.length / pageSize) || 1}
          totalItems={filteredVehicles.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* MODALS */}
      <AddVehicleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />

      <ImportVehiclesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <VehicleDetailsModal
        vehicle={activeDetailsVehicle}
        isOpen={Boolean(selectedVehicleForDetails)}
        onClose={() => setSelectedVehicleForDetails(null)}
        onEdit={(v) => {
          setSelectedVehicleForDetails(null);
          setSelectedVehicleForEdit(v);
        }}
        onUpdatePlate={(v) => {
          setSelectedVehicleForDetails(null);
          setSelectedVehicleForPlate(v);
        }}
        onAssignMember={(v) => {
          setSelectedVehicleForDetails(null);
          setSelectedVehicleForAssign(v);
        }}
        onSuspend={(v) => {
          setSelectedVehicleForDetails(null);
          setSelectedVehicleForSuspend(v);
        }}
      />

      <EditVehicleModal
        vehicle={selectedVehicleForEdit}
        isOpen={Boolean(selectedVehicleForEdit)}
        onClose={() => setSelectedVehicleForEdit(null)}
      />

      <UpdatePlateModal
        vehicle={selectedVehicleForPlate}
        isOpen={Boolean(selectedVehicleForPlate)}
        onClose={() => setSelectedVehicleForPlate(null)}
      />

      <AssignMemberModal
        vehicle={selectedVehicleForAssign}
        isOpen={Boolean(selectedVehicleForAssign)}
        onClose={() => setSelectedVehicleForAssign(null)}
      />

      <SuspendVehicleModal
        vehicle={selectedVehicleForSuspend}
        isOpen={Boolean(selectedVehicleForSuspend)}
        onClose={() => setSelectedVehicleForSuspend(null)}
      />
    </div>
  );
};
