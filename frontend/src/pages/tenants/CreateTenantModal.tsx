import React, { useState } from 'react';
import { Modal, Input, Select, Switch, Button, Badge } from '../../components/ui';
import { Building2, UserCheck, ShieldCheck, Check } from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';

export const CreateTenantModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { createTenant } = usePlatform();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 State: Organization
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');

  // Step 2 State: Tenant Admin
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(true);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleOrgNameChange = (val: string) => {
    setOrgName(val);
    if (!orgCode) {
      // Auto generate code from name
      const code = val
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, '-');
      setOrgCode(code);
    }
  };

  const validateStep1 = () => {
    const newErr: Record<string, string> = {};
    if (!orgName.trim()) newErr.orgName = 'Organization name is required';
    if (!orgCode.trim()) newErr.orgCode = 'Tenant code is required';
    if (!orgEmail.trim() || !orgEmail.includes('@')) newErr.orgEmail = 'Valid contact email is required';
    setErrors(newErr);
    return Object.keys(newErr).length === 0;
  };

  const validateStep2 = () => {
    const newErr: Record<string, string> = {};
    if (!adminName.trim()) newErr.adminName = 'Administrator full name is required';
    if (!adminEmail.trim() || !adminEmail.includes('@')) newErr.adminEmail = 'Valid admin email is required';
    if (!adminPassword || adminPassword.length < 10) newErr.adminPassword = 'Password must be at least 10 characters';
    setErrors(newErr);
    return Object.keys(newErr).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleSubmit = () => {
    createTenant(
      {
        name: orgName,
        code: orgCode,
        email: orgEmail,
        phone: orgPhone,
        timezone
      },
      {
        name: adminName,
        email: adminEmail,
        password: adminPassword
      }
    );

    // Reset & Close
    setStep(1);
    setOrgName('');
    setOrgCode('');
    setOrgEmail('');
    setOrgPhone('');
    setAdminName('');
    setAdminEmail('');
    setAdminPassword('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Provision Enterprise Tenant Organization"
      subtitle="Configure organization identity and primary tenant administrator"
      maxWidth="2xl"
    >
      {/* Step Stepper Indicator */}
      <div className="grid grid-cols-3 gap-2 mb-6 border-b border-slate-800 pb-4">
        <div className={`p-2.5 rounded-xl border text-center transition-all ${step === 1 ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
          <span className="text-[10px] font-bold block uppercase tracking-wider">Step 1</span>
          <span className="text-xs font-semibold flex items-center justify-center gap-1 mt-0.5">
            <Building2 className="w-3.5 h-3.5" /> Organization
          </span>
        </div>

        <div className={`p-2.5 rounded-xl border text-center transition-all ${step === 2 ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
          <span className="text-[10px] font-bold block uppercase tracking-wider">Step 2</span>
          <span className="text-xs font-semibold flex items-center justify-center gap-1 mt-0.5">
            <UserCheck className="w-3.5 h-3.5" /> Tenant Admin
          </span>
        </div>

        <div className={`p-2.5 rounded-xl border text-center transition-all ${step === 3 ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
          <span className="text-[10px] font-bold block uppercase tracking-wider">Step 3</span>
          <span className="text-xs font-semibold flex items-center justify-center gap-1 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Confirm & Provision
          </span>
        </div>
      </div>

      {/* Step 1: Organization Details */}
      {step === 1 && (
        <div className="space-y-4">
          <Input
            label="Organization Name *"
            placeholder="e.g. ABC Parking Logistics Enterprise"
            value={orgName}
            onChange={(e) => handleOrgNameChange(e.target.value)}
            error={errors.orgName}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Tenant Identifier Code *"
              placeholder="e.g. ABC-PARKING"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              error={errors.orgCode}
              helperText="Unique uppercase identifier used for routing & storage isolation"
            />

            <Select
              label="Default Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={[
                { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (GMT+7)' },
                { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT+8)' },
                { value: 'Asia/Tokyo', label: 'Asia/Tokyo (GMT+9)' },
                { value: 'UTC', label: 'UTC (Coordinated Universal Time)' }
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Email *"
              type="email"
              placeholder="contact@organization.com"
              value={orgEmail}
              onChange={(e) => setOrgEmail(e.target.value)}
              error={errors.orgEmail}
            />

            <Input
              label="Phone Number"
              placeholder="+84 28 3800 0000"
              value={orgPhone}
              onChange={(e) => setOrgPhone(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Step 2: Tenant Admin Account */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-xs text-indigo-200">
            This account will be assigned <strong>TENANT_ADMIN</strong> role for governance over this tenant organization.
          </div>

          <Input
            label="Administrator Full Name *"
            placeholder="e.g. Nguyen Van Minh"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            error={errors.adminName}
          />

          <Input
            label="Administrator Email *"
            type="email"
            placeholder="admin@organization.com"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            error={errors.adminEmail}
          />

          <Input
            label="Initial Password *"
            type="password"
            placeholder="••••••••••••"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            error={errors.adminPassword}
            helperText="Minimum 8 characters with numbers & symbols"
          />

          <Switch
            label="Require Password Reset on First Login"
            description="Forces the tenant admin to configure a new secret during initial authentication"
            checked={forcePasswordChange}
            onChange={setForcePasswordChange}
          />
        </div>
      )}

      {/* Step 3: Review & Provision */}
      {step === 3 && (
        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Organization Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div><span className="text-slate-500">Name:</span> {orgName}</div>
              <div><span className="text-slate-500">Code:</span> <code className="text-amber-300">{orgCode}</code></div>
              <div><span className="text-slate-500">Email:</span> {orgEmail}</div>
              <div><span className="text-slate-500">Timezone:</span> {timezone}</div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Primary Administrator Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div><span className="text-slate-500">Full Name:</span> {adminName}</div>
              <div><span className="text-slate-500">Email:</span> {adminEmail}</div>
              <div><span className="text-slate-500">Role:</span> TENANT_ADMIN</div>
              <div><span className="text-slate-500">Force Password Reset:</span> {forcePasswordChange ? 'Yes' : 'No'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        {step > 1 ? (
          <Button variant="outline" size="sm" onClick={() => setStep((step - 1) as any)}>
            Back
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        )}

        {step < 3 ? (
          <Button variant="primary" size="sm" onClick={handleNext}>
            Continue →
          </Button>
        ) : (
          <Button variant="success" size="sm" icon={Check} onClick={handleSubmit}>
            Confirm & Provision
          </Button>
        )}
      </div>
    </Modal>
  );
};
