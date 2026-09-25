import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor — GymCogOrigins
 * ─────────────────────────────────────────────────────────────
 * Plugins instalados que usa este config:
 *  · @capgo/capacitor-media-session → gadget / FGS mediaPlayback
 *  · @capacitor/local-notifications → POST_NOTIFICATIONS (API 33+)
 *  · @capacitor/app → ciclo de vida
 *  · @capacitor-community/keep-awake → pantalla en vídeo FS (se usa en JS)
 *  · @capgo/capacitor-video-player → disponible; PiP actual va por WebView
 *
 * LIVE vs RELEASE:
 *  · LIVE_RELOAD = true  → el APK carga https://gco-one.vercel.app
 *  · LIVE_RELOAD = false → el APK usa assets de webDir ('dist') [recomendado release]
 *
 * Tras cambiar este archivo:
 *   npm run build && npx cap sync android
 */

/** Pon true solo mientras depuras contra Vercel. En tienda / release: false. */
const LIVE_RELOAD = false

const config: CapacitorConfig = {
  appId: 'com.savitarxeno.gco',
  appName: 'GymCogOrigins',
  webDir: 'dist',

  ...(LIVE_RELOAD
    ? {
        server: {
          url: 'https://gco-one.vercel.app',
          cleartext: false,
          androidScheme: 'https',
        },
      }
    : {
        server: {
          androidScheme: 'https',
          iosScheme: 'https',
          // hostname local: assets embebidos en el APK
          hostname: 'localhost',
        },
      }),

  android: {
    allowMixedContent: false,
    backgroundColor: '#0B1220',
    appendUserAgent: ' GCO-Capacitor',
    // true solo en debug; en release conviene false
    webContentsDebuggingEnabled: LIVE_RELOAD,
  },

  ios: {
    backgroundColor: '#0B1220',
    contentInset: 'automatic',
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },

  plugins: {
    /**
     * @capgo/capacitor-media-session
     * Mantiene el Foreground Service de tipo mediaPlayback en segundo plano.
     * Requiere AndroidManifest con:
     *   FOREGROUND_SERVICE_MEDIA_PLAYBACK
     *   com.capgo.mediasession.MediaSessionService
     *   android:foregroundServiceType="mediaPlayback"
     *   android:stopWithTask="false"
     */
    MediaSession: {
      foregroundService: 'always',
    },

    /**
     * @capacitor/local-notifications
     * useMediaPlayer pide el permiso en runtime (API 33+).
     * smallIcon debe existir en res/drawable; si no tienes el sample,
     * usa el icono por defecto del sistema omitiendo smallIcon.
     */
    LocalNotifications: {
      iconColor: '#22E6C5',
    },

    /** @capacitor/app — listeners de appStateChange en useMediaPlayer */
    App: {},
  },
}

export default config