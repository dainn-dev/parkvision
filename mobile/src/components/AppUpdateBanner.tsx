import { useState } from 'react';
import { downloadAndInstallAndroidUpdate, type AndroidUpdate } from '../lib/appUpdater';

type Props = {
  update: AndroidUpdate;
};

export function AppUpdateBanner({ update }: Props) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async (): Promise<void> => {
    setInstalling(true);
    setError(null);
    try {
      await downloadAndInstallAndroidUpdate(update);
    } catch {
      setError('Không thể tải bản cập nhật. Vui lòng thử lại.');
      setInstalling(false);
    }
  };

  return (
    <aside className="fixed inset-x-3 bottom-20 z-50 rounded-2xl border border-blue-400/30 bg-slate-900 p-4 text-white shadow-2xl">
      <p className="text-sm font-bold">Có bản cập nhật mới {update.latestVersion}</p>
      {update.notes && <p className="mt-1 text-xs text-slate-300">{update.notes}</p>}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <button
        type="button"
        disabled={installing}
        onClick={() => void handleInstall()}
        className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        {installing ? 'Đang tải…' : 'Cập nhật ngay'}
      </button>
    </aside>
  );
}
