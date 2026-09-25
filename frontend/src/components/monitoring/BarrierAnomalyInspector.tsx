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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="bg-[#161b22] border-l border-purple-500/40 w-full max-w-2xl h-full flex flex-col justify-between shadow-2xl shadow-purple-950/50 p-6 overflow-y-auto">
        {/* Top Header */}
        <div className="space-y-4 border-b border-[#30363d] pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0 shadow-lg shadow-purple-950/40">
                <Activity className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={isCritical ? 'red' : isHigh ? 'amber' : 'purple'} dot size="sm">
                    ML HEURISTIC · {anomaly.severity}
                  </Badge>
                  <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded">
                    Score: {anomaly.anomalyScore}/100
                  </span>
                  <span className="text-xs text-[#8b949e] font-mono">{anomaly.detectedAt}</span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1 leading-snug tracking-tight">
                  {anomaly.title}
                </h3>
                <p className="text-xs text-[#8b949e] mt-0.5">
                  {anomaly.siteName} · <span className="text-[#58a6ff] font-mono font-semibold">{anomaly.gateName} ({anomaly.gateCode})</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Anomaly Score Bar */}
          <div className="bg-[#0d1117] p-3.5 rounded-xl border border-purple-900/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-300 font-semibold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                Chỉ Số Dị Thường Heuristic (Anomaly Score)
              </span>
              <span className="font-mono font-bold text-purple-200 text-sm">
                {anomaly.anomalyScore} / 100
              </span>
            </div>
            <div className="w-full bg-[#161b22] h-2.5 rounded-full overflow-hidden border border-[#30363d]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 transition-all duration-700"
                style={{ width: `${anomaly.anomalyScore}%` }}
              />
            </div>
            <p className="text-[11px] text-[#8b949e]">
              Dựa trên mô hình khoảng cách đa biến (Z-score + EWMA + Phân phối Poisson) phân tích lưu lượng thời gian thực.
            </p>
          </div>
        </div>

        {/* Middle Content */}
        <div className="flex-1 py-4 space-y-5 overflow-y-auto pr-1">
          {/* 1. Metric Breakdown Grid */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
              Đặc Trưng Thống Kê & Tham Số Heuristic (Features)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                <span className="text-[#8b949e] text-[10px] block">Tần Suất Quan Sát</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-base text-purple-300">
                    {features.currentReqPerMin}
                  </span>
                  <span className="text-[10px] text-[#8b949e]">req/phút</span>
                </div>
                <span className="text-[10px] text-red-400 font-mono block">
                  +{(features.burstRatio * 100 - 100).toFixed(0)}% so với chuẩn
                </span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                <span className="text-[#8b949e] text-[10px] block">Baseline Lịch Sử (μ ± σ)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-base text-white">
                    {features.baselineReqPerMin}
                  </span>
                  <span className="text-[10px] text-[#8b949e]">± {features.baselineStdDev}</span>
                </div>
                <span className="text-[10px] text-[#8b949e] font-mono block">
                  Ngưỡng 3σ: {(features.baselineReqPerMin + 3 * features.baselineStdDev).toFixed(1)} req/m
                </span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                <span className="text-[#8b949e] text-[10px] block">Độ Lệch Chuẩn (Z-Score)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-base text-purple-400">
                    +{features.zScore}σ
                  </span>
                </div>
                <span className="text-[10px] text-purple-300/80 font-mono block">
                  Poisson p &lt; 0.001
                </span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                <span className="text-[#8b949e] text-[10px] block">Tốc Độ EWMA (α=0.35)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-base text-white">
                    {features.ewmaRate}
                  </span>
                  <span className="text-[10px] text-[#8b949e]">req/phút</span>
                </div>
                <span className="text-[10px] text-[#8b949e] font-mono block">
                  Làm mượt dao động ngắn
                </span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                <span className="text-[#8b949e] text-[10px] block">Phương Sai Giãn Cách (Δt)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-base text-amber-300">
                    {features.interArrivalVariance}s
                  </span>
                </div>
                <span className="text-[10px] text-amber-400/80 font-mono block">
                  Rất thấp (Đặc trưng máy spam)
                </span>
              </div>

              <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                <span className="text-[#8b949e] text-[10px] block">Nhiệt Độ Động Cơ Servo</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-base text-white">
                    {features.motorTempC}°C
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono block">
                  Chu kỳ 5m: {features.cyclesLast5Min} lượt
                </span>
              </div>
            </div>
          </div>

          {/* 2. Historical Timeline Sparkline Visualization */}
          <div className="bg-[#0d1117] p-4 rounded-xl border border-[#30363d] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Diễn Biến Tần Suất Yêu Cầu (10 Phút Gần Nhất)</span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1 text-purple-400">
                  <span className="w-2 h-2 bg-purple-400 rounded-sm" /> Thực tế
                </span>
                <span className="flex items-center gap-1 text-[#8b949e]">
                  <span className="w-2 h-0.5 bg-[#8b949e]" /> Baseline
                </span>
              </div>
            </div>

            {/* Visual Bar Graph */}
            <div className="pt-2">
              <div className="grid grid-cols-6 gap-2 items-end h-28 border-b border-[#30363d] pb-2">
                {anomaly.historicalWindow.observedFreq.map((val, idx) => {
                  const maxVal = Math.max(...anomaly.historicalWindow.observedFreq, 50);
                  const heightPercent = Math.min(100, Math.round((val / maxVal) * 100));
                  const isLast = idx === anomaly.historicalWindow.observedFreq.length - 1;

                  return (
                    <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[10px] font-mono text-purple-200">{val}</span>
                      <div className="w-full max-w-[28px] bg-[#161b22] h-full rounded-t-md relative flex items-end overflow-hidden">
                        {/* Baseline line */}
                        <div
                          className="absolute w-full border-t border-dashed border-[#8b949e]/60 z-10"
                          style={{ bottom: `${Math.round((features.baselineReqPerMin / maxVal) * 100)}%` }}
                        />
                        <div
                          className={`w-full rounded-t-md transition-all duration-500 ${
                            isLast
                              ? 'bg-gradient-to-t from-purple-600 to-pink-500 shadow-md shadow-purple-500/50'
                              : 'bg-purple-900/60'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[#8b949e]">
                        {anomaly.historicalWindow.timestamps[idx]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Explainable AI Root Cause Hypothesis */}
          <div className="bg-[#0d1117] p-4 rounded-xl border border-purple-900/30 space-y-2">
            <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
              Giả Thuyết Nguyên Nhân Gốc (Heuristic Root Cause)
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed bg-[#161b22] p-3 rounded-lg border border-[#30363d]">
              {anomaly.hypothesis}
            </p>
          </div>

          {/* 4. Tactical Recommended Mitigation */}
          <div className="bg-[#0d1117] p-4 rounded-xl border border-emerald-900/40 space-y-2.5">
            <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Khuyến Nghị Khắc Phục Tức Thời (Mitigation Strategy)
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              {anomaly.recommendedAction}
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap gap-2">
              <Button
                variant="success"
                size="sm"
                icon={Zap}
                disabled={isApplying}
                onClick={() => handleApplyAction('Kích hoạt Edge Rate-Limiting (2.5s/lệnh)')}
                className="text-xs font-semibold shadow-md shadow-emerald-950/40"
              >
                Bật Edge Rate-Limiting
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={Sliders}
                disabled={isApplying}
                onClick={() => handleApplyAction('Tăng Delay Vòng Từ 3.5s')}
                className="text-xs font-semibold"
              >
                Tăng Delay Cảm Biến Từ
              </Button>

              <Button
                variant="danger"
                size="sm"
                icon={Lock}
                disabled={isApplying}
                onClick={() => handleApplyAction('Khóa Tạm Thời Làn Đang Bị Tấn Công')}
                className="text-xs font-semibold"
              >
                Khóa Tạm Thời Làn
              </Button>
            </div>
          </div>
        </div>

        {/* Bottom Footer Actions */}
        <div className="pt-4 border-t border-[#30363d] flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Đóng
          </Button>

          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            disabled={isApplying}
            onClick={() => handleApplyAction('Đã rà soát & thiết lập lại Heuristic')}
            className="text-xs font-bold"
          >
            Đánh Dấu Đã Xử Lý & Reset Heuristic
          </Button>
        </div>
      </div>
    </div>
  );
};
