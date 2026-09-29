import React, { useState } from 'react';
import { Search, Car, MapPinned, Camera, Clock, AlertCircle } from 'lucide-react';
import { Button, Card, Input } from '../../ui';
import type { LocateOut } from '../../../services/api';
import { useTranslation } from 'react-i18next';

interface VehicleLocatePanelProps {
  onLocate: (plate: string) => Promise<LocateOut | null>;
  result: LocateOut | null;
  searching: boolean;
}

export const VehicleLocatePanel: React.FC<VehicleLocatePanelProps> = ({
  onLocate,
  result,
  searching,
}) => {
  const { t } = useTranslation('tenant');
  const [plate, setPlate] = useState('');

  const submit = async () => {
    const p = plate.trim();
    if (p.length < 4) return;
    await onLocate(p);
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-[#58a6ff]" />
          {t('Find vehicle in lot')}
        </h3>
        <p className="text-[11px] text-[#8b949e] mt-1">
          {t('Enter a plate number — the system will point to the zone where the vehicle is parked.')}
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="51F-123.45"
          className="font-mono"
        />
        <Button onClick={submit} disabled={searching || plate.trim().length < 4}>
          {searching ? '...' : t('Find')}
        </Button>
      </div>

      {result && !result.found && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#d29922]/10 border border-[#d29922]/30">
          <AlertCircle className="w-4 h-4 text-[#d29922] mt-0.5 shrink-0" />
          <p className="text-xs text-[#d29922]">{t('Vehicle not found in the lot.')}</p>
        </div>
      )}

      {result?.found && result.presence && (
        <div className="space-y-2 p-3 rounded-lg bg-[#58a6ff]/5 border border-[#58a6ff]/30">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-[#58a6ff]" />
            <span className="font-mono font-bold text-white text-sm">
              {result.presence.plateNumber}
            </span>
          </div>
          <div className="text-xs text-[#c9d1d9] space-y-1">
            <div className="flex items-center gap-2">
              <MapPinned className="w-3.5 h-3.5 text-[#3fb950] shrink-0" />
              <span>
                {result.level?.name}
                {result.level?.code ? ` (${result.level.code})` : ''} →{' '}
                <strong className="text-white">
                  {result.zone?.name}
                  {result.zone?.code ? ` · ${result.zone.code}` : ''}
                </strong>
              </span>
            </div>
            {result.cameraName && (
              <div className="flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />
                <span className="text-[#8b949e]">{t('Confirmed by {{name}}', { name: result.cameraName })}</span>
              </div>
            )}
            {result.presence.firstSeenAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />
                <span className="text-[#8b949e]">
                  {t('Parked since')} {new Date(result.presence.firstSeenAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
