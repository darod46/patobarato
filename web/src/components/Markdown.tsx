import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SITE_HOST = 'patobarato.com'

function isExternal(href: string | undefined): boolean {
  if (!href) return false
  if (href.startsWith('#')) return false
  if (href.startsWith('/') && !href.startsWith('//')) return false
  try {
    const url = new URL(href, `https://${SITE_HOST}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host !== SITE_HOST && host !== `www.${SITE_HOST}`
  } catch {
    return false
  }
}

const PROSE =
  'flex flex-col gap-4 text-[15px] leading-relaxed text-ink md:text-base ' +
  '[&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold ' +
  '[&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold ' +
  '[&_a]:font-semibold [&_a]:text-primary [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_th]:border-b [&_th]:py-2 [&_td]:border-b [&_td]:py-2'

/** Renders trusted-ish guide Markdown (GFM). Raw HTML is dropped; external links are nofollow. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className ? `${PROSE} ${className}` : PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ node: _node, href, children, ...props }) {
            if (!href) return <span>{children}</span>
            return isExternal(href) ? (
              <a {...props} href={href} target="_blank" rel="nofollow noopener noreferrer">
                {children}
              </a>
            ) : (
              <a {...props} href={href}>
                {children}
              </a>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
