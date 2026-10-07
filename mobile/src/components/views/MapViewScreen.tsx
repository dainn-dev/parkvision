import React, { useMemo, useState } from 'react';
import { ParkingMap } from '../discover/ParkingMap';
import { TenantPreviewSheet } from '../discover/TenantPreviewSheet';
import { Tenant, UserLocation } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { Sparkles } from 'lucide-react';

interface MapViewScreenProps {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  onSelectTenant: (tenant: Tenant) => void;
  userLocation: UserLocation;
  onRecenterGps: () => void;
  onOpenDetails: (tenant: Tenant) => void;
  onOpenDirections: (tenant: Tenant) => void;
}

export const MapViewScreen: React.FC<MapViewScreenProps> = ({
  tenants,
  selectedTenant,
  onSelectTenant,
  userLocation,
  onRecenterGps,
  onOpenDetails,
  onOpenDirections
}) => {
  const { t } = useLanguage();
  const [dismissedAutoSuggest, setDismissedAutoSuggest] = useState(false);

  // Find nearest tenant if none selected
  const nearestTenant = useMemo(() => {
    if (!tenants || tenants.length === 0) return null;
    return [...tenants].sort(
      (a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER)
    )[0];
  }, [tenants]);

  const activeTenant = selectedTenant || (!dismissedAutoSuggest ? nearestTenant : null);
  const isAutoSuggested = !selectedTenant && activeTenant !== null && activeTenant === nearestTenant;

  const handleClosePreview = () => {
    if (selectedTenant) {
      onSelectTenant(null as any);
    } else {
      setDismissedAutoSuggest(true);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-70px)] flex flex-col bg-slate-950 overflow-hidden">
      <div className="flex-1 relative h-full">
        <ParkingMap
          tenants={tenants}
          selectedTenant={activeTenant}
          onSelectTenant={(tenant) => {
            setDismissedAutoSuggest(false);
            onSelectTenant(tenant);
          }}
          userLocation={userLocation}
          onRecenterGps={onRecenterGps}
          fullHeight
        />

        {activeTenant && (
          <div className="absolute bottom-4 left-0 right-0 z-20 px-2 space-y-1.5">
            {isAutoSuggested && (
              <div className="mx-auto w-max bg-blue-600/90 text-white font-bold text-[11px] px-3 py-1 rounded-full shadow-lg border border-blue-400/40 backdrop-blur-md flex items-center gap-1.5 animate-bounce">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {t('suggestedNearest')}
                  {activeTenant.distanceMeters != null && ` (${Math.round(activeTenant.distanceMeters)}m)`}
                </span>
              </div>
            )}
            <TenantPreviewSheet
              tenant={activeTenant}
              onClose={handleClosePreview}
              onOpenDetails={onOpenDetails}
              onOpenDirections={onOpenDirections}
            />
          </div>
        )}
      </div>
    </div>
  );
};

