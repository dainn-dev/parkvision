import React, { useState } from 'react';
import { BarrierAnomalyResult } from '../../types/anomaly';
import {
  ShieldAlert,
  X,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Cpu,
  Flame,
  Layers,
  Lock,
  RefreshCw,
  Sliders,
  Radio,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import { Badge, Button } from '../ui';
import { useTranslation } from 'react-i18next';

interface BarrierAnomalyInspectorProps {
  anomaly: BarrierAnomalyResult | null;
  isOpen: boolean;
  onClose: () => void;
  onMitigate: (gateId: string, actionNote: string) => void;
}

export const BarrierAnomalyInspector: React.FC<BarrierAnomalyInspectorProps> = ({
  anomaly,
  isOpen,
  onClose,
  onMitigate
}) => {
  const { t } = useTranslation('monitoring');
  const [mitigationNote, setMitigationNote] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  if (!isOpen || !anomaly) return null;

  const { features } = anomaly;
  const isCritical = anomaly.severity === 'CRITICAL';
  const isHigh = anomaly.severity === 'HIGH';

  const handleApplyAction = (actionTitle: string) => {
    setIsApplying(true);
    setTimeout(() => {
      onMitigate(anomaly.gateId, actionTitle);
      setIsApplying(false);
      onClose();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex justify-end animate-in fade-in duration-[330ms]">
      <div className="bg-card border-l border-chart-5/40 w-full max-w-2xl h-full flex flex-col justify-between p-6 overflow-y-auto">
        {/* Top Header */}
        <div className="space-y-4 border-b border-border pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-chart-5/20 border border-chart-5/40 flex items-center justify-center text-chart-5 shrink-0 ">
                <Activity className="w-6 h-6 " />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={isCritical ? 'red' : isHigh ? 'amber' : 'purple'} dot size="sm">
                    ML HEURISTIC · {t(anomaly.severity)}
                  </Badge>
                  <span className="text-[11px] text-chart-5 bg-chart-5/10 border border-chart-5/60 px-2 py-0.5 rounded">
                    Score: {anomaly.anomalyScore}/100
                  </span>
                  <span className="text-xs text-muted-foreground ">{anomaly.detectedAt}</span>
                </div>
                <h3 className="text-lg font-medium text-foreground mt-1 leading-snug tracking-tight">
                  {anomaly.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {anomaly.siteName} · <span className="text-primary font-mono font-medium">{anomaly.gateName} ({anomaly.gateCode})</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Anomaly Score Bar */}
          <div className="bg-background p-3.5 rounded-xl border border-chart-5/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-chart-5 font-medium flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-chart-5" />
                {t('Heuristic Anomaly Score')}
              </span>
              <span className=" font-medium text-chart-5 text-sm">
                {anomaly.anomalyScore} / 100
              </span>
            </div>
            <div className="w-full bg-card h-2.5 rounded-full overflow-hidden border border-border">
              <div
                className="h-full rounded-full bg-card transition-colors duration-700"
                style={{ width: `${anomaly.anomalyScore}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('Based on multivariate distance model (Z-score + EWMA + Poisson distribution) analyzing real-time traffic.')}
            </p>
          </div>
        </div>

        {/* Middle Content */}
        <div className="flex-1 py-4 space-y-5 overflow-y-auto pr-1">
          {/* 1. Metric Breakdown Grid */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-chart-5" />
              {t('Statistical Features & Heuristic Parameters')}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-background p-3 rounded-xl border border-border space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('Observed Frequency')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className=" font-medium text-base text-chart-5">
                    {features.currentReqPerMin}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{t('req/min')}</span>
                </div>
                <span className="text-[11px] text-destructive block">
                  +{(features.burstRatio * 100 - 100).toFixed(0)}% {t('vs baseline')}
                </span>
              </div>

              <div className="bg-background p-3 rounded-xl border border-border space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('Historical Baseline (μ ± σ)')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className=" font-medium text-base text-foreground">
                    {features.baselineReqPerMin}
                  </span>
                  <span className="text-[11px] text-muted-foreground">± {features.baselineStdDev}</span>
                </div>
                <span className="text-[11px] text-muted-foreground block">
                  {t('3σ threshold: {{val}} req/m', { val: (features.baselineReqPerMin + 3 * features.baselineStdDev).toFixed(1) })}
                </span>
              </div>

              <div className="bg-background p-3 rounded-xl border border-border space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('Standard Deviation (Z-Score)')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className=" font-medium text-base text-chart-5">
                    +{features.zScore}σ
                  </span>
                </div>
                <span className="text-[11px] text-chart-5 block">
                  Poisson p &lt; 0.001
                </span>
              </div>

              <div className="bg-background p-3 rounded-xl border border-border space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('EWMA Rate (α=0.35)')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className=" font-medium text-base text-foreground">
                    {features.ewmaRate}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{t('req/min')}</span>
                </div>
                <span className="text-[11px] text-muted-foreground block">
                  {t('Smooths short-term fluctuations')}
                </span>
              </div>

              <div className="bg-background p-3 rounded-xl border border-border space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('Inter-Arrival Variance (Δt)')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className=" font-medium text-base text-warning">
                    {features.interArrivalVariance}s
                  </span>
                </div>
                <span className="text-[11px] text-warning block">
                  {t('Very low (bot spam signature)')}
                </span>
              </div>

              <div className="bg-background p-3 rounded-xl border border-border space-y-1">
                <span className="text-muted-foreground text-[11px] block">{t('Servo Motor Temperature')}</span>
                <div className="flex items-baseline gap-1.5">
                  <span className=" font-medium text-base text-foreground">
                    {features.motorTempC}°C
                  </span>
                </div>
                <span className="text-[11px] text-success block">
                  {t('5m cycles: {{count}}', { count: features.cyclesLast5Min })}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Historical Timeline Sparkline Visualization */}
          <div className="bg-background p-4 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{t('Request Frequency Trend (Last 10 Minutes)')}</span>
              <div className="flex items-center gap-3 text-[11px] ">
                <span className="flex items-center gap-1 text-chart-5">
                  <span className="w-2 h-2 bg-chart-5 rounded-sm" /> {t('Observed')}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <span className="w-2 h-0.5 bg-muted-foreground" /> Baseline
                </span>
              </div>
            </div>

            {/* Visual Bar Graph */}
            <div className="pt-2">
              <div className="grid grid-cols-6 gap-2 items-end h-28 border-b border-border pb-2">
                {anomaly.historicalWindow.observedFreq.map((val, idx) => {
                  const maxVal = Math.max(...anomaly.historicalWindow.observedFreq, 50);
                  const heightPercent = Math.min(100, Math.round((val / maxVal) * 100));
                  const isLast = idx === anomaly.historicalWindow.observedFreq.length - 1;

                  return (
                    <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[11px] text-chart-5">{val}</span>
                      <div className="w-full max-w-[28px] bg-card h-full rounded-t-md relative flex items-end overflow-hidden">
                        {/* Baseline line */}
                        <div
                          className="absolute w-full border-t border-dashed border-muted-foreground/60 z-10"
                          style={{ bottom: `${Math.round((features.baselineReqPerMin / maxVal) * 100)}%` }}
                        />
                        <div
                          className={`w-full rounded-t-md transition-colors duration-500 ${
                            isLast
                              ? 'bg-card '
                              : 'bg-chart-5/10'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {anomaly.historicalWindow.timestamps[idx]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Explainable AI Root Cause Hypothesis */}
          <div className="bg-background p-4 rounded-xl border border-chart-5/30 space-y-2">
            <h4 className="text-xs font-medium text-chart-5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-chart-5" />
              {t('Root Cause Hypothesis (Heuristic)')}
            </h4>
            <p className="text-xs text-foreground leading-relaxed bg-card p-3 rounded-lg border border-border">
              {anomaly.hypothesis}
            </p>
          </div>

          {/* 4. Tactical Recommended Mitigation */}
          <div className="bg-background p-4 rounded-xl border border-success/40 space-y-2.5">
            <h4 className="text-xs font-medium text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('Immediate Mitigation Recommendations')}
            </h4>
            <p className="text-xs text-foreground leading-relaxed">
              {anomaly.recommendedAction}
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button
                variant="success"
                size="sm"
                icon={Zap}
                disabled={isApplying}
                onClick={() => handleApplyAction(t('Edge rate-limiting enabled (2.5s/command)'))}
                className="text-xs font-medium "
              >
                {t('Enable Edge Rate-Limiting')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={Sliders}
                disabled={isApplying}
                onClick={() => handleApplyAction(t('Loop sensor delay increased to 3.5s'))}
                className="text-xs font-medium"
              >
                {t('Increase Loop Sensor Delay')}
              </Button>

              <Button
                variant="danger"
                size="sm"
                icon={Lock}
                disabled={isApplying}
                onClick={() => handleApplyAction(t('Temporarily locked attacked lane'))}
                className="text-xs font-medium"
              >
                {t('Temporarily Lock Lane')}
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Footer Actions */}
        <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            {t('Close')}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            disabled={isApplying}
            onClick={() => handleApplyAction(t('Reviewed & heuristic reset'))}
            className="text-xs font-medium"
          >
            {t('Mark Resolved & Reset Heuristic')}
          </Button>
        </div>
      </div>
    </div>
  );
};
