import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { TenantSite } from '../../types/tenant';
import { CameraHealth } from '../../types/platform';
import { Camera, X, Check } from 'lucide-react';
import { Button, Input } from '../ui';

interface CameraFormModalProps {
  site: TenantSite;
  camera: CameraHealth | null; // null = create, set = edit
  isOpen: boolean;
  onClose: () => void;
}

const SELECT_CLS =
  'w-full bg-[#161b22] border border-[#30363d] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#58a6ff]';

export const CameraFormModal: React.FC<CameraFormModalProps> = ({ site, camera, isOpen, onClose }) => {
  const { createTenantCamera, updateTenantCamera, tenantLanes, edgeDevices, parkingMap, setCameraCoverage } = usePlatform();
  const isEdit = camera !== null;
  const [coverageZoneIds, setCoverageZoneIds] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    streamUrl: '',
    purpose: 'plate',
    laneId: '',
    edgeDeviceId: '',
    status: 'provisioning',
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      name: camera?.cameraName ?? '',
      code: camera?.code ?? '',
      streamUrl: camera?.streamUrl ?? '',
      purpose: camera?.purpose ?? 'plate',
      laneId: camera?.laneId ?? '',
      edgeDeviceId: camera?.edgeDeviceId ?? '',
      status: camera ? (camera.status === 'ONLINE' ? 'active' : camera.status === 'OFFLINE' ? 'disabled' : 'provisioning') : 'provisioning',
      notes: camera?.notes ?? '',
    });
    // Prefill coverage from zones that already list this camera.
    const covered = new Set<string>();
    if (camera) {
      for (const lv of parkingMap) {
        for (const z of lv.zones) {
          if (z.cameraIds.includes(camera.id)) covered.add(z.id);
        }
      }
    }
    setCoverageZoneIds(covered);
  }, [isOpen, camera, parkingMap]);

  if (!isOpen) return null;

  const siteLanes = tenantLanes.filter((l) => l.siteId === site.id);
  const siteDevices = edgeDevices.filter((d) => d.siteId === site.id);
  const siteZones = parkingMap.filter((l) => l.siteId === site.id).flatMap((l) =>
    l.zones.map((z) => ({ ...z, levelName: l.name }))
  );

  const toggleZone = (id: string) => {
    setCoverageZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.streamUrl.trim()) return;

    setIsLoading(true);
    const body = {
      name: formData.name.trim(),
      code: formData.code.trim() || null,
      streamUrl: formData.streamUrl.trim(),
      purpose: formData.purpose,
      laneId: formData.laneId || null,
      edgeDeviceId: formData.edgeDeviceId || null,
      status: formData.status,
      notes: formData.notes.trim() || null,
    };
    if (isEdit && camera) {
      updateTenantCamera(camera.id, body);
      if (formData.purpose === 'monitor') {
        setCameraCoverage(camera.id, [...coverageZoneIds]);
      }
    } else {
      createTenantCamera(site.id, body);
    }
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl bg-[#0d0e12] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isEdit ? 'Edit Camera' : 'Register ANPR Camera'}
              </h3>
              <p className="text-xs text-[#8b949e]">{site.name} — video stream endpoint & lane assignment</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-white hover:bg-[#30363d] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Camera Name <span className="text-[#f85149]">*</span>
              </label>
              <Input
                placeholder="e.g. Entry Lane A Plate Cam"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="bg-[#161b22] border-[#30363d] text-white"
              />
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Camera Code</label>
              <Input
                placeholder="e.g. CAM-IN-01"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className="bg-[#161b22] border-[#30363d] text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">
              Stream URL <span className="text-[#f85149]">*</span>
            </label>
            <Input
              placeholder="rtsp://user:pass@192.168.1.10:554/stream1"
              value={formData.streamUrl}
              onChange={(e) => setFormData({ ...formData, streamUrl: e.target.value })}
              required
              className="bg-[#161b22] border-[#30363d] text-white font-mono"
            />
            <p className="text-[10px] text-[#8b949e] mt-1">
              rtsp://, rtsps:// or http(s):// — credentials in the URL are stored with the camera.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Purpose</label>
              <select
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                className={SELECT_CLS}
              >
                <option value="plate">Plate close-up (ANPR)</option>
                <option value="overview">Overview / context</option>
                <option value="monitor">Camera giám sát khu đỗ</option>
              </select>
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Lane</label>
              <select
                value={formData.laneId}
                onChange={(e) => setFormData({ ...formData, laneId: e.target.value })}
                className={SELECT_CLS}
              >
                <option value="">— none —</option>
                {siteLanes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Edge Device</label>
              <select
                value={formData.edgeDeviceId}
                onChange={(e) => setFormData({ ...formData, edgeDeviceId: e.target.value })}
                className={SELECT_CLS}
              >
                <option value="">— none —</option>
                {siteDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deviceName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className={SELECT_CLS}
              >
                <option value="provisioning">Provisioning (awaiting edge)</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          )}

          {formData.purpose === 'monitor' && (
            <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] space-y-2">
              <h4 className="text-white font-semibold text-xs">Phạm vi khu vực đỗ (zone coverage)</h4>
              {siteZones.length === 0 ? (
                <p className="text-[11px] text-[#8b949e] italic">
                  Site chưa có khu vực đỗ — tạo zone trong Sơ Đồ Bãi Xe trước.
                </p>
              ) : !isEdit ? (
                <p className="text-[11px] text-[#8b949e] italic">
                  Lưu camera trước, sau đó mở lại để gán khu vực phụ trách.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {siteZones.map((z) => (
                    <label
                      key={z.id}
                      className="flex items-center gap-2 text-xs text-[#c9d1d9] cursor-pointer hover:text-white"
                    >
                      <input
                        type="checkbox"
                        checked={coverageZoneIds.has(z.id)}
                        onChange={() => toggleZone(z.id)}
                        className="accent-[#58a6ff]"
                      />
                      <span className="font-mono">{z.code ?? z.name}</span>
                      <span className="text-[10px] text-[#8b949e]">{z.levelName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {isEdit && camera.lastSnapshotUrl && (
            <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] space-y-2">
              <h4 className="text-white font-semibold text-xs">Snapshot gần nhất</h4>
              <img
                src={camera.lastSnapshotUrl}
                alt="Last camera snapshot"
                className="w-full max-h-40 object-contain rounded-lg border border-[#30363d] bg-black"
              />
              {camera.snapshotCapturedAt && (
                <p className="text-[10px] text-[#8b949e] font-mono">
                  Captured: {new Date(camera.snapshotCapturedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">Notes</label>
            <Input
              placeholder="Mounting position, model, serial…"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="bg-[#161b22] border-[#30363d] text-white"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-[#30363d] flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {isEdit ? 'Save Camera' : 'Register Camera'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
