import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { Flag, Plus, Search, Sliders, Check } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Switch,
  Input,
  Modal,
  Select
} from '../../components/ui';

export const FeatureFlagsPage: React.FC = () => {
  const { featureFlags, toggleFeatureFlag, addToast } = usePlatform();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Flag Form
  const [flagKey, setFlagKey] = useState('');
  const [flagName, setFlagName] = useState('');
  const [flagDesc, setFlagDesc] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'staging' | 'development'>('production');
  const [rolloutPercentage, setRolloutPercentage] = useState(100);

  const filteredFlags = featureFlags.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFlag = () => {
    if (!flagKey.trim() || !flagName.trim()) {
      addToast({ type: 'error', title: 'Validation Error', description: 'Key and Name are required.' });
      return;
    }

    addToast({
      type: 'success',
      title: 'Feature Flag Created',
      description: `Feature flag ${flagKey.toUpperCase()} provisioned.`
    });

    setIsAddModalOpen(false);
    setFlagKey('');
    setFlagName('');
    setFlagDesc('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-400" /> Feature Flags & Progressive Rollouts
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Safely roll out platform capabilities, AI models, and gate algorithms dynamically without redeploying code.
          </p>
        </div>

        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setIsAddModalOpen(true)}
          className="shadow-md shadow-indigo-600/30"
        >
          New Feature Flag
        </Button>
      </div>

      {/* Search Bar */}
      <Card className="p-4">
        <Input
          placeholder="Search feature flags by key, name, or description..."
          icon={Search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      {/* Flags List */}
      <div className="space-y-4">
        {filteredFlags.map((flag) => (
          <Card key={flag.id} className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-3">
                  <Badge variant={flag.enabled ? 'emerald' : 'slate'} dot>
                    {flag.enabled ? 'ENABLED' : 'DISABLED'}
                  </Badge>
                  <code className="text-xs font-mono font-bold text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                    {flag.key}
                  </code>
                  <Badge variant={flag.environment === 'production' ? 'purple' : 'blue'} size="sm">
                    {flag.environment.toUpperCase()}
                  </Badge>
                </div>

                <h3 className="text-base font-bold text-white mt-1">{flag.name}</h3>
                <p className="text-xs text-slate-400">{flag.description}</p>

                <div className="text-[11px] text-slate-500 pt-1 font-mono">
                  Rollout: {flag.rolloutPercentage}% • Updated by {flag.updatedBy} at {new Date(flag.updatedAt).toLocaleString()}
                </div>
              </div>

              {/* Action Controls */}
              <div className="flex items-center gap-6 shrink-0 bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                    Rollout Gate
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-300">
                    {flag.rolloutPercentage}% Target
                  </span>
                </div>

                <Switch
                  checked={flag.enabled}
                  onChange={() => toggleFeatureFlag(flag.id)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create Flag Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Provision Platform Feature Flag"
        subtitle="Configure progressive deployment rules for new runtime capabilities"
      >
        <div className="space-y-4 text-xs">
          <Input
            label="Feature Flag Key Identifier *"
            placeholder="e.g. ANPR_YOLO_V11_PRECISION"
            value={flagKey}
            onChange={(e) => setFlagKey(e.target.value.toUpperCase())}
          />

          <Input
            label="Feature Display Name *"
            placeholder="e.g. YOLOv11 License Plate Recognition AI"
            value={flagName}
            onChange={(e) => setFlagName(e.target.value)}
          />

          <Input
            label="Description"
            placeholder="High precision 99.8% ANPR model for low light camera conditions"
            value={flagDesc}
            onChange={(e) => setFlagDesc(e.target.value)}
          />

          <Select
            label="Target Environment"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as any)}
            options={[
              { value: 'production', label: 'Production' },
              { value: 'staging', label: 'Staging' },
              { value: 'development', label: 'Development' }
            ]}
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Initial Target Rollout ({rolloutPercentage}%)
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={rolloutPercentage}
              onChange={(e) => setRolloutPercentage(Number(e.target.value))}
              className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon={Check} onClick={handleCreateFlag}>
              Create Flag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
