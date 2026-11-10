import { xmlEscape } from './naming'

const NS = 'xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"'

/** The component node: title, description and group. */
export function generateComponentXml(title: string, description: string, group: string): string {
  const attrs = [`jcr:primaryType="cq:Component"`, `jcr:title="${xmlEscape(title)}"`, ...(description ? [`jcr:description="${xmlEscape(description)}"`] : []), `componentGroup="${xmlEscape(group)}"`]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<jcr:root ${NS}\n    ${attrs.join('\n    ')}/>\n`
}

/** Basic edit behavior: the author can edit, delete and insert the component. */
export function generateEditConfig(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"\n    jcr:primaryType="cq:EditConfig"\n    cq:actions="[edit,delete,insert]"/>\n`
}
