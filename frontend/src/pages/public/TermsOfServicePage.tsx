import React from 'react';
import {
  FileText,
  Scale,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  DollarSign,
  ShieldAlert,
  Server,
  Building2,
  Key
} from 'lucide-react';
import { PublicViewType } from '../../components/layout/PublicNavbar';

interface TermsOfServicePageProps {
  onNavigate: (view: PublicViewType) => void;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({ onNavigate }) => {
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
          <span className="text-xs text-[#8b949e] font-mono">Hiệu lực từ: 01/01/2026</span>
        </div>

        {/* Header Title */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] text-xs font-mono font-semibold">
            <Scale className="w-4 h-4" /> Thỏa Thuận Sử Dụng Nền Tảng B2B
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Điều Khoản Sử Dụng Dịch Vụ (Terms of Service)
          </h1>
          <p className="text-xs sm:text-sm text-[#8b949e] leading-relaxed">
            Văn bản này cấu thành thỏa thuận pháp lý ràng buộc giữa Khách hàng Doanh nghiệp / Tổ chức đăng ký dịch vụ (sau đây gọi là "Tenant") và Công ty Cổ phần Giải pháp An ninh Số Toàn Cầu (sau đây gọi là "ANPR Cloud" hoặc "Chúng tôi").
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-[#c9d1d9]">
          {/* Section 1 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-[#58a6ff]" />
              1. Định Nghĩa Thuật Ngữ
            </h2>
            <ul className="space-y-2 text-[#8b949e]">
              <li><strong className="text-white">"Nền Tảng ANPR Cloud":</strong> Dịch vụ phần mềm dạng dịch vụ (SaaS) cung cấp tính năng nhận diện biển số xe AI, động cơ đánh giá quy tắc ra vào và điều khiển relay barrier qua mạng.</li>
              <li><strong className="text-white">"Edge Gateway":</strong> Thiết bị phần cứng máy tính mini chuyên dụng được lắp đặt tại cơ sở bãi xe của Tenant để giao tiếp với camera IP và rơ-le barrier.</li>
              <li><strong className="text-white">"Tenant Administrator":</strong> Cá nhân được Tenant chỉ định làm người quản lý cao nhất của tài khoản tổ chức, có quyền mời người dùng, cấu hình bãi xe và thanh toán.</li>
              <li><strong className="text-white">"Làn Cổng (Gate Lane)":</strong> Điểm kiểm soát vật lý bao gồm 01 camera ANPR và 01 cần barrier điều khiển.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#3fb950]" />
              2. Quyền Sử Dụng & Chương Trình Dùng Thử 14 Ngày
            </h2>
            <p>
              Khi đăng ký tài khoản Tenant mới, Quý khách được cấp quyền truy cập dùng thử miễn phí trong vòng <strong>14 ngày</strong> với đầy đủ tính năng của gói dịch vụ đã chọn (không yêu cầu nhập thẻ thanh toán trước).
            </p>
            <p className="text-[#8b949e]">
              Sau thời gian 14 ngày, nếu Tenant không chọn gói thuê bao định kỳ, hệ thống sẽ tạm dừng gửi lệnh điều khiển tự động tới barrier (bảo vệ vẫn có thể mở barrier bằng nút bấm cơ học tại chỗ). Toàn bộ dữ liệu cấu hình được bảo lưu trong 60 ngày tiếp theo.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#d29922]" />
              3. Cước Phí Dịch Vụ, Hạn Ngạch & Thanh Toán
            </h2>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li><strong>Mô hình thuê bao:</strong> Cước dịch vụ được tính theo chu kỳ Hàng tháng hoặc Hàng năm dựa trên số lượng Làn Cổng (Gates) và Hạn ngạch số lượng phương tiện lưu kho.</li>
              <li><strong>Hóa đơn VAT:</strong> ANPR Cloud xuất hóa đơn giá trị gia tăng điện tử hợp lệ theo đúng quy định của Tổng cục Thuế Việt Nam sau mỗi kỳ thanh toán.</li>
              <li><strong>Thời hạn thanh toán:</strong> Hóa đơn định kỳ cần được thanh toán trong vòng 07 ngày làm việc kể từ ngày phát hành thông báo cước.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#a371f7]" />
              4. Trách Nhiệm Của Khách Hàng (Tenant)
            </h2>
            <p>Để đảm bảo hệ thống vận hành trơn tru, Tenant có trách nhiệm:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li>Bảo dưỡng định kỳ phần cứng tại bãi xe: vệ sinh ống kính camera IP, kiểm tra cảm biến an toàn (vòng từ loop detector hoặc cảm biến quang chống đập cần barrier).</li>
              <li>Bảo mật tài khoản: kích hoạt xác thực hai yếu tố (2FA) cho toàn bộ nhân viên quản trị và bảo vệ trực cổng.</li>
              <li>Đảm bảo tính hợp pháp của danh sách phương tiện và số điện thoại chủ xe khi nạp vào hệ thống.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#f85149]" />
              5. Giới Hạn Trách Nhiệm & Sự Kiện Bất Khả Kháng
            </h2>
            <p className="text-[#8b949e]">
              ANPR Cloud không chịu trách nhiệm đối với các thiệt hại vật chất hoặc va chạm phương tiện phát sinh do lỗi cơ khí phần cứng của barrier (ví dụ: gãy cần barrier do gió bão, đứt lò xo trợ lực, hỏng động cơ điện) hoặc hành vi cố tình vượt barrier của người điều khiển phương tiện khi đèn báo chưa bật xanh.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-[#58a6ff]" />
              6. Luật Điều Chỉnh & Giải Quyết Tranh Chấp
            </h2>
            <p className="text-[#8b949e]">
              Thỏa thuận này được điều chỉnh và giải thích theo pháp luật nước Cộng hòa Xã hội Chủ nghĩa Việt Nam. Mọi tranh chấp phát sinh trước hết sẽ được thương lượng trên tinh thần hòa giải và hợp tác. Nếu không giải quyết được trong vòng 30 ngày, tranh chấp sẽ được đưa ra Trung tâm Trọng tài Quốc tế Việt Nam (VIAC) hoặc Tòa án có thẩm quyền tại TP. Hồ Chí Minh.
            </p>
          </section>
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
              onClick={() => onNavigate('sla')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              Cam Kết SLA 99.9% →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
