import React from 'react';
import { useTranslation } from 'react-i18next';

export const InstallGuide: React.FC = () => {
  const { t } = useTranslation('download');
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{t('Install guide')}</h2>
        <h3 className="mt-4 text-sm font-medium">{t('Edge Client (Windows)')}</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t('Run the NSIS installer.')}</li>
          <li>{t('Activate with the code from the dashboard.')}</li>
        </ol>
        <h3 className="mt-4 text-sm font-medium">{t('Driver app (Android)')}</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t('Allow install from this source when Android asks.')}</li>
          <li>{t('Open the downloaded APK to install.')}</li>
        </ol>
      </section>
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">{t('Verify your download')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('Compare the SHA-256 printed by these commands with the value on the card.')}
        </p>
        <div className="mt-3 text-sm">{t('Windows')}</div>
        <pre className="mt-1 overflow-x-auto rounded bg-background p-3 font-mono text-xs">
          Get-FileHash -Algorithm SHA256 &lt;file&gt;
        </pre>
        <div className="mt-3 text-sm">{t('Linux')}</div>
        <pre className="mt-1 overflow-x-auto rounded bg-background p-3 font-mono text-xs">
          sha256sum &lt;file&gt;
        </pre>
        <div className="mt-3 text-sm">{t('macOS')}</div>
        <pre className="mt-1 overflow-x-auto rounded bg-background p-3 font-mono text-xs">
          shasum -a 256 &lt;file&gt;
        </pre>
      </section>
    </div>
  );
};
