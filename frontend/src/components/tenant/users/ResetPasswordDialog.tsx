import React from 'react';
import { usePlatform } from '../../../context/PlatformContext';
import { TenantUser } from '../../../types/tenant';
import { X, Key, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui';

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: TenantUser | null;
}

export const ResetPasswordDialog: React.FC<ResetPasswordDialogProps> = ({ isOpen, onClose, user }) => {
  const { resetTenantUserPassword } = usePlatform();

  if (!isOpen || !user) return null;

  const handleConfirm = () => {
    resetTenantUserPassword(user.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Reset Password</h2>
              <p className="text-xs text-[#8b949e]">Send password reset instructions to user</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 text-xs">
          <p className="text-[#c9d1d9] leading-relaxed">
            Are you sure you want to trigger a password reset for <strong className="text-white">{user.name}</strong>?
          </p>

          <div className="p-3.5 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#21262d] border border-[#30363d] text-[#58a6ff] flex items-center justify-center font-bold text-xs">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <div className="font-bold text-white truncate">{user.name}</div>
              <div className="text-[11px] font-mono text-[#8b949e] truncate">{user.email}</div>
            </div>
          </div>

          <div className="p-3.5 bg-[#161b22] border border-[#30363d] rounded-xl text-[#8b949e] text-[11px] leading-relaxed">
            An automated email containing a single-use secure reset link (valid for 24 hours) will be dispatched to <span className="font-mono text-white">{user.email}</span>. Their existing sessions will remain active until the new password is set.
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12]/80 flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            className="text-xs bg-[#58a6ff] hover:bg-[#79b8ff] text-black font-bold gap-1.5 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            Send Reset Link
          </Button>
        </div>
      </div>
    </div>
  );
};
