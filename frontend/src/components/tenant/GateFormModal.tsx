import React, { useEffect, useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { TenantSite } from '../../types/tenant';
import { GateHealth } from '../../types/platform';
import { DoorOpen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GateFormModalProps {
  site: TenantSite;
  gate: GateHealth | null; // null = create, set = edit
  isOpen: boolean;
  onClose: () => void;
}

const SELECT_CLS =
  'w-full bg-[#161b22] border border-[#30363d] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#58a6ff]';

const GATE_TYPES = ['barrier', 'turnstile', 'speed-gate', 'chain-gate'] as const;

export const GateFormModal: React.FC<GateFormModalProps> = ({ site, gate, isOpen, onClose }) => {
  const { createTenantGate, updateTenantGate, tenantLanes, edgeDevices } = usePlatform();
  const { t } = useTranslation('tenant');
  const isEdit = gate !== null;

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    gateType: 'barrier',
    modelType: '',
    laneId: '',
    edgeDeviceId: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      name: gate?.gateName ?? '',
      code: '',
      gateType: gate?.rawType ?? 'barrier',
      modelType: '',
      laneId: gate?.laneId ?? '',
      edgeDeviceId: gate?.edgeDeviceId ?? '',
    });
  }, [isOpen, gate]);

  if (!isOpen) return null;

  const siteLanes = tenantLanes.filter((l) => l.siteId === site.id);
  const siteDevices = edgeDevices.filter((d) => d.siteId === site.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setIsLoading(true);
    const body = {
      name: formData.name.trim(),
      gateType: formData.gateType,
      laneId: formData.laneId || null,
      edgeDeviceId: formData.edgeDeviceId || null,
    };
    if (isEdit && gate) {
      // Backend PATCH revalidates against GateIn, which requires site_id.
      updateTenantGate(gate.id, { ...body, siteId: site.id });
    } else {
      createTenantGate(site.id, { ...body, code: formData.code.trim() || null, modelType: formData.modelType.trim() || null });
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
            <div className="w-10 h-10 rounded-xl bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] flex items-center justify-center">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {isEdit ? t('Edit Gate') : t('Add Barrier Gate')}
              </h3>
              <p className="text-xs text-[#8b949e]">{t('{{site}} — lane assignment & edge gateway binding', { site: site.name })}</p>
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
                {t('Gate Name')} <span className="text-[#f85149]">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('e.g. Main Entrance')}
                className="w-full bg-[#161b22] border border-[#30363d] text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[#58a6ff]"
              />
            </div>
            {!isEdit && (
              <div>
                <label className="block text-[#c9d1d9] font-medium mb-1.5">{t('Gate Code')}</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder={t('e.g. GATE-02')}
                  className="w-full bg-[#161b22] border border-[#30363d] text-white rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            )}
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">{t('Gate Type')}</label>
              <select
                value={formData.gateType}
                onChange={(e) => setFormData({ ...formData, gateType: e.target.value })}
                className={SELECT_CLS}
              >
                {GATE_TYPES.map((gt) => (
                  <option key={gt} value={gt}>{t(gt)}</option>
                ))}
              </select>
            </div>
            {!isEdit && (
              <div>
                <label className="block text-[#c9d1d9] font-medium mb-1.5">{t('Model / Hardware')}</label>
                <input
                  type="text"
                  value={formData.modelType}
                  onChange={(e) => setFormData({ ...formData, modelType: e.target.value })}
                  placeholder={t('e.g. barrier-arm-4m')}
                  className="w-full bg-[#161b22] border border-[#30363d] text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[#58a6ff]"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">{t('Lane')}</label>
              <select
                value={formData.laneId}
                onChange={(e) => setFormData({ ...formData, laneId: e.target.value })}
                className={SELECT_CLS}
              >
                <option value="">— {t('none')} —</option>
                {siteLanes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.direction === 'exit' ? t('outbound') : t('inbound')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">{t('Edge Gateway')}</label>
              <select
                value={formData.edgeDeviceId}
                onChange={(e) => setFormData({ ...formData, edgeDeviceId: e.target.value })}
                className={SELECT_CLS}
              >
                <option value="">— {t('none')} —</option>
                {siteDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.deviceName}</option>
                ))}
              </select>
              <p className="text-[10px] text-[#8b949e] mt-1.5">
                {t('The gateway drives the barrier relay; bind one so commands reach the board.')}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#30363d]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:text-white hover:bg-[#30363d] transition-colors cursor-pointer font-semibold"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim() || isLoading}
              className="px-4 py-2 rounded-lg bg-[#58a6ff] text-[#0d1117] hover:bg-[#79b8ff] transition-colors font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEdit ? t('Save Gate') : t('Create Gate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
