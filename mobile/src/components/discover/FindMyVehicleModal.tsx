import React, { useState } from 'react';
import { X, Navigation, Compass, Car } from 'lucide-react';
import { ActiveParkingSession } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface FindMyVehicleModalProps {
  isOpen: boolean;
  session: ActiveParkingSession | null;
  onClose: () => void;
  onPayEarly?: () => void;
}

export const FindMyVehicleModal: React.FC<FindMyVehicleModalProps> = ({
  isOpen,
  session,
  onClose,
  onPayEarly
}) => {
  if (!isOpen || !session) return null;

  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'map' | 'anpr' | 'directions'>('map');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <Navigation className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-bold text-white">{t('findMyVehicleTitle')}</h2>
              <div className="text-xs text-slate-400 font-mono">
                {t('spotLabel')} {session.floor} · {session.zone} · <span className="text-amber-400 font-bold">{session.spotNumber}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950 text-xs font-semibold text-slate-400">
          <button
            onClick={() => setActiveTab('map')}
            className={`py-2.5 text-center border-b-2 transition-colors ${
              activeTab === 'map' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('indoorFloorMap')}
          </button>
          <button
            onClick={() => setActiveTab('anpr')}
            className={`py-2.5 text-center border-b-2 transition-colors ${
              activeTab === 'anpr' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('anprPhoto')}
          </button>
          <button
            onClick={() => setActiveTab('directions')}
            className={`py-2.5 text-center border-b-2 transition-colors ${
              activeTab === 'directions' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('stepByStepPath')}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-slate-200 flex-1">
          {/* TAB 1: INDOOR MAP */}
          {activeTab === 'map' && (
            <div className="space-y-3">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl relative overflow-hidden">
                {/* Visual indoor parking grid layout */}
                <div className="text-xs text-slate-400 font-mono mb-2 flex justify-between">
                  <span>{t('pedestrianEntrance')}</span>
                  <span>{t('targetSpot')} {session.spotNumber}</span>
                </div>

                <div className="relative border-2 border-dashed border-slate-700 rounded-xl p-4 bg-slate-900/60 min-h-[200px] flex flex-col justify-between">
                  {/* Entrance Marker */}
                  <div className="flex items-center gap-1 text-xs font-semibold text-blue-400 bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/30 w-max">
                    <Compass className="w-3.5 h-3.5" />
                    <span>{t('elevatorLobbyB')}</span>
                  </div>

                  {/* Dotted path */}
                  <div className="my-3 border-l-2 border-dashed border-blue-500 pl-4 space-y-2 text-xs font-mono text-slate-300">
                    <div className="text-slate-400">{t('walkStraight')}</div>
                    <div className="text-slate-400">{t('turnLeft')}</div>
                    <div className="text-emerald-400 font-bold">{t('slotOnRight')}</div>
                  </div>

                  {/* Target Spot Highlight */}
                  <div className="p-3 bg-gradient-to-r from-amber-500/20 to-blue-500/20 border-2 border-amber-400 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-amber-400 text-slate-950 font-bold rounded-lg font-mono text-sm">
                        {session.vehiclePlate}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white">{session.floor} - {session.spotNumber}</div>
                        <div className="text-[10px] text-emerald-400 font-mono">{t('pulsingLightOn')}</div>
                      </div>
                    </div>
                    <Car className="w-6 h-6 text-amber-400 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ANPR PHOTO */}
          {activeTab === 'anpr' && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-950">
                <img
                  src={session.entrancePhotoUrl}
                  alt="ANPR Entrance Capture"
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-mono">
                  <span className="bg-slate-900/90 text-amber-400 font-bold px-2.5 py-1 rounded-lg border border-amber-400/40">
                    Plate: {session.vehiclePlate}
                  </span>
                  <span className="bg-blue-600/90 text-white font-bold px-2.5 py-1 rounded-lg">
                    ANPR: 99.4%
                  </span>
                </div>
              </div>
              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-white">{t('anprEntryLog')}</div>
                <div>{t('gateNorthEntrance')} · {new Date(session.entryTime).toLocaleTimeString()}</div>
              </div>
            </div>
          )}

          {/* TAB 3: STEP BY STEP PATH */}
          {activeTab === 'directions' && (
            <div className="space-y-2 text-xs">
              {[
                { step: 1, title: t('takeElevator'), desc: t('elevatorSub') },
                { step: 2, title: t('turnLeftSign'), desc: t('followLights') },
                { step: 3, title: t('arrivePillar'), desc: t('carParkedSlot') }
              ].map((item) => (
                <div key={item.step} className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <div className="font-bold text-white">{item.title}</div>
                    <div className="text-slate-400 mt-0.5">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-between items-center">
          <div className="text-xs font-mono">
            <span className="text-slate-400">{t('totalFee')}: </span>
            <span className="text-emerald-400 font-bold text-sm">{session.currentFeeVnd.toLocaleString()} đ</span>
          </div>

          <button
            onClick={() => {
              if (onPayEarly) onPayEarly();
              onClose();
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            {t('payExitFeeEarly')}
          </button>
        </div>
      </div>
    </div>
  );
};

