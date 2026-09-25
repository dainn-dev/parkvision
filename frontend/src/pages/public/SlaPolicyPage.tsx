import React from 'react';
import {
  Server,
  Zap,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowLeft,
  Activity,
  Headphones,
  Check
} from 'lucide-react';
import { PublicViewType } from '../../components/layout/PublicNavbar';

interface SlaPolicyPageProps {
  onNavigate: (view: PublicViewType) => void;
}

export const SlaPolicyPage: React.FC<SlaPolicyPageProps> = ({ onNavigate }) => {
  return (
    <div className="w-full bg-[#0d0e12] text-[#c9d1d9] font-sans antialiased py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Back */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#58a6ff] hover:text-[#79c0ff] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại Trang Chủ</span>
          </button>
          <span className="text-xs text-[#8b949e] font-mono">Chuẩn dịch vụ cấp độ doanh nghiệp (Enterprise SLA)</span>
        </div>

        {/* Header Title */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#a371f7]/10 border border-[#a371f7]/30 text-[#a371f7] text-xs font-mono font-semibold">
            <Server className="w-4 h-4" /> Cam Kết Uptime 99.9% Có Bồi Hoàn
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Cam Kết Chất Lượng Dịch Vụ (Service Level Agreement - SLA)
          </h1>
          <p className="text-xs sm:text-sm text-[#8b949e] leading-relaxed">
            ANPR Cloud cam kết mang đến dịch vụ kiểm soát ra vào vận hành liên tục, ổn định và bảo mật cao nhất với chính sách hoàn tiền rõ ràng nếu không đạt chỉ số cam kết.
          </p>
        </div>

        {/* Key SLA Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center">
            <div className="text-3xl font-black text-[#3fb950] font-mono">99.9%</div>
            <div className="text-xs font-bold text-white mt-1">Uptime Khả Dụng Hàng Tháng</div>
            <p className="text-[11px] text-[#8b949e] mt-0.5">Thời gian gián đoạn tối đa &lt; 43 phút/tháng</p>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center">
            <div className="text-3xl font-black text-[#58a6ff] font-mono">&lt; 100ms</div>
            <div className="text-xs font-bold text-white mt-1">Độ Trễ Phản Hồi Barrier</div>
            <p className="text-[11px] text-[#8b949e] mt-0.5">Thời gian kích hoạt relay mở cần</p>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center">
            <div className="text-3xl font-black text-[#d29922] font-mono">&lt; 15 phút</div>
            <div className="text-xs font-bold text-white mt-1">Thời Gian Phản Hồi Sự Cố Cấp 1</div>
            <p className="text-[11px] text-[#8b949e] mt-0.5">Hỗ trợ kỹ thuật khẩn cấp 24/7/365</p>
          </div>
        </div>

        {/* Section 1: Incident Severity Matrix */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#f85149]" />
            1. Ma Trận Phân Cấp Sự Cố & Thời Gian Khắc Phục (MTTR)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#30363d] text-[#8b949e] font-mono">
                  <th className="py-2.5 px-3">Cấp độ sự cố</th>
                  <th className="py-2.5 px-3">Mô tả sự cố</th>
                  <th className="py-2.5 px-3">Thời gian phản hồi</th>
                  <th className="py-2.5 px-3">Thời gian xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d] text-[#c9d1d9]">
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#da3633]/20 text-[#f85149] font-bold font-mono">
                      SEV 1 - CRITICAL
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Toàn bộ cổng barrier tại cơ sở bị tê liệt, xe không thể ra vào tự động.
                  </td>
                  <td className="py-3 px-3 font-mono text-[#f85149] font-bold">&lt; 15 phút</td>
                  <td className="py-3 px-3 font-mono font-bold">&lt; 2 giờ</td>
                </tr>
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#d29922]/20 text-[#d29922] font-bold font-mono">
                      SEV 2 - HIGH
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Một làn barrier đơn lẻ bị mất kết nối camera hoặc độ trễ nhận diện tăng cao.
                  </td>
                  <td className="py-3 px-3 font-mono text-[#d29922] font-bold">&lt; 30 phút</td>
                  <td className="py-3 px-3 font-mono font-bold">&lt; 4 giờ</td>
                </tr>
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#388bfd]/20 text-[#58a6ff] font-bold font-mono">
                      SEV 3 - MEDIUM
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Tính năng xuất báo cáo Excel chậm, giao diện Dashboard hiển thị thiếu dữ liệu.
                  </td>
                  <td className="py-3 px-3 font-mono text-[#58a6ff]">&lt; 2 giờ</td>
                  <td className="py-3 px-3 font-mono">&lt; 24 giờ</td>
                </tr>
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] font-mono">
                      SEV 4 - LOW
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Yêu cầu hướng dẫn cấu hình, điều chỉnh biểu mẫu hoặc góp ý tính năng mới.
                  </td>
                  <td className="py-3 px-3 font-mono text-[#8b949e]">&lt; 4 giờ</td>
                  <td className="py-3 px-3 font-mono">Theo kế hoạch</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Compensation Matrix */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#3fb950]" />
            2. Chính Sách Hoàn Tiền / Bồi Hoàn Cước (Service Credits)
          </h2>
          <p className="text-xs text-[#8b949e]">
            Nếu tỷ lệ khả dụng hàng tháng không đạt chỉ số 99.9%, Tenant có quyền nhận bồi hoàn cước dịch vụ tương ứng dưới hình thức giảm trừ trực tiếp vào hóa đơn kỳ tiếp theo:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
              <div className="font-bold text-[#d29922] font-mono text-sm">99.0% - 99.89%</div>
              <div className="text-xs font-bold text-white">Hoàn 10% Cước Tháng</div>
              <p className="text-[11px] text-[#8b949e]">Gián đoạn từ 44 phút đến 7.2 giờ/tháng</p>
            </div>

            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
              <div className="font-bold text-[#f85149] font-mono text-sm">95.0% - 98.9%</div>
              <div className="text-xs font-bold text-white">Hoàn 25% Cước Tháng</div>
              <p className="text-[11px] text-[#8b949e]">Gián đoạn từ 7.2 giờ đến 36 giờ/tháng</p>
            </div>

            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
              <div className="font-bold text-[#f85149] font-mono text-sm">&lt; 95.0%</div>
              <div className="text-xs font-bold text-white">Hoàn 50% Cước Tháng</div>
              <p className="text-[11px] text-[#8b949e]">Gián đoạn nghiêm trọng trên 36 giờ/tháng</p>
            </div>
          </div>
        </div>

        {/* Section 3: Offline Redundancy Guarantee */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#58a6ff]" />
            3. Bảo Đảm Vận Hành Ngoại Tuyến (Offline Edge Guarantee)
          </h2>
          <p className="text-xs text-[#8b949e] leading-relaxed">
            Ngay cả trong trường hợp Cloud Server bảo trì hoặc cáp quang Internet bị đứt hoàn toàn, thiết bị Edge Gateway tại chỗ vẫn hoạt động độc lập và tiếp tục mở barrier cho 100% phương tiện hợp lệ có trong bộ nhớ đệm cục bộ (Local Snapshot Database). Cam kết không làm gián đoạn dòng xe lưu thông tại cổng.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={() => onNavigate('landing')}
            className="px-5 py-2.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-semibold border border-[#30363d] cursor-pointer"
          >
            ← Trở về Trang Chủ
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('privacy')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              Chính Sách Bảo Mật →
            </button>
            <span className="text-[#8b949e]">•</span>
            <button
              onClick={() => onNavigate('terms')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              Điều Khoản Dịch Vụ →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
