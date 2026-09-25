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
    name: 'Xe VIP / Ban Lãnh Đạo',
    category: 'Thành viên VIP',
    plate: '51A-888.88',
    vehicleType: 'Mercedes-Benz S450 (Đen)',
    owner: 'Nguyễn Văn Hùng (Tổng Giám Đốc)',
    status: 'ALLOWED',
    latencyMs: 58,
    confidence: 99.4,
    winningRule: '#1 - VIP FAST-TRACK PASS (24/7)',
    reason: 'Phương tiện thuộc Danh mục Cán bộ Cấp cao. Barrier mở tự động toàn quyền.',
    imageThumbnail: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=300&auto=format&fit=crop&q=60'
  },
  {
    id: 'employee',
    name: 'Xe Cán Bộ Nhân Viên (Ca Ngày)',
    category: 'Nhân viên tòa nhà',
    plate: '29A-123.45',
    vehicleType: 'Mazda CX-5 (Trắng)',
    owner: 'Trần Thị Mai (Phòng Tài Chính)',
    status: 'ALLOWED',
    latencyMs: 74,
    confidence: 98.7,
    winningRule: '#4 - EMPLOYEE SHIFT ACCESS (06:00 - 20:00)',
    reason: 'Đúng khung giờ làm việc và thẻ tháng còn hạn sử dụng. Barrier mở.',
    imageThumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300&auto=format&fit=crop&q=60'
  },
  {
    id: 'visitor',
    name: 'Xe Khách Chưa Đăng Ký',
    category: 'Khách vãng lai',
    plate: '43B-999.01',
    vehicleType: 'Toyota Vios (Bạc)',
    owner: 'Chưa có thông tin chủ sở hữu',
    status: 'DENIED',
    latencyMs: 82,
    confidence: 97.2,
    winningRule: '#99 - DEFAULT CATCH-ALL RESTRICTION',
    reason: 'Biển số chưa được đăng ký trong hệ thống nội bộ. Yêu cầu bảo vệ kiểm tra vé giấy.',
    imageThumbnail: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=300&auto=format&fit=crop&q=60'
  },
  {
    id: 'blacklist',
    name: 'Phương Tiện Bị Cảnh Báo An Ninh',
    category: 'Danh sách đen (Blacklist)',
    plate: '30G-666.99',
    vehicleType: 'Ford Ranger (Đỏ)',
    owner: 'Cảnh báo: Vi phạm nội quy đỗ xe nhiều lần',
    status: 'CRITICAL_BLOCK',
    latencyMs: 46,
    confidence: 99.8,
    winningRule: '#0 - SECURITY ENFORCEMENT BLOCKLIST',
    reason: 'Phương tiện nằm trong danh sách cấm ra vào. Hệ thống khóa cứng barrier và phát chuông báo an ninh.',
    imageThumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=300&auto=format&fit=crop&q=60'
  }
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onSelectPlan
}) => {
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
          name: `Xe Kiểm Tra: ${customPlateInput}`,
          category: 'Cảnh báo An Ninh',
          plate: customPlateInput.toUpperCase(),
          vehicleType: 'Phương tiện nghi vấn',
          owner: 'Nghi ngờ biển số giả mạo',
          status: 'CRITICAL_BLOCK',
          latencyMs: 52,
          confidence: 96.5,
          winningRule: '#0 - SUSPICIOUS VEHICLE BLOCKLIST',
          reason: 'Biển số có dấu hiệu bất thường, hệ thống tự động chặn và phát báo động.',
          imageThumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=300&auto=format&fit=crop&q=60'
        });
        setBarrierState('LOCKED');
      } else if (isKnownVip) {
        setSelectedScenario({
          id: 'custom-vip',
          name: `Xe Kiểm Tra: ${customPlateInput}`,
          category: 'Thành viên Cấp Phép',
          plate: customPlateInput.toUpperCase(),
          vehicleType: 'Sedan / SUV',
          owner: 'Khách Đã Đăng Ký Trước (Pre-registered)',
          status: 'ALLOWED',
          latencyMs: 68,
          confidence: 99.1,
          winningRule: '#3 - PRE-APPROVED VISITOR ACCESS',
          reason: 'Biển số hợp lệ, barrier tự động mở cho xe lưu thông.',
          imageThumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300&auto=format&fit=crop&q=60'
        });
        setBarrierState('UP');
      } else {
        setSelectedScenario({
          id: 'custom-unregistered',
          name: `Xe Kiểm Tra: ${customPlateInput}`,
          category: 'Chưa Đăng Ký',
          plate: customPlateInput.toUpperCase(),
          vehicleType: 'Phương tiện vãng lai',
          owner: 'Khách chưa đăng ký',
          status: 'DENIED',
          latencyMs: 85,
          confidence: 98.0,
          winningRule: '#99 - UNREGISTERED GATE RESTRICTION',
          reason: 'Không tìm thấy vé tháng hợp lệ. Yêu cầu thanh toán vé lượt hoặc kiểm tra thủ công.',
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
      badge: 'Bãi Xe & Chung Cư Nhỏ',
      price: '1.990.000',
      period: 'tháng',
      description: 'Dành cho các bãi đỗ xe đơn lẻ, chung cư mini hoặc trụ sở công ty quy mô vừa và nhỏ.',
      features: [
        'Tối đa 2 Làn Barrier (1 Vào - 1 Ra)',
        'Quản lý 1 Cơ sở (Site)',
        'Sức chứa tối đa 500 phương tiện',
        'Camera ANPR nhận diện biển số OCR AI',
        'Động cơ luật ra vào cơ bản',
        'Lưu trữ lịch sử sự kiện 30 ngày',
        'Hỗ trợ kỹ thuật qua Email & Zalo'
      ],
      popular: false,
      ctaText: 'Bắt đầu dùng thử Starter'
    },
    {
      id: 'business',
      name: 'Business',
      badge: 'Phổ biến nhất ★',
      price: '4.990.000',
      period: 'tháng',
      description: 'Giải pháp hoàn hảo cho Tòa nhà văn phòng hạng A-B, trung tâm thương mại và khu dân cư cao cấp.',
      features: [
        'Tối đa 8 Làn Barrier đa chiều',
        'Quản lý tới 3 Cơ sở (Sites) đồng thời',
        'Sức chứa tới 3.000 phương tiện',
        'Deterministic Policy Engine (Độ ưu tiên #1 - #9999)',
        'Chống bám đuôi (Tailgating) & Anti-passback',
        'Cơ chế Failover Offline tại trạm khi mất Internet',
        'Tích hợp Webhook (Telegram/Slack) & API mở',
        'Lưu trữ hình ảnh & sự kiện 1 năm',
        'Hỗ trợ kỹ thuật 24/7 qua Hotline riêng'
      ],
      popular: true,
      ctaText: 'Đăng ký dùng thử Business'
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      badge: 'Chuỗi & KCN Logistics',
      price: 'Liên hệ',
      period: 'báo giá riêng',
      description: 'Dành cho Tập đoàn quản lý chuỗi tòa nhà, Khu công nghiệp, Bệnh viện lớn và Trung tâm Logistics.',
      features: [
        'Không giới hạn số Làn Barrier & Cổng ra vào',
        'Không giới hạn Cơ sở và số lượng xe lưu kho',
        'Cơ sở dữ liệu riêng biệt (Dedicated RLS DB)',
        'Tích hợp sâu hệ thống BMS, SAP, Oracle ERP, VietQR',
        'Cam kết SLA 99.99% Uptime có bồi hoàn',
        'Tùy biến thuật toán OCR biển số chuyên dụng',
        'Kỹ sư hỗ trợ cài đặt & bảo trì tận nơi On-site'
      ],
      popular: false,
      ctaText: 'Tư vấn giải pháp Enterprise'
    }
  ];

  const faqs = [
    {
      q: 'Hệ thống ANPR Cloud có yêu cầu phải thay thế cổng barrier hiện có không?',
      a: 'Hoàn toàn không. ANPR Cloud được thiết kế để tương thích 100% với các thương hiệu barrier phổ biến hiện nay như Bisen, FAAC, CAME, MAG, ZKTeco, Wonsun... Chúng tôi chỉ cần kết nối bộ điều khiển Edge Relay nhỏ gọn vào cổng tín hiệu Relay Open/Close của barrier hiện tại của bạn trong vòng chưa tới 15 phút.'
    },
    {
      q: 'Nếu đường truyền cáp quang hoặc Internet bị mất thì barrier có mở được không?',
      a: 'Có, barrier vẫn đóng mở hoàn toàn bình thường. Thiết bị Edge Gateway tại mỗi trạm bãi xe luôn đồng bộ một bản sao cơ sở dữ liệu biển số hợp lệ và luật ra vào (Offline Cache). Khi mất mạng, Edge AI tự xử lý nhận diện OCR và kích hoạt relay mở barrier cục bộ. Khi có mạng trở lại, dữ liệu sự kiện sẽ tự động đẩy ngược lên Cloud.'
    },
    {
      q: 'Tốc độ nhận diện biển số và mở barrier là bao nhiêu?',
      a: 'Toàn trình từ lúc phương tiện chạm vạch dừng (Loop Detector kích hoạt camera), chụp ảnh, chạy mô hình Deep Learning OCR đọc chuỗi ký tự biển số, đến khi rơ-le barrier nâng cần chỉ mất từ 50ms đến 90ms (chưa tới 0.1 giây), đảm bảo phương tiện lưu thông mượt mà không bị gián đoạn.'
    },
    {
      q: 'Hệ thống có nhận diện được biển số bị mờ, bùn đất, biển số xe máy hoặc trời mưa ban đêm không?',
      a: 'Có. Mô hình ANPR của chúng tôi được huấn luyện đặc biệt trên tập dữ liệu hàng triệu biển số xe tại Việt Nam (bao gồm biển trắng dân sự, biển vàng xe kinh doanh, biển xanh cơ quan, biển đỏ quân đội, biển số xe điện, biển xe máy 2 hàng và biển ngoại giao). Kết hợp với camera IP chuyên dụng có đèn hồng ngoại (IR) hoặc LED Strobe, độ chính xác duy trì trên 99.5% ngay cả trong điều kiện mưa bão hay đêm tối.'
    },
    {
      q: 'Dữ liệu hình ảnh biển số xe có được bảo mật theo quy định pháp luật không?',
      a: 'Chúng tôi tuân thủ nghiêm ngặt Nghị định 13/2023/NĐ-CP của Chính phủ về bảo vệ dữ liệu cá nhân. Toàn bộ hình ảnh biển số và log ra vào được mã hóa AES-256 trên Cloud Storage, đường truyền bảo vệ bằng chuẩn TLS 1.3. Doanh nghiệp (Tenant) hoàn toàn làm chủ dữ liệu của mình và có thể yêu cầu xóa dữ liệu bất kỳ lúc nào.'
    },
    {
      q: 'Chi phí triển khai ban đầu và thời gian hoàn tất là bao lâu?',
      a: 'Nếu cơ sở đã có sẵn camera IP và barrier, bạn chỉ cần trang bị bộ Edge Gateway với chi phí rất tiết kiệm. Thời gian cấu hình toàn bộ hệ thống trên Cloud và cắm nối phần cứng chỉ mất từ 2 đến 4 giờ làm việc. Bạn cũng được dùng thử miễn phí 14 ngày đầy đủ tính năng trước khi quyết định ký hợp đồng.'
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
                Nền Tảng ANPR Cloud SaaS Thế Hệ Mới
              </span>
              <span className="text-[#8b949e] text-xs">|</span>
              <span className="text-xs text-[#c9d1d9] font-medium hidden sm:inline">
                Tự động hóa Barrier & Nhận diện Biển số AI
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
              Kiểm Soát Ra Vào Thông Minh <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#58a6ff] via-[#79c0ff] to-[#a371f7]">
                Tự Động Mở Barrier Qua Biển Số
              </span>
            </h1>

            {/* Sub-headline */}
            <p className="text-base sm:text-lg text-[#8b949e] max-w-2xl mx-auto leading-relaxed">
              Giải pháp đám mây toàn diện cho Tòa nhà, Chung cư, Bãi xe và Khu công nghiệp. Nhận diện biển số trong <strong className="text-white">&lt;100ms</strong>, chống quay vòng vé, phân quyền thông minh và vận hành tự động 24/7.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
              <button
                onClick={() => onNavigate('register')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold text-sm sm:text-base shadow-xl shadow-[#58a6ff]/25 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02]"
              >
                <span>Dùng thử miễn phí 14 ngày</span>
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
                <span>Trải nghiệm Live Demo</span>
              </button>
            </div>

            {/* Trust Micro-Bullets */}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-[#8b949e]">
              <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" /> Không cần thẻ từ rườm rà
              </span>
              <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" /> Tương thích mọi loại Barrier
              </span>
              <span className="flex items-center gap-1.5 text-[#c9d1d9]">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" /> Hoạt động offline khi mất mạng
              </span>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#58a6ff] font-mono">99.8%</div>
              <div className="text-xs font-bold text-white mt-1">Độ chính xác OCR</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">Biển số ô tô, xe máy, xe điện</p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#3fb950] font-mono">&lt;100ms</div>
              <div className="text-xs font-bold text-white mt-1">Tốc độ mở Barrier</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">Từ lúc quét đến khi nâng cần</p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#d29922] font-mono">90%</div>
              <div className="text-xs font-bold text-white mt-1">Giảm ùn tắc cổng</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">Lưu thông tốc độ cao giờ cao điểm</p>
            </div>

            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center shadow-lg">
              <div className="text-2xl sm:text-3xl font-black text-[#a371f7] font-mono">99.9%</div>
              <div className="text-xs font-bold text-white mt-1">SLA Uptime Đảm Bảo</div>
              <p className="text-[11px] text-[#8b949e] mt-0.5">Dự phòng Edge Offline 100%</p>
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
              Trải Nghiệm Động Cơ Nhận Diện & Quyết Định Barrier
            </h2>
            <p className="text-sm text-[#8b949e]">
              Chọn một phương tiện mẫu hoặc tự nhập biển số xe để xem cách camera ANPR phân tích, đối soát chính sách luật và ra lệnh mở hoặc khóa barrier trong tích tắc.
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
                    Chọn Tình Huống Xe Tiếp Cận Cổng:
                  </h3>
                  <span className="text-[10px] text-[#8b949e] font-mono">4 mẫu thử</span>
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
                              <span>{scenario.name}</span>
                              {scenario.status === 'ALLOWED' && (
                                <Badge variant="emerald" size="sm" className="text-[9px]">Mở Barrier</Badge>
                              )}
                              {scenario.status === 'DENIED' && (
                                <Badge variant="amber" size="sm" className="text-[9px]">Chặn Lại</Badge>
                              )}
                              {scenario.status === 'CRITICAL_BLOCK' && (
                                <Badge variant="red" size="sm" className="text-[9px]">Báo Động</Badge>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[#8b949e] mt-0.5">
                              Biển số: <span className="text-white font-bold">{scenario.plate}</span> • {scenario.vehicleType}
                            </div>
                          </div>
                        </div>

                        <span className="text-xs font-mono font-bold text-[#58a6ff] shrink-0">
                          {isSelected ? 'Đang chọn' : 'Thử'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Custom Plate Input */}
                <div className="pt-3 border-t border-[#30363d]">
                  <form onSubmit={handleCustomScan} className="space-y-2">
                    <label className="text-[11px] font-semibold text-[#8b949e] block">
                      Hoặc nhập biển số xe bất kỳ để kiểm tra:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customPlateInput}
                        onChange={(e) => setCustomPlateInput(e.target.value)}
                        placeholder="Ví dụ: 59X1-88899"
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
                        <span>Quét</span>
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
                      Làn 01 - Cổng Chính (INBOUND ANPR CAM 4K)
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
                        <span>Đang xử lý Deep Learning OCR...</span>
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
                        <div className="text-[#8b949e] text-[10px]">Độ trễ: {selectedScenario.latencyMs}ms</div>
                      </div>
                    </div>
                  )}

                  {/* Physical Barrier Arm Simulation Indicator */}
                  <div className="absolute top-4 right-4 bg-[#0d0e12]/90 border border-[#30363d] rounded-xl p-3 backdrop-blur-md flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-[#8b949e] font-mono">TRẠNG THÁI BARRIER:</div>
                      <div className={`text-xs font-black font-mono ${
                        barrierState === 'UP' ? 'text-[#3fb950]' : barrierState === 'LOCKED' ? 'text-[#f85149]' : 'text-[#d29922]'
                      }`}>
                        {barrierState === 'UP' && 'CẦN ĐÃ NÂNG (CHO VÀO)'}
                        {barrierState === 'DOWN' && 'CẦN ĐANG ĐÓNG (CHỜ)'}
                        {barrierState === 'LOCKED' && 'KHÓA CỨNG (AN NINH)'}
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
                      <div className="text-[11px] font-mono text-[#8b949e]">QUY TẮC CHIẾN THẮNG (WINNING ACCESS RULE):</div>
                      <div className="text-xs font-bold text-white font-mono mt-0.5">
                        {selectedScenario.winningRule}
                      </div>
                    </div>
                    <div>
                      {selectedScenario.status === 'ALLOWED' && (
                        <Badge variant="emerald" size="md" className="font-bold">
                          QUYẾT ĐỊNH: CHO PHÉP VÀO
                        </Badge>
                      )}
                      {selectedScenario.status === 'DENIED' && (
                        <Badge variant="amber" size="md" className="font-bold">
                          QUYẾT ĐỊNH: TỪ CHỐI TỰ ĐỘNG
                        </Badge>
                      )}
                      {selectedScenario.status === 'CRITICAL_BLOCK' && (
                        <Badge variant="red" size="md" className="font-bold">
                          BÁO ĐỘNG: PHÁT HIỆN VI PHẠM
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[#c9d1d9] bg-[#0d0e12] p-3 rounded-xl border border-[#30363d] leading-relaxed">
                    <strong className="text-white">Chi tiết đánh giá:</strong> {selectedScenario.reason} (Chủ xe: {selectedScenario.owner})
                  </p>

                  <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-[#8b949e] font-mono">
                    <span>Edge Relay: Kích hoạt tức thì</span>
                    <span>Anti-passback: Hợp lệ</span>
                    <span>Dung lượng bãi xe: Còn 48/200 chỗ</span>
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
            <Layers className="w-3.5 h-3.5" /> Năng Lực Nền Tảng Vượt Trội
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Mọi Công Cụ Bạn Cần Để Tự Động Hóa Bãi Xe
          </h2>
          <p className="text-sm text-[#8b949e]">
            Loại bỏ hoàn toàn thẻ từ vật lý dễ bị sao chép hoặc thất lạc. Kiểm soát luồng xe chính xác từng giây với AI và cơ chế bảo mật đa tầng.
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
              Nhận Diện Biển Số OCR Đa Điều Kiện
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Mô hình Deep Learning tối ưu riêng cho biển số Việt Nam (biển trắng, vàng, xanh, đỏ, biển xe điện và xe máy). Nhận diện chính xác 99.8% cả ban đêm hoặc góc chụp nghiêng 45°.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#58a6ff]">
              <span>Tốc độ xử lý: ~60ms</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#3fb950]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#238636]/10 border border-[#3fb950]/30 text-[#3fb950] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Động Cơ Luật Ra Vào Deterministic
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Tùy biến chính sách không giới hạn: phân quyền theo nhóm VIP, Cán bộ, Nhà thầu hoặc Khách; thiết lập khung giờ theo ngày trong tuần và tự động phát hiện xung đột quy tắc.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#3fb950]">
              <span>Độ ưu tiên từ #1 đến #9999</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#f85149]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#da3633]/10 border border-[#f85149]/30 text-[#f85149] flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Chống Gian Lận & Cảnh Báo An Ninh
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Tự động phát hiện hành vi bám đuôi (Tailgating), quay vòng vé xe trái phép (Anti-passback) và nhận diện phương tiện thuộc danh sách đen để khóa cứng barrier ngay tức thì.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#f85149]">
              <span>Bảo vệ doanh thu & chống thất thoát</span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#d29922]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#9e6a03]/10 border border-[#d29922]/30 text-[#d29922] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Quản Lý Đa Điểm & Sức Chứa (Capacity)
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Theo dõi đồng thời hàng chục bãi xe và tòa nhà trên một màn hình quản trị duy nhất. Tự động cảnh báo và đóng cổng khi khu vực đỗ xe đã đạt ngưỡng giới hạn tối đa.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#d29922]">
              <span>Cập nhật số chỗ trống Real-time</span>
            </div>
          </div>

          {/* Card 5 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#a371f7]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#8957e5]/10 border border-[#a371f7]/30 text-[#a371f7] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Offline-First: Vận Hành Bền Bỉ Khi Mất Mạng
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Edge Gateway tại cổng lưu trữ bộ nhớ đệm cục bộ. Nếu đường truyền Internet cáp quang bị đứt, cổng barrier vẫn nhận diện và mở cho xe hợp lệ, sau đó tự đồng bộ khi có mạng lại.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#a371f7]">
              <span>Uptime 99.9% không lo tắc đường</span>
            </div>
          </div>

          {/* Card 6 */}
          <div className="bg-[#161b22] border border-[#30363d] hover:border-[#58a6ff]/50 rounded-2xl p-6 transition-all space-y-3 group shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Smartphone className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Tích Hợp Mở (Open API & VietQR)
            </h3>
            <p className="text-xs text-[#8b949e] leading-relaxed">
              Dễ dàng kết nối với phần mềm quản lý tòa nhà (BMS), ERP, hệ thống nhân sự chấm công và cổng thanh toán tự động VietQR, MoMo giúp cư dân thanh toán tiền gửi xe siêu tốc.
            </p>
            <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-[#58a6ff]">
              <span>RESTful API & Webhooks</span>
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
              <CheckCircle2 className="w-3.5 h-3.5" /> Triển Khai Trong 4 Giờ
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              3 Bước Đơn Giản Để Bắt Đầu Vận Hành
            </h2>
            <p className="text-sm text-[#8b949e]">
              Không cần mua sắm hệ thống cồng kềnh hay thay đổi kết cấu hạ tầng sẵn có của bạn.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Step 1 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#58a6ff] text-slate-950 font-black text-base flex items-center justify-center">
                1
              </div>
              <h3 className="text-base font-bold text-white">Kết Nối Camera & Barrier Hiện Có</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Kỹ thuật viên cắm bộ điều khiển Edge Gateway nhỏ gọn vào cổng tín hiệu Relay của barrier và kết nối tới Camera IP có sẵn qua chuẩn ONVIF / RTSP.
              </p>
              <div className="text-[11px] font-mono text-[#58a6ff]">Thời gian: 30 - 60 phút</div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#3fb950] text-slate-950 font-black text-base flex items-center justify-center">
                2
              </div>
              <h3 className="text-base font-bold text-white">Khởi Tạo Tổ Chức & Cấu Hình Luật</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Đăng ký tài khoản Tenant trên Cloud, tải lên danh sách biển số xe bằng file Excel, phân nhóm thành viên và thiết lập khung giờ cho phép ra vào theo ý muốn.
              </p>
              <div className="text-[11px] font-mono text-[#3fb950]">Thời gian: 15 phút</div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 relative space-y-4">
              <div className="w-10 h-10 rounded-xl bg-[#d29922] text-slate-950 font-black text-base flex items-center justify-center">
                3
              </div>
              <h3 className="text-base font-bold text-white">Vận Hành Tự Động & Giám Sát Từ Xa</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Hệ thống tự động kích hoạt đóng mở barrier 24/7. Ban quản lý theo dõi báo cáo lưu lượng, hình ảnh bằng chứng và nhận cảnh báo an ninh mọi lúc mọi nơi.
              </p>
              <div className="text-[11px] font-mono text-[#d29922]">Hoạt động liên tục 24/7</div>
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
            <Building2 className="w-3.5 h-3.5" /> Giải Pháp Đa Dạng
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Tối Ưu Cho Mọi Mô Hình Doanh Nghiệp
          </h2>
          <p className="text-sm text-[#8b949e]">
            Được tùy biến linh hoạt để giải quyết triệt để bài toán kiểm soát giao thông nội bộ của từng lĩnh vực.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Tòa Nhà Văn Phòng & TTTM</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Giải quyết dứt điểm cảnh ùn tắc giờ cao điểm sáng - chiều. Ưu tiên lối đi riêng cho xe VIP/Lãnh đạo, kiểm soát chặt chẽ xe khách đăng ký trước qua cổng bảo vệ.
              </p>
              <div className="text-xs font-medium text-[#58a6ff] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> Giảm 90% thời gian chờ tại cổng
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Chung Cư Cao Cấp & Khu Đô Thị</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Quản lý vé xe tháng của cư dân minh bạch. Cư dân không lo mất thẻ gửi xe, tự động cảnh báo khi có phương tiện lạ đỗ quá giờ quy định trong khuôn viên.
              </p>
              <div className="text-xs font-medium text-[#3fb950] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> Nâng tầm đẳng cấp tiện ích thông minh
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#d29922]/10 border border-[#d29922]/30 text-[#d29922] flex items-center justify-center shrink-0">
              <Car className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Khu Công Nghiệp & Trung Tâm Logistics</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Nhận diện chính xác biển số xe tải bẩn, container và xe công vụ. Tích hợp trạm cân điện tử, ghi nhận giờ giao nhận hàng và ngăn chặn thất thoát nguyên vật liệu.
              </p>
              <div className="text-xs font-medium text-[#d29922] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> Kiểm toán lịch sử vào/ra có bằng chứng ảnh 4K
              </div>
            </div>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl bg-[#a371f7]/10 border border-[#a371f7]/30 text-[#a371f7] flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Bãi Đỗ Xe Thu Phí Tự Động VietQR</h3>
              <p className="text-xs text-[#8b949e] leading-relaxed">
                Tự động tính cước theo block giờ, hiển thị mã QR động trên màn hình LED ngoài cổng để tài xế quét chuyển khoản ngân hàng, barrier tự mở ngay khi nhận thanh toán.
              </p>
              <div className="text-xs font-medium text-[#a371f7] flex items-center gap-1 pt-1">
                <Check className="w-3.5 h-3.5" /> Giảm 100% rủi ro thất thoát tiền mặt
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
              <BarChart3 className="w-3.5 h-3.5" /> Bảng Giá Minh Bạch
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Lựa Chọn Gói Dịch Vụ Phù Hợp
            </h2>
            <p className="text-sm text-[#8b949e]">
              Không phí ẩn. Dùng thử miễn phí 14 ngày không cần nhập thẻ tín dụng. Hỗ trợ lắp đặt nhanh chóng.
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
                    Gói Phổ Biến Nhất
                  </div>
                )}

                <div className="space-y-5">
                  <div className="space-y-1">
                    <span className="text-xs font-mono text-[#58a6ff] font-semibold">{plan.badge}</span>
                    <h3 className="text-2xl font-black text-white">{plan.name}</h3>
                    <p className="text-xs text-[#8b949e] leading-relaxed pt-1">{plan.description}</p>
                  </div>

                  <div className="pt-2 pb-4 border-y border-[#30363d] flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-white font-mono">{plan.price}</span>
                    <span className="text-xs text-[#8b949e] font-mono">vnđ/{plan.period}</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      Quyền lợi bao gồm:
                    </div>
                    <ul className="space-y-2 text-xs text-[#c9d1d9]">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />
                          <span>{feat}</span>
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
                    <span>{plan.ctaText}</span>
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
            <Star className="w-3.5 h-3.5" /> Khách Hàng Tin Tưởng
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Được Đánh Giá Cao Bởi Các Đơn Vị Quản Lý
          </h2>
          <p className="text-sm text-[#8b949e]">
            Hơn 250+ cơ sở tòa nhà và khu công nghiệp đã tự động hóa barrier ra vào với ANPR Cloud.
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
              "Trước đây mỗi sáng vào giờ cao điểm, hàng dài ô tô xếp hàng bấm thẻ từ gây ùn ứ ra tận mặt đường lớn. Từ ngày lắp ANPR Cloud, xe vừa tới vạch là barrier đã mở, tài xế không cần hạ kính xe trời mưa."
            </p>
            <div className="pt-2 border-t border-[#30363d] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#58a6ff]/20 text-[#58a6ff] font-bold flex items-center justify-center text-xs">
                LH
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Ông Lê Hoàng Quân</h4>
                <p className="text-[10px] text-[#8b949e]">Trưởng Ban Quản Lý Tòa Nhà Sunrise Tower</p>
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
              "Tính năng quy tắc ưu tiên (Rule Engine) cực kỳ thông minh. Chúng tôi dễ dàng cấp quyền riêng cho xe container của các nhà thầu theo khung giờ giao nhận, chặn hoàn toàn các xe đi trái phép vào ban đêm."
            </p>
            <div className="pt-2 border-t border-[#30363d] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#3fb950]/20 text-[#3fb950] font-bold flex items-center justify-center text-xs">
                VD
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Bà Vũ Thùy Dung</h4>
                <p className="text-[10px] text-[#8b949e]">Giám đốc Vận hành KCN Tân Phú Trung</p>
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
              "Điều tôi ấn tượng nhất là cơ chế dự phòng Offline. Có đợt nhà mạng bị đứt cáp quang nhưng barrier vẫn mở mượt mà cho cư dân, bảo vệ không phải ra quay cần thủ công một lần nào."
            </p>
            <div className="pt-2 border-t border-[#30363d] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#a371f7]/20 text-[#a371f7] font-bold flex items-center justify-center text-xs">
                NT
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Ông Nguyễn Thành Nam</h4>
                <p className="text-[10px] text-[#8b949e]">Chỉ Huy Đội An Ninh Khu Đô Thị Sala</p>
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
              <HelpCircle className="w-3.5 h-3.5" /> Giải Đáp Chuyên Sâu
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Các Câu Hỏi Thường Gặp
            </h2>
            <p className="text-sm text-[#8b949e]">
              Nếu bạn cần thêm tư vấn kỹ thuật chuyên sâu, đội ngũ kỹ sư của chúng tôi luôn sẵn sàng hỗ trợ 24/7.
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
                    <span className="text-sm font-bold text-white tracking-tight">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#58a6ff] shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#8b949e] shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs text-[#8b949e] leading-relaxed border-t border-[#30363d]/50">
                      {faq.a}
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
            Nâng Cấp Bãi Đỗ Xe Thông Minh Ngay Hôm Nay
          </h2>
          <p className="text-sm sm:text-base text-[#8b949e] max-w-xl mx-auto">
            Đăng ký dùng thử 14 ngày không giới hạn tính năng. Đội ngũ chuyên gia ANPR Cloud sẽ hỗ trợ thiết lập cổng và kiểm tra kỹ thuật miễn phí.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('register')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold text-sm sm:text-base shadow-xl shadow-[#58a6ff]/30 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-105"
            >
              <span>Tạo tài khoản Tenant dùng thử</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#161b22] hover:bg-[#21262d] text-white font-semibold text-sm sm:text-base border border-[#30363d] transition-all cursor-pointer"
            >
              Đăng nhập tài khoản sẵn có
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
