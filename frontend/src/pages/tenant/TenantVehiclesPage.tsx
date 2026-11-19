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
import { canTenantWrite } from '../../lib/permissions';
import { TenantVehicle, VehicleType, VehicleStatus, VehicleAccessStatus } from '../../types/tenant';
import { AddVehicleModal } from '../../components/tenant/AddVehicleModal';
import { VehicleDetailsModal } from '../../components/tenant/vehicles/VehicleDetailsModal';
import { EditVehicleModal } from '../../components/tenant/vehicles/EditVehicleModal';
import { UpdatePlateModal } from '../../components/tenant/vehicles/UpdatePlateModal';
import { AssignMemberModal } from '../../components/tenant/vehicles/AssignMemberModal';
import { SuspendVehicleModal } from '../../components/tenant/vehicles/SuspendVehicleModal';
import { ImportVehiclesModal } from '../../components/tenant/vehicles/ImportVehiclesModal';
import { useTranslation } from 'react-i18next';

export const TenantVehiclesPage: React.FC = () => {
  const { t } = useTranslation('tenant');
  const {
    tenantVehicles,
    activateTenantVehicle,
    deactivateTenantVehicle,
    archiveTenantVehicle,
    currentUser
  } = usePlatform();

  // Enroll/edit/suspend/reassign are WRITE_ROLES (owner/admin/operator) —
  // mirrors tenant/vehicles.py's `require_roles(*WRITE_ROLES)`.
  const canManage = canTenantWrite(currentUser.rawRole);

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
    <div className="space-y-6 pb-12 animate-in fade-in duration-[330ms]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/70 p-5 rounded-2xl border border-border ">
        <div>
          <div className="flex items-center gap-2.5">
            <Car className="w-6 h-6 text-primary" />
            <h1 className="text-xl md:text-2xl font-medium text-foreground tracking-tight">
              {t('Vehicle Whitelist & Registry')}
            </h1>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-muted border border-border text-primary">
              {t('{{count}} Enrolled Vehicles', { count: tenantVehicles.length })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Manage authorized vehicles, license plate updates, member vehicle assignments, and ANPR barrier policies')}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs h-9 gap-1.5 border-border bg-card text-foreground hover:text-foreground"
            >
              <UploadCloud className="w-4 h-4" />
              {t('Bulk CSV Import')}
            </Button>
            <Button
              variant="primary"
              onClick={() => setIsAddModalOpen(true)}
              className="text-xs h-9 bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 "
            >
              <Plus className="w-4 h-4" />
              {t('Enroll Vehicle')}
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-muted-foreground font-medium block ">{t('Total Enrolled')}</span>
            <div className="text-xl font-medium text-foreground mt-1">{metrics.total}</div>
            <span className="text-[11px] text-muted-foreground">{t('Registered in whitelist')}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
            <Car className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-muted-foreground font-medium block ">{t('Gate Allowed')}</span>
            <div className="text-xl font-medium text-success mt-1">{metrics.allowed}</div>
            <span className="text-[11px] text-muted-foreground">{t('Active whitelist pass')}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/30 text-success flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-muted-foreground font-medium block ">{t('Suspended')}</span>
            <div className="text-xl font-medium text-warning mt-1">{metrics.suspended}</div>
            <span className="text-[11px] text-muted-foreground">{t('Access blocked')}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-warning/10 border border-warning/30 text-warning flex items-center justify-center">
            <Ban className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
          <div>
            <span className="text-[11px] text-muted-foreground font-medium block ">{t('Member Assigned')}</span>
            <div className="text-xl font-medium text-primary mt-1">{metrics.assigned}</div>
            <span className="text-[11px] text-muted-foreground">{t('{{count}} unassigned fleet', { count: metrics.unassigned })}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Toolbar */}
      <div className="p-4 rounded-xl bg-card border border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
          <Input
            placeholder={t('Search by license plate, make, model, VIN, or owner name...')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-background border-border text-foreground text-xs h-9"
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
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-hidden"
          >
            <option value="ALL">{t('Status: All')}</option>
            <option value="ACTIVE">{t('Status: Active')}</option>
            <option value="SUSPENDED">{t('Status: Suspended')}</option>
            <option value="INACTIVE">{t('Status: Inactive')}</option>
            <option value="ARCHIVED">{t('Status: Archived')}</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-hidden"
          >
            <option value="ALL">{t('Category: All')}</option>
            <option value="CAR">{t('Car / SUV')}</option>
            <option value="MOTORCYCLE">{t('Motorcycle')}</option>
            <option value="VAN">{t('Van')}</option>
            <option value="TRUCK">{t('Truck')}</option>
            <option value="BUS">{t('Bus')}</option>
          </select>

          {/* Access Filter */}
          <select
            value={accessFilter}
            onChange={(e) => {
              setAccessFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-hidden"
          >
            <option value="ALL">{t('Gate Access: All')}</option>
            <option value="ALLOWED">{t('Gate Allowed')}</option>
            <option value="DENIED">{t('Gate Denied')}</option>
          </select>

          {/* Assignment Filter */}
          <select
            value={assignmentFilter}
            onChange={(e) => {
              setAssignmentFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-hidden"
          >
            <option value="ALL">{t('Ownership: All')}</option>
            <option value="ASSIGNED">{t('Member Assigned')}</option>
            <option value="UNASSIGNED">{t('Unassigned Fleet')}</option>
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
              className="text-[11px] h-8 text-muted-foreground hover:text-foreground"
            >
              {t('Reset Filters')}
            </Button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background text-muted-foreground border-b border-border font-medium text-[11px]">
              <tr>
                <th className="py-3 px-4">{t('License Plate')}</th>
                <th className="py-3 px-4">{t('Vehicle Specs')}</th>
                <th className="py-3 px-4">{t('Assigned Member / Owner')}</th>
                <th className="py-3 px-4">{t('Gate Authorization')}</th>
                <th className="py-3 px-4">{t('Lifecycle Status')}</th>
                <th className="py-3 px-4">{t('Plates History')}</th>
                <th className="py-3 px-4 text-right">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium">
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Car className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="font-medium text-foreground">{t('No vehicles match your search')}</p>
                    <p className="text-xs mt-1">{t('Try resetting your search query or filters')}</p>
                  </td>
                </tr>
              ) : (
                paginatedVehicles.map((vehicle) => {
                  const isSuspended = vehicle.status === 'SUSPENDED';

                  return (
                    <tr
                      key={vehicle.id}
                      className="hover:bg-muted/60 transition-colors cursor-pointer"
                      onClick={() => setSelectedVehicleForDetails(vehicle)}
                    >
                      {/* Plate */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className=" font-medium text-foreground px-2.5 py-1 rounded bg-background border border-border text-xs tracking-wider">
                            {vehicle.currentPlate.number}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground block mt-0.5">
                          {vehicle.currentPlate.province || t('Ho Chi Minh City')} ({vehicle.currentPlate.country})
                        </span>
                      </td>

                      {/* Specs */}
                      <td className="py-3.5 px-4 text-foreground">
                        <div className="font-medium text-foreground">{vehicle.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {t(vehicle.type)} · {vehicle.color || t('White')} {vehicle.year ? `· ${vehicle.year}` : ''}
                        </div>
                      </td>

                      {/* Assigned Member */}
                      <td className="py-3.5 px-4">
                        {vehicle.member ? (
                          <div>
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <span>{vehicle.member.name}</span>
                              <span className="text-[11px] text-primary px-1 py-0.2 rounded bg-primary/10">
                                {vehicle.member.code}
                              </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground block mt-0.5">
                              {vehicle.member.department || vehicle.member.type}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">
                            <User className="w-3 h-3" />
                            {t('Unassigned Fleet')}
                          </span>
                        )}
                      </td>

                      {/* Access Decision */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium ${
                            vehicle.accessStatus === 'ALLOWED'
                              ? 'bg-success/15 text-success border border-success/30'
                              : 'bg-destructive/15 text-destructive border border-destructive/30'
                          }`}
                          title={vehicle.accessStatusReason}
                        >
                          {vehicle.accessStatus === 'ALLOWED' ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5" />
                          )}
                          {t(vehicle.accessStatus)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                            vehicle.status === 'ACTIVE'
                              ? 'bg-success/15 text-success border border-success/30'
                              : vehicle.status === 'SUSPENDED'
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : vehicle.status === 'ARCHIVED'
                              ? 'bg-muted-foreground/15 text-muted-foreground border border-muted-foreground/30'
                              : 'bg-destructive/15 text-destructive border border-destructive/30'
                          }`}
                        >
                          {t(vehicle.status)}
                        </span>
                      </td>

                      {/* Plate history count */}
                      <td className="py-3.5 px-4 text-muted-foreground text-[11px]">
                        <span className="">
                          {t('{{count}} plates', { count: 1 + (vehicle.previousPlates?.length || 0) })}
                        </span>
                        {vehicle.previousPlates && vehicle.previousPlates.length > 0 && (
                          <span className="text-[11px] text-primary block">
                            ({t('{{count}} previous', { count: vehicle.previousPlates.length })})
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedVehicleForDetails(vehicle)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title={t('View Details & History')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canManage && (
                            <>
                              <button
                                onClick={() => setSelectedVehicleForEdit(vehicle)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                title={t('Edit Vehicle Specs')}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedVehicleForPlate(vehicle)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                title={t('Update License Plate')}
                              >
                                <Tag className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedVehicleForAssign(vehicle)}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                                title={t('Assign / Reassign Member')}
                              >
                                <UserCheck className="w-4 h-4" />
                              </button>
                              {isSuspended ? (
                                <button
                                  onClick={() => activateTenantVehicle(vehicle.id)}
                                  className="p-1.5 rounded hover:bg-success/20 text-success transition-colors cursor-pointer"
                                  title={t('Reactivate Vehicle')}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setSelectedVehicleForSuspend(vehicle)}
                                  className="p-1.5 rounded hover:bg-warning/20 text-muted-foreground hover:text-warning transition-colors cursor-pointer"
                                  title={t('Suspend Access')}
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              )}
                            </>
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
