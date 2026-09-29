import React, { useMemo, useState } from 'react';
import { MapPinned, Plus, Layers, Car, X, Pencil } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { Button, Card, Select } from '../../components/ui';
import { ParkingMapCanvas } from '../../components/tenant/parking/ParkingMapCanvas';
import { VehicleLocatePanel } from '../../components/tenant/parking/VehicleLocatePanel';
import { ParkingLevelEditor } from '../../components/tenant/parking/ParkingLevelEditor';
import { ZoneEditorSheet } from '../../components/tenant/parking/ZoneEditorSheet';
import type { LocateOut, MapZoneOut, ZoneBounds } from '../../services/api';
import { useTranslation } from 'react-i18next';

export const TenantParkingMapPage: React.FC = () => {
  const {
    parkingMap,
    parkingPresences,
    tenantSites,
    currentUser,
    locateVehicleInLot,
    setTenantNavTab,
  } = usePlatform();
  const { t } = useTranslation('tenant');

  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [highlightZoneId, setHighlightZoneId] = useState<string | null>(null);
  const [locateResult, setLocateResult] = useState<LocateOut | null>(null);
  const [searching, setSearching] = useState(false);
  const [zonePopover, setZonePopover] = useState<MapZoneOut | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [levelEditorOpen, setLevelEditorOpen] = useState(false);
  const [zoneEditor, setZoneEditor] = useState<{ zone: MapZoneOut | null; bounds: ZoneBounds | null } | null>(null);

  const canWrite = /owner|admin|operator/i.test(currentUser.role);

  const levels = useMemo(
    () =>
      siteFilter === 'all'
        ? parkingMap
        : parkingMap.filter((l) => l.siteId === siteFilter),
    [parkingMap, siteFilter]
  );

  const selectedLevel = levels.find((l) => l.id === selectedLevelId) ?? levels[0] ?? null;
  const editorSite = useMemo(
    () => tenantSites.find((s) => s.id === (siteFilter !== 'all' ? siteFilter : selectedLevel?.siteId)) ?? tenantSites[0] ?? null,
    [tenantSites, siteFilter, selectedLevel]
  );

  const zonePlates = useMemo(() => {
    if (!zonePopover) return [];
    return parkingPresences.filter((p) => p.zoneId === zonePopover.id);
  }, [zonePopover, parkingPresences]);

  const handleLocate = async (plate: string): Promise<LocateOut | null> => {
    setSearching(true);
    try {
      const res = await locateVehicleInLot(plate);
      setLocateResult(res);
      if (res?.found && res.zone) {
        setHighlightZoneId(res.zone.id);
        if (res.zone.levelId) setSelectedLevelId(res.zone.levelId);
      } else {
        setHighlightZoneId(null);
      }
      return res;
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#161b22] p-6 rounded-2xl border border-[#30363d]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <MapPinned className="w-5 h-5 text-[#58a6ff]" />
            {t('Parking Lot Map')}
          </h2>
          <p className="text-xs text-[#8b949e] mt-1">
            {t('Levels, parking zones and plate-based vehicle locating — live from monitor cameras.')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tenantSites.length > 1 && (
            <Select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="min-w-[180px]"
              options={[
                { value: 'all', label: t('All sites') },
                ...tenantSites.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}
          {canWrite && (
            <>
              <Button
                variant="outline"
                className="text-xs gap-1.5"
                onClick={() => setLevelEditorOpen(true)}
              >
                <Layers className="w-3.5 h-3.5" />
                {t('Manage Levels')}
              </Button>
              <Button
                variant={editMode ? 'primary' : 'outline'}
                className="text-xs gap-1.5"
                onClick={() => setEditMode((v) => !v)}
              >
                <Pencil className="w-3.5 h-3.5" />
                {editMode ? t('Editing') : t('Edit map')}
              </Button>
            </>
          )}
        </div>
      </div>

      {levels.length === 0 ? (
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <Layers className="w-10 h-10 text-[#8b949e]" />
          <h3 className="text-sm font-bold text-white">{t('No parking map yet')}</h3>
          <p className="text-xs text-[#8b949e] max-w-md">
            {t('Create levels and zones so monitor cameras can record vehicle positions and guide users.')}
          </p>
          {canWrite && (
            <Button
              onClick={() => (editorSite ? setLevelEditorOpen(true) : setTenantNavTab('sites'))}
              className="mt-2"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t('Add first level')}
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <VehicleLocatePanel
              onLocate={handleLocate}
              result={locateResult}
              searching={searching}
            />

            {/* Zone detail popover */}
            {zonePopover && (
              <Card className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white font-mono">
                    {zonePopover.code ?? zonePopover.name}
                  </h4>
                  <button
                    onClick={() => setZonePopover(null)}
                    className="text-[#8b949e] hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-[#8b949e]">
                  {zonePopover.occupiedCount}{zonePopover.capacity ? `/${zonePopover.capacity}` : ''} {t('vehicles parked')}
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {zonePlates.length === 0 && (
                    <p className="text-[11px] text-[#8b949e] italic">{t('Empty')}</p>
                  )}
                  {zonePlates.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                      <Car className="w-3 h-3 text-[#58a6ff]" />
                      <span className="font-mono">{p.plateNumber}</span>
                      <span className="text-[10px] text-[#8b949e]">{p.status}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <Card className="lg:col-span-2 p-4">
            {editMode && canWrite && (
              <p className="text-[11px] text-[#58a6ff] mb-2">
                {t('Edit mode: drag on the map to draw a new zone, or click a zone to edit.')}
              </p>
            )}
            <ParkingMapCanvas
              levels={levels}
              selectedLevelId={selectedLevel?.id ?? null}
              onSelectLevel={setSelectedLevelId}
              highlightZoneId={highlightZoneId}
              editMode={editMode && canWrite}
              onZoneClick={(z) => {
                const full = parkingMap.flatMap((l) => l.zones).find((fz) => fz.id === z.id) ?? null;
                if (!full) return;
                if (editMode && canWrite) {
                  setZoneEditor({ zone: full, bounds: null });
                } else {
                  setZonePopover(full);
                  setHighlightZoneId(z.id);
                }
              }}
              onZoneDrawn={(bounds) => setZoneEditor({ zone: null, bounds })}
            />
          </Card>
        </div>
      )}

      {editorSite && (
        <ParkingLevelEditor
          site={editorSite}
          isOpen={levelEditorOpen}
          onClose={() => setLevelEditorOpen(false)}
        />
      )}
      {selectedLevel && zoneEditor && (
        <ZoneEditorSheet
          level={selectedLevel}
          zone={zoneEditor.zone}
          draftBounds={zoneEditor.bounds}
          isOpen
          onClose={() => setZoneEditor(null)}
        />
      )}
    </div>
  );
};
