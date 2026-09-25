import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { Button } from '../../ui';
import { usePlatform } from '../../../context/PlatformContext';

interface ImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportUsersModal: React.FC<ImportUsersModalProps> = ({ isOpen, onClose }) => {
  const { addToast } = usePlatform();
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFileName(e.dataTransfer.files[0].name);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileName(e.target.files[0].name);
    }
  };

  const handleImport = () => {
    if (!fileName) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      addToast({
        type: 'success',
        title: 'Users Imported Successfully',
        description: `Imported records from ${fileName}. Invitations dispatched.`
      });
      onClose();
    }, 800);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Bulk Import Users & Members</h2>
              <p className="text-xs text-[#8b949e]">Upload CSV spreadsheet to batch invite or provision</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
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
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              dragOver
                ? 'border-[#58a6ff] bg-[#58a6ff]/10'
                : 'border-[#30363d] bg-[#0d0e12] hover:border-[#8b949e]'
            }`}
          >
            <UploadCloud className="w-8 h-8 text-[#58a6ff] mx-auto mb-2" />
            <p className="font-bold text-white text-xs">
              {fileName ? fileName : 'Drag and drop your CSV file here'}
            </p>
            <p className="text-[11px] text-[#8b949e] mt-1">Supports UTF-8 CSV with standard header mapping</p>

            <label className="mt-3 inline-block">
              <span className="px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-semibold cursor-pointer border border-[#30363d] transition-colors">
                Browse File
              </span>
              <input type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
            </label>
          </div>

          {/* Template Download */}
          <div className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-[#58a6ff]" />
              <div>
                <div className="font-semibold text-white">Download Sample CSV Template</div>
                <div className="text-[11px] text-[#8b949e]">Includes columns for Name, Email, Role, Plates</div>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={downloadSampleCsv}
              className="text-[11px] py-1 px-2.5 bg-[#21262d] hover:bg-[#30363d] text-white gap-1 border border-[#30363d]"
            >
              <Download className="w-3 h-3" />
              Template
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12]/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!fileName || isProcessing}
            onClick={handleImport}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white font-bold gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isProcessing ? 'Processing CSV...' : 'Process Import'}
          </Button>
        </div>
      </div>
    </div>
  );
};
