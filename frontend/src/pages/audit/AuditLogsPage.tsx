import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { platformApi, ApiError } from '../../services/api';
import { AuditLogItem } from '../../types/platform';
import {
  FileText,
  Search,
  Download,
  Filter,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Globe,
  Layers,
  Code
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Input,
  Select,
  Modal,
  Pagination,
  DiffViewer,
  JsonViewer
} from '../../components/ui';
import { useTranslation } from 'react-i18next';

export const AuditLogsPage: React.FC = () => {
  const { t } = useTranslation('audit');
  const { auditLogs, addToast } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [selectedAuditModal, setSelectedAuditModal] = useState<AuditLogItem | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'CSV' | 'JSON'>('CSV');
  const [isExporting, setIsExporting] = useState(false);

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resourceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.ipAddress.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || log.category === categoryFilter;
    const matchesResult = resultFilter === 'ALL' || log.result === resultFilter;

    return matchesSearch && matchesCategory && matchesResult;
  });

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `platform_audit_logs_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addToast({
      type: 'success',
      title: t('Audit Trail Exported'),
      description: t('Downloaded {{count}} matching audit logs in {{format}} format.', { count: filteredLogs.length, format: exportFormat })
    });
    setIsExportModalOpen(false);
  };

  const handleExport = async () => {
    // JSON exports the currently loaded page; CSV goes through the backend
    // job which covers the full filtered audit history, not just this page.
    if (exportFormat === 'JSON') {
      downloadJson();
      return;
    }
    setIsExporting(true);
    try {
      const job = await platformApi.exportAudit({});
      addToast({ type: 'info', title: t('Export queued'), description: t('Preparing CSV export…') });
      // Poll the job until the presigned download URL is ready.
      const deadline = Date.now() + 60_000;
      let done = job;
      while (done.status !== 'done' && done.status !== 'failed' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        done = await platformApi.job(job.id);
      }
      const url = done.status === 'done' ? (done.result as { downloadUrl?: string }).downloadUrl : undefined;
      if (!url) {
        throw new ApiError(500, { code: 'export_failed', message: done.error || 'Export job did not produce a download URL' });
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = `platform_audit_logs_${Date.now()}.csv`;
      link.click();
      addToast({
        type: 'success',
        title: t('Audit Trail Exported'),
        description: t('CSV export ready — {{count}} rows.', { count: done.rowCount ?? 0 })
      });
      setIsExportModalOpen(false);
    } catch (e) {
      addToast({
        type: 'error',
        title: t('Export failed'),
        description: e instanceof Error ? e.message : t('Could not export audit logs.')
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" /> {t('Platform Governance Audit Logs')}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t('Immutable, append-only record of administrative actions, credential rotations, and tenant lifecycle changes.')}
          </p>
        </div>

        <Button
          variant="secondary"
          icon={Download}
          onClick={() => setIsExportModalOpen(true)}
        >
          {t('Export Audit Trail')}
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80">
          <Input
            placeholder={t('Search audit action, actor email, IP...')}
            icon={Search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: 'ALL', label: t('All Event Categories') },
              { value: 'AUTHENTICATION', label: t('Authentication') },
              { value: 'TENANT_MANAGEMENT', label: t('Tenant Management') },
              { value: 'PLATFORM_ADMIN', label: t('Platform Admins') },
              { value: 'SECURITY', label: t('Security & Threats') },
              { value: 'CONFIGURATION', label: t('Configuration') },
              { value: 'MONITORING', label: t('Monitoring Incidents') }
            ]}
          />

          <Select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            options={[
              { value: 'ALL', label: t('All Results') },
              { value: 'SUCCESS', label: t('Success Only') },
              { value: 'FAILED', label: t('Failed Only') },
              { value: 'DENIED', label: t('Denied Only') }
            ]}
          />
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">{t('Timestamp (UTC)')}</th>
                <th className="py-3.5 px-4">{t('Actor')}</th>
                <th className="py-3.5 px-4">{t('Action Event')}</th>
                <th className="py-3.5 px-4">{t('Target Resource')}</th>
                <th className="py-3.5 px-4">{t('Result')}</th>
                <th className="py-3.5 px-4">{t('Source IP')}</th>
                <th className="py-3.5 px-4 text-right">{t('Details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {t('No matching audit events found.')}
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedAuditModal(log)}
                  >
                    <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-bold text-white block">{log.actorName}</span>
                      <span className="text-[11px] text-slate-400">{log.actorEmail}</span>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-300">
                      {log.action}
                    </td>

                    <td className="py-3.5 px-4">
                      <Badge variant="slate" size="sm">{log.resourceType}</Badge>
                      <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                        {log.resourceId}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <Badge variant={log.result === 'SUCCESS' ? 'emerald' : 'red'} dot>
                        {log.result}
                      </Badge>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-amber-300">
                      {log.ipAddress}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <Button variant="ghost" size="sm" icon={Eye} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={filteredLogs.length}
          pageSize={pageSize}
        />
      </Card>

      {/* Audit Detail Modal */}
      {selectedAuditModal && (
        <Modal
          isOpen={Boolean(selectedAuditModal)}
          onClose={() => setSelectedAuditModal(null)}
          title={t('Audit Event Detail: {{action}}', { action: selectedAuditModal.action })}
          subtitle={t('Event Reference ID: {{id}}', { id: selectedAuditModal.id })}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono">
              <div><span className="text-slate-500">{t('Timestamp:')}</span> {new Date(selectedAuditModal.timestamp).toISOString()}</div>
              <div><span className="text-slate-500">{t('Category:')}</span> {selectedAuditModal.category}</div>
              <div><span className="text-slate-500">{t('Actor Email:')}</span> {selectedAuditModal.actorEmail}</div>
              <div><span className="text-slate-500">{t('Actor Role:')}</span> {selectedAuditModal.actorType}</div>
              <div><span className="text-slate-500">{t('Source IP:')}</span> <span className="text-amber-300">{selectedAuditModal.ipAddress}</span></div>
              <div><span className="text-slate-500">{t('Source Type:')}</span> {selectedAuditModal.source}</div>
              <div><span className="text-slate-500">{t('Request ID:')}</span> {selectedAuditModal.requestId}</div>
              <div><span className="text-slate-500">{t('Trace ID:')}</span> {selectedAuditModal.traceId}</div>
            </div>

            {selectedAuditModal.changes && selectedAuditModal.changes.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
                  {t('Recorded Field Changes')}
                </h4>
                <DiffViewer changes={selectedAuditModal.changes} />
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAuditModal(null)}>
                {t('Close')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title={t('Export Governance Audit Logs')}
        subtitle={t('Exporting {{count}} matching audit log records', { count: filteredLogs.length })}
      >
        <div className="space-y-4 text-xs">
          <Select
            label={t('Export Format')}
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as any)}
            options={[
              { value: 'CSV', label: t('CSV (Comma Separated Spreadsheet)') },
              { value: 'JSON', label: t('JSON (Raw Structural Payload)') }
            ]}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" size="sm" onClick={() => setIsExportModalOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="primary" size="sm" icon={Download} onClick={handleExport} isLoading={isExporting} disabled={isExporting}>
              {isExporting ? t('Preparing Export…') : t('Download Export')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
