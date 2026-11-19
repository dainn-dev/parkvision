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
import { useTranslation } from 'react-i18next';

export const TenantEventsPage: React.FC = () => {
  const { t } = useTranslation('tenant');
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
    // Real client-side CSV from the filtered set — Excel-friendly BOM + quoting.
    const header = ['Timestamp', 'Plate', 'Site', 'Gate', 'Lane', 'Direction', 'Decision', 'Reason', 'Confidence', 'Source'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filteredEvents.map((e) =>
      [e.timestamp, e.plate, e.siteName, e.gateName, e.laneName, e.direction, e.decision, e.reason ?? '', e.plateConfidence ?? 0, e.verifiedBy ?? '']
        .map(esc)
        .join(',')
    );
    const csv = '\ufeff' + [header.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-events-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToast({
      type: 'success',
      title: t('Export Generated'),
      description: t('Downloaded access verification log ({{count}} records).', { count: filteredEvents.length })
    });
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-[330ms]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/70 p-5 rounded-2xl border border-border ">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-xl md:text-2xl font-medium text-foreground tracking-tight">
              {t('Access Event Audit Stream')}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success border border-success/30">
              <span className="w-1.5 h-1.5 rounded-full bg-success " />
              {t('Live Telemetry')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Real-time optical license plate verification, gate decision rules, and operator overrides')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs bg-background border-border text-foreground hover:border-primary gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {t('Export Log (.CSV)')}
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
            <Input
              placeholder={t('Search plate, owner, or gate...')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 bg-background border-border text-foreground text-xs h-9"
            />
          </div>

          <select
            value={siteFilter}
            onChange={(e) => handleSiteChange(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-hidden"
          >
            <option value="ALL">{t('All Facilities')} ({tenantSites.length})</option>
            {tenantSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border text-xs">
            {(['ALL', 'ALLOWED', 'DENIED', 'BLOCKED', 'UNKNOWN'] as const).map((dec) => (
              <button
                key={dec}
                onClick={() => handleDecisionChange(dec)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer text-[11px] font-medium ${
                  decisionFilter === dec
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {dec === 'ALL' ? t('All Decisions') : t(dec)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background text-muted-foreground border-b border-border font-medium text-[11px]">
              <tr>
                <th className="py-3 px-4">{t('Timestamp')}</th>
                <th className="py-3 px-4">{t('License Plate')}</th>
                <th className="py-3 px-4">{t('Facility Site')}</th>
                <th className="py-3 px-4">{t('Gate & Direction')}</th>
                <th className="py-3 px-4">{t('Decision')}</th>
                <th className="py-3 px-4">{t('Registered Driver')}</th>
                <th className="py-3 px-4">{t('OCR Confidence')}</th>
                <th className="py-3 px-4 text-right">{t('Inspect')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-medium">
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="font-medium text-foreground">{t('No access events found')}</p>
                    <p className="text-xs mt-1">{t('Try adjusting search parameters or facility filters')}</p>
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => handleOpenDrawer(event)}
                    className="hover:bg-muted/60 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 text-muted-foreground text-[11px] whitespace-nowrap">
                      {event.timestamp} ({event.timeFormatted})
                    </td>

                    <td className="py-3.5 px-4">
                      <span className=" font-medium text-foreground px-2.5 py-1 rounded bg-background border border-border group-hover:border-primary/40 transition-colors tracking-wider">
                        {event.plate}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-foreground whitespace-nowrap font-medium">
                      {event.siteName}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="text-foreground font-medium">{event.gateName}</span>
                      <span className="text-[11px] text-muted-foreground block ">
                        {event.laneName} · {event.direction === 'IN' ? t('↓ Inbound') : t('↑ Outbound')}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium ${
                        event.decision === 'ALLOWED'
                          ? 'bg-success/15 text-success border border-success/30'
                          : event.decision === 'DENIED'
                          ? 'bg-destructive/15 text-destructive border border-destructive/30'
                          : event.decision === 'BLOCKED'
                          ? 'bg-destructive/25 text-destructive border border-destructive/50'
                          : 'bg-warning/15 text-warning border border-warning/30'
                      }`}>
                        {event.decision === 'ALLOWED' && <CheckCircle2 className="w-3 h-3" />}
                        {event.decision === 'DENIED' && <XCircle className="w-3 h-3" />}
                        {event.decision === 'BLOCKED' && <Ban className="w-3 h-3" />}
                        {event.decision === 'UNKNOWN' && <AlertTriangle className="w-3 h-3" />}
                        {t(event.decision)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-foreground whitespace-nowrap">
                      <span>{event.ownerName || t('Unregistered')}</span>
                      {event.ownerType && (
                        <span className="text-[11px] text-muted-foreground block ">
                          ({event.ownerType})
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-success font-medium text-[11px]">
                      {(event.plateConfidence * 100).toFixed(1)}%
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs py-1 px-2 bg-background border-border text-muted-foreground group-hover:text-foreground group-hover:border-primary"
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
