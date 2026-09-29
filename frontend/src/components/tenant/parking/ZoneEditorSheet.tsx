import React, { useEffect, useMemo, useState } from 'react';
import { Shapes, X, Check, Trash2, Camera } from 'lucide-react';
import { usePlatform } from '../../../context/PlatformContext';
import { Button, Input } from '../../ui';
import { tenantApi, type MapLevelOut, type MapZoneOut, type ZoneBounds } from '../../../services/api';

interface ZoneEditorSheetProps {
  level: MapLevelOut;
  /** Set when editing an existing zone; null when drawing a new one. */
  zone: MapZoneOut | null;
  /** Bounds produced by drag-to-draw on the canvas (new zones only). */
  draftBounds: ZoneBounds | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ZoneEditorSheet: React.FC<ZoneEditorSheetProps> = ({
  level,
  zone,
  draftBounds,
  isOpen,
  onClose,
}) => {
  const {
    activeTenantId,
    cameras,
    parkingMap,
    removeParkingZone,
    refreshParkingMap,
    addToast,
  } = usePlatform();

  const isEdit = zone !== null;
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [capacity, setCapacity] = useState<number>(0);
  const [selectedCameraIds, setSelectedCameraIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Monitor cameras mounted at this level's site.
  const monitorCameras = useMemo(
    () => cameras.filter((c) => c.siteId === level.siteId && c.purpose === 'monitor'),
    [cameras, level.siteId]
  );

  // cameraId -> zoneIds currently covered (derived from map zone cameraIds).
  const coverageByCamera = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const lv of parkingMap) {
      for (const z of lv.zones) {
        for (const cid of z.cameraIds) {
          m.set(cid, [...(m.get(cid) ?? []), z.id]);
        }
      }
    }
    return m;
  }, [parkingMap]);

  useEffect(() => {
    if (!isOpen) return;
    setName(zone?.name ?? '');
    setCode(zone?.code ?? '');
    setCapacity(zone?.capacity ?? 0);
    setSelectedCameraIds(
      new Set(
        zone
          ? zone.cameraIds.filter((cid) => monitorCameras.some((c) => c.id === cid))
          : []
      )
    );
  }, [isOpen, zone, monitorCameras]);

  if (!isOpen) return null;

  const bounds = zone?.bounds ?? draftBounds;

  const toggleCamera = (id: string) => {
    setSelectedCameraIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !activeTenantId) return;
    setIsSaving(true);
    try {
      let zoneId = zone?.id ?? null;
      if (isEdit && zone) {
        await tenantApi.updateParkingZone(activeTenantId, zone.id, {
          name: name.trim(),
          code: code.trim() || null,
          capacity: Number(capacity) || 0,
        });
      } else {
        const created = await tenantApi.createParkingZone(activeTenantId, level.id, {
          name: name.trim(),
          code: code.trim() || null,
          bounds,
          capacity: Number(capacity) || 0,
        });
        zoneId = created.id;
      }
      // Sync coverage: each selected monitor camera should cover this zone.
      await Promise.all(
        monitorCameras.map((cam) => {
          const current = new Set(coverageByCamera.get(cam.id) ?? []);
          const want = selectedCameraIds.has(cam.id);
          const has = zoneId ? current.has(zoneId) : false;
          if (want === has || !zoneId) return Promise.resolve();
          const next = new Set(current);
          if (want) next.add(zoneId);
          else next.delete(zoneId);
          return tenantApi.setCameraCoverage(activeTenantId, cam.id, [...next]);
        })
      );
      refreshParkingMap();
      addToast({ type: 'success', title: isEdit ? 'Zone updated' : 'Zone added', description: name.trim() });
      onClose();
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to save zone', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!zone) return;
    removeParkingZone(zone.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] flex items-center justify-center">
              <Shapes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isEdit ? 'Chỉnh sửa khu vực' : 'Thêm khu vực đỗ xe'}
              </h3>
              <p className="text-xs text-[#8b949e]">{level.name} — vùng đỗ trên sơ đồ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Tên khu vực <span className="text-[#f85149]">*</span>
              </label>
              <Input
                placeholder="e.g. Khu A — gần thang máy"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Mã khu vực</label>
              <Input
                placeholder="e.g. A1"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="bg-[#161b22] border-[#30363d] text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Sức chứa (xe)</label>
              <Input
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="bg-[#161b22] border-[#30363d] text-white font-mono"
              />
            </div>
          </div>

          {bounds && (
            <p className="text-[10px] text-[#8b949e] font-mono">
              bounds: x={bounds.x.toFixed(2)} y={bounds.y.toFixed(2)} w={bounds.w.toFixed(2)} h={bounds.h.toFixed(2)}
            </p>
          )}

          {/* Monitor camera coverage */}
          <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] space-y-2">
            <h4 className="text-white font-semibold text-xs flex items-center gap-2">
              <Camera className="w-3.5 h-3.5 text-[#58a6ff]" />
              Camera giám sát phụ trách khu vực
            </h4>
            {monitorCameras.length === 0 ? (
              <p className="text-[11px] text-[#8b949e] italic">
                Chưa có camera nào ở khu vực này với purpose "monitor".
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {monitorCameras.map((cam) => (
                  <label
                    key={cam.id}
                    className="flex items-center gap-2 text-xs text-[#c9d1d9] cursor-pointer hover:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCameraIds.has(cam.id)}
                      onChange={() => toggleCamera(cam.id)}
                      className="accent-[#58a6ff]"
                    />
                    <span>{cam.cameraName}</span>
                    {cam.code && <span className="text-[10px] text-[#8b949e] font-mono">{cam.code}</span>}
                  </label>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[#8b949e]">
              Camera monitor được chọn sẽ ghi nhận xe đỗ/di chuyển trong khu vực này.
            </p>
          </div>

          <div className="pt-4 border-t border-[#30363d] flex items-center justify-between gap-3">
            <div>
              {isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  className="text-xs text-[#f85149] border-[#f85149]/40 hover:bg-[#f85149]/10 gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" onClick={onClose} className="text-xs">
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSaving}
                className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {isEdit ? 'Lưu khu vực' : 'Tạo khu vực'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
