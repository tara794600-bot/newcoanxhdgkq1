import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mock } from 'node:test'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { matchesCompanySearch, resolveCompanyContent } from '../shared/company-content.js'
import { companyPostToPlainText, getCompanyPostImageUrls, sanitizeCompanyPostHtml, summarizeCompanyPostText } from '../shared/company-post.js'
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
assert.ok(detail.includes(`<title>${expected.name} | 사기업체 게시판 | 법무법인 나란</title>`))
assert.ok(detail.includes(`<h1>${expected.name}</h1>`))
assert.ok(detail.includes(`rel="canonical" href="${site.url}/companies/shared-post"`))
assert.ok(detail.includes(`property="og:title" content="${expected.name} | 사기업체 게시판 | 법무법인 나란"`))
assert.ok(detail.includes(`name="twitter:title" content="${expected.name} | 사기업체 게시판 | 법무법인 나란"`))
assert.equal(readBootstrap(detail).item.description, expected.description)
assert.equal(readBootstrap(detail).item.name, expected.name)
assert.equal(readArticle(detail).headline, expected.name)
assert.equal(readArticle(detail).description, expected.description.replace(/\s+/g, ' '))

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

assert.deepEqual(resolveCompanyContent({}), { name: '', description: '' })
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
assert.deepEqual(getCompanyPostImageUrls(richPost.contentHtml), [imageUrl])
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
mock.method(getFirestore(app), 'collection', (name) => {
  assert.equal(name, 'companyCases')
  return {
    get: async () => ({ docs: [snapshot] }),
    doc: (id) => {
      assert.equal(id, original.id)
      return { get: async () => snapshot }
    },
  }
})
try {
  for (const host of [new URL(site.url).host, 'www.naranfintech.com', 'www.naranfintechnews.co.kr', 'localhost']) {
    for (const [url, path] of [
      ['/companies', '/companies'],
      ['/api/company-page?id=shared-post', '/companies/shared-post'],
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
    assert.ok(sitemapResponse.body.includes(`<loc>${site.url}/companies/shared-post</loc>`))
    assert.doesNotMatch(sitemapResponse.body, /https:\/\/www\.naranfintech(?:news\.co\.kr|\.com)/)
  }
} finally {
  mock.restoreAll()
  await deleteApp(app)
}

// The detail entry point reads the blog body from its own collection.
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
console.log('Single-site content verification passed')
