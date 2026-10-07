import React from 'react';
import { MapPin, Bell, Activity, ChevronDown } from 'lucide-react';
import { UserLocation } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { LanguageSelector } from '../common/LanguageSelector';

interface DiscoverHeaderProps {
  userLocation: UserLocation;
  onOpenLocationSelector: () => void;
  onOpenNotifications: () => void;
  unreadNotificationsCount?: number;
  isRealtimeActive?: boolean;
}

export const DiscoverHeader: React.FC<DiscoverHeaderProps> = ({
  userLocation,
  onOpenLocationSelector,
  onOpenNotifications,
  unreadNotificationsCount = 0,
  isRealtimeActive = true
}) => {
  const { t } = useLanguage();

  return (
    <header className="bg-slate-900 text-white px-4 pt-4 pb-3 border-b border-slate-800 shadow-md sticky top-0 z-30">
      <div className="flex items-center justify-between gap-2">
        {/* Location selector trigger */}
        <button
          onClick={onOpenLocationSelector}
          className="flex items-start gap-2 text-left group flex-1 max-w-[55%] sm:max-w-[65%]"
          aria-label="Select location"
        >
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg mt-0.5 group-hover:bg-blue-500/30 transition-colors">
            <MapPin className="w-4 h-4 text-blue-400 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span>{userLocation.isDetecting ? t('detectingLocation') : t('currentLocation')}</span>
              <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
            </div>
            <div className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">
              {userLocation.address || "Ho Chi Minh City"}
            </div>
          </div>
        </button>

        {/* Right side language toggle & notifications */}
        <div className="flex items-center gap-2">
          {/* EN / VI Language Switcher */}
          <LanguageSelector />

          {/* Notifications bell */}
          <button
            onClick={onOpenNotifications}
            className="relative p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors border border-slate-700/60"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-slate-300" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900 shadow-sm animate-bounce">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
          {t('whereToPark')}
        </h1>
        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
          <Activity className="w-3 h-3" />
          <span>{t('realtimeStream')}</span>
        </div>
      </div>
    </header>
  );
};
