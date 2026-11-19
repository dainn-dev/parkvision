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
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          {t('Find vehicle in lot')}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          {t('Enter a plate number — the system will point to the zone where the vehicle is parked.')}
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="51F-123.45"
          className=""
        />
        <Button onClick={submit} disabled={searching || plate.trim().length < 4}>
          {searching ? '...' : t('Find')}
        </Button>
      </div>

      {result && !result.found && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
          <p className="text-xs text-warning">{t('Vehicle not found in the lot.')}</p>
        </div>
      )}

      {result?.found && result.presence && (
        <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/30">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-primary" />
            <span className=" font-medium text-foreground text-sm">
              {result.presence.plateNumber}
            </span>
          </div>
          <div className="text-xs text-foreground space-y-1">
            <div className="flex items-center gap-2">
              <MapPinned className="w-3.5 h-3.5 text-success shrink-0" />
              <span>
                {result.level?.name}
                {result.level?.code ? ` (${result.level.code})` : ''} →{' '}
                <strong className="text-foreground">
                  {result.zone?.name}
                  {result.zone?.code ? ` · ${result.zone.code}` : ''}
                </strong>
              </span>
            </div>
            {result.cameraName && (
              <div className="flex items-center gap-2">
                <Camera className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{t('Confirmed by {{name}}', { name: result.cameraName })}</span>
              </div>
            )}
            {result.presence.firstSeenAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
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
