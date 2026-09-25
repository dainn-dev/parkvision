import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
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

export const AuditLogsPage: React.FC = () => {
  const { auditLogs, addToast } = usePlatform();

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [selectedAuditModal, setSelectedAuditModal] = useState<AuditLogItem | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'CSV' | 'JSON'>('CSV');

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

  const handleExport = () => {
    const dataString =
      exportFormat === 'JSON'
        ? JSON.stringify(filteredLogs, null, 2)
        : 'Timestamp,Actor,Action,Resource,Result,IP\n' +
          filteredLogs
            .map(
              (l) =>
                `"${l.timestamp}","${l.actorEmail}","${l.action}","${l.resourceType}:${l.resourceId}","${l.result}","${l.ipAddress}"`
            )
            .join('\n');

    const blob = new Blob([dataString], {
      type: exportFormat === 'JSON' ? 'application/json' : 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `platform_audit_logs_${Date.now()}.${exportFormat.toLowerCase()}`;
    link.click();

    addToast({
      type: 'success',
      title: 'Audit Trail Exported',
      description: `Downloaded ${filteredLogs.length} matching audit logs in ${exportFormat} format.`
    });

    setIsExportModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" /> Platform Governance Audit Logs
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Immutable, append-only record of administrative actions, credential rotations, and tenant lifecycle changes.
          </p>
        </div>

        <Button
          variant="secondary"
          icon={Download}
          onClick={() => setIsExportModalOpen(true)}
        >
          Export Audit Trail
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80">
          <Input
            placeholder="Search audit action, actor email, IP..."
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
              { value: 'ALL', label: 'All Event Categories' },
              { value: 'AUTHENTICATION', label: 'Authentication' },
              { value: 'TENANT_MANAGEMENT', label: 'Tenant Management' },
              { value: 'PLATFORM_ADMIN', label: 'Platform Admins' },
              { value: 'SECURITY', label: 'Security & Threats' },
              { value: 'CONFIGURATION', label: 'Configuration' },
              { value: 'MONITORING', label: 'Monitoring Incidents' }
            ]}
          />

          <Select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Results' },
              { value: 'SUCCESS', label: 'Success Only' },
              { value: 'FAILED', label: 'Failed Only' },
              { value: 'DENIED', label: 'Denied Only' }
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
                <th className="py-3.5 px-4">Timestamp (UTC)</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action Event</th>
                <th className="py-3.5 px-4">Target Resource</th>
                <th className="py-3.5 px-4">Result</th>
                <th className="py-3.5 px-4">Source IP</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No matching audit events found.
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
          title={`Audit Event Detail: ${selectedAuditModal.action}`}
          subtitle={`Event Reference ID: ${selectedAuditModal.id}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono">
              <div><span className="text-slate-500">Timestamp:</span> {new Date(selectedAuditModal.timestamp).toISOString()}</div>
              <div><span className="text-slate-500">Category:</span> {selectedAuditModal.category}</div>
              <div><span className="text-slate-500">Actor Email:</span> {selectedAuditModal.actorEmail}</div>
              <div><span className="text-slate-500">Actor Role:</span> {selectedAuditModal.actorType}</div>
              <div><span className="text-slate-500">Source IP:</span> <span className="text-amber-300">{selectedAuditModal.ipAddress}</span></div>
              <div><span className="text-slate-500">Source Type:</span> {selectedAuditModal.source}</div>
              <div><span className="text-slate-500">Request ID:</span> {selectedAuditModal.requestId}</div>
              <div><span className="text-slate-500">Trace ID:</span> {selectedAuditModal.traceId}</div>
            </div>

            {selectedAuditModal.changes && selectedAuditModal.changes.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Recorded Field Changes
                </h4>
                <DiffViewer changes={selectedAuditModal.changes} />
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setSelectedAuditModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export Governance Audit Logs"
        subtitle={`Exporting ${filteredLogs.length} matching audit log records`}
      >
        <div className="space-y-4 text-xs">
          <Select
            label="Export Format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as any)}
            options={[
              { value: 'CSV', label: 'CSV (Comma Separated Spreadsheet)' },
              { value: 'JSON', label: 'JSON (Raw Structural Payload)' }
            ]}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" size="sm" onClick={() => setIsExportModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon={Download} onClick={handleExport}>
              Download Export
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
