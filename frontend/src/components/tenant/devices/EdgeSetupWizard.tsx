import React, { useState } from 'react';
import { Check, Copy, Server, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Select } from '../../ui';
import { usePlatform } from '../../../context/PlatformContext';

interface EdgeSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 1 | 2 | 3;

const SETUP_ERRORS: Record<string, string> = {
  site_required: 'Choose a site before continuing.',
  no_site: 'Your location will be created automatically during setup.',
};

export const EdgeSetupWizard: React.FC<EdgeSetupWizardProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { tenantSites, setupTenantEdge } = usePlatform();
  const [step, setStep] = useState<Step>(1);
  const [siteId, setSiteId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [gateName, setGateName] = useState('');
  const [gateDirection, setGateDirection] = useState('entry');
  const [error, setError] = useState<string | null>(null);
  const [activation, setActivation] = useState<Awaited<ReturnType<typeof setupTenantEdge>>['data']>();
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const hasSeveralSites = tenantSites.length > 1;

  const close = () => {
    if (isLoading) return;
    setStep(1);
    setSiteId('');
    setDeviceName('');
    setGateName('');
    setGateDirection('entry');
    setError(null);
    setActivation(undefined);
    setCopied(false);
    setCopyError(false);
    onClose();
  };

  const submit = async () => {
    if (!deviceName.trim() || !gateName.trim() || (hasSeveralSites && !siteId)) {
      setError(t('Enter the Edge device name, gate name, and site to continue.'));
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await setupTenantEdge({
      ...(hasSeveralSites ? { siteId } : {}),
      deviceName: deviceName.trim(),
      gateName: gateName.trim(),
      gateDirection,
      gateType: 'barrier',
    });
    setIsLoading(false);
    if (!result.success || !result.data) {
      setError(result.code ? t(SETUP_ERRORS[result.code] ?? 'Setup failed. Please try again.') : result.message ?? t('Setup failed. Please try again.'));
      return;
    }
    setActivation(result.data);
    setStep(3);
  };

  const copyCode = async () => {
    if (!activation?.activation.code) return;
    if (!navigator.clipboard) {
      setCopied(false);
      setCopyError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(activation.activation.code);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      maxWidth="md"
      title={<span className="flex items-center gap-2"><Server className="h-5 w-5 text-[#58a6ff]" />{t('Set up Edge Client')}</span>}
      subtitle={t('A guided setup for your gatehouse computer')}
      footer={step === 3 ? (
        <div className="flex justify-end"><Button variant="primary" onClick={close}>{t('Done')}</Button></div>
      ) : (
        <div className="flex justify-between gap-3">
          <Button variant="secondary" onClick={step === 1 ? close : () => setStep((step - 1) as Step)}>{step === 1 ? t('Cancel') : t('Back')}</Button>
          <Button variant="primary" isLoading={isLoading} onClick={() => step === 2 ? void submit() : setStep(2)}>{step === 2 ? t('Create and show activation code') : t('Continue')}</Button>
        </div>
      )}
    >
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          {[1, 2, 3].map((number) => <span key={number} className={`rounded-full px-2.5 py-1 ${step === number ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>{number}</span>)}
        </div>
        {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
        {step === 1 && (
          <div className="space-y-4">
            <div><h3 className="font-semibold">{t('Choose the location')}</h3><p className="mt-1 text-xs text-muted-foreground">{hasSeveralSites ? t('Select where this Edge Client will operate.') : tenantSites.length === 1 ? t('Your only location will be used automatically.') : t('A location will be created automatically from your tenant name.')}</p></div>
            {hasSeveralSites && <Select label={t('Location')} value={siteId} onChange={(event) => setSiteId(event.target.value)} options={[{ value: '', label: t('Select a location…') }, ...tenantSites.map((site) => ({ value: site.id, label: site.name }))]} />}
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div><h3 className="font-semibold">{t('Name your gatehouse')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('Use names your team will recognize. Technical settings can be added later.')}</p></div>
            <Input label={t('Edge PC name')} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder={t('e.g. Main gate computer')} required />
            <Input label={t('Gate name')} value={gateName} onChange={(event) => setGateName(event.target.value)} placeholder={t('e.g. Main entrance')} required />
            <Select label={t('Gate direction')} value={gateDirection} onChange={(event) => setGateDirection(event.target.value)} options={[{ value: 'entry', label: t('Entry') }, { value: 'exit', label: t('Exit') }]} />
          </div>
        )}
        {step === 3 && activation && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"><ShieldCheck className="h-6 w-6 text-emerald-400" /><div><h3 className="font-semibold">{t('Ready to activate')}</h3><p className="text-xs text-muted-foreground">{activation.device.name} · {activation.gate.name}</p></div></div>
            <div><p className="text-xs text-muted-foreground">{t('Enter this one-time code in ParkVision Edge on the gatehouse PC.')}</p><div className="mt-2 flex items-center gap-2"><code className="flex-1 rounded-lg bg-background px-4 py-3 text-center font-mono text-lg font-bold tracking-widest">{activation.activation.code}</code><Button variant="outline" aria-label={t('Copy activation code')} onClick={() => void copyCode()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div>{copyError && <p className="mt-1 text-xs text-destructive">{t('Copy failed, select the code manually')}</p>}<p className="mt-2 text-[11px] text-muted-foreground">{t('This code expires at {{time}}.', { time: new Date(activation.activation.expiresAt).toLocaleString() })}</p></div>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">{activation.nextSteps.map((nextStep) => <li key={nextStep}>{t(nextStep)}</li>)}</ol>
          </div>
        )}
      </div>
    </Modal>
  );
};
