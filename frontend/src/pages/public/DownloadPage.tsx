import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ReleaseChannel } from '../../services/api';
import { InstallGuide } from './download/InstallGuide';
import { ReleaseCard } from './download/ReleaseCard';
import { useLatestReleases } from './download/useLatestReleases';

const CHANNELS: ReleaseChannel[] = ['edge-windows-x86_64', 'android'];

export const DownloadPage: React.FC = () => {
  const { t } = useTranslation('download');
  const { releases, isLoading, hasError, retry } = useLatestReleases();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16">
      <h1 className="text-3xl font-semibold">{t('Download ParkVision')}</h1>
      <p className="mt-2 text-muted-foreground">
        {t('Get the gatehouse Edge Client for Windows and the driver app for Android.')}
      </p>

      <div className="mt-10">
        {isLoading && (
          <div role="status" aria-label={t('Loading releases')} className="grid gap-6 md:grid-cols-2">
            {CHANNELS.map((c) => (
              <div key={c} className="h-64 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        )}
        {hasError && (
          <div role="alert" className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-warning">{t('Could not load releases.')}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t('Retry')}
            </button>
          </div>
        )}
        {releases && (
          <div className="grid gap-6 md:grid-cols-2">
            {CHANNELS.map((c) => (
              <ReleaseCard key={c} channel={c} release={releases.find((r) => r.channel === c)} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <InstallGuide />
      </div>
    </main>
  );
};
