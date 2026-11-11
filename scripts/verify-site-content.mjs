import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mock } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { matchesCompanySearch, resolveCompanyContent } from '../shared/company-content.js'
import { getCompanySeoDescription, getCompanySeoTitle } from '../shared/company-seo.js'
import { buildCompanySlugIndex, resolveCompanySlug, toCompanySlug } from '../shared/company-slug.js'
import { clearCompanySlugIndex } from '../server/company-slug-index.js'
import { companyPostToPlainText, fillCompanyPostImageAlt, getCompanyPostImageUrls, sanitizeCompanyPostHtml, summarizeCompanyPostText } from '../shared/company-post.js'
import { CONTENT_SITE as site } from '../shared/site.js'
import companyHandler, { buildCompaniesPageHtml, buildCompanyCasePageHtml, buildNotFoundPageHtml } from '../api/company-page.js'
import sitemapHandler, { renderSitemap } from '../api/sitemap.js'

const html = await readFile(new URL('../dist/app-shell.html', import.meta.url), 'utf8')
const original = Object.freeze({
  id: 'shared-post', name: '샘플 업체', service: '투자사기',
  description: '원문 첫 줄입니다.\n두 번째 줄의 사실관계를 그대로 보존합니다.',
  image: '/logo.png', isPublic: true, isSearchBlocked: false,
})
const readBootstrap = (page) => JSON.parse(page.match(/window\.__COMPANY_PAGE_DATA__=([\s\S]*?)<\/script>/)[1])
const readArticle = (page) => JSON.parse(page.match(/id="route-structured-data"[^>]*>([\s\S]*?)<\/script>/)[1])['@graph'][0]

const expected = resolveCompanyContent(original)
assert.equal(expected.name, '샘플 업체 피해 관련 확인 사항')
assert.equal(expected.description, `샘플 업체 피해 관련 확인 사항\n유형: 투자사기\n\n${original.description}`)
assert.equal(expected.id, original.id)
assert.ok(expected.description.endsWith(original.description))
assert.ok(matchesCompanySearch(original, expected.name))
assert.ok(matchesCompanySearch(original, '두 번째 줄'))
assert.equal(matchesCompanySearch(original, '없는 검색어'), false)
assert.equal(resolveCompanyContent(original).name, expected.name)

const detail = buildCompanyCasePageHtml(html, original)
const expectedTitle = '샘플 업체 사기 피해 확인 — 지급정지·피해금 반환 절차 | 법무법인 나란'
assert.equal(getCompanySeoTitle(expected), expectedTitle)
assert.ok(detail.includes(`<title>${expectedTitle}</title>`))
assert.ok(detail.includes(`<h1>${expected.name}</h1>`))
assert.ok(detail.includes(`rel="canonical" href="${site.url}/companies/shared-post"`))
assert.ok(detail.includes(`property="og:title" content="${expectedTitle}"`))
assert.ok(detail.includes(`name="twitter:title" content="${expectedTitle}"`))
assert.ok(getCompanySeoDescription(expected).startsWith('샘플 업체 관련 투자사기 피해가 의심된다면'))
assert.ok(getCompanySeoDescription(expected).length <= 158)
assert.ok(detail.includes('name="keywords" content="샘플 업체, 샘플 업체 사기,'))
assert.equal(readBootstrap(detail).item.description, expected.description)
assert.equal(readBootstrap(detail).item.name, expected.name)
assert.equal(readArticle(detail).headline, expected.name)
assert.equal(readArticle(detail).description, getCompanySeoDescription(expected))

const list = buildCompaniesPageHtml(html, { items: [original], page: 1, searchQuery: '', totalCount: 1, totalPages: 1 })
assert.equal(readBootstrap(list).items[0].name, expected.name)
assert.equal(readBootstrap(list).items[0].description, expected.description)
assert.ok(list.includes(`<p class="company-card-name">${expected.name}</p>`))
assert.ok(buildNotFoundPageHtml(html, '/companies/missing').includes(`${site.url}/companies/missing`))
assert.ok(renderSitemap([]).includes(`<loc>${site.url}/companies</loc>`))

const phone = buildCompanyCasePageHtml(html, { ...original, isPublic: false })
assert.ok(phone.includes('href="tel:15517203"'))
assert.equal(readBootstrap(phone).item.name, expected.name)
const blocked = buildCompaniesPageHtml(html, { items: [{ ...original, isSearchBlocked: true }], page: 1, searchQuery: '', totalCount: 0, totalPages: 1 })
assert.equal(readBootstrap(blocked).items.length, 0)

const edited = { ...original, name: '수정된 업체', description: '수정된 원문' }
const editedData = readBootstrap(buildCompanyCasePageHtml(html, edited)).item
assert.equal(editedData.name, '수정된 업체 피해 관련 확인 사항')
assert.ok(!editedData.description.includes(original.description))

const unsafe = buildCompanyCasePageHtml(html, { ...original, name: '<img src=x onerror=alert(1)>', description: '</script><script>alert(1)</script>' })
assert.ok(!unsafe.includes('<img src=x'))
assert.ok(!unsafe.includes('</script><script>alert(1)</script>'))
assert.ok(unsafe.includes('&lt;img'))

const symbols = { ...original, name: '$& 업체', description: "원문 $& $' $` 문자를 그대로 보존" }
const symbolPage = buildCompanyCasePageHtml(html, symbols)
assert.equal(readBootstrap(symbolPage).item.description, resolveCompanyContent(symbols).description)
assert.ok(symbolPage.includes('<h1>$&amp; 업체'))
assert.equal((symbolPage.match(/<title>/g) ?? []).length, 1)

assert.deepEqual(resolveCompanyContent({}), { keyword: '', name: '', description: '' })
assert.equal(original.name, '샘플 업체')

// Blog editor posts: stored HTML is filtered before it reaches any page.
const imageUrl = 'https://firebasestorage.googleapis.com/v0/b/demo/o/a.png?alt=media&token=1'
const richPost = {
  ...original,
  hasRichContent: true,
  contentHtml: `<div class="se-component se-image se-align-center evil" contenteditable="false"><figure class="se-image-figure"><img src="${imageUrl.replace('&', '&amp;')}" onerror="alert(1)"></figure></div>`
    + '<p style="font-family: NanumGothic, sans-serif; position: fixed">본문 <b>강조</b></p><script>alert(1)</script>'
    + '<a href="javascript:alert(1)">위험</a><img src="http://insecure.example/a.png"><iframe src="https://evil.example"></iframe>',
}
const richDetail = buildCompanyCasePageHtml(html, richPost)
const richBody = richDetail.slice(richDetail.indexOf('company-post-body'), richDetail.indexOf('</article>'))
assert.ok(richBody.startsWith('company-post-body"><div class="se-component se-image se-align-center"><figure class="se-image-figure"><img src='))
assert.ok(richBody.includes('<p style="font-family: NanumGothic, sans-serif;">본문 <b>강조</b></p>'))
assert.doesNotMatch(richBody, /onerror|contenteditable|<script|javascript:|position|insecure\.example|iframe|evil/)
assert.ok(richDetail.includes(`<h1>${expected.name}</h1>`))
assert.ok(richDetail.includes('data-company-post-font="https://hangeul.pstatic.net/hangeul_static/css/nanum-gothic.css"'))
assert.equal(readBootstrap(richDetail).item.contentHtml, sanitizeCompanyPostHtml(richPost.contentHtml))
assert.ok(richBody.includes(`alt="${expected.name} 이미지 1"`))
assert.deepEqual(getCompanyPostImageUrls(richPost.contentHtml), [imageUrl])

// Images without a description are named after the post; written ones stay.
const altSource = sanitizeCompanyPostHtml('<img src="https://a.example/1.png"><img src="https://a.example/2.png" alt="직접 쓴 설명"><img src="https://a.example/3.png">')
assert.equal(
  fillCompanyPostImageAlt(altSource, '샘플 "업체"'),
  '<img src="https://a.example/1.png" alt="샘플 &quot;업체&quot; 이미지 1"><img src="https://a.example/2.png" alt="직접 쓴 설명"><img src="https://a.example/3.png" alt="샘플 &quot;업체&quot; 이미지 3">',
)
assert.equal(fillCompanyPostImageAlt(altSource, ''), altSource)

// Related posts render as links under the post and ship to the browser as card data.
const relatedCard = { id: 'next-post', name: '다음 업체', service: '부업사기', image: '/logo.png', description: '본문' }
const relatedPage = buildCompanyCasePageHtml(html, original, [relatedCard, { ...relatedCard, id: 'x"y', name: '<b>위험</b>' }])
assert.ok(relatedPage.includes('<h2 id="company-related-title" class="company-related-title">이런 사건도 함께 확인하세요</h2>'))
assert.ok(relatedPage.includes('href="/companies/next-post"'))
assert.ok(relatedPage.includes('<p class="company-card-name">다음 업체 피해 관련 확인 사항</p>'))
assert.ok(relatedPage.includes('href="/companies/x%22y"'))
assert.ok(!relatedPage.includes('<b>위험</b>'))
assert.deepEqual(readBootstrap(relatedPage).relatedItems[0], { id: 'next-post', slug: 'next-post', name: '다음 업체 피해 관련 확인 사항', service: '부업사기', image: '/logo.png' })
assert.equal(buildCompanyCasePageHtml(html, original).includes('company-related'), false)
const hiddenRelated = buildCompanyCasePageHtml(html, { ...original, isPublic: false }, [relatedCard])
assert.equal(hiddenRelated.includes('company-related'), false)
assert.deepEqual(readBootstrap(hiddenRelated).relatedItems, [])
assert.equal('contentHtml' in readBootstrap(buildCompanyCasePageHtml(html, { ...richPost, isPublic: false })).item, false)
assert.equal(buildCompanyCasePageHtml(html, { ...richPost, contentHtml: '' }).includes('company-post-body'), false)
assert.equal(companyPostToPlainText('<p>첫 줄</p><p><br></p><p>둘째 &amp; <b>셋째</b></p><table><tr><td>가</td><td>나</td></tr></table>'), '첫 줄\n\n둘째 & 셋째\n가 나')
assert.equal(summarizeCompanyPostText('가나다라마', 4), '가나다…')
assert.equal(summarizeCompanyPostText('가나다', 4), '가나다')
assert.equal(sanitizeCompanyPostHtml('<b>열림<i>중첩</b>'), '<b>열림<i>중첩</i></b>')
assert.equal(sanitizeCompanyPostHtml('<a href="https://naver.com">링크</a>'), '<a href="https://naver.com" target="_blank" rel="noopener noreferrer nofollow">링크</a>')

// Exercise the server entry points with former site hosts and local previews.
const response = () => ({
  headers: {}, statusCode: 0, body: '',
  setHeader(name, value) { this.headers[name] = value },
  status(code) { this.statusCode = code; return this },
  send(body) { this.body = body; return this },
  end(body = '') { this.body = body; return this },
})
const app = initializeApp({ projectId: 'single-site-verification' })
const snapshot = { id: original.id, exists: true, data: () => original }
const keywordPath = `/companies/${encodeURIComponent('샘플-업체')}`
clearCompanySlugIndex()
mock.method(getFirestore(app), 'collection', (name) => {
  assert.equal(name, 'companyCases')
  return {
    get: async () => ({ docs: [snapshot] }),
    select: () => ({ get: async () => ({ docs: [snapshot] }) }),
    doc: (id) => {
      assert.equal(id, original.id)
      return { get: async () => snapshot }
    },
  }
})
try {
  for (const host of [new URL(site.url).host, 'www.naranfintech.com', 'www.naranfintechnews.co.kr', 'localhost']) {
    const redirect = response()
    await companyHandler({ method: 'GET', url: '/api/company-page?id=shared-post', headers: { host } }, redirect)
    assert.equal(redirect.statusCode, 301)
    assert.equal(redirect.headers.Location, keywordPath)

    for (const [url, path] of [
      ['/companies', '/companies'],
      [`/api/company-page?id=${encodeURIComponent('샘플-업체')}`, keywordPath],
    ]) {
      const res = response()
      await companyHandler({ method: 'GET', url, headers: { host } }, res)
      assert.equal(res.statusCode, 200)
      assert.ok(res.body.includes(`rel="canonical" href="${site.url}${path}"`))
      const bootstrap = readBootstrap(res.body)
      assert.equal((bootstrap.item ?? bootstrap.items[0]).name, expected.name)
      assert.doesNotMatch(res.body, /https:\/\/www\.naranfintech(?:news\.co\.kr|\.com)/)
    }
    const sitemapResponse = response()
    await sitemapHandler({ method: 'GET', url: '/sitemap.xml', headers: { host } }, sitemapResponse)
    assert.equal(sitemapResponse.statusCode, 200)
    assert.ok(sitemapResponse.body.includes(`<loc>${site.url}${keywordPath}</loc>`))
    assert.doesNotMatch(sitemapResponse.body, /https:\/\/www\.naranfintech(?:news\.co\.kr|\.com)/)
  }
} finally {
  mock.restoreAll()
  await deleteApp(app)
}

// The detail entry point reads the blog body from its own collection.
clearCompanySlugIndex()
mock.method(console, 'error', () => {})
const richApp = initializeApp({ projectId: 'rich-post-verification' })
const richSnapshot = { id: 'rich-post', exists: true, data: () => ({ ...original, hasRichContent: true }) }
mock.method(getFirestore(richApp), 'collection', (name) => ({
  doc: (id) => {
    assert.equal(id, 'rich-post')
    assert.ok(['companyCases', 'companyCaseContents'].includes(name))
    return { get: async () => (name === 'companyCases' ? richSnapshot : { exists: true, data: () => ({ html: richPost.contentHtml }) }) }
  },
}))
try {
  const res = response()
  await companyHandler({ method: 'GET', url: '/api/company-page?id=rich-post', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.includes('<div class="se-content company-post-body">'))
  assert.equal(readBootstrap(res.body).item.contentHtml, sanitizeCompanyPostHtml(richPost.contentHtml))
} finally {
  mock.restoreAll()
  await deleteApp(richApp)
}

// The detail entry point reads only the posts registered right before and after
// this one, then lists the same category first, nearest date first.
clearCompanySlugIndex()
mock.method(console, 'error', () => {})
const relatedApp = initializeApp({ projectId: 'related-post-verification' })
const relatedDoc = (id, service, createdAt, extra = {}) => ({
  id, exists: true, data: () => ({ ...original, name: `${id} 업체`, service, createdAt: new Date(createdAt), ...extra }),
})
const currentDoc = relatedDoc('current-post', '투자사기', '2026-10-20T00:00:00.000Z')
const newerDocs = [
  relatedDoc('newer-same', '투자사기', '2026-10-21T00:00:00.000Z'),
  relatedDoc('newer-other', '부업사기', '2026-10-20T01:00:00.000Z'),
  relatedDoc('newer-hidden', '투자사기', '2026-10-20T02:00:00.000Z', { isPublic: false }),
]
const olderDocs = [
  relatedDoc('older-same', '투자사기', '2026-10-19T06:00:00.000Z'),
  relatedDoc('older-blocked', '투자사기', '2026-10-19T12:00:00.000Z', { isSearchBlocked: true }),
]
const relatedQueries = []
mock.method(getFirestore(relatedApp), 'collection', (name) => {
  assert.equal(name, 'companyCases')
  return {
    doc: () => ({ get: async () => currentDoc }),
    orderBy: (field, direction = 'asc') => ({
      startAfter: (cursor) => ({
        limit: (count) => ({
          get: async () => {
            relatedQueries.push(`${field} ${direction} ${cursor.toISOString()} ${count}`)
            return { docs: direction === 'desc' ? olderDocs : newerDocs }
          },
        }),
      }),
    }),
  }
})
try {
  const res = response()
  await companyHandler({ method: 'GET', url: '/api/company-page?id=current-post', headers: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(relatedQueries.sort(), [
    'createdAt asc 2026-10-20T00:00:00.000Z 12',
    'createdAt desc 2026-10-20T00:00:00.000Z 12',
  ])
  assert.deepEqual(readBootstrap(res.body).relatedItems.map((item) => item.id), ['older-same', 'newer-same', 'newer-other'])
  assert.ok(res.body.includes('href="/companies/older-same"'))
  assert.doesNotMatch(res.body, /newer-hidden|older-blocked|href="\/companies\/current-post"/)
} finally {
  mock.restoreAll()
  await deleteApp(relatedApp)
}

// Posts missing here are read from the previous Firebase project, which still
// holds the pages search engines indexed before this domain was separated.
clearCompanySlugIndex()
const legacyApp = initializeApp({ projectId: 'legacy-post-verification' })
const legacyFields = {
  name: { stringValue: original.name },
  service: { stringValue: original.service },
  description: { stringValue: original.description },
  image: { stringValue: 'https://firebasestorage.googleapis.com/v0/b/newcoanxhdgkq.firebasestorage.app/o/a.png' },
  isPublic: { booleanValue: true },
  isSearchBlocked: { booleanValue: true },
  createdAt: { timestampValue: '2026-09-30T03:38:50.330Z' },
}
mock.method(getFirestore(legacyApp), 'collection', () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }))
mock.method(globalThis, 'fetch', async (url) => {
  assert.ok(String(url).startsWith('https://firestore.googleapis.com/v1/projects/newcoanxhdgkq/databases/(default)/documents/companyCases/'))
  const id = new URL(url).pathname.split('/').pop()
  return id === 'legacy-post'
    ? new Response(JSON.stringify({ fields: legacyFields }), { status: 200 })
    : new Response('{}', { status: id === 'missing-post' ? 404 : 500 })
})
mock.method(console, 'error', () => {})
try {
  const legacy = response()
  await companyHandler({ method: 'GET', url: '/api/company-page?id=legacy-post', headers: {} }, legacy)
  assert.equal(legacy.statusCode, 200)
  assert.ok(legacy.body.includes(`<h1>${expected.name}</h1>`))
  assert.ok(legacy.body.includes(`rel="canonical" href="${site.url}/companies/legacy-post"`))
  assert.equal(readBootstrap(legacy.body).item.isSearchBlocked, true)
  assert.equal(readArticle(legacy.body).datePublished, '2026-09-30T03:38:50.330Z')

  const missing = response()
  await companyHandler({ method: 'GET', url: '/api/company-page?id=missing-post', headers: {} }, missing)
  assert.equal(missing.statusCode, 404)

  const unavailable = response()
  await companyHandler({ method: 'GET', url: '/api/company-page?id=broken-post', headers: {} }, unavailable)
  assert.equal(unavailable.statusCode, 503)
} finally {
  mock.restoreAll()
  await deleteApp(legacyApp)
}
// Keyword slugs: the company name becomes the address of its detail page.
assert.equal(toCompanySlug('더라운지'), '더라운지')
assert.equal(toCompanySlug(' ORCA Market.com '), 'orca-market-com')
assert.equal(toCompanySlug('A/B?C#D%E'), 'a-b-c-d-e')
assert.equal(toCompanySlug('   '), '')
const slugIndex = buildCompanySlugIndex([
  { id: 'newer', name: '더라운지', createdAt: '2026-10-02T00:00:00Z' },
  { id: 'older', name: '더라운지', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'english', name: 'ORCA Market', createdAt: '2026-10-03T00:00:00Z' },
  { id: 'blank', name: '***', createdAt: '2026-10-03T00:00:00Z' },
])
assert.equal(slugIndex.slugById.get('older'), '더라운지')
assert.equal(slugIndex.slugById.get('newer'), '더라운지-newer')
assert.equal(slugIndex.slugById.get('blank'), 'blank')
assert.deepEqual(resolveCompanySlug(slugIndex, '더라운지'), { id: 'older', slug: '더라운지', redirect: false })
assert.deepEqual(resolveCompanySlug(slugIndex, '더라운지-newer'), { id: 'newer', slug: '더라운지-newer', redirect: false })
assert.deepEqual(resolveCompanySlug(slugIndex, 'newer'), { id: 'newer', slug: '더라운지-newer', redirect: true })
assert.deepEqual(resolveCompanySlug(slugIndex, 'ORCA-Market'), { id: 'english', slug: 'orca-market', redirect: true })
assert.deepEqual(resolveCompanySlug(slugIndex, 'ORCA Market'), { id: 'english', slug: 'orca-market', redirect: true })
assert.equal(resolveCompanySlug(slugIndex, '없는-업체'), null)

// An unknown keyword answers 404 without re-reading a freshly built index.
clearCompanySlugIndex()
const missingApp = initializeApp({ projectId: 'missing-keyword-verification' })
let indexReads = 0
mock.method(getFirestore(missingApp), 'collection', () => ({
  select: () => ({ get: async () => { indexReads += 1; return { docs: [snapshot] } } }),
  doc: () => ({ get: async () => ({ exists: false }) }),
}))
mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }))
try {
  const res = response()
  await companyHandler({ method: 'GET', url: `/api/company-page?id=${encodeURIComponent('없는-업체')}`, headers: {} }, res)
  assert.equal(res.statusCode, 404)
  assert.equal(indexReads, 1)
} finally {
  mock.restoreAll()
  await deleteApp(missingApp)
}
console.log('Single-site content verification passed')
