import React, { useState, useMemo } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Activity,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  Clock,
  MapPin,
  ChevronRight,
  Download,
  RefreshCw,
  Eye
} from 'lucide-react';
import { Button, Input, Pagination } from '../../components/ui';
import { AccessEvent } from '../../types/tenant';
import { AccessEventDrawer } from '../../components/tenant/AccessEventDrawer';

export const TenantEventsPage: React.FC = () => {
  const { accessEvents, tenantSites, triggerGateCommand, addToast } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [siteFilter, setSiteFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'ALLOWED' | 'DENIED' | 'BLOCKED' | 'UNKNOWN'>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<AccessEvent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredEvents = useMemo(() => {
    return accessEvents.filter((event) => {
      const matchesSearch =
        event.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.gateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.ownerName && event.ownerName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSite = siteFilter === 'ALL' || event.siteId === siteFilter;
      const matchesDecision = decisionFilter === 'ALL' || event.decision === decisionFilter;

      return matchesSearch && matchesSite && matchesDecision;
    });
  }, [accessEvents, searchQuery, siteFilter, decisionFilter]);

  const paginatedEvents = useMemo(() => {
    return filteredEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [filteredEvents, currentPage, pageSize]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleSiteChange = (val: string) => {
    setSiteFilter(val);
    setCurrentPage(1);
  };

  const handleDecisionChange = (val: any) => {
    setDecisionFilter(val);
    setCurrentPage(1);
  };

  const handleOpenDrawer = (event: AccessEvent) => {
    setSelectedEvent(event);
    setIsDrawerOpen(true);
  };

  const handleExportCSV = () => {
    addToast({
      type: 'success',
      title: 'Export Generated',
      description: `Downloaded access verification log (${filteredEvents.length} records).`
    });
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Access Event Audit Stream
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse" />
              Live Telemetry
            </span>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Real-time optical license plate verification, gate decision rules, and operator overrides
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs bg-[#0d0e12] border-[#30363d] text-white hover:border-[#58a6ff] gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Log (.CSV)
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search plate, owner, or gate..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 bg-[#0d0e12] border-[#30363d] text-white text-xs h-9"
            />
          </div>

          <select
            value={siteFilter}
            onChange={(e) => handleSiteChange(e.target.value)}
            className="bg-[#0d0e12] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-hidden"
          >
            <option value="ALL">All Facilities ({tenantSites.length})</option>
            {tenantSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-[#0d0e12] p-1 rounded-lg border border-[#30363d] text-xs">
            {(['ALL', 'ALLOWED', 'DENIED', 'BLOCKED', 'UNKNOWN'] as const).map((dec) => (
              <button
                key={dec}
                onClick={() => handleDecisionChange(dec)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer text-[11px] font-medium ${
                  decisionFilter === dec
                    ? 'bg-[#21262d] text-white font-semibold'
                    : 'text-[#8b949e] hover:text-[#c9d1d9]'
                }`}
              >
                {dec === 'ALL' ? 'All Decisions' : dec}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="rounded-2xl bg-[#161b22] border border-[#30363d] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d0e12] text-[#8b949e] border-b border-[#30363d] uppercase font-semibold text-[10px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">License Plate</th>
                <th className="py-3 px-4">Facility Site</th>
                <th className="py-3 px-4">Gate & Direction</th>
                <th className="py-3 px-4">Decision</th>
                <th className="py-3 px-4">Registered Driver</th>
                <th className="py-3 px-4">OCR Confidence</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#30363d]/60 font-medium">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#8b949e]">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-[#8b949e]/50" />
                    <p className="font-semibold text-white">No access events found</p>
                    <p className="text-xs mt-1">Try adjusting search parameters or facility filters</p>
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => handleOpenDrawer(event)}
                    className="hover:bg-[#21262d]/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono text-[#8b949e] text-[11px] whitespace-nowrap">
                      {event.timestamp} ({event.timeFormatted})
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-white px-2.5 py-1 rounded bg-[#0d0e12] border border-[#30363d] group-hover:border-[#58a6ff]/40 transition-colors tracking-wider">
                        {event.plate}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-white whitespace-nowrap font-medium">
                      {event.siteName}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="text-white font-medium">{event.gateName}</span>
                      <span className="text-[10px] text-[#8b949e] block font-mono">
                        {event.laneName} · {event.direction === 'IN' ? '↓ Inbound' : '↑ Outbound'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                        event.decision === 'ALLOWED'
                          ? 'bg-[#238636]/15 text-[#3fb950] border border-[#238636]/30'
                          : event.decision === 'DENIED'
                          ? 'bg-[#da3633]/15 text-[#f85149] border border-[#da3633]/30'
                          : event.decision === 'BLOCKED'
                          ? 'bg-[#da3633]/25 text-[#ff7b72] border border-[#da3633]/50'
                          : 'bg-[#d29922]/15 text-[#e3b341] border border-[#d29922]/30'
                      }`}>
                        {event.decision === 'ALLOWED' && <CheckCircle2 className="w-3 h-3" />}
                        {event.decision === 'DENIED' && <XCircle className="w-3 h-3" />}
                        {event.decision === 'BLOCKED' && <Ban className="w-3 h-3" />}
                        {event.decision === 'UNKNOWN' && <AlertTriangle className="w-3 h-3" />}
                        {event.decision}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-[#c9d1d9] whitespace-nowrap">
                      <span>{event.ownerName || 'Unregistered'}</span>
                      {event.ownerType && (
                        <span className="text-[10px] text-[#8b949e] block font-mono">
                          ({event.ownerType})
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#3fb950] font-bold text-[11px]">
                      {(event.plateConfidence * 100).toFixed(1)}%
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs py-1 px-2 bg-[#0d0e12] border-[#30363d] text-[#8b949e] group-hover:text-white group-hover:border-[#58a6ff]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(filteredEvents.length / pageSize) || 1}
          totalItems={filteredEvents.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <AccessEventDrawer
        event={selectedEvent}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onOverride={(evt) => {
          triggerGateCommand(evt.gateId, 'OPEN');
          setIsDrawerOpen(false);
        }}
      />
    </div>
  );
};
