import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Building2,
  Plus,
  Search,
  Filter,
  MapPin,
  Camera,
  DoorOpen,
  HardDrive,
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  LayoutGrid,
  List,
  Sliders,
  Trash2,
  Edit,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { TenantSite } from '../../types/tenant';
import { SiteDetailDrawer } from '../../components/tenant/SiteDetailDrawer';
import { CreateSiteModal } from '../../components/tenant/CreateSiteModal';

export const TenantSitesPage: React.FC = () => {
  const { tenantSites, deleteTenantSite, setTenantNavTab } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HEALTHY' | 'WARNING' | 'INACTIVE'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const [selectedSite, setSelectedSite] = useState<TenantSite | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);

  const filteredSites = tenantSites.filter((site) => {
    const matchesSearch =
      site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      site.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      site.address.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || site.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleOpenSite = (site: TenantSite) => {
    setSelectedSite(site);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Site Facilities Management
            </h1>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
              {tenantSites.length} Total Facilities
            </span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Configure locations, ANPR camera arrays, automatic barrier gates, and edge node compute
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setTenantNavTab('gates')}
            className="text-xs text-[#58a6ff] border-[#30363d] hover:bg-[#21262d] gap-1.5"
          >
            <DoorOpen className="w-4 h-4 text-[#3fb950]" />
            Bản Đồ Barrier (D3.js)
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsAddSiteOpen(true)}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add New Site
          </Button>
        </div>
      </div>

      {/* Filter & View Mode Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
        <div className="flex items-center gap-3 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search by site name, code, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-[#0d0e12] border-[#30363d] text-white text-xs h-9"
            />
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1 bg-[#0d0e12] p-1 rounded-lg border border-[#30363d] text-xs">
            {(['ALL', 'HEALTHY', 'WARNING', 'INACTIVE'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] font-medium ${
                  statusFilter === st
                    ? 'bg-[#21262d] text-white font-semibold'
                    : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                {st === 'ALL' ? 'All Status' : st}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-[#0d0e12] p-1 rounded-lg border border-[#30363d]">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'grid' ? 'bg-[#21262d] text-[#58a6ff]' : 'text-[#8b949e]'
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              viewMode === 'table' ? 'bg-[#21262d] text-[#58a6ff]' : 'text-[#8b949e]'
            }`}
            title="Table View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSites.map((site) => {
            const occPercent = site.capacity ? Math.round(((site.currentOccupancy || 0) / site.capacity) * 100) : 0;

            return (
              <div
                key={site.id}
                className="rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/40 transition-all flex flex-col justify-between overflow-hidden group shadow-sm"
              >
                {/* Site Header */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0d0e12] border border-[#30363d] flex items-center justify-center text-[#58a6ff] shrink-0 font-bold group-hover:scale-105 transition-transform">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">{site.name}</h3>
                        <span className="font-mono text-[11px] text-[#58a6ff] font-semibold">
                          {site.code}
                        </span>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                      site.status === 'HEALTHY'
                        ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                        : site.status === 'WARNING'
                        ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                        : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#30363d]'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {site.status}
                    </span>
                  </div>

                  <p className="text-xs text-[#8b949e] flex items-center gap-1.5 line-clamp-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-[#8b949e]" />
                    {site.address}
                  </p>

                  {/* Hardware Status Metric Badges */}
                  <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                    <div className="p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                      <span className="text-[10px] text-[#8b949e] block">Cameras</span>
                      <span className="font-mono font-bold text-white text-xs">
                        {site.onlineCameraCount}/{site.cameraCount}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                      <span className="text-[10px] text-[#8b949e] block">Gates</span>
                      <span className="font-mono font-bold text-white text-xs">
                        {site.onlineGateCount}/{site.gateCount}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-[#0d0e12] border border-[#30363d]">
                      <span className="text-[10px] text-[#8b949e] block">Edge AI</span>
                      <span className="font-mono font-bold text-white text-xs">
                        {site.onlineEdgeDeviceCount}/{site.edgeDeviceCount}
                      </span>
                    </div>
                  </div>

                  {/* Occupancy Bar (if capacity > 0) */}
                  {site.capacity && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#8b949e]">Facility Occupancy</span>
                        <span className="text-white font-mono font-bold">
                          {site.currentOccupancy} / {site.capacity} ({occPercent}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#0d0e12] overflow-hidden border border-[#30363d]">
                        <div
                          className={`h-full rounded-full ${
                            occPercent > 80 ? 'bg-[#f85149]' : occPercent > 60 ? 'bg-[#d29922]' : 'bg-[#3fb950]'
                          }`}
                          style={{ width: `${occPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Operations Meta */}
                  <div className="flex items-center justify-between text-[11px] text-[#8b949e] pt-2 border-t border-[#30363d]/60">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#8b949e]" /> {site.operatingHours}
                    </span>
                    <span className="font-mono text-white font-semibold">
                      {site.todayAccessCount.toLocaleString()} accesses
                    </span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-5 py-3 border-t border-[#30363d] bg-[#0d0e12]/60 flex items-center justify-between">
                  <span className="text-[11px] text-[#8b949e]">
                    Manager: {site.managerName || 'Operations'}
                  </span>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenSite(site)}
                      className="text-xs bg-[#161b22] border-[#30363d] text-white hover:border-[#58a6ff] gap-1"
                    >
                      Manage Site <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Facility Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Lanes & Gates</th>
                  <th className="py-3 px-4">ANPR Cameras</th>
                  <th className="py-3 px-4">Edge Nodes</th>
                  <th className="py-3 px-4">Today's Access</th>
                  <th className="py-3 px-4">Operating Hours</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d]/60 font-medium">
                {filteredSites.map((site) => (
                  <tr key={site.id} className="hover:bg-[#21262d]/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#0d0e12] border border-[#30363d] flex items-center justify-center text-[#58a6ff] font-bold shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">{site.name}</span>
                            <span className="text-[10px] font-mono text-[#58a6ff] bg-[#0d0e12] px-1.5 py-0.5 rounded border border-[#30363d]">
                              {site.code}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#8b949e]">{site.address}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        site.status === 'HEALTHY'
                          ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                          : site.status === 'WARNING'
                          ? 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                          : 'bg-[#8b949e]/15 text-[#8b949e] border border-[#30363d]'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {site.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-white">
                      {site.onlineGateCount} / {site.gateCount} Gates ({site.lanesCount} Lanes)
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-white">
                      {site.onlineCameraCount} / {site.cameraCount} Online
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-white">
                      {site.onlineEdgeDeviceCount} / {site.edgeDeviceCount}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[#58a6ff] font-bold">
                      {site.todayAccessCount.toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap text-[#8b949e]">
                      {site.operatingHours}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenSite(site)}
                        className="text-xs bg-[#0d0e12] border-[#30363d] text-[#c9d1d9] hover:text-white hover:border-[#58a6ff]"
                      >
                        Inspect →
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DRAWERS & MODALS */}
      <SiteDetailDrawer
        site={selectedSite}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      <CreateSiteModal
        isOpen={isAddSiteOpen}
        onClose={() => setIsAddSiteOpen(false)}
      />
    </div>
  );
};
