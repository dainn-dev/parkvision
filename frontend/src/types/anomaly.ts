export type AnomalySeverity = 'NOMINAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AnomalyType =
  | 'UNUSUALLY_HIGH_FREQUENCY'    // Burst of access requests (e.g. tailgating flood, loop bouncing, DoS)
  | 'RAPID_CYCLING_BURST'         // Rapid OPEN/CLOSE oscillations exceeding servo mechanical duty
  | 'OFF_HOURS_SURGE'             // Abnormal traffic spikes during scheduled quiet/closed hours
  | 'PLATE_MISMATCH_FLOOD'        // Surge in rejected/unrecognized plates (credential stuffing / reconnaissance)
  | 'THERMAL_DUTY_DISCREPANCY';   // Motor temperature rising much faster than duty cycle allows

export interface BarrierFeatureVector {
  currentReqPerMin: number;
  baselineReqPerMin: number;
  baselineStdDev: number;
  zScore: number;
  ewmaRate: number;
  burstRatio: number;
  interArrivalVariance: number;
  cyclesLast5Min: number;
  motorTempC: number;
  rejectionRatePercent: number;
}

export interface BarrierAnomalyResult {
  id: string;
  gateId: string;
  gateCode: string;
  gateName: string;
  siteId: string;
  siteName: string;
  tenantId: string;
  tenantName: string;
  detectedAt: string;
  anomalyScore: number; // 0 to 100
  severity: AnomalySeverity;
  primaryType: AnomalyType;
  title: string;
  description: string;
  hypothesis: string;
  recommendedAction: string;
  features: BarrierFeatureVector;
  mitigationStatus: 'ACTIVE' | 'MITIGATED' | 'IGNORED';
  historicalWindow: {
    timestamps: string[];
    observedFreq: number[];
    baselineFreq: number[];
  };
}

export interface SiteAnomalyAggregate {
  siteId: string;
  siteName: string;
  anomalyCount: number;
  maxScore: number;
  highestSeverity: AnomalySeverity;
  anomalies: BarrierAnomalyResult[];
}
