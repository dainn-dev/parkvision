import React, { useState } from 'react';
import { Check, Copy, Server, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Modal, Select } from '../../ui';
import { usePlatform } from '../../../context/PlatformContext';

interface EdgeSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 1 | 2;

const SETUP_ERRORS: Record<string, string> = {
  site_required: 'Choose a site before continuing.',
  no_site: 'Your location will be created automatically during setup.',
};
const DEFAULT_GATES = [{ name: '', direction: 'entry' }, { name: '', direction: 'exit' }];

export const EdgeSetupWizard: React.FC<EdgeSetupWizardProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('tenant');
  const { tenantSites, setupTenantEdge } = usePlatform();
  const [step, setStep] = useState<Step>(1);
  const [deviceName, setDeviceName] = useState('');
  const [gates, setGates] = useState(DEFAULT_GATES);
  const [error, setError] = useState<string | null>(null);
  const [activation, setActivation] = useState<Awaited<ReturnType<typeof setupTenantEdge>>['data']>();
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const close = () => {
    if (isLoading) return;
    setStep(1);
    setDeviceName('');
    setGates(DEFAULT_GATES);
    setError(null);
    setActivation(undefined);
    setCopied(false);
    setCopyError(false);
    onClose();
  };

  const submit = async () => {
    if (!deviceName.trim() || gates.some((gate) => !gate.name.trim())) {
      setError(t('Enter the Edge device name and at least one gate to continue.'));
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await setupTenantEdge({
      deviceName: deviceName.trim(),
      gates: gates.map((gate) => ({ ...gate, name: gate.name.trim(), gateType: 'barrier' })),
    });
    setIsLoading(false);
    if (!result.success || !result.data) {
      setError(result.code ? t(SETUP_ERRORS[result.code] ?? 'Setup failed. Please try again.') : result.message ?? t('Setup failed. Please try again.'));
      return;
    }
    setActivation(result.data);
    setStep(2);
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
      footer={step === 2 ? (
        <div className="flex justify-end"><Button variant="primary" onClick={close}>{t('Done')}</Button></div>
      ) : (
        <div className="flex justify-between gap-3">
          <Button variant="secondary" onClick={step === 1 ? close : () => setStep(1)}>{step === 1 ? t('Cancel') : t('Back')}</Button>
          <Button variant="primary" isLoading={isLoading} onClick={() => void submit()}>{t('Create and show activation code')}</Button>
        </div>
      )}
    >
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-2" aria-label={t('Setup progress')}>
          {[
            { number: 1, title: t('Device and gates'), description: t('Name the Edge PC and its gates') },
            { number: 2, title: t('Activation'), description: t('Enter the code on the Edge PC') },
          ].map(({ number, title, description }) => {
            const isComplete = step === 2 && number === 1;
            const isCurrent = step === number;
            return (
              <div key={number} className={`rounded-lg border px-3 py-2 ${isCurrent ? 'border-primary bg-primary/10' : isComplete ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-background'}`}>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${isCurrent ? 'bg-primary text-primary-foreground' : isComplete ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {isComplete ? <Check className="size-3" /> : number}
                  </span>
                  <span>{title}</span>
                </div>
                <p className="mt-1 pl-7 text-[10px] text-muted-foreground">{description}</p>
              </div>
            );
          })}
        </div>
        {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
        {step === 1 && (
          <div className="space-y-4">
            <div><h3 className="font-semibold">{t('Name your gatehouse')}</h3><p className="mt-1 text-xs text-muted-foreground">{t('Use names your team will recognize. Technical settings can be added later.')}</p></div>
            <Input label={t('Edge PC name')} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder={t('e.g. Main gate computer')} required />
            {gates.map((gate, index) => <div key={index} className="space-y-2 rounded-lg border border-border p-3"><div className="flex items-center justify-between text-xs font-semibold"><span>{t('Gate {{number}}', { number: index + 1 })}</span>{gates.length > 1 && <Button variant="outline" type="button" onClick={() => setGates((current) => current.filter((_, i) => i !== index))}>{t('Remove')}</Button>}</div><Input label={t('Gate name')} value={gate.name} onChange={(event) => setGates(gates.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={t('e.g. Main entrance')} required /><Select label={t('Gate direction')} value={gate.direction} onChange={(event) => setGates(gates.map((item, i) => i === index ? { ...item, direction: event.target.value } : item))} options={[{ value: 'entry', label: t('Entry') }, { value: 'exit', label: t('Exit') }]} /></div>)}
            <Button variant="outline" type="button" onClick={() => setGates((current) => [...current, { name: '', direction: 'exit' }])}>{t('Add another gate')}</Button>
          </div>
        )}
        {step === 2 && activation && (
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
