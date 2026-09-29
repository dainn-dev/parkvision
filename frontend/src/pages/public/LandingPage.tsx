import React, { useState, useEffect } from 'react';
import {
  Car,
  ShieldCheck,
  ShieldAlert,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Building2,
  Clock,
  Camera,
  Server,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Lock,
  Eye,
  Radio,
  BarChart3,
  Users,
  Smartphone,
  Check,
  RefreshCw,
  DoorOpen,
  Info,
  HelpCircle,
  Star,
  Quote,
  Flame,
  CheckCircle
} from 'lucide-react';
import { Button, Badge } from '../../components/ui';
import { PublicViewType } from '../../components/layout/PublicNavbar';
import { useTranslation } from 'react-i18next';

interface LandingPageProps {
  onNavigate: (view: PublicViewType) => void;
  onSelectPlan?: (planId: string) => void;
}

// Preset vehicle data for the Interactive Live Demo
interface DemoScenario {
  id: string;
  name: string;
  category: string;
  plate: string;
  vehicleType: string;
  owner: string;
  status: 'ALLOWED' | 'DENIED' | 'CRITICAL_BLOCK';
  latencyMs: number;
  confidence: number;
  winningRule: string;
  reason: string;
  imageThumbnail: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'vip',
    name: 'VIP / Executive Vehicle',
    category: 'VIP Member',
    plate: '51A-888.88',
    vehicleType: 'Mercedes-Benz S450 (Black)',
    owner: 'Nguyen Van Hung (CEO)',
    status: 'ALLOWED',
    latencyMs: 58,
    confidence: 99.4,
    winningRule: '#1 - VIP FAST-TRACK PASS (24/7)',
    reason: 'Vehicle belongs to the Senior Staff category. Barrier opens fully automatically.',
    imageThumbnail: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=300&auto=format&fit=crop&q=60'
  },
  {
    id: 'employee',
    name: 'Employee Vehicle (Day Shift)',
    category: 'Building Staff',
    plate: '29A-123.45',
    vehicleType: 'Mazda CX-5 (White)',
    owner: 'Tran Thi Mai (Finance Dept.)',
    status: 'ALLOWED',
    latencyMs: 74,
    confidence: 98.7,
    winningRule: '#4 - EMPLOYEE SHIFT ACCESS (06:00 - 20:00)',
    reason: 'Within working hours and monthly pass still valid. Barrier opens.',
    imageThumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300&auto=format&fit=crop&q=60'
  },
  {
    id: 'visitor',
    name: 'Unregistered Visitor Vehicle',
    category: 'Casual Visitor',
    plate: '43B-999.01',
    vehicleType: 'Toyota Vios (Silver)',
    owner: 'No owner information available',
    status: 'DENIED',
    latencyMs: 82,
    confidence: 97.2,
    winningRule: '#99 - DEFAULT CATCH-ALL RESTRICTION',
    reason: 'Plate not registered in the internal system. Guard must check a paper ticket.',
    imageThumbnail: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=300&auto=format&fit=crop&q=60'
  },
  {
    id: 'blacklist',
    name: 'Security-Flagged Vehicle',
    category: 'Blacklist',
    plate: '30G-666.99',
    vehicleType: 'Ford Ranger (Red)',
    owner: 'Alert: Repeated parking violations',
    status: 'CRITICAL_BLOCK',
    latencyMs: 46,
    confidence: 99.8,
    winningRule: '#0 - SECURITY ENFORCEMENT BLOCKLIST',
    reason: 'Vehicle is on the access blocklist. The system hard-locks the barrier and sounds a security alarm.',
    imageThumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=300&auto=format&fit=crop&q=60'
  }
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onSelectPlan
}) => {
  const { t } = useTranslation('landing');
  // Live Simulator state
  const [selectedScenario, setSelectedScenario] = useState<DemoScenario>(DEMO_SCENARIOS[0]);
  const [customPlateInput, setCustomPlateInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [barrierState, setBarrierState] = useState<'UP' | 'DOWN' | 'LOCKED'>('UP');

  // FAQ open states
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Trigger scan animation whenever scenario changes
  const handleSelectScenario = (scenario: DemoScenario) => {
    setIsScanning(true);
    setSelectedScenario(scenario);
    setCustomPlateInput(scenario.plate);

    setTimeout(() => {
      setIsScanning(false);
      if (scenario.status === 'ALLOWED') {
        setBarrierState('UP');
      } else if (scenario.status === 'CRITICAL_BLOCK') {
        setBarrierState('LOCKED');
      } else {
        setBarrierState('DOWN');
      }
    }, 600);
  };

  const handleCustomScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPlateInput.trim()) return;

    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const clean = customPlateInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const isKnownVip = clean.includes('888') || clean.includes('999');
      const isBlocked = clean.includes('666') || clean.includes('404');

      if (isBlocked) {
        setSelectedScenario({
          id: 'custom-block',
          name: `${customPlateInput}`,
          category: 'Security Alert',
          plate: customPlateInput.toUpperCase(),
          vehicleType: 'Suspicious vehicle',
          owner: 'Suspected forged license plate',
          status: 'CRITICAL_BLOCK',
          latencyMs: 52,
          confidence: 96.5,
          winningRule: '#0 - SUSPICIOUS VEHICLE BLOCKLIST',
          reason: 'Plate shows abnormal signs; the system auto-blocks and raises an alarm.',
          imageThumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=300&auto=format&fit=crop&q=60'
        });
        setBarrierState('LOCKED');
      } else if (isKnownVip) {
        setSelectedScenario({
          id: 'custom-vip',
          name: `${customPlateInput}`,
          category: 'Authorized Member',
          plate: customPlateInput.toUpperCase(),
          vehicleType: 'Sedan / SUV',
          owner: 'Pre-registered Guest',
          status: 'ALLOWED',
          latencyMs: 68,
          confidence: 99.1,
          winningRule: '#3 - PRE-APPROVED VISITOR ACCESS',
          reason: 'Valid plate; the barrier opens automatically for passage.',
          imageThumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300&auto=format&fit=crop&q=60'
        });
        setBarrierState('UP');
      } else {
        setSelectedScenario({
          id: 'custom-unregistered',
          name: `${customPlateInput}`,
          category: 'Unregistered',
          plate: customPlateInput.toUpperCase(),
          vehicleType: 'Casual vehicle',
          owner: 'Unregistered guest',
          status: 'DENIED',
          latencyMs: 85,
          confidence: 98.0,
          winningRule: '#99 - UNREGISTERED GATE RESTRICTION',
          reason: 'No valid monthly pass found. Requires a single-ride ticket or manual check.',
          imageThumbnail: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=300&auto=format&fit=crop&q=60'
        });
        setBarrierState('DOWN');
      }
    }, 500);
  };

  const pricingPlans = [
    {
      id: 'starter',
      name: 'Starter',
      badge: 'Small Lots & Condos',
      price: '1.990.000',
      period: 'month',
      description: 'For standalone parking lots, mini condos or small-to-medium company offices.',
      features: [
        'Up to 2 Barrier Lanes (1 In - 1 Out)',
        'Manage 1 Site',
        'Capacity up to 500 vehicles',
        'ANPR camera with AI OCR plate recognition',
        'Basic access rules engine',
        '30-day event history retention',
        'Technical support via Email & Zalo'
      ],
      popular: false,
      ctaText: 'Start Starter Trial'
    },
    {
      id: 'business',
      name: 'Business',
      badge: 'Most Popular ★',
      price: '4.990.000',
      period: 'month',
      description: 'The perfect solution for grade A-B office buildings, shopping malls and premium residential areas.',
      features: [
        'Up to 8 multi-direction Barrier Lanes',
        'Manage up to 3 Sites simultaneously',
        'Capacity up to 3,000 vehicles',
        'Deterministic Policy Engine (Priority #1 - #9999)',
        'Anti-Tailgating & Anti-passback',
        'On-site Offline Failover when Internet drops',
        'Webhook integration (Telegram/Slack) & Open API',
        '1-year image & event retention',
        '24/7 dedicated Hotline support'
      ],
      popular: true,
      ctaText: 'Start Business Trial'
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      badge: 'Chains & Logistics Parks',
      price: 'Contact us',
      period: 'custom quote',
      description: 'For corporations managing building chains, industrial parks, large hospitals and logistics centers.',
      features: [
        'Unlimited Barrier Lanes & access gates',
        'Unlimited Sites and stored vehicles',
        'Dedicated isolated database (Dedicated RLS DB)',
        'Deep integration with BMS, SAP, Oracle ERP, VietQR',
        'Compensated 99.99% Uptime SLA commitment',
        'Customized dedicated plate OCR algorithms',
        'On-site installation & maintenance engineers'
      ],
      popular: false,
      ctaText: 'Enterprise Consultation'
    }
  ];

  const faqs = [
    {
      q: 'Does ANPR Cloud require replacing my existing barrier gates?',
      a: 'Absolutely not. ANPR Cloud is designed to be 100% compatible with popular barrier brands such as Bisen, FAAC, CAME, MAG, ZKTeco, Wonsun... We only need to connect a compact Edge Relay controller to the Relay Open/Close signal port of your existing barrier in under 15 minutes.'
    },
    {
      q: 'If the fiber optic line or Internet goes down, can the barrier still open?',
      a: 'Yes, the barrier continues to open and close completely normally. The Edge Gateway at each parking site always syncs a copy of the valid license plate database and access rules (Offline Cache). When the network drops, Edge AI processes OCR recognition locally and triggers the barrier relay on-site. Once connectivity returns, event data is automatically pushed back to the Cloud.'
    },
    {
      q: 'How fast is license plate recognition and barrier opening?',
      a: 'The entire pipeline — from the vehicle touching the stop line (Loop Detector triggering the camera), capturing the image, running the Deep Learning OCR model to read the plate, to the barrier relay lifting — takes only 50ms to 90ms (under 0.1 seconds), ensuring smooth, uninterrupted vehicle flow.'
    },
    {
      q: 'Can the system recognize blurred plates, muddy plates, motorbike plates, or plates in rainy night conditions?',
      a: 'Yes. Our ANPR model is specially trained on a dataset of millions of Vietnamese license plates (including white civilian plates, yellow commercial plates, blue government plates, red military plates, electric vehicle plates, two-line motorbike plates and diplomatic plates). Combined with dedicated IP cameras featuring infrared (IR) or LED Strobe lighting, accuracy stays above 99.5% even in storms or darkness.'
    },
    {
      q: 'Is license plate image data secured under legal regulations?',
      a: 'We strictly comply with Government Decree 13/2023/ND-CP on personal data protection. All plate images and access logs are encrypted with AES-256 on Cloud Storage, with transport protected by TLS 1.3. Your organization (Tenant) fully owns its data and can request deletion at any time.'
    },
    {
      q: 'What is the initial deployment cost and completion time?',
      a: 'If your site already has IP cameras and barriers, you only need the Edge Gateway at a very affordable cost. Configuring the entire Cloud system and plugging in hardware takes just 2 to 4 working hours. You also get a full-featured 14-day free trial before deciding to sign a contract.'
    }
  ];

  return (
    <div className="w-full bg-[#0d0e12] text-[#c9d1d9] font-sans antialiased selection:bg-[#58a6ff] selection:text-slate-950">
      {/* ========================================================================= */}
      {/* 1. HERO SECTION */}
      {/* ========================================================================= */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden border-b border-[#30363d]">
        {/* Glowing Background Orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#58a6ff]/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-10 right-10 w-[350px] h-[350px] bg-[#1f6feb]/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto space-y-6">
            {/* Tag Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#161b22] border border-[#58a6ff]/40 shadow-sm shadow-[#58a6ff]/10">
              <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-ping" />
              <span className="w-2 h-2 rounded-full bg-[#3fb950] -ml-4" />
              <span className="text-xs font-mono font-semibold text-[#58a6ff]">
                {t('Next-Gen ANPR Cloud SaaS Platform')}
              </span>
              <span className="text-[#8b949e] text-xs">|</span>
              <span className="text-xs text-[#c9d1d9] font-medium hidden sm:inline">
                {t('Barrier Automation & AI License Plate Recognition')}
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
              {t('Smart Access Control')} <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#58a6ff] via-[#79c0ff] to-[#a371f7]">
                {t('Barriers Open Automatically on License Plates')}
              </span>
            </h1>

            {/* Sub-headline */}
            <p className="text-base sm:text-lg text-[#8b949e] max-w-2xl mx-auto leading-relaxed">
              {t('A comprehensive cloud solution for Buildings, Condos, Parking Lots and Industrial Parks. Plate recognition in')} <strong className="text-white">&lt;100ms</strong>, {t('anti-ticket-looping, smart authorization and fully automated 24/7 operation.')}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
              <button
                onClick={() => onNavigate('register')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold text-sm sm:text-base shadow-xl shadow-[#58a6ff]/25 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02]"
              >
                <span>{t('Start 14-day Free Trial')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  const el = document.getElementById('simulator');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-white font-semibold text-sm sm:text-base border border-[#30363d] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#58a6ff]" />
                <span>{t('Try the Live Demo')}</span>
              </button>
            </div>

            {/* Trust Micro-Bullets */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-[#8b949e]">
              <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" /> {t('No clunky RFID cards needed')}
              </span>
              <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" /> {t('Compatible with all barrier types')}
              </span>
              <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" /> {t('Keeps working offline during outages')}
              </span>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#58a6ff] font-mono">99.8%</div>
              <div className="text-xs font-bold text-white mt-1">{t('OCR Accuracy')}</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">{t('Car, motorbike & e-vehicle plates')}</p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#3fb950] font-mono">&lt;100ms</div>
              <div className="text-xs font-bold text-white mt-1">{t('Barrier Open Speed')}</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">{t('From scan to arm lift')}</p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#d29922] font-mono">90%</div>
              <div className="text-xs font-bold text-white mt-1">{t('Less Gate Congestion')}</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">{t('High-speed flow at peak hours')}</p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#a371f7] font-mono">99.9%</div>
              <div className="text-xs font-bold text-white mt-1">{t('Guaranteed SLA Uptime')}</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">{t('100% Edge offline failover')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. INTERACTIVE ANPR LIVE SIMULATOR (THUYẾT PHỤC KHÁCH HÀNG THỰC TẾ) */}
      {/* ========================================================================= */}
      <section id="simulator" className="py-20 bg-[#161b22]/50 border-b border-[#30363d] relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#58a6ff]/10 text-[#58a6ff] text-xs font-mono font-semibold border border-[#58a6ff]/30">
              <Sparkles className="w-3.5 h-3.5" /> Interactive Demo Sandbox
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {t('Experience the Recognition Engine & Barrier Decisions')}
            </h2>
            <p className="text-sm text-[#8b949e]">
              {t('Pick a sample vehicle or enter any license plate to see how the ANPR camera analyzes, matches access policies, and opens or locks the barrier instantly.')}
            </p>
          </div>

          {/* Simulator Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Preset Selector & Custom Input (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Car className="w-4 h-4 text-[#58a6ff]" />
                    {t('Pick a Vehicle Scenario at the Gate:')}
                  </h3>
                  <span className="text-[10px] text-[#8b949e] font-mono">{t('4 samples')}</span>
                </div>

                {/* Scenarios List */}
                <div className="space-y-2.5">
                  {DEMO_SCENARIOS.map((scenario) => {
                    const isSelected = selectedScenario.id === scenario.id;
                    return (
                      <div
                        key={scenario.id}
                        onClick={() => handleSelectScenario(scenario)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white shadow-md'
                            : 'bg-[#0d0e12] border-[#30363d] text-[#c9d1d9] hover:border-[#484f58]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-3 h-3 rounded-full shrink-0 ${
                            scenario.status === 'ALLOWED' ? 'bg-[#3fb950]' : scenario.status === 'CRITICAL_BLOCK' ? 'bg-[#f85149]' : 'bg-[#d29922]'
                          }`} />
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate flex items-center gap-2">
                              <span>{t(scenario.name)}</span>
                              {scenario.status === 'ALLOWED' && (
                                <Badge variant="emerald" size="sm" className="text-[9px]">{t('Barrier Open')}</Badge>
                              )}
                              {scenario.status === 'DENIED' && (
                                <Badge variant="amber" size="sm" className="text-[9px]">{t('Blocked')}</Badge>
                              )}
                              {scenario.status === 'CRITICAL_BLOCK' && (
                                <Badge variant="red" size="sm" className="text-[9px]">{t('Alarm')}</Badge>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[#8b949e] mt-0.5">
                              {t('Plate:')} <span className="text-white font-bold">{scenario.plate}</span> • {t(scenario.vehicleType)}
                            </div>
                          </div>
                        </div>

                        <span className="text-xs font-mono font-bold text-[#58a6ff] shrink-0">
                          {isSelected ? t('Selected') : t('Try')}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Custom Plate Input */}
                <div className="pt-3 border-t border-[#30363d]">
                  <form onSubmit={handleCustomScan} className="space-y-2">
                    <label className="text-[11px] font-semibold text-[#8b949e] block">
                      {t('Or enter any license plate to test:')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customPlateInput}
                        onChange={(e) => setCustomPlateInput(e.target.value)}
                        placeholder={t('e.g. 59X1-88899')}
                        className="flex-1 px-3 py-2 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
                      />
                      <button
                        type="submit"
                        disabled={isScanning || !customPlateInput.trim()}
                        className="px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isScanning ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#58a6ff]" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-[#58a6ff]" />
                        )}
                        <span>{t('Scan')}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Camera Feed & Gate Visualization (7 Cols) */}
            <div className="lg:col-span-7">
              <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden shadow-2xl">
                {/* Visualizer Top Bar */}
                <div className="px-5 py-3.5 border-b border-[#30363d] bg-[#0d0e12] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f85149] animate-pulse" />
                    <span className="text-xs font-bold text-white font-mono uppercase">
                      {t('Lane 01 - Main Gate (INBOUND ANPR CAM 4K)')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-[#3fb950] flex items-center gap-1">
                      <Radio className="w-3 h-3" /> Live Feed
                    </span>
                    <span className="text-[#8b949e]">FPS: 30</span>
                  </div>
                </div>

                {/* Simulated Camera Viewport */}
                <div className="relative bg-slate-950 aspect-video flex items-center justify-center overflow-hidden border-b border-[#30363d]">
                  {/* Background Car Photo */}
                  <img
                    src={selectedScenario.imageThumbnail}
                    alt="Vehicle preview"
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      isScanning ? 'opacity-40 scale-105' : 'opacity-85'
                    }`}
                  />

                  {/* Scanning Laser Line Overlay */}
                  {isScanning && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center bg-[#58a6ff]/10">
                      <div className="w-full h-0.5 bg-[#58a6ff] shadow-[0_0_15px_#58a6ff] animate-pulse" />
                      <div className="mt-4 px-3 py-1 rounded bg-[#0d0e12]/90 border border-[#58a6ff] text-[#58a6ff] text-xs font-mono font-bold flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('Processing Deep Learning OCR...')}</span>
                      </div>
                    </div>
                  )}

                  {/* License Plate Bounding Box */}
                  {!isScanning && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#0d0e12]/90 border-2 border-[#58a6ff] rounded-lg p-2 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in zoom-in-95 duration-200">
                      <div className="px-3 py-1 bg-white text-slate-950 font-black text-sm tracking-widest rounded border border-slate-300 font-mono">
                        {selectedScenario.plate}
                      </div>
                      <div className="text-left text-xs font-mono">
                        <div className="text-[#58a6ff] font-bold">OCR: {selectedScenario.confidence}%</div>
                        <div className="text-[#8b949e] text-[10px]">{t('Latency: {{ms}}ms', { ms: selectedScenario.latencyMs })}</div>
                      </div>
                    </div>
                  )}

                  {/* Physical Barrier Arm Simulation Indicator */}
                  <div className="absolute top-4 right-4 bg-[#0d0e12]/90 border border-[#30363d] rounded-xl p-3 backdrop-blur-md flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-[#8b949e] font-mono">{t('BARRIER STATUS:')}</div>
                      <div className={`text-xs font-black font-mono ${
                        barrierState === 'UP' ? 'text-[#3fb950]' : barrierState === 'LOCKED' ? 'text-[#f85149]' : 'text-[#d29922]'
                      }`}>
                        {barrierState === 'UP' && t('ARM RAISED (ENTRY ALLOWED)')}
                        {barrierState === 'DOWN' && t('ARM DOWN (WAITING)')}
                        {barrierState === 'LOCKED' && t('HARD LOCKED (SECURITY)')}
                      </div>
                    </div>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                      barrierState === 'UP'
                        ? 'bg-[#238636]/20 text-[#3fb950] border border-[#3fb950]'
                        : barrierState === 'LOCKED'
                        ? 'bg-[#da3633]/20 text-[#f85149] border border-[#f85149]'
                        : 'bg-[#9e6a03]/20 text-[#d29922] border border-[#d29922]'
                    }`}>
                      {barrierState === 'UP' ? <DoorOpen className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Evaluation Decision Detail Panel */}
                <div className="p-5 bg-[#161b22] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono text-[#8b949e]">{t('WINNING ACCESS RULE:')}</div>
                      <div className="text-xs font-bold text-white font-mono mt-0.5">
                        {t(selectedScenario.winningRule)}
                      </div>
                    </div>
                    <div>
                      {selectedScenario.status === 'ALLOWED' && (
                        <Badge variant="emerald" size="md" className="font-bold">
                          {t('DECISION: ENTRY ALLOWED')}
                        </Badge>
                      )}
                      {selectedScenario.status === 'DENIED' && (
                        <Badge variant="amber" size="md" className="font-bold">
                          {t('DECISION: AUTO-DENIED')}
                        </Badge>
                      )}
                      {selectedScenario.status === 'CRITICAL_BLOCK' && (
                        <Badge variant="red" size="md" className="font-bold">
                          {t('ALARM: VIOLATION DETECTED')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[#c9d1d9] bg-[#0d0e12] p-3 rounded-xl border border-[#30363d] leading-relaxed">
                    <strong className="text-white">{t('Evaluation details:')}</strong> {t(selectedScenario.reason)} ({t('Owner:')} {t(selectedScenario.owner)})
                  </p>

                  <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-[#8b949e] font-mono">
                    <span>{t('Edge Relay: Instant trigger')}</span>
                    <span>{t('Anti-passback: Valid')}</span>
                    <span>{t('Lot capacity: 48/200 spots left')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. CORE VALUE PROPOSITION & SYSTEM ARCHITECTURE */}
      {/* ========================================================================= */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#58a6ff]/10 text-[#58a6ff] text-xs font-mono font-semibold border border-[#58a6ff]/30">
            <Layers className="w-3.5 h-3.5" /> {t('Outstanding Platform Capabilities')}
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            {t('Every Tool You Need to Automate Your Parking')}
          </h2>
          <p className="text-sm text-[#8b949e]">
            {t('Eliminate physical RFID cards that are easily cloned or lost. Control vehicle flow to the second with AI and multi-layered security.')}
          </p>
        </div>

        {/* Features Grid (6 Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('All-Condition OCR Plate Recognition')}
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {t('A Deep Learning model optimized for Vietnamese plates (white, yellow, blue, red, EV and motorbike plates). 99.8% accuracy at night or at a 45° capture angle.')}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#58a6ff]">
              <span>{t('Processing speed: ~60ms')}</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#3fb950]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#238636]/10 border border-[#3fb950]/30 text-[#3fb950] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('Deterministic Access Rules Engine')}
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {t('Unlimited custom policies: authorize by VIP, Staff, Contractor or Visitor groups; set weekday time windows and auto-detect rule conflicts.')}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#3fb950]">
              <span>{t('Priority levels #1 to #9999')}</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#f85149]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#da3633]/10 border border-[#f85149]/30 text-[#f85149] flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('Anti-Fraud & Security Alerts')}
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {t('Automatically detects tailgating, illegal ticket looping (Anti-passback) and recognizes blacklisted vehicles to hard-lock the barrier instantly.')}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#f85149]">
              <span>{t('Protects revenue & prevents leakage')}</span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#d29922]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#9e6a03]/10 border border-[#d29922]/30 text-[#d29922] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('Multi-Site Management & Capacity')}
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {t('Monitor dozens of parking lots and buildings on a single admin screen. Auto-alert and close gates when a parking zone reaches its maximum threshold.')}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#d29922]">
              <span>{t('Real-time available spot updates')}</span>
            </div>
          </div>

          {/* Card 5 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#a371f7]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#8957e5]/10 border border-[#a371f7]/30 text-[#a371f7] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('Offline-First: Resilient During Outages')}
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {t('The Edge Gateway at the gate keeps a local cache. If the fiber Internet drops, the barrier still recognizes and opens for valid vehicles, then syncs when back online.')}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#a371f7]">
              <span>{t('99.9% uptime, no road blockage')}</span>
            </div>
          </div>

          {/* Card 6 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              {t('Open Integrations (Open API & VietQR)')}
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              {t('Easily connects to building management software (BMS), ERP, HR attendance systems and automated payment gateways like VietQR and MoMo for lightning-fast parking payments.')}
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#58a6ff]">
              <span>{t('RESTful API & Webhooks')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. HOW IT WORKS (3 BƯỚC TRIỂN KHAI) */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-20 bg-[#161b22]/40 border-y border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3fb950]/10 text-[#3fb950] text-xs font-mono font-semibold border border-[#3fb950]/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('Deployed in 4 Hours')}
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {t('3 Simple Steps to Go Live')}
            </h2>
            <p className="text-sm text-[#8b949e]">
              {t('No bulky systems to buy or changes to your existing infrastructure required.')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#58a6ff] text-slate-950 font-black text-base flex items-center justify-center">
                1
              </div>
              <h3 className="text-base font-bold text-white">{t('Connect Existing Cameras & Barriers')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('Our technicians plug the compact Edge Gateway controller into the barrier\'s Relay signal port and link to your existing IP cameras via ONVIF / RTSP.')}
              </p>
              <div className="text-[11px] font-mono text-[#58a6ff]">{t('Time: 30 - 60 minutes')}</div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#3fb950] text-slate-950 font-black text-base flex items-center justify-center">
                2
              </div>
              <h3 className="text-base font-bold text-white">{t('Set Up Organization & Access Rules')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('Register a Tenant account on the Cloud, upload the vehicle plate list via Excel, group members and configure allowed access time windows as you like.')}
              </p>
              <div className="text-[11px] font-mono text-[#3fb950]">{t('Time: 15 minutes')}</div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#d29922] text-slate-950 font-black text-base flex items-center justify-center">
                3
              </div>
              <h3 className="text-base font-bold text-white">{t('Automated Operation & Remote Monitoring')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('The system automatically opens and closes barriers 24/7. Management tracks traffic reports, evidence photos and receives security alerts anytime, anywhere.')}
              </p>
              <div className="text-[11px] font-mono text-[#d29922]">{t('Runs continuously 24/7')}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. SOLUTIONS BY INDUSTRY */}
      {/* ========================================================================= */}
      <section id="solutions" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#a371f7]/10 text-[#a371f7] text-xs font-mono font-semibold border border-[#a371f7]/30">
            <Building2 className="w-3.5 h-3.5" /> {t('Diverse Solutions')}
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            {t('Optimized for Every Business Model')}
          </h2>
          <p className="text-sm text-[#8b949e]">
            {t('Flexibly customized to thoroughly solve internal traffic control for each industry.')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">{t('Office Buildings & Shopping Malls')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('Eliminate morning and evening rush-hour congestion. Dedicated fast lanes for VIP/executive vehicles and strict control of pre-registered guest vehicles at the security gate.')}
              </p>
              <div className="text-xs font-medium text-[#58a6ff] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> {t('Cuts gate waiting time by 90%')}
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">{t('Premium Apartments & Urban Areas')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('Transparent management of residents\' monthly parking passes. Residents never worry about lost cards, with automatic alerts when unknown vehicles overstay within the premises.')}
              </p>
              <div className="text-xs font-medium text-[#3fb950] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> {t('Elevates smart amenity standards')}
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 text-[#d29922] flex items-center justify-center shrink-0">
              <Car className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">{t('Industrial Parks & Logistics Centers')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('Accurately recognizes dirty truck plates, containers and utility vehicles. Integrates electronic weigh stations, logs cargo times and prevents material loss.')}
              </p>
              <div className="text-xs font-medium text-[#d29922] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> {t('Entry/exit audit trail with 4K photo evidence')}
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#a371f7]/10 border border-[#a371f7]/30 text-[#a371f7] flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">{t('Automated VietQR Paid Parking Lots')}</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                {t('Automatically bills by time blocks, shows a dynamic QR code on the outdoor LED gate screen for drivers to scan and pay by bank transfer — the barrier opens instantly on payment.')}
              </p>
              <div className="text-xs font-medium text-[#a371f7] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> {t('Eliminates 100% of cash-leakage risk')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. PRICING & SUBSCRIPTION PLANS */}
      {/* ========================================================================= */}
      <section id="pricing" className="py-20 bg-[#161b22]/30 border-t border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#58a6ff]/10 text-[#58a6ff] text-xs font-mono font-semibold border border-[#58a6ff]/30">
              <BarChart3 className="w-3.5 h-3.5" /> {t('Transparent Pricing')}
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {t('Choose the Right Service Plan')}
            </h2>
            <p className="text-sm text-[#8b949e]">
              {t('No hidden fees. Free 14-day trial with no credit card required. Fast installation support.')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            {pricingPlans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl p-7 flex flex-col justify-between relative transition-all shadow-xl ${
                  plan.popular
                    ? 'bg-[#161b22] border-2 border-[#58a6ff] shadow-[#58a6ff]/10 scale-105 z-10'
                    : 'bg-[#161b22] border border-[#30363d] hover:border-[#484f58]'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#58a6ff] text-slate-950 text-[11px] font-bold tracking-wide uppercase shadow-md">
                    {t('Most Popular Plan')}
                  </div>
                )}

                <div className="space-y-5">
                  <div className="space-y-1">
                    <span className="text-xs font-mono text-[#58a6ff] font-semibold">{t(plan.badge)}</span>
                    <h3 className="text-2xl font-black text-white">{plan.name}</h3>
                    <p className="text-xs text-[#8b949e] leading-relaxed pt-1">{t(plan.description)}</p>
                  </div>

                  <div className="pt-2 pb-4 border-y border-[#30363d] flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-white font-mono">{t(plan.price)}</span>
                    <span className="text-xs text-[#8b949e] font-mono">{t('vnd/{{period}}', { period: t(plan.period) })}</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      {t('Included benefits:')}
                    </div>
                    <ul className="space-y-2 text-xs text-[#c9d1d9]">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />
                          <span>{t(feat)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <button
                    onClick={() => {
                      if (onSelectPlan) onSelectPlan(plan.id);
                      onNavigate('register');
                    }}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      plan.popular
                        ? 'bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 shadow-lg shadow-[#58a6ff]/20'
                        : 'bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]'
                    }`}
                  >
                    <span>{t(plan.ctaText)}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. CUSTOMER TESTIMONIALS & TRUST */}
      {/* ========================================================================= */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3fb950]/10 text-[#3fb950] text-xs font-mono font-semibold border border-[#3fb950]/30">
            <Star className="w-3.5 h-3.5" /> {t('Trusted by Customers')}
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            {t('Highly Rated by Property Managers')}
          </h2>
          <p className="text-sm text-[#8b949e]">
            {t('Over 250+ building sites and industrial parks have automated their access barriers with ANPR Cloud.')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-1 text-[#d29922]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-current" />
              ))}
            </div>
            <p className="text-xs text-[#c9d1d9] leading-relaxed italic">
              "{t('Before, every morning rush hour, long lines of cars queued to tap RFID cards, clogging the main road. Since installing ANPR Cloud, the barrier opens the moment a car reaches the line — drivers never roll down their windows in the rain.')}"
            </p>
            <div className="pt-2 border-t border-[#30363d] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#58a6ff]/20 text-[#58a6ff] font-bold flex items-center justify-center text-xs">
                LH
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('Mr. Le Hoang Quan')}</h4>
                <p className="text-[10px] text-[#8b949e]">{t('Head of Management, Sunrise Tower')}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-1 text-[#d29922]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-current" />
              ))}
            </div>
            <p className="text-xs text-[#c9d1d9] leading-relaxed italic">
              "{t('The priority rules engine is incredibly smart. We easily grant dedicated access for contractor container trucks during delivery windows, completely blocking unauthorized vehicles at night.')}"
            </p>
            <div className="pt-2 border-t border-[#30363d] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3fb950]/20 text-[#3fb950] font-bold flex items-center justify-center text-xs">
                VD
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('Ms. Vu Thuy Dung')}</h4>
                <p className="text-[10px] text-[#8b949e]">{t('Operations Director, Tan Phu Trung IP')}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-1 text-[#d29922]">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-current" />
              ))}
            </div>
            <p className="text-xs text-[#c9d1d9] leading-relaxed italic">
              "{t('What impressed me most is the offline failover. Once the ISP cut the fiber line but barriers still opened smoothly for residents — guards never had to crank the arm manually even once.')}"
            </p>
            <div className="pt-2 border-t border-[#30363d] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#a371f7]/20 text-[#a371f7] font-bold flex items-center justify-center text-xs">
                NT
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">{t('Mr. Nguyen Thanh Nam')}</h4>
                <p className="text-[10px] text-[#8b949e]">{t('Security Team Lead, Sala Urban Area')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 8. FREQUENTLY ASKED QUESTIONS (FAQ ACCORDION) */}
      {/* ========================================================================= */}
      <section id="faq" className="py-20 bg-[#161b22]/40 border-y border-[#30363d]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 mb-12">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#d29922]/10 text-[#d29922] text-xs font-mono font-semibold border border-[#d29922]/30">
              <HelpCircle className="w-3.5 h-3.5" /> {t('In-Depth Answers')}
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {t('Frequently Asked Questions')}
            </h2>
            <p className="text-sm text-[#8b949e]">
              {t('Need deeper technical consulting? Our engineering team is ready to support 24/7.')}
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={index}
                  className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-[#21262d]/50"
                  >
                    <span className="text-sm font-bold text-white tracking-tight">{t(faq.q)}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#58a6ff] shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#8b949e] shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs text-[#8b949e] leading-relaxed border-t border-[#30363d]/50">
                      {t(faq.a)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 9. FINAL CALL TO ACTION */}
      {/* ========================================================================= */}
      <section className="py-20 relative overflow-hidden text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 relative z-10">
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            {t('Upgrade to a Smart Parking Lot Today')}
          </h2>
          <p className="text-sm sm:text-base text-[#8b949e] max-w-xl mx-auto">
            {t('Sign up for an unlimited-feature 14-day trial. Our ANPR Cloud experts will help set up your gates and run a free technical check.')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('register')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold text-sm sm:text-base shadow-xl shadow-[#58a6ff]/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-105"
            >
              <span>{t('Create a Trial Tenant Account')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-white font-semibold text-sm sm:text-base border border-[#30363d] transition-all cursor-pointer"
            >
              {t('Sign in to an existing account')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
