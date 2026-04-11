import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lior.app',
  appName: 'Lior',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // Hardware-accelerated WebView rendering
    webContentsDebuggingEnabled: false,
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#F8E7EC',
      launchShowDuration: 0,
      launchFadeOutDuration: 200,
    },
    StatusBar: {
      // Edge-to-edge: transparent overlay so our gradient shows through
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      // Android: resize the viewport smoothly instead of panning
      resize: 'body' as any,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
