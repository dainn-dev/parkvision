import React from 'react';
import {
  Car,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Lock,
  Server,
  Layers,
  Sparkles,
  ArrowRight,
  Globe
} from 'lucide-react';
import { PublicViewType } from './PublicNavbar';

interface PublicFooterProps {
  onNavigate: (view: PublicViewType) => void;
  onScrollToSection?: (sectionId: string) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  onNavigate,
  onScrollToSection
}) => {
  return (
    <footer className="border-t border-[#30363d] bg-[#0d0e12] text-[#8b949e] font-sans">
      {/* Top Banner CTA */}
      <div className="border-b border-[#30363d] bg-gradient-to-r from-[#161b22] via-[#0d0e12] to-[#161b22] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" /> Dùng thử đầy đủ tính năng trong 14 ngày
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Sẵn sàng nâng cấp bãi đỗ xe và cổng barrier thông minh?
            </h3>
            <p className="text-sm text-[#8b949e] max-w-2xl">
              Không cần thay mới phần cứng barrier. Tương thích ngay với camera IP hiện có. Cài đặt nhanh chóng chỉ trong 4 giờ làm việc.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('register')}
              className="px-6 py-3 rounded-xl bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold text-sm shadow-lg shadow-[#58a6ff]/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Đăng ký Tenant dùng thử</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (onScrollToSection) onScrollToSection('simulator');
              }}
              className="px-5 py-3 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-white font-semibold text-sm border border-[#30363d] transition-colors cursor-pointer"
            >
              Xem Live Demo
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] flex items-center justify-center text-slate-950 font-black shadow-md">
                <Car className="w-5 h-5 text-slate-950" />
              </div>
              <span className="text-lg font-extrabold text-white tracking-tight font-mono">
                ANPR<span className="text-[#58a6ff]">.CLOUD</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#8b949e] max-w-sm">
              Nền tảng kiểm soát ra vào phương tiện thế hệ mới dựa trên trí tuệ nhân tạo (Edge AI ANPR), tự động hóa barrier và quản trị bãi xe đa điểm tập trung trên đám mây.
            </p>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2.5 text-[#c9d1d9]">
                <MapPin className="w-4 h-4 text-[#58a6ff] shrink-0" />
                <span>Tầng 12, Tòa nhà Bitexco Financial, Q.1, TP. Hồ Chí Minh</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#c9d1d9]">
                <Phone className="w-4 h-4 text-[#3fb950] shrink-0" />
                <span>Hotline tư vấn & CSKH: 1900 8899 / (028) 7300 8899</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#c9d1d9]">
                <Mail className="w-4 h-4 text-[#d29922] shrink-0" />
                <span>Email: contact@anprcloud.vn / support@anprcloud.vn</span>
              </div>
            </div>

            {/* Compliance Badges */}
            <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#3fb950]">
                <CheckCircle2 className="w-3 h-3" /> Nghị định 13/2023/NĐ-CP
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
                <Lock className="w-3 h-3" /> TLS 1.3 & AES-256
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#a371f7]">
                <Server className="w-3 h-3" /> SLA 99.9% Uptime
              </span>
            </div>
          </div>

          {/* Solutions Column */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Giải Pháp Theo Ngành
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Tòa nhà văn phòng & TTTM
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Khu dân cư & Chung cư cao cấp
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Khu công nghiệp & Kho vận
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Bệnh viện & Cơ quan nhà nước
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Bãi đỗ xe thông minh thu phí tự động
                </button>
              </li>
            </ul>
          </div>

          {/* Platform & Product Column */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Nền Tảng & Công Nghệ
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Nhận diện biển số OCR AI
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Động cơ luật Policy Rules Engine
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Chống bám đuôi & Anti-Passback
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Cơ chế dự phòng Offline tại trạm
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('pricing');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  Bảng giá & Gói cước
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Policy Column */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Chính Sách & Pháp Lý
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5"
                >
                  <span>Chính sách bảo mật (Privacy)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('terms')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5"
                >
                  <span>Điều khoản dịch vụ (Terms)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('sla')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5"
                >
                  <span>Cam kết chất lượng SLA (99.9%)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('login')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5 text-[#58a6ff]"
                >
                  <span>Cổng đăng nhập khách hàng</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('register')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5 text-[#3fb950]"
                >
                  <span>Đăng ký Tenant mới (14 ngày)</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>© 2026 ANPR.CLOUD SaaS Platform. Bản quyền thuộc về Công ty Cổ phần Giải pháp An ninh Số Toàn Cầu.</p>
          <div className="flex items-center gap-6">
            <button onClick={() => onNavigate('privacy')} className="hover:text-white transition-colors">
              Bảo mật dữ liệu
            </button>
            <button onClick={() => onNavigate('terms')} className="hover:text-white transition-colors">
              Điều khoản sử dụng
            </button>
            <button onClick={() => onNavigate('sla')} className="hover:text-white transition-colors">
              SLA 99.9%
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
