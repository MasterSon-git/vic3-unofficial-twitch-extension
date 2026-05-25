export function requireElement<T extends HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return element
}

export function setText(element: HTMLElement, text: string) {
  element.textContent = text
}
