import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildCompaniesPageHtml,
  buildCompanyCasePageHtml,
  buildNotFoundPageHtml,
} from '../api/company-page.js'
import { renderSitemap } from '../api/sitemap.js'

const indexHtml = await readFile(new URL('../dist/app-shell.html', import.meta.url), 'utf8')
const sampleItems = [
  {
    id: 'sample-one',
    name: '샘플 업체 1',
    service: '투자 사기 의심 사례',
    description: '첫 번째 줄\n두 번째 줄',
    image: '/logo.png',
  },
  {
    id: 'sample-two',
    name: '샘플 업체 2',
    service: '로맨스스캠 의심 사례',
    description: '서로 다른 상세 설명',
    image: '/logo.png',
  },
]

const listHtml = buildCompaniesPageHtml(indexHtml, {
  items: sampleItems,
  page: 2,
  searchQuery: '',
  totalCount: 82,
  totalPages: 3,
})

assert.match(listHtml, /<title>사기업체 게시판 2페이지 \| 법무법인 나란<\/title>/)
assert.match(listHtml, /<link rel="canonical" href="https:\/\/www\.xn--naranfintech-t458b147kl8ppf0a\.kr\/companies\?page=2"/)
assert.match(listHtml, /href="\/companies\/sample-one"/)
assert.match(listHtml, /href="\/companies\?page=3"/)
assert.match(listHtml, /window\.__COMPANY_PAGE_DATA__=/)
assert.doesNotMatch(listHtml, /<div id="root"><\/div>/)

const detailHtml = buildCompanyCasePageHtml(indexHtml, sampleItems[0])

assert.match(detailHtml, /<h1>샘플 업체 1 피해 관련 확인 사항<\/h1>/)
assert.match(detailHtml, /<p class="company-detail-description">첫 번째 줄<\/p>/)
assert.match(detailHtml, /<p class="company-detail-description">두 번째 줄<\/p>/)
assert.match(detailHtml, /<link rel="canonical" href="https:\/\/www\.xn--naranfintech-t458b147kl8ppf0a\.kr\/companies\/sample-one"/)
assert.match(detailHtml, /"kind":"detail"/)

const privateDetailHtml = buildCompanyCasePageHtml(indexHtml, {
  ...sampleItems[0],
  isPublic: false,
  isSearchBlocked: false,
})

assert.match(privateDetailHtml, /<title>샘플 업체 1 피해 관련 확인 사항 \| 사기업체 게시판 \| 법무법인 나란<\/title>/)
assert.match(privateDetailHtml, /content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/)
assert.match(privateDetailHtml, /현재 페이지는 삭제되었습니다/)
assert.match(privateDetailHtml, /해당 내용으로 사칭 피해를 보신 분들은 즉시 1551-7203으로 연락 바랍니다/)
assert.match(privateDetailHtml, /href="tel:15517203">전화연결<\/a>/)
assert.doesNotMatch(privateDetailHtml, /<div class="company-detail-copy">/)

const searchBlockedDetailHtml = buildCompanyCasePageHtml(indexHtml, {
  ...sampleItems[0],
  id: 'search-blocked-detail',
  isPublic: true,
  isSearchBlocked: true,
})

assert.match(searchBlockedDetailHtml, /content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/)
assert.match(searchBlockedDetailHtml, /<div class="company-detail-copy">/)
assert.match(searchBlockedDetailHtml, /<h1>샘플 업체 1 피해 관련 확인 사항<\/h1>/)
assert.doesNotMatch(searchBlockedDetailHtml, /현재 페이지는 삭제되었습니다/)

const searchHtml = buildCompaniesPageHtml(indexHtml, {
  items: [
    ...sampleItems,
    {
      ...sampleItems[0],
      id: 'private-search-result',
      name: '검색 제외 전화연결 업체',
      isPublic: false,
      isSearchBlocked: false,
    },
    {
      ...sampleItems[0],
      id: 'search-blocked-result',
      name: '검색 제외 검색차단 업체',
      isPublic: true,
      isSearchBlocked: true,
    },
  ],
  page: 1,
  searchQuery: '샘플',
  totalCount: 2,
  totalPages: 1,
})

assert.match(searchHtml, /content="noindex,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/)
assert.match(searchHtml, /<link rel="canonical" href="https:\/\/www\.xn--naranfintech-t458b147kl8ppf0a\.kr\/companies"/)
assert.doesNotMatch(searchHtml, /href="\/companies\/private-search-result"/)
assert.doesNotMatch(searchHtml, /href="\/companies\/search-blocked-result"/)

const notFoundHtml = buildNotFoundPageHtml(indexHtml, '/companies/missing')
assert.match(notFoundHtml, /content="noindex,follow"/)
assert.match(notFoundHtml, /페이지를 찾을 수 없습니다/)
assert.doesNotMatch(notFoundHtml, /<script\s+[^>]*type="module"/)

const sitemap = renderSitemap([
  { loc: 'https://www.xn--naranfintech-t458b147kl8ppf0a.kr/companies/sample-one', lastmod: '2026-08-01' },
  { loc: 'https://www.xn--naranfintech-t458b147kl8ppf0a.kr/companies/private-search-result', lastmod: '2026-08-03' },
  { loc: 'https://www.xn--naranfintech-t458b147kl8ppf0a.kr/companies/search-blocked-result', lastmod: '2026-08-02' },
])

assert.match(sitemap, /<lastmod>2026-08-03<\/lastmod>/)
assert.match(sitemap, /<loc>https:\/\/www\.xn--naranfintech-t458b147kl8ppf0a\.kr\/companies\/private-search-result<\/loc>/)
assert.match(sitemap, /<loc>https:\/\/www\.xn--naranfintech-t458b147kl8ppf0a\.kr\/companies\/search-blocked-result<\/loc>/)
assert.doesNotMatch(sitemap, /<changefreq>|<priority>|\/rss\.xml/)

console.log('SEO rendering verification passed')
