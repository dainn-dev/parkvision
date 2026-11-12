import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api';

export type AndroidUpdate = {
  updateAvailable: boolean;
  required: boolean;
  latestVersion: string | null;
  latestVersionCode: number | null;
  notes: string | null;
  downloadUrl: string | null;
  sha256: string | null;
  sizeBytes: number | null;
};

type NativeAppUpdater = {
  getInfo(): Promise<{ versionName: string; versionCode: number }>;
  downloadAndInstall(options: { downloadUrl: string; sha256: string }): Promise<void>;
};

const AppUpdater = registerPlugin<NativeAppUpdater>('AppUpdater');

export async function checkAndroidUpdate(): Promise<AndroidUpdate | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { versionCode } = await AppUpdater.getInfo();
  return api<AndroidUpdate>(`/updates/android?versionCode=${versionCode}`, { auth: false });
}

export async function downloadAndInstallAndroidUpdate(update: AndroidUpdate): Promise<void> {
  if (!update.downloadUrl || !update.sha256) {
    throw new Error('Update package is incomplete');
  }
  await AppUpdater.downloadAndInstall({
    downloadUrl: update.downloadUrl,
    sha256: update.sha256,
  });
}
