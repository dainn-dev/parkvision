import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LatestReleaseOut, ReleaseChannel } from '../../../services/api';
import { formatBytes, formatDate } from './formatRelease';

interface ReleaseCardProps {
  channel: ReleaseChannel;
  release: LatestReleaseOut | undefined;
}

const TITLES: Record<ReleaseChannel, string> = {
  'edge-windows-x86_64': 'Edge Client - Windows x64',
  android: 'Driver app - Android',
};

export const ReleaseCard: React.FC<ReleaseCardProps> = ({ channel, release }) => {
  const { t, i18n } = useTranslation('download');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyHash = async () => {
    if (!release) return;
    try {
      if (!navigator.clipboard) {
        setCopyState('failed');
        return;
      }
      await navigator.clipboard.writeText(release.sha256);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">{t(TITLES[channel])}</h2>
      {!release ? (
        <p className="text-sm text-muted-foreground">{t('No published release yet')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('Version')}</dt>
              <dd className="font-medium">{release.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('Released')}</dt>
              <dd className="font-medium">{formatDate(release.publishedAt, i18n.language)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('Size')}</dt>
              <dd className="font-medium">{formatBytes(release.sizeBytes)}</dd>
            </div>
          </dl>
          <div className="text-sm">
            <div className="text-muted-foreground">SHA-256</div>
            <div className="mt-1 flex items-start gap-2">
              <code className="break-all font-mono text-xs">{release.sha256}</code>
              <button
                type="button"
                onClick={copyHash}
                aria-label={t('Copy SHA-256')}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs hover:bg-background"
              >
                {copyState === 'copied' ? t('Copied') : t('Copy')}
              </button>
            </div>
            {copyState === 'failed' && (
              <p className="mt-1 text-xs text-warning">{t('Copy failed, select the hash manually')}</p>
            )}
          </div>
          {release.notes && (
            <div className="text-sm">
              <div className="text-muted-foreground">{t('Release notes')}</div>
              <p className="mt-1 whitespace-pre-line">{release.notes}</p>
            </div>
          )}
          <a
            href={`/api/v1/updates/download/${channel}`}
            className="mt-auto inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t('Download')}
          </a>
        </>
      )}
    </section>
  );
};
