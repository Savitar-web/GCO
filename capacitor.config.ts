import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.savitarxeno.gco',
  appName: 'GymCogOrigins',
  webDir: 'dist',
  server: {
    url: 'https://gco-one.vercel.app',
    cleartext: false,
  },
  plugins: {
  MediaSession: { foregroundService: 'always' }
}
}

export default config