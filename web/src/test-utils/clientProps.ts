import { isValidElement, type ReactElement, type ReactNode } from 'react'

/** Props of the first element of type `component` in a server page's returned tree. */
export function propsOf<P>(tree: ReactNode, component: (props: P) => ReactNode): P {
  const stack: ReactNode[] = [tree]
  while (stack.length > 0) {
    const node = stack.pop()
    if (Array.isArray(node)) stack.push(...node)
    else if (isValidElement(node)) {
      const el = node as ReactElement<{ children?: ReactNode }>
      if (el.type === component) return el.props as P
      stack.push(el.props.children)
    }
  }
  throw new Error('component not found in tree')
}

/**
 * Keys that a client component's props would put in the RSC payload as data. React elements are skipped:
 * server components in a slot reach the client already rendered, not as props.
 */
export function payloadKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (isValidElement(value)) return keys
  if (Array.isArray(value)) value.forEach((v) => payloadKeys(v, keys))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k)
      payloadKeys(v, keys)
    }
  }
  return keys
}
