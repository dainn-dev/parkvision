import React, { useEffect, useRef, useState } from 'react';
import { Search, Car, MapPin, Layers, Clock } from 'lucide-react';
import { publicApi, type PublicLocateOut, type PublicMapLevelOut } from '../../services/api';
import { ParkingMapCanvas } from '../../components/tenant/parking/ParkingMapCanvas';
import { Button, Input } from '../../components/ui';
import { useTranslation } from 'react-i18next';

interface FindMyCarPageProps {
  tenantSlug: string;
  initialPlate?: string;
}

export const FindMyCarPage: React.FC<FindMyCarPageProps> = ({ tenantSlug, initialPlate }) => {
  const { t } = useTranslation('landing');
  const [plate, setPlate] = useState(initialPlate ?? '');
  const [result, setResult] = useState<PublicLocateOut | null>(null);
  const [map, setMap] = useState<PublicMapLevelOut[] | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSearched = useRef(false);

  const doLocate = async (rawPlate: string) => {
    const p = rawPlate.trim();
    if (!tenantSlug || p.length < 4) return;
    setSearching(true);
    setError(null);
    try {
      const res = await publicApi.publicLocate(tenantSlug, p);
      setResult(res);
      if (res.found) {
        const levels = map ?? (await publicApi.publicParkingMap(tenantSlug));
        if (!map) setMap(levels);
        if (res.levelId) setSelectedLevelId(res.levelId);
      }
    } catch {
      setError(t('Lookup unavailable right now. Please try again later.'));
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  // Auto-search when both ?tenant= and ?plate= are present.
  useEffect(() => {
    if (autoSearched.current) return;
    if (tenantSlug && initialPlate && initialPlate.trim().length >= 4) {
      autoSearched.current = true;
      void doLocate(initialPlate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, initialPlate]);

  const locatedLevel = result?.found && map
    ? map.find((l) => l.id === result.levelId) ?? null
    : null;

  return (
    <div className="min-h-[70vh] bg-[#0d0e12] px-4 py-10 sm:py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] items-center justify-center shadow-lg shadow-[#58a6ff]/20">
            <Car className="w-7 h-7 text-slate-950" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">{t('Find your vehicle')}</h1>
          <p className="text-sm text-[#8b949e]">
            {t('Enter your license plate to see which level and zone your vehicle is parked in.')}
          </p>
        </div>

        {!tenantSlug ? (
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 text-center">
            <p className="text-sm text-[#f85149] font-semibold">{t('Invalid link')}</p>
            <p className="text-xs text-[#8b949e] mt-1">
              {t('This page requires the')} <span className="font-mono">?tenant=</span> {t('parameter of the parking lot. Please use the link provided by the facility.')}
            </p>
          </div>
        ) : (
          <>
            {/* Search */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void doLocate(plate);
              }}
              className="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-3"
            >
              <div className="flex-1">
                <Input
                  placeholder={t('Enter license plate, e.g. 51G12345')}
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="bg-[#0d0e12] border-[#30363d] text-white font-mono uppercase tracking-wider text-base py-3"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                isLoading={searching}
                disabled={plate.trim().length < 4}
                className="gap-1.5 shrink-0"
              >
                <Search className="w-4 h-4" />
                {t('Locate vehicle')}
              </Button>
            </form>

            {error && (
              <div className="bg-[#f85149]/10 border border-[#f85149]/40 rounded-xl px-4 py-3 text-xs text-[#f85149]">
                {error}
              </div>
            )}

            {/* Result */}
            {result && !result.found && (
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 text-center space-y-2">
                <MapPin className="w-8 h-8 text-[#8b949e] mx-auto" />
                <p className="text-sm font-bold text-white">{t('Vehicle not found')}</p>
                <p className="text-xs text-[#8b949e] max-w-md mx-auto">
                  {t('Plate {{plate}} is not currently in the lot, or the vehicle just moved and cameras have not synced yet. Double-check the plate or try again in a few minutes.', { plate: plate.trim().toUpperCase() })}
                </p>
              </div>
            )}

            {result?.found && (
              <div className="space-y-4">
                <div className="bg-[#238636]/10 border border-[#3fb950]/40 rounded-2xl p-5 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#3fb950]" />
                    <span className="text-xs text-[#8b949e]">{t('Level:')}</span>
                    <span className="text-sm font-bold text-white">
                      {result.levelName ?? locatedLevel?.name ?? '—'}
                      {result.levelCode ? ` (${result.levelCode})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#3fb950]" />
                    <span className="text-xs text-[#8b949e]">{t('Zone:')}</span>
                    <span className="text-sm font-bold text-white">
                      {result.zoneName ?? '—'}
                      {result.zoneCode ? ` (${result.zoneCode})` : ''}
                    </span>
                  </div>
                  {result.sinceAt && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#3fb950]" />
                      <span className="text-xs text-[#8b949e]">{t('Parked since:')}</span>
                      <span className="text-xs font-mono text-[#c9d1d9]">
                        {new Date(result.sinceAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {map && map.length > 0 && (
                  <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-4">
                    <ParkingMapCanvas
                      levels={map}
                      selectedLevelId={selectedLevelId}
                      onSelectLevel={setSelectedLevelId}
                      highlightZoneId={result.zoneId ?? null}
                    />
                    <p className="text-[11px] text-[#8b949e] mt-3 text-center">
                      {t('The highlighted zone is where your vehicle is parked.')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
