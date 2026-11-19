import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { Button } from '../../ui';
import { usePlatform } from '../../../context/PlatformContext';
import { useTranslation } from 'react-i18next';

interface ImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ImportResult {
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: string[];
}

/** Minimal CSV parser: handles quoted fields, commas inside quotes, CRLF. */
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ImportUsersModal: React.FC<ImportUsersModalProps> = ({ isOpen, onClose }) => {
  const { addToast, importTenantUsers } = usePlatform();
  const { t } = useTranslation('tenant');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!isOpen) return null;

  const pickFile = (f: File | undefined) => {
    if (f) {
      setFile(f);
      setResult(null);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onClose();
  };

  const handleImport = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        addToast({ type: 'error', title: t('Import failed'), description: t('CSV has no data rows.') });
        return;
      }
      const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
      const col = (names: string[]) => headers.findIndex((h) => names.includes(h));
      const iName = col(['fullname', 'name']);
      const iEmail = col(['email', 'emailaddress']);
      const iRole = col(['role']);
      if (iEmail < 0) {
        addToast({
          type: 'error',
          title: t('Import failed'),
          description: t('CSV must contain an Email column.'),
        });
        return;
      }

      const skipped: string[] = [];
      const toInvite: Array<{ fullName: string; email: string; role: string }> = [];
      for (const r of rows.slice(1)) {
        const email = (r[iEmail] ?? '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) {
          skipped.push(email || `(row ${rows.indexOf(r) + 1})`);
          continue;
        }
        toInvite.push({
          fullName: iName >= 0 ? (r[iName] ?? '').trim() : '',
          email,
          role: iRole >= 0 ? (r[iRole] ?? '').trim() : '',
        });
      }

      const res = await importTenantUsers(toInvite);
      setResult({
        importedCount: res.importedCount,
        failedCount: res.failedCount,
        skippedCount: skipped.length,
        errors: [...skipped.map((s) => `${s}: ${t('missing or invalid email')}`), ...res.errors],
      });
      addToast({
        type: res.failedCount === 0 ? 'success' : 'warning',
        title: t('Import finished'),
        description: t('{{imported}} invited, {{failed}} failed, {{skipped}} skipped.', {
          imported: res.importedCount,
          failed: res.failedCount,
          skipped: skipped.length,
        }),
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: t('Import failed'),
        description: e instanceof Error ? e.message : t('Could not read the CSV file.'),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent = 'data:text/csv;charset=utf-8,Full Name,Email,Role,Membership Type,Department,Employee ID,Phone,Vehicle Plate,Vehicle Model\n'
      + 'Marcus Sterling,msterling@pwc.com,MEMBER,EMPLOYEE,Consulting,EMP-901,+84901234567,51H-123.45,Toyota Camry\n'
      + 'Le Thi Mai,mai.le@partner.vn,SITE_MANAGER,STAFF,Security,SEC-004,+84909876543,59A-998.12,Honda CR-V\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'tenant_users_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-[330ms]">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">{t('Bulk Import Users & Members')}</h2>
              <p className="text-xs text-muted-foreground">{t('Upload CSV spreadsheet to batch invite or provision')}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={`border border-dashed rounded-2xl p-6 text-center transition-colors ${
              dragOver
                ? 'border-primary bg-primary/10'
                : 'border-border bg-background hover:border-muted-foreground'
            }`}
          >
            <UploadCloud className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="font-medium text-foreground text-xs">
              {file ? file.name : t('Drag and drop your CSV file here')}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{t('Supports UTF-8 CSV with standard header mapping')}</p>

            <label className="mt-3 inline-block">
              <span className="px-3 py-1.5 rounded-lg bg-muted hover:bg-border text-foreground text-xs font-medium cursor-pointer border border-border transition-colors">
                {t('Browse File')}
              </span>
              <input type="file" accept=".csv" onChange={(e) => pickFile(e.target.files?.[0])} className="hidden" />
            </label>
          </div>

          {/* Result summary */}
          {result && (
            <div className="p-3.5 bg-background border border-border rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-foreground">
                {result.failedCount === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-warning" />
                )}
                {t('{{imported}} invited · {{failed}} failed · {{skipped}} skipped', {
                  imported: result.importedCount,
                  failed: result.failedCount,
                  skipped: result.skippedCount,
                })}
              </div>
              {result.errors.length > 0 && (
                <ul className="max-h-28 overflow-y-auto text-[11px] text-muted-foreground space-y-0.5 pt-1">
                  {result.errors.slice(0, 20).map((err, i) => (
                    <li key={i} className="truncate">{err}</li>
                  ))}
                  {result.errors.length > 20 && (
                    <li>{t('…and {{count}} more', { count: result.errors.length - 20 })}</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* Template Download */}
          <div className="p-3.5 bg-background border border-border rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-primary" />
              <div>
                <div className="font-medium text-foreground">{t('Download Sample CSV Template')}</div>
                <div className="text-[11px] text-muted-foreground">{t('Includes columns for Name, Email, Role, Plates')}</div>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={downloadSampleCsv}
              className="text-[11px] py-1 px-2.5 bg-muted hover:bg-border text-foreground gap-1 border border-border"
            >
              <Download className="w-3 h-3" />
              {t('Template')}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={handleClose} className="text-xs">
            {result ? t('Close') : t('Cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!file || isProcessing}
            onClick={handleImport}
            className="text-xs bg-primary hover:bg-primary/90 text-[#fff] font-medium gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isProcessing ? t('Processing CSV...') : t('Process Import')}
          </Button>
        </div>
      </div>
    </div>
  );
};
