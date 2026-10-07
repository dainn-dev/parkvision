import React from 'react';
import { DollarSign, MapPin, SlidersHorizontal, Clock } from 'lucide-react';
import { FilterState } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface FilterChipsProps {
  filters: FilterState;
  onUpdateFilter: (updates: Partial<FilterState>) => void;
  onOpenMoreFilters: () => void;
  activeCount: number;
}

export const FilterChips: React.FC<FilterChipsProps> = ({
  filters,
  onUpdateFilter,
  onOpenMoreFilters,
  activeCount
}) => {
  const { t } = useLanguage();

  return (
    <div className="bg-slate-900 border-b border-slate-800/80 px-4 py-2.5 overflow-x-auto no-scrollbar scroll-smooth flex items-center gap-2 z-10">
      {/* More Filters Trigger Button */}
      <button
        onClick={onOpenMoreFilters}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all border ${
          activeCount > 0
            ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/20'
            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>{t('filters')}</span>
        {activeCount > 0 && (
          <span className="w-4 h-4 bg-white text-blue-700 font-bold text-[10px] rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {/* Available Now Toggle Chip */}
      <button
        onClick={() => onUpdateFilter({
          availability: filters.availability === 'available_now' ? 'all' : 'available_now'
        })}
        className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all border ${
          filters.availability === 'available_now'
            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/80 font-semibold shadow-sm'
            : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${filters.availability === 'available_now' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
        <span>{t('availableNow')}</span>
      </button>

      {/* Distance Chip */}
      <button
        onClick={() => {
          const nextDistances = [1, 3, 5, 10];
          const currIdx = nextDistances.indexOf(filters.distanceKm);
          const nextDist = nextDistances[(currIdx + 1) % nextDistances.length];
          onUpdateFilter({ distanceKm: nextDist });
        }}
        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/80 hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap transition-all"
      >
        <MapPin className="w-3.5 h-3.5 text-blue-400" />
        <span>{t('withinRadius')} {filters.distanceKm}km</span>
      </button>

      {/* Hourly Price Chip */}
      <button
        onClick={() => {
          const nextPrices = [20000, 30000, 50000, 100000];
          const currIdx = nextPrices.indexOf(filters.maxHourlyPrice);
          const nextPrice = nextPrices[(currIdx + 1) % nextPrices.length];
          onUpdateFilter({ maxHourlyPrice: nextPrice });
        }}
        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/80 hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap transition-all"
      >
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
        <span>≤ {(filters.maxHourlyPrice / 1000).toLocaleString()}k/h</span>
      </button>

      {/* 24/7 Facility Toggle Chip */}
      <button
        onClick={() => {
          const has247 = filters.facilities.includes('24/7');
          const newFacilities = has247
            ? filters.facilities.filter(f => f !== '24/7')
            : [...filters.facilities, '24/7'];
          onUpdateFilter({ facilities: newFacilities });
        }}
        className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all border ${
          filters.facilities.includes('24/7')
            ? 'bg-purple-950/80 text-purple-300 border-purple-600/80 font-semibold'
            : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700'
        }`}
      >
        <Clock className="w-3.5 h-3.5 text-purple-400" />
        <span>{t('access247')}</span>
      </button>

      {/* EV Charging Chip */}
      <button
        onClick={() => {
          const hasEV = filters.facilities.includes('EV Charging');
          const newFacilities = hasEV
            ? filters.facilities.filter(f => f !== 'EV Charging')
            : [...filters.facilities, 'EV Charging'];
          onUpdateFilter({ facilities: newFacilities });
        }}
        className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all border ${
          filters.facilities.includes('EV Charging')
            ? 'bg-teal-950/80 text-teal-300 border-teal-600/80 font-semibold'
            : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700'
        }`}
      >
        <span>⚡ {t('evCharger')}</span>
      </button>
    </div>
  );
};
