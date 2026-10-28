import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dwss.kolwezi',
  appName: 'DWSS 斯语',
  webDir: 'www',
  android: { backgroundColor: '#F7F8FC', allowMixedContent: false },
  ios: { contentInset: 'automatic', backgroundColor: '#F7F8FC' },
  server: { androidScheme: 'https', iosScheme: 'https' },
};

export default config;
