import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.dainn.parkvision',
  appName: 'ParkVision',
  webDir: 'dist',
  plugins: {
    // Route fetch/XHR through the native HTTP stack. The UI runs on the app's
    // own origin (https://localhost) while the API is on another host, and
    // the API's CORS policy does not list that origin.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
