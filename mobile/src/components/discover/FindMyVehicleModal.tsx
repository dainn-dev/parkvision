import React, { useState, useEffect } from 'react';
import { X, Navigation, Car, MapPin, Loader2 } from 'lucide-react';
import { ActiveParkingSession } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { locatePlate } from '../../api/public';
import { PublicLocateOut } from '../../api/types';

interface FindMyVehicleModalProps {
  isOpen: boolean;
  session: ActiveParkingSession | null;
  onClose: () => void;
}

export const FindMyVehicleModal: React.FC<FindMyVehicleModalProps> = ({
  isOpen,
  session,
  onClose
}) => {
  const { t } = useLanguage();
  const [location, setLocation] = useState<PublicLocateOut | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setLocation(null);
    if (!isOpen || !session) return;
    setLocating(true);
    locatePlate(session.tenantSlug, session.vehiclePlate)
      .then(setLocation)
      .catch(() => setLocation(null))
      .finally(() => setLocating(false));
  }, [isOpen, session?.id]);

  if (!isOpen || !session) return null;

  const zoneText =
    location?.found && (location.zoneName || location.levelName)
      ? [location.levelName, location.zoneName].filter(Boolean).join(' · ')
      : null;

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
                {zoneText ?? session.tenantName}
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

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-slate-200 flex-1">
          {/* Location panel */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-400 text-slate-950 font-mono font-bold rounded-lg text-sm">
                {session.vehiclePlate}
              </div>
              <div className="flex-1">
                {locating ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('locatingVehicle')}</span>
                  </div>
                ) : zoneText ? (
                  <>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                      <span>{zoneText}</span>
                    </div>
                    {location?.sinceAt && (
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {t('parkedSince')} {new Date(location.sinceAt).toLocaleTimeString()}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-slate-400">{t('notLocatedYet')}</div>
                )}
              </div>
            </div>
          </div>

          {/* ANPR entry photo */}
          {session.entrancePhotoUrl ? (
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
                {session.anprConfidence != null && (
                  <span className="bg-blue-600/90 text-white font-bold px-2.5 py-1 rounded-lg">
                    ANPR: {Math.round(session.anprConfidence)}%
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Car className="w-3.5 h-3.5 text-blue-400" />
              {t('anprEntryLog')}
            </div>
            <div>
              {session.tenantName} · {new Date(session.entryTime).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Footer — payment is not supported yet */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-between items-center">
          <div className="text-xs font-mono">
            <span className="text-slate-400">{t('totalFee')}: </span>
            <span className="text-slate-300 font-bold text-sm">
              {session.currentFeeVnd != null ? `${session.currentFeeVnd.toLocaleString()} đ` : '—'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
