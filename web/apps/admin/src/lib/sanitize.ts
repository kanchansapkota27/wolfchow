/**
 * Strips all HTML except a safe allowlist of formatting tags/attributes.
 * Use this before any dangerouslySetInnerHTML with superadmin-authored content.
 */
export function sanitizeHtml(html: string): string {
  const ALLOWED_TAGS = new Set(['p', 'strong', 'em', 'u', 'b', 'i', 'ul', 'ol', 'li', 'br', 'a'])

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function clean(el: Element) {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ''))
      } else {
        for (const attr of Array.from(child.attributes)) {
          if (tag === 'a' && attr.name === 'href') {
            const href = attr.value
            if (!href.startsWith('https://') && !href.startsWith('http://')) {
              child.removeAttribute('href')
            }
          } else {
            child.removeAttribute(attr.name)
          }
        }
        clean(child)
      }
    }
  }

  clean(doc.body)
  return doc.body.innerHTML
}
