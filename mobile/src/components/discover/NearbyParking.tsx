import React from 'react';
import { ParkingCard } from './ParkingCard';
import { Tenant, FilterState } from '../../types';
import { ArrowUpDown, MapPinOff } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface NearbyParkingProps {
  tenants: Tenant[];
  onOpenDetails: (tenant: Tenant) => void;
  onOpenDirections: (tenant: Tenant) => void;
  onToggleFavorite: (tenantId: string) => void;
  sortBy: FilterState['sortBy'];
  onSortChange: (sortBy: FilterState['sortBy']) => void;
  isLoading?: boolean;
  onClearFilters?: () => void;
}

export const NearbyParking: React.FC<NearbyParkingProps> = ({
  tenants,
  onOpenDetails,
  onOpenDirections,
  onToggleFavorite,
  sortBy,
  onSortChange,
  isLoading = false,
  onClearFilters
}) => {
  const { t } = useLanguage();

  return (
    <section className="p-4 space-y-3 bg-slate-950 min-h-[400px]">
      {/* Header & Sort Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>{t('nearbyParking')}</span>
            <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
              {tenants.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400">{t('sortedByDistance')}</p>
        </div>

        {/* Sort Selector Dropdown */}
        <div className="relative flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-300">
          <ArrowUpDown className="w-3.5 h-3.5 text-blue-400" />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as FilterState['sortBy'])}
            className="bg-transparent text-slate-200 focus:outline-none cursor-pointer pr-1 text-xs"
          >
            <option value="recommended" className="bg-slate-900 text-white">{t('recommended')}</option>
            <option value="nearest" className="bg-slate-900 text-white">{t('nearestFirst')}</option>
            <option value="cheapest" className="bg-slate-900 text-white">{t('cheapestRate')}</option>
            <option value="availability" className="bg-slate-900 text-white">{t('mostAvailable')}</option>
            <option value="rating" className="bg-slate-900 text-white">{t('bestRated')}</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton State */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse space-y-3">
              <div className="flex gap-3">
                <div className="w-20 h-20 bg-slate-800 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-3/4" />
                  <div className="h-3 bg-slate-800 rounded w-1/2" />
                  <div className="h-5 bg-slate-800 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tenants.length === 0 ? (
        /* Empty State */
        <div className="p-8 text-center bg-slate-900/60 border border-slate-800/80 rounded-2xl my-4 space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <MapPinOff className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-white">{t('noParkingNearby')}</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            {t('noParkingDesc')}
          </p>
          <div className="pt-2 flex justify-center gap-2">
            {onClearFilters && (
              <button
                onClick={onClearFilters}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-md shadow-blue-600/20"
              >
                {t('clearAllFilters')}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Parking Cards Grid / List */
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <ParkingCard
              key={tenant.id}
              tenant={tenant}
              onOpenDetails={onOpenDetails}
              onOpenDirections={onOpenDirections}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </section>
  );
};
