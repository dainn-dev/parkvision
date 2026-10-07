import React from 'react';
import { Compass, Map, Car, CreditCard, User } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface BottomNavigationProps {
  activeTab: 'discover' | 'map' | 'parking' | 'memberships' | 'profile';
  onChangeTab: (tab: 'discover' | 'map' | 'parking' | 'memberships' | 'profile') => void;
  hasActiveSession?: boolean;
  membershipsCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  onChangeTab,
  hasActiveSession = false,
  membershipsCount = 0
}) => {
  const { t } = useLanguage();

  const tabs = [
    { id: 'discover', label: t('discover'), icon: Compass },
    { id: 'map', label: t('mapView'), icon: Map },
    {
      id: 'parking',
      label: t('myParking'),
      icon: Car,
      badge: hasActiveSession ? 'Active' : undefined
    },
    {
      id: 'memberships',
      label: t('memberships'),
      icon: CreditCard,
      count: membershipsCount
    },
    { id: 'profile', label: t('profile'), icon: User }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2 max-w-md mx-auto sm:max-w-xl">
      <div className="grid grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id as any)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative ${
                isActive
                  ? 'text-blue-400 font-bold bg-blue-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-2.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping border-2 border-slate-900" />
                )}
                {tab.count && tab.count > 0 ? (
                  <span className="absolute -top-1.5 -right-2 bg-blue-600 text-white font-bold text-[9px] px-1.5 py-0.2 rounded-full border border-slate-900">
                    {tab.count}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] tracking-tight mt-1 truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
