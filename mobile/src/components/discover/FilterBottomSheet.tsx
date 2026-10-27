import React from 'react';
import { X, SlidersHorizontal, RotateCcw, Check, Car, Bike } from 'lucide-react';
import { FilterState } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onUpdateFilter: (updates: Partial<FilterState>) => void;
  onReset: () => void;
  totalResultsCount: number;
}

const ALL_FACILITIES = [
  "EV Charging",
  "Security",
  "CCTV",
  "Elevator",
  "24/7",
  "Overnight"
];

export const FilterBottomSheet: React.FC<FilterBottomSheetProps> = ({
  isOpen,
  onClose,
  filters,
  onUpdateFilter,
  onReset,
  totalResultsCount
}) => {
  if (!isOpen) return null;

  const { t } = useLanguage();

  const toggleFacility = (facility: string) => {
    const exists = filters.facilities.includes(facility);
    const newFacs = exists
      ? filters.facilities.filter(f => f !== facility)
      : [...filters.facilities, facility];
    onUpdateFilter({ facilities: newFacs });
  };

  const toggleParkingType = (type: string) => {
    const exists = filters.parkingTypes.includes(type);
    const newTypes = exists
      ? filters.parkingTypes.filter(t => t !== type)
      : [...filters.parkingTypes, type];
    onUpdateFilter({ parkingTypes: newTypes });
  };

  const renderFacilityLabel = (fac: string) => {
    if (fac === 'EV Charging') return `⚡ ${t('evCharger')}`;
    if (fac === '24/7') return t('access247');
    if (fac === 'Overnight') return t('overnight');
    return fac;
  };

  const renderParkingTypeLabel = (type: string) => {
    if (type === 'indoor') return t('indoor');
    if (type === 'outdoor') return t('outdoor');
    if (type === 'covered') return t('covered');
    return type;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Handle bar & Title */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">{t('filterTitle')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white flex items-center gap-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('reset')}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Filters Content */}
        <div className="p-4 overflow-y-auto space-y-6 text-slate-200">
          {/* Vehicle Type selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('vehicleType')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onUpdateFilter({ vehicleType: 'car' })}
                className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                  filters.vehicleType === 'car'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-750'
                }`}
              >
                <Car className="w-4 h-4" />
                <span>{t('carSuv')}</span>
              </button>
              <button
                onClick={() => onUpdateFilter({ vehicleType: 'motorcycle' })}
                className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
                  filters.vehicleType === 'motorcycle'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-750'
                }`}
              >
                <Bike className="w-4 h-4" />
                <span>{t('motorcycle')}</span>
              </button>
            </div>
          </div>

          {/* Availability Status */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('realtimeAvailability')}
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { key: 'all', label: t('showAll') },
                { key: 'available_now', label: t('availableNowFilter') },
                { key: 'limited', label: t('limitedSpotsFilter') },
                { key: 'hide_full', label: t('hideFullFilter') }
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => onUpdateFilter({ availability: opt.key as any })}
                  className={`p-2.5 rounded-xl border font-medium text-left flex items-center justify-between transition-all ${
                    filters.availability === opt.key
                      ? 'bg-blue-950/80 text-blue-300 border-blue-600 font-semibold'
                      : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-750'
                  }`}
                >
                  <span>{opt.label}</span>
                  {filters.availability === opt.key && <Check className="w-4 h-4 text-blue-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Max Distance Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {t('maxDistanceRadius')}
              </label>
              <span className="text-sm font-bold text-blue-400 font-mono">
                {filters.distanceKm} km
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[0.5, 1, 3, 5, 10].map((dist) => (
                <button
                  key={dist}
                  onClick={() => onUpdateFilter({ distanceKm: dist })}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                    filters.distanceKm === dist
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {dist < 1 ? `${dist * 1000}m` : `${dist}km`}
                </button>
              ))}
            </div>
          </div>

          {/* Max Hourly Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {t('maxHourlyRate')}
              </label>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                {(filters.maxHourlyPrice).toLocaleString()} đ{t('perHour')}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100000}
              step={5000}
              value={filters.maxHourlyPrice}
              onChange={(e) => onUpdateFilter({ maxHourlyPrice: Number(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none bg-slate-800 accent-emerald-500 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>0 đ</span>
              <span>100k đ</span>
            </div>
          </div>

          {/* Parking Structure Type */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('parkingType')}
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {['indoor', 'outdoor', 'covered'].map((type) => {
                const isSelected = filters.parkingTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleParkingType(type)}
                    className={`py-2.5 px-2 rounded-xl border capitalize font-medium transition-all ${
                      isSelected
                        ? 'bg-blue-950/80 text-blue-300 border-blue-600 font-semibold'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {renderParkingTypeLabel(type)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Facilities Checkboxes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {t('facilitiesAccess')}
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {ALL_FACILITIES.map((fac) => {
                const isSelected = filters.facilities.includes(fac);
                return (
                  <button
                    key={fac}
                    onClick={() => toggleFacility(fac)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                      isSelected
                        ? 'bg-blue-950/80 text-blue-300 border-blue-600 font-semibold'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <span>{renderFacilityLabel(fac)}</span>
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-blue-600 border-blue-500 text-white' : 'border-slate-600'
                    }`}>
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Membership Only Checkbox */}
          <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">{t('membershipOnly')}</div>
              <div className="text-xs text-slate-400">{t('membershipOnlyDesc')}</div>
            </div>
            <button
              onClick={() => onUpdateFilter({ membershipOnly: !filters.membershipOnly })}
              className={`w-12 h-6 rounded-full transition-colors p-1 relative ${
                filters.membershipOnly ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                filters.membershipOnly ? 'translate-x-6' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>

        {/* Footer Apply Button */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 sticky bottom-0 z-10 flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
          >
            <span>{t('applyFilters')} ({totalResultsCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
};

