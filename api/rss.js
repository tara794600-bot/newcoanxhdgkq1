import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getRequestContentSite } from '../server/content-site.js'
import { resolveCompanyContent } from '../shared/company-content.js'

const DEFAULT_SITE = getRequestContentSite()
const RSS_ITEM_LIMIT = 500
const DESCRIPTION_MAX_LENGTH = 1000
const toTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '')

const parseJsonEnv = (key) => {
  const rawValue = process.env[key]
  if (!rawValue?.trim()) return null

  try {
    const parsed = JSON.parse(rawValue)
    if (parsed && typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n')
    }
    return parsed
  } catch {
    throw new Error(`${key} 환경변수가 JSON 형식이 아닙니다.`)
  }
}

const getFirebaseApp = () => {
  if (getApps().length > 0) return getApps()[0]

  const serviceAccount =
    parseJsonEnv('FIREBASE_SERVICE_ACCOUNT_JSON') ?? parseJsonEnv('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수를 설정해주세요.')
  }
  return initializeApp({ credential: cert(serviceAccount) })
}

const toDate = (value) => {
  const date = value && typeof value.toDate === 'function'
    ? value.toDate()
    : value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
}

const escapeXml = (value) => String(value)
  .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const summarize = (description) => {
  const characters = Array.from(description.replace(/\s+/g, ' ').trim())
  return characters.length > DESCRIPTION_MAX_LENGTH
    ? `${characters.slice(0, DESCRIPTION_MAX_LENGTH).join('')}…`
    : characters.join('')
}

export const getLatestCompanyRssItems = async (collectionRef, site = DEFAULT_SITE) => {
  const items = []
  const query = collectionRef.orderBy('createdAt', 'desc').limit(RSS_ITEM_LIMIT)
  let cursor = null

  // Continue past phone-only/incomplete posts until 500 detail pages are found.
  // Site-search blocking does not hide a detail page from RSS.
  while (items.length < RSS_ITEM_LIMIT) {
    const snapshot = await (cursor ? query.startAfter(cursor) : query).get()
    for (const doc of snapshot.docs) {
      const data = doc.data() ?? {}
      const name = toTrimmedString(data.name)
      const service = toTrimmedString(data.service)
      const description = toTrimmedString(data.description)
      if (!name || !service || !description || data.isPublic === false) {
        continue
      }

      const content = resolveCompanyContent({ name, service, description }, site.id)
      items.push({
        title: content.name,
        link: `${site.url}/companies/${encodeURIComponent(doc.id)}`,
        description: summarize(content.description),
        category: service,
        publishedAt: toDate(data.createdAt),
      })
      if (items.length === RSS_ITEM_LIMIT) break
    }
    if (snapshot.docs.length < RSS_ITEM_LIMIT) break
    cursor = snapshot.docs.at(-1)
  }

  return items
}

export const renderRss = (items, site = DEFAULT_SITE, now = new Date()) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>사기업체 게시판 | 법무법인 나란</title>
    <link>${escapeXml(site.url)}/companies</link>
    <atom:link href="${escapeXml(site.url)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>법무법인 나란 사기업체 게시판의 최신 상세페이지 500개를 제공합니다.</description>
    <language>ko-KR</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <ttl>5</ttl>
${items.map((item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <description>${escapeXml(item.description)}</description>
      <category>${escapeXml(item.category)}</category>${item.publishedAt ? `
      <pubDate>${item.publishedAt.toUTCString()}</pubDate>` : ''}
    </item>`).join('\n')}
  </channel>
</rss>
`

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).end('Method Not Allowed')
  }

  try {
    const site = getRequestContentSite(req)
    const collectionRef = getFirestore(getFirebaseApp()).collection('companyCases')
    const items = await getLatestCompanyRssItems(collectionRef, site)
    const rss = renderRss(items, site)

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate')
    if (req.method === 'HEAD') return res.status(200).end()
    return res.status(200).send(rss)
  } catch (error) {
    console.error('[api/rss] Firestore read failed', error)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '60')
    return res.status(503).end(req.method === 'HEAD' ? undefined : 'Service Unavailable')
  }
}
