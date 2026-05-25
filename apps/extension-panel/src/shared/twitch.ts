export type TwitchAuth = {
  token: string
  channelId: string
  clientId: string
  userId: string
}

export type TwitchContext = {
  theme?: 'light' | 'dark'
  mode?: string
  language?: string
  arePlayerControlsVisible?: boolean
}

type TwitchListenTarget = 'broadcast' | 'global' | 'whisper-' | string

export type TwitchExt = {
  onAuthorized(callback: (auth: TwitchAuth) => void): void
  onContext(callback: (context: TwitchContext, changed: string[]) => void): void
  onVisibilityChanged?(callback: (visible: boolean, context: TwitchContext) => void): void
  listen?(target: TwitchListenTarget, callback: (target: string, contentType: string, message: string) => void): void
  unlisten?(target: TwitchListenTarget, callback: (target: string, contentType: string, message: string) => void): void
}

declare global {
  interface Window {
    Twitch?: {
      ext?: TwitchExt
    }
  }
}

export function getTwitchExt() {
  return window.Twitch?.ext ?? null
}

export function applyTwitchTheme(context: TwitchContext) {
  document.documentElement.classList.toggle('dark', context.theme === 'dark')
}

export function applyPreferredTheme() {
  document.documentElement.classList.toggle(
    'dark',
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  )
}
