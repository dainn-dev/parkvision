import React, { useState } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui';
import { authApi, ApiError } from '../../services/api';
import { PublicViewType } from '../../components/layout/PublicNavbar';

interface ActivatePageProps {
  onNavigate: (view: PublicViewType) => void;
  token: string;
}

export const ActivatePage: React.FC<ActivatePageProps> = ({ onNavigate, token }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      setErrorMessage('Mật khẩu tối thiểu phải từ 10 ký tự trở lên.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không trùng khớp.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await authApi.activate(token, password);
      setIsDone(true);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Kích hoạt thất bại — liên hệ quản trị viên để cấp lại lời mời.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0e12] text-[#c9d1d9] flex items-center justify-center p-4 relative font-sans selection:bg-[#58a6ff] selection:text-slate-950">
      <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-[#58a6ff]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <button
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#8b949e] hover:text-white transition-colors cursor-pointer mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Về Trang Chủ
        </button>

        <div className="bg-[#161b22]/80 border border-[#30363d] rounded-2xl p-8 backdrop-blur-xs shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 flex items-center justify-center text-[#58a6ff] mb-5">
            <ShieldCheck className="w-6 h-6" />
          </div>

          {isDone ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#3fb950]" /> Kích hoạt thành công
              </h1>
              <p className="text-sm text-[#8b949e]">
                Tài khoản của bạn đã được kích hoạt. Đăng nhập để vào Tenant Portal.
              </p>
              <Button variant="primary" className="w-full" onClick={() => onNavigate('login')}>
                Đăng nhập
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">Kích hoạt tài khoản</h1>
              <p className="text-sm text-[#8b949e] mt-1 mb-6">
                Đặt mật khẩu cho tài khoản được mời của bạn.
              </p>

              {errorMessage && (
                <div className="mb-4 p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Mật khẩu mới</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tối thiểu 10 ký tự"
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">Xác nhận mật khẩu</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <Button type="submit" variant="primary" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Đang kích hoạt...' : 'Kích hoạt & Đặt mật khẩu'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
