import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import {
  Settings,
  Building2,
  Bell,
  Radio,
  Key,
  Shield,
  Save,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { Button, Input } from '../../components/ui';

export const TenantSettingsPage: React.FC = () => {
  const { addToast } = usePlatform();

  const [settings, setSettings] = useState({
    orgName: 'Acme Parking Systems',
    contactEmail: 'support@acmeparking.vn',
    supportHotline: '+84 28 3822 9999',
    ocrConfidenceThreshold: '90.0',
    autoOpenBarrier: true,
    alarmOnUnknownPlate: true,
    webhookUrl: 'https://api.acmeparking.vn/v1/webhooks/anpr-events',
    backupFrequency: 'HOURLY'
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    addToast({
      type: 'info',
      title: 'Not persisted',
      description: 'These tenant settings are not editable via the API yet — a platform admin must apply them.'
    });
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300 max-w-4xl">
      <div className="flex items-center justify-between gap-4 bg-[#161b22]/70 p-5 rounded-2xl border border-[#30363d] backdrop-blur-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-[#58a6ff]" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              Tenant Organization & Site Settings
            </h1>
          </div>
          <p className="text-xs text-[#8b949e] mt-1">
            Configure default OCR recognition thresholds, automated barrier relay policies, and webhook subscriptions
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5 text-xs">
        {/* Org Profile */}
        <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#58a6ff]" />
            Tenant Organization Profile
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Tenant Display Name</label>
              <Input
                value={settings.orgName}
                onChange={(e) => setSettings({ ...settings, orgName: e.target.value })}
                className="bg-[#0d0e12] border-[#30363d] text-white"
              />
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">Administrative Contact Email</label>
              <Input
                value={settings.contactEmail}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                className="bg-[#0d0e12] border-[#30363d] text-white"
              />
            </div>
          </div>
        </div>

        {/* ANPR Automation */}
        <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#3fb950]" />
            ANPR Engine & Gate Automation Rules
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Minimum OCR Confidence Threshold (%)
              </label>
              <Input
                type="number"
                value={settings.ocrConfidenceThreshold}
                onChange={(e) => setSettings({ ...settings, ocrConfidenceThreshold: e.target.value })}
                className="bg-[#0d0e12] border-[#30363d] text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[#c9d1d9] font-medium mb-1.5">
                Edge Backup Frequency
              </label>
              <select
                value={settings.backupFrequency}
                onChange={(e) => setSettings({ ...settings, backupFrequency: e.target.value })}
                className="w-full bg-[#0d0e12] border border-[#30363d] rounded-lg px-3 py-2 text-white"
              >
                <option value="REALTIME">Continuous Real-time Streaming</option>
                <option value="HOURLY">Hourly Batch Sync</option>
                <option value="DAILY">Daily Off-peak Archive</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoOpenBarrier}
                onChange={(e) => setSettings({ ...settings, autoOpenBarrier: e.target.checked })}
                className="rounded border-[#30363d] text-[#58a6ff]"
              />
              <span className="text-[#c9d1d9]">
                Automatically trigger barrier relay open when registered plate matches whitelist
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.alarmOnUnknownPlate}
                onChange={(e) => setSettings({ ...settings, alarmOnUnknownPlate: e.target.checked })}
                className="rounded border-[#30363d] text-[#58a6ff]"
              />
              <span className="text-[#c9d1d9]">
                Send operator alert push notification when unregistered or unknown vehicle approaches gate
              </span>
            </label>
          </div>
        </div>

        {/* Webhooks */}
        <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#a371f7]" />
            Outbound Webhook Dispatch
          </h3>

          <div>
            <label className="block text-[#c9d1d9] font-medium mb-1.5">Webhook Endpoint URL</label>
            <Input
              value={settings.webhookUrl}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              className="bg-[#0d0e12] border-[#30363d] text-white font-mono"
            />
            <p className="text-[11px] text-[#8b949e] mt-1">
              Events will be dispatched in JSON payload upon every gate open, denied, or manual override event.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" className="bg-[#238636] hover:bg-[#2ea043] text-white gap-2">
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
};
