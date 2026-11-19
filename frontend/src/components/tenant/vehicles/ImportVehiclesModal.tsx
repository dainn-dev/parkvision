import React, { useState } from 'react';
import { VehicleType } from '../../../types/tenant';
import { usePlatform } from '../../../context/PlatformContext';
import { X, Check, UploadCloud, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Button } from '../../ui';
import { useTranslation } from 'react-i18next';

interface ImportVehiclesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportVehiclesModal: React.FC<ImportVehiclesModalProps> = ({
  isOpen,
  onClose
}) => {
  const { importTenantVehicles } = usePlatform();
  const { t } = useTranslation('tenant');

  const SAMPLE_CSV = `Make,Model,Type,Plate,Color,Year,OwnerName
Toyota,Corolla Altis,CAR,51H-123.45,Silver,2023,Nguyen Van A
Mazda,CX-5,CAR,51K-998.22,Soul Red,2024,Tran Thi B
VinFast,VF8,CAR,29E-888.11,Deep Ocean,2024,Le Quang C
Honda,SH 150i,MOTORCYCLE,59P1-456.78,Black,2022,Pham Minh D
Ford,Transit Delivery,VAN,51D-334.56,White,2021,Contractor Lead`;

  const [rawText, setRawText] = useState(SAMPLE_CSV);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultSummary, setResultSummary] = useState<{ imported: number; duplicates: number } | null>(null);

  if (!isOpen) return null;

  const handleParseAndImport = async () => {
    setIsProcessing(true);
    setResultSummary(null);

    const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      setIsProcessing(false);
      return;
    }

    const itemsToImport: Array<{
      type: VehicleType;
      make: string;
      model: string;
      year?: number;
      color?: string;
      vin?: string;
      plate: string;
      country?: string;
      province?: string;
      memberId?: string | null;
    }> = [];

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (parts.length >= 4) {
        const make = parts[0] || 'Generic';
        const model = parts[1] || 'Vehicle';
        const typeStr = (parts[2] || 'CAR').toUpperCase() as VehicleType;
        const plate = parts[3] || '';
        const color = parts[4] || 'White';
        const year = Number(parts[5]) || new Date().getFullYear();

        if (plate) {
          itemsToImport.push({
            make,
            model,
            type: ['CAR', 'MOTORCYCLE', 'VAN', 'TRUCK', 'BUS', 'OTHER'].includes(typeStr) ? typeStr : 'CAR',
            plate,
            color,
            year,
            country: 'Vietnam',
            province: 'Ho Chi Minh City'
          });
        }
      }
    }

    const result = await importTenantVehicles(itemsToImport);
    setResultSummary({ imported: result.importedCount, duplicates: result.duplicateCount });
    setIsProcessing(false);

    if (result.importedCount > 0 && result.duplicateCount === 0) {
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 " onClick={onClose} />

      <div className="relative w-full max-w-lg bg-background border border-border rounded-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-[330ms]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 text-primary flex items-center justify-center">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground tracking-tight">{t('Bulk Import Vehicles')}</h3>
              <p className="text-xs text-muted-foreground">{t('Import multiple vehicles via CSV format')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:bg-border flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-foreground font-medium">
                {t('CSV Data (Comma Separated)')}
              </label>
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_CSV)}
                className="text-[11px] text-primary hover:underline cursor-pointer"
              >
                {t('Reset to Sample Template')}
              </button>
            </div>
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full bg-card border border-border rounded-lg p-3 text-foreground text-[11px] focus:outline-hidden focus:border-primary"
            />
          </div>

          {resultSummary && (
            <div className="p-3 rounded-xl bg-card border border-border flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-success/20 text-success flex items-center justify-center">
                <Check className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <span className="font-medium text-foreground">{t('Import Complete:')}</span> {t('{{count}} vehicles imported successfully.', { count: resultSummary.imported })}
                {resultSummary.duplicates > 0 && (
                  <span className="text-warning block text-[11px]">
                    {t('{{count}} skipped because plates already exist.', { count: resultSummary.duplicates })}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs"
            >
              {t('Cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isProcessing}
              onClick={handleParseAndImport}
              className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {t('Process & Import Vehicles')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
