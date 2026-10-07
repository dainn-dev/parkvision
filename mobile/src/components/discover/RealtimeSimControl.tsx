import React from 'react';
import { Activity, Plus, Minus, Play, Pause } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface RealtimeSimControlProps {
  onSimulateEntry: () => void;
  onSimulateExit: () => void;
  isAutoStreaming: boolean;
  onToggleAutoStream: () => void;
  lastUpdatedTime: string;
}

export const RealtimeSimControl: React.FC<RealtimeSimControlProps> = ({
  onSimulateEntry,
  onSimulateExit,
  isAutoStreaming,
  onToggleAutoStream,
  lastUpdatedTime
}) => {
  const { t } = useLanguage();

  return (
    <div className="mx-4 my-2 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg backdrop-blur-md flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
          <Activity className={`w-4 h-4 ${isAutoStreaming ? 'animate-spin' : ''}`} />
        </div>
        <div>
          <div className="font-bold text-slate-100 flex items-center gap-1.5">
            <span>{t('cameraStream')}</span>
            {isAutoStreaming ? (
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">{t('live')}</span>
            ) : (
              <span className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded font-mono">{t('paused')}</span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">{t('updated')}: {lastUpdatedTime}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onSimulateEntry}
          className="px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-bold rounded-lg transition-colors flex items-center gap-1"
          title={t('simulateEntryTitle')}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('carEntry')}</span>
        </button>

        <button
          onClick={onSimulateExit}
          className="px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-300 font-bold rounded-lg transition-colors flex items-center gap-1"
          title={t('simulateExitTitle')}
        >
          <Minus className="w-3.5 h-3.5" />
          <span>{t('carExit')}</span>
        </button>

        <button
          onClick={onToggleAutoStream}
          className={`p-1.5 rounded-lg border transition-colors ${
            isAutoStreaming
              ? 'bg-blue-600 text-white border-blue-500'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
          title={isAutoStreaming ? t('pauseStream') : t('startStream')}
        >
          {isAutoStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};

