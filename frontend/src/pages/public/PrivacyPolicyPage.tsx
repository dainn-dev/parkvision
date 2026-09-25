import React from 'react';
import {
  ShieldCheck,
  Lock,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Server,
  ArrowLeft,
  ChevronRight,
  Database,
  EyeOff,
  Scale
} from 'lucide-react';
import { PublicViewType } from '../../components/layout/PublicNavbar';

interface PrivacyPolicyPageProps {
  onNavigate: (view: PublicViewType) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
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
          <span className="text-xs text-[#8b949e] font-mono">Phiên bản hiệu lực: 01/2026</span>
        </div>

        {/* Header Title */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] text-xs font-mono font-semibold">
            <ShieldCheck className="w-4 h-4" /> Cam Kết Bảo Mật Thông Tin & Dữ Liệu
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Chính Sách Bảo Mật Quyền Riêng Tư (Privacy Policy)
          </h1>
          <p className="text-xs sm:text-sm text-[#8b949e] leading-relaxed">
            Hệ thống ANPR Cloud SaaS cam kết bảo vệ dữ liệu cá nhân, thông tin phương tiện và dữ liệu lưu thông của khách hàng doanh nghiệp (Tenants) và chủ phương tiện theo chuẩn bảo mật quốc tế và tuân thủ Nghị định 13/2023/NĐ-CP của Chính phủ Việt Nam.
          </p>
        </div>

        {/* Table of Contents */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-xs space-y-2">
          <div className="font-bold text-white font-mono uppercase tracking-wider">Mục Lục Nội Dung:</div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#58a6ff]">
            <li><a href="#section-1" className="hover:underline">1. Dữ liệu thu thập & xử lý</a></li>
            <li><a href="#section-2" className="hover:underline">2. Mục đích xử lý dữ liệu</a></li>
            <li><a href="#section-3" className="hover:underline">3. Chuẩn mã hóa & bảo vệ dữ liệu</a></li>
            <li><a href="#section-4" className="hover:underline">4. Tuân thủ Nghị định 13/2023/NĐ-CP</a></li>
            <li><a href="#section-5" className="hover:underline">5. Thời hạn lưu trữ & Quyền xóa dữ liệu</a></li>
            <li><a href="#section-6" className="hover:underline">6. Quyền của chủ thể dữ liệu & Tenant</a></li>
          </ul>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-[#c9d1d9]">
          {/* Section 1 */}
          <section id="section-1" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#58a6ff]" />
              1. Các Loại Dữ Liệu Được Thu Thập & Xử Lý
            </h2>
            <p>
              Khi phương tiện tiếp cận các cổng barrier được kết nối với hệ thống ANPR Cloud, hệ thống tự động ghi nhận và xử lý các thông tin kỹ thuật sau:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li><strong>Hình ảnh quang học biển số xe (Cropped Plate Image):</strong> Ảnh cắt cận cảnh chứa biển kiểm soát phục vụ phân tích ký tự OCR.</li>
              <li><strong>Hình ảnh bối cảnh phương tiện (Overview Vehicle Snapshot):</strong> Ảnh chụp góc rộng ghi nhận kiểu dáng, màu sơn xe tại thời điểm tiếp cận vạch dừng barrier.</li>
              <li><strong>Chuỗi ký tự biển kiểm soát:</strong> Ký tự số và chữ được trích xuất tự động kèm độ tin cậy nhận diện (Confidence Score).</li>
              <li><strong>Dữ liệu thời gian và không gian:</strong> Thời điểm chính xác (Timestamp tính đến mili-giây), làn cổng (Gate ID), cơ sở (Site ID) và hướng di chuyển (Vào/Ra).</li>
              <li><strong>Dữ liệu thành viên do Tenant cung cấp:</strong> Tên chủ xe, số điện thoại, căn hộ/phòng ban, loại vé tháng (nếu Tenant khai báo trên hệ thống).</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section id="section-2" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-[#3fb950]" />
              2. Mục Đích Xử Lý Dữ Liệu
            </h2>
            <p>Dữ liệu chỉ được thu thập và xử lý duy nhất cho các mục đích vận hành hợp pháp sau đây:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">Tự động hóa đóng mở Barrier</div>
                <p className="text-[11px] text-[#8b949e]">So khớp biển số với danh sách vé tháng để gửi lệnh nâng cần trong &lt;100ms.</p>
              </div>
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">Ngăn ngừa gian lận & bám đuôi</div>
                <p className="text-[11px] text-[#8b949e]">Phát hiện vé xoay vòng (Anti-passback) và xe bám đuôi không quẹt thẻ.</p>
              </div>
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">An ninh & Kiểm soát Blocklist</div>
                <p className="text-[11px] text-[#8b949e]">Cảnh báo phương tiện thuộc danh sách nghi vấn hoặc vi phạm nội quy đỗ xe.</p>
              </div>
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">Đối soát & Báo cáo minh bạch</div>
                <p className="text-[11px] text-[#8b949e]">Cung cấp hình ảnh chứng cứ tra cứu khi có sự cố va chạm hoặc tranh chấp bãi xe.</p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="section-3" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#d29922]" />
              3. Tiêu Chuẩn Mã Hóa & An Toàn Hạ Tầng
            </h2>
            <p>Chúng tôi áp dụng các chuẩn mực bảo mật thông tin khắt khe nhất:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li><strong>Mã hóa đường truyền (In-Transit):</strong> 100% dữ liệu truyền tải giữa Edge Gateway tại trạm và Cloud Server được bảo vệ bằng giao thức mã hóa TLS 1.3 và mTLS (Mutual TLS).</li>
              <li><strong>Mã hóa lưu trữ (At-Rest):</strong> Hình ảnh và dữ liệu nhạy cảm được mã hóa theo chuẩn quân sự AES-256 trên hệ thống Cloud Storage.</li>
              <li><strong>Cách ly đa khách hàng (Multi-Tenant Row-Level Security - RLS):</strong> Dữ liệu của từng doanh nghiệp được phân vùng hoàn toàn riêng biệt. Không một Tenant nào có thể xem hoặc truy cập dữ liệu của Tenant khác.</li>
              <li><strong>Xác thực 2 yếu tố (TOTP MFA / FIDO2):</strong> Toàn bộ tài khoản quản trị hệ thống bắt buộc kích hoạt bảo mật 2 lớp.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section id="section-4" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#a371f7]" />
              4. Tuân Thủ Nghị Định 13/2023/NĐ-CP (Bảo Vệ Dữ Liệu Cá Nhân)
            </h2>
            <p>
              ANPR Cloud SaaS hoạt động với vai trò là <strong>Bên Xử Lý Dữ Liệu Cá Nhân (Data Processor)</strong> thay mặt cho Khách hàng doanh nghiệp (Bên Kiểm Soát Dữ Liệu - Data Controller).
            </p>
            <p className="text-[#8b949e]">
              Chúng tôi cam kết không bao giờ bán, cho thuê hoặc chia sẻ dữ liệu hình ảnh biển số xe cho bất kỳ bên thứ ba nào vì mục đích quảng cáo hay thương mại. Dữ liệu chỉ được cung cấp cho cơ quan chức năng có thẩm quyền khi có văn bản yêu cầu chính thức theo quy định pháp luật Việt Nam.
            </p>
          </section>

          {/* Section 5 */}
          <section id="section-5" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#58a6ff]" />
              5. Thời Hạn Lưu Trữ & Quyền Xóa Dữ Liệu (Data Retention & Purging)
            </h2>
            <p>
              Tenant có quyền tự cấu hình thời gian lưu trữ nhật ký hình ảnh sự kiện theo nhu cầu thực tế của cơ sở (từ 30 ngày, 90 ngày đến 365 ngày).
            </p>
            <p className="text-[#8b949e]">
              Sau khi hết thời hạn lưu trữ hoặc khi hợp đồng dịch vụ chấm dứt, toàn bộ dữ liệu lịch sử và hình ảnh phương tiện sẽ được hệ thống tự động xóa vĩnh viễn (Cryptographic Erasure) khỏi toàn bộ máy chủ sao lưu trong vòng 30 ngày.
            </p>
          </section>

          {/* Section 6 */}
          <section id="section-6" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-[#3fb950]" />
              6. Quyền Của Khách Hàng & Thông Tin Liên Hệ Ban An Toàn Thông Tin
            </h2>
            <p>
              Khách hàng có toàn quyền xuất dữ liệu (Data Export), chỉnh sửa thông tin phương tiện hoặc yêu cầu hủy bỏ tài khoản thông qua cổng Tenant Settings Portal.
            </p>
            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] text-xs space-y-1 font-mono">
              <div>Bộ Phận Phụ Trách Bảo Vệ Dữ Liệu (DPO - Data Protection Officer):</div>
              <div className="text-white">Email: privacy@anprcloud.vn / security@anprcloud.vn</div>
              <div>Hotline bảo mật: (028) 7300 8899 (Nhánh 3)</div>
            </div>
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
              onClick={() => onNavigate('terms')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              Xem Điều Khoản Dịch Vụ →
            </button>
            <span className="text-[#8b949e]">•</span>
            <button
              onClick={() => onNavigate('sla')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              Xem Cam Kết SLA →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
