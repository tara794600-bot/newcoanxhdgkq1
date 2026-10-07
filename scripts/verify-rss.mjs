import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { mock } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import handler, { getLatestCompanyRssItems, renderRss } from '../api/rss.js'
import { CONTENT_SITES, resolveCompanyContent } from '../shared/company-content.js'

// Model Firestore ordering, limits and document cursors without live credentials.
const createCollection = (records) => {
  let reads = 0
  const makeQuery = ({ field, direction = 'asc', limit = Infinity, cursor } = {}) => ({
    orderBy: (field, direction) => makeQuery({ field, direction, limit, cursor }),
    limit: (limit) => makeQuery({ field, direction, limit, cursor }),
    startAfter: (cursor) => makeQuery({ field, direction, limit, cursor }),
    get: async () => {
      reads += 1
      const ordered = records.filter((record) => !field || record.data()[field] !== undefined)
        .sort((a, b) => {
          const aValue = a.data()[field]?.toMillis() ?? 0
          const bValue = b.data()[field]?.toMillis() ?? 0
          const result = aValue - bValue || a.id.localeCompare(b.id)
          return direction === 'desc' ? -result : result
        })
      const start = cursor ? ordered.findIndex((record) => record.id === cursor.id) + 1 : 0
      return { docs: ordered.slice(start, start + limit) }
    },
  })
  return { ref: makeQuery(), reads: () => reads }
}

const baseTime = Date.parse('2026-10-01T00:00:00Z')
const record = (id, data) => ({ id, data: () => data })
const records = Array.from({ length: 505 }, (_, index) => record(`post-${String(index).padStart(4, '0')}`, {
  name: `업체 ${index}`,
  service: '투자사기',
  description: `상세 내용 ${index}`,
  createdAt: Timestamp.fromMillis(baseTime + Math.floor(index / 2) * 1000),
  // Updating an old post must not make it the newest publication.
  updatedAt: Timestamp.fromMillis(baseTime + (2000 - index) * 1000),
  ...(index % 2 ? { isPublic: true, isSearchBlocked: index % 3 === 0 } : {}),
}))
const hiddenRecords = Array.from({ length: 510 }, (_, index) => record(`hidden-${index}`, {
  name: '숨긴 업체', service: '투자사기', description: '노출되면 안 되는 내용',
  createdAt: Timestamp.fromMillis(baseTime + (1000 + index) * 1000),
  ...[{ isPublic: false }, { service: ' ' }, { description: ' ' }][index % 3],
}))
const collection = createCollection([...records, ...hiddenRecords])
const site = CONTENT_SITES[0]
const items = await getLatestCompanyRssItems(collection.ref, site)
assert.equal(items.length, 500)
assert.equal(collection.reads(), 3)
assert.equal(new Set(items.map((item) => item.link)).size, 500)
assert.equal(items[0].link, `${site.url}/companies/post-0504`)
assert.equal(items.at(-1).link, `${site.url}/companies/post-0005`)
assert.ok(items.every((item, index) => !index || item.publishedAt <= items[index - 1].publishedAt))
assert.ok(items.every((item) => !item.link.includes('hidden-')))
assert.ok(items.some((item) => item.link.endsWith('/post-0501')), 'Internal search-blocked posts belong in RSS')

const shortCollection = createCollection(records.slice(0, 2))
assert.equal((await getLatestCompanyRssItems(shortCollection.ref, site)).length, 2)
assert.equal(shortCollection.reads(), 1)
assert.deepEqual(await getLatestCompanyRssItems(createCollection([]).ref, site), [])
assert.deepEqual(await getLatestCompanyRssItems(createCollection(hiddenRecords).ref, site), [])
const exactCollection = createCollection(records.slice(0, 500))
assert.equal((await getLatestCompanyRssItems(exactCollection.ref, site)).length, 500)
assert.equal(exactCollection.reads(), 1)

const specialPost = {
  name: '업체 & <검증> "인용" \'작은따옴표\'',
  service: '유형 & 검증',
  description: '한글 <script>alert("x")</script> & ]]> \u0001 🙂\n두 번째 줄',
  createdAt: Timestamp.fromMillis(baseTime),
}
const specialRecord = record('한글 & ?#', specialPost)
for (const domain of CONTENT_SITES) {
  const domainItems = await getLatestCompanyRssItems(createCollection([specialRecord]).ref, domain)
  const content = resolveCompanyContent(specialPost, domain.id)
  assert.equal(domainItems[0].title, content.name)
  assert.equal(domainItems[0].link, `${domain.url}/companies/${encodeURIComponent(specialRecord.id)}`)
  const xml = renderRss(domainItems, domain, new Date('2026-10-07T00:00:00Z'))
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/)
  assert.ok(xml.includes(`href="${domain.url}/rss.xml"`))
  assert.match(xml, /&amp; &lt;검증&gt; &quot;인용&quot; &apos;작은따옴표&apos;/)
  assert.match(xml, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; \]\]&gt;/)
  assert.doesNotMatch(xml, /\u0001|<script>|Invalid Date/)
  assert.match(xml, /<pubDate>Thu, 01 Oct 2026 00:00:00 GMT<\/pubDate>/)
  assert.match(xml, /<lastBuildDate>Wed, 07 Oct 2026 00:00:00 GMT<\/lastBuildDate>/)
}
const longItems = await getLatestCompanyRssItems(createCollection([
  record('long-post', { ...specialPost, description: '🙂'.repeat(2000) }),
]).ref, site)
assert.equal(Array.from(longItems[0].description).length, 1001)
assert.ok(longItems[0].description.endsWith('🙂…'))
const undated = await getLatestCompanyRssItems(createCollection([
  record('undated', { ...specialPost, createdAt: null }),
]).ref, site)
assert.doesNotMatch(renderRss(undated, site), /<pubDate>|Invalid Date/)
assert.equal((renderRss(items, site).match(/<item>/g) ?? []).length, 500)

const response = () => ({
  headers: {}, statusCode: 0, body: undefined,
  setHeader(name, value) { this.headers[name] = value },
  status(code) { this.statusCode = code; return this },
  send(body) { this.body = body; return this },
  end(body) { this.body = body; return this },
})
const app = initializeApp({ projectId: 'rss-verification' })
let activeCollection = createCollection([specialRecord]).ref
mock.method(getFirestore(app), 'collection', (name) => {
  assert.equal(name, 'companyCases')
  return activeCollection
})
try {
  for (const domain of CONTENT_SITES) {
    const req = { method: 'GET', url: '/rss.xml', headers: { host: new URL(domain.url).host } }
    const res = response()
    await handler(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['Content-Type'], 'application/rss+xml; charset=utf-8')
    assert.match(res.headers['Cache-Control'], /s-maxage=300/)
    assert.ok(res.body.includes(`href="${domain.url}/rss.xml"`))
    assert.ok(res.body.includes(`${domain.url}/companies/`))
    const head = response()
    await handler({ ...req, method: 'HEAD' }, head)
    assert.equal(head.statusCode, 200)
    assert.equal(head.body, undefined)
  }

  activeCollection = createCollection([]).ref
  const empty = response()
  await handler({ method: 'GET', headers: {} }, empty)
  assert.equal(empty.statusCode, 200)
  assert.doesNotMatch(empty.body, /<item>/)

  const unsupported = response()
  await handler({ method: 'POST' }, unsupported)
  assert.equal(unsupported.statusCode, 405)
  assert.equal(unsupported.headers.Allow, 'GET, HEAD')

  activeCollection = { orderBy() { throw new Error('Simulated Firestore failure') } }
  const errorLog = mock.method(console, 'error', () => {})
  for (const method of ['GET', 'HEAD']) {
    const unavailable = response()
    await handler({ method, headers: {} }, unavailable)
    assert.equal(unavailable.statusCode, 503)
    assert.equal(unavailable.headers['Cache-Control'], 'no-store')
    assert.equal(unavailable.headers['Retry-After'], '60')
    assert.equal(unavailable.body, method === 'HEAD' ? undefined : 'Service Unavailable')
  }
  assert.equal(errorLog.mock.callCount(), 2)
} finally {
  mock.restoreAll()
  await deleteApp(app)
}

const routes = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
const rssRoute = routes.rewrites.findIndex((rule) => rule.source === '/rss.xml')
assert.ok(rssRoute >= 0 && rssRoute < routes.rewrites.findIndex((rule) => rule.source === '/(.*)'))
assert.equal(routes.rewrites[rssRoute].destination, '/api/rss')
for (const file of ['public/rss.xml', 'dist/rss.xml']) {
  await assert.rejects(access(new URL(`../${file}`, import.meta.url)), { code: 'ENOENT' })
}
for (const file of ['index.html', 'dist/app-shell.html']) {
  const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
  assert.match(html, /<link[^>]*type="application\/rss\+xml"[^>]*href="\/rss.xml"/)
}
console.log('RSS verified: latest 500, pagination, visibility, three domains, XML escaping, GET/HEAD, failure responses and dynamic routing.')
