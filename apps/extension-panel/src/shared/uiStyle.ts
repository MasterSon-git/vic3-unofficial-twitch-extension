import type { Snapshot } from './openapi'

export type UiStyleKey = 'victoria3-default'

export type UiStyle = {
  key: UiStyleKey
  className: string
}

const defaultStyle: UiStyle = {
  key: 'victoria3-default',
  className: 'ui-style-victoria3-default',
}

export function resolveUiStyle(_snapshot: Snapshot | null): UiStyle {
  return defaultStyle
}
