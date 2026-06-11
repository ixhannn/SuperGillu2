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
      // LIGHT means dark status-bar text/icons for the app's default light shell.
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      // Keep the WebView frame stable. Android is handled by adjustNothing in
      // the manifest/MainActivity; Capacitor's fullscreen resize workaround
      // fights that overlay model and makes the fixed shell jump above IME.
      resize: 'none' as any,
      resizeOnFullScreen: false,
      style: 'default' as any,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#E91E8C',
    },
  },
};

export default config;
