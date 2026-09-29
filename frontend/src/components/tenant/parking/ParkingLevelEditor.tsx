import React, { useMemo, useRef, useState } from 'react';
import { Layers, X, Plus, Trash2, ArrowUp, ArrowDown, ImagePlus } from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import { Button, Input } from '../../ui';
import type { TenantSite } from '../../../types/tenant';
import type { MapLevelOut } from '../../../services/api';

interface ParkingLevelEditorProps {
  site: TenantSite;
  isOpen: boolean;
  onClose: () => void;
}

export const ParkingLevelEditor: React.FC<ParkingLevelEditorProps> = ({ site, isOpen, onClose }) => {
  const {
    parkingMap,
    upsertParkingLevel,
    removeParkingLevel,
    uploadParkingMapImage,
    addToast,
  } = usePlatform();

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const levels = useMemo(
    () => parkingMap.filter((l) => l.siteId === site.id).sort((a, b) => a.sortOrder - b.sortOrder),
    [parkingMap, site.id]
  );

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    upsertParkingLevel(null, {
      siteId: site.id,
      name: newName.trim(),
      code: newCode.trim() || null,
      sortOrder: levels.length,
    });
    setNewName('');
    setNewCode('');
  };

  const move = (lv: MapLevelOut, dir: -1 | 1) => {
    const idx = levels.findIndex((l) => l.id === lv.id);
    const swap = levels[idx + dir];
    if (!swap) return;
    upsertParkingLevel(lv.id, { name: lv.name, sortOrder: swap.sortOrder });
    upsertParkingLevel(swap.id, { name: swap.name, sortOrder: lv.sortOrder });
  };

  const handleUpload = async (lv: MapLevelOut, file: File) => {
    setUploadingId(lv.id);
    try {
      const objectKey = await uploadParkingMapImage(file);
      upsertParkingLevel(lv.id, { name: lv.name, mapImageUrl: objectKey });
    } catch (err) {
      addToast({ type: 'error', title: 'Upload failed', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Quản lý tầng</h3>
              <p className="text-xs text-[#8b949e]">{site.name} — thêm, sắp xếp, ảnh sơ đồ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs max-h-[70vh] overflow-y-auto">
          {/* Existing levels */}
          <div className="space-y-2">
            {levels.length === 0 && (
              <p className="text-[11px] text-[#8b949e] italic">Chưa có tầng nào — thêm tầng bên dưới.</p>
            )}
            {levels.map((lv, idx) => (
              <div
                key={lv.id}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-[#161b22] border border-[#30363d]"
              >
                <div className="flex flex-col">
                  <button
                    onClick={() => move(lv, -1)}
                    disabled={idx === 0}
                    className="text-[#8b949e] hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(lv, 1)}
                    disabled={idx === levels.length - 1}
                    className="text-[#8b949e] hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <Input
                  value={lv.name}
                  onChange={(e) => upsertParkingLevel(lv.id, { name: e.target.value })}
                  className="bg-[#0d0e12] border-[#30363d] text-white flex-1"
                />
                <span className="text-[10px] text-[#8b949e] font-mono w-14 truncate">{lv.code ?? '—'}</span>
                <input
                  ref={(el) => { fileInputs.current[lv.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(lv, f);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputs.current[lv.id]?.click()}
                  disabled={uploadingId === lv.id}
                  title={lv.mapImageUrl ? 'Thay ảnh sơ đồ' : 'Tải ảnh sơ đồ'}
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer ${
                    lv.mapImageUrl
                      ? 'border-[#3fb950]/40 text-[#3fb950] hover:bg-[#3fb950]/10'
                      : 'border-[#30363d] text-[#8b949e] hover:text-white'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeParkingLevel(lv.id)}
                  title="Xóa tầng"
                  className="w-7 h-7 rounded-lg border border-[#f85149]/40 text-[#f85149] hover:bg-[#f85149]/10 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add level */}
          <form onSubmit={handleAdd} className="pt-3 border-t border-[#30363d] flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[#8b949e] text-[11px] mb-1">Tên tầng mới</label>
              <Input
                placeholder="e.g. Tầng hầm B1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
            <div className="w-24">
              <label className="block text-[#8b949e] text-[11px] mb-1">Mã</label>
              <Input
                placeholder="B1"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                className="bg-[#161b22] border-[#30363d] text-white font-mono"
              />
            </div>
            <Button type="submit" variant="primary" className="text-xs gap-1.5" disabled={!newName.trim()}>
              <Plus className="w-3.5 h-3.5" />
              Thêm
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
