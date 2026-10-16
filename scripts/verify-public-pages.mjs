import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { CONTENT_SITE as site } from '../shared/site.js'
import { SEO_META_BY_ROUTE } from '../shared/page-meta.js'
import handler from '../api/site-page.js'
import { buildCompanyCasePageHtml } from '../api/company-page.js'

const dist = path.resolve('dist')
const shell = await readFile(path.join(dist, 'app-shell.html'), 'utf8')
assert.match(shell, /<div id="root"><\/div>/)

const response = () => ({
  headers: {}, statusCode: 0, body: '',
  setHeader(name, value) { this.headers[name] = value },
  status(code) { this.statusCode = code; return this },
  send(body) { this.body = body; return this },
  end(body = '') { this.body = body; return this },
})

// Request Host must never select another website in this deployment.
for (const host of [new URL(site.url).host, 'www.naranfintech.com', 'www.naranfintechnews.co.kr', 'localhost']) {
  for (const route of ['home', 'lawyers']) {
    const meta = SEO_META_BY_ROUTE[route]
    const res = response()
    await handler({ method: 'GET', url: meta.path, headers: { host } }, res)
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['Content-Type'], /text\/html/)
    const html = res.body
    // Inspect the actual body, without executing JS or counting JSON-LD text.
    const body = html.split('<body>')[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    assert.equal((body.match(/<h1\b/g) ?? []).length, 1)
    assert.equal((body.match(/id="root"/g) ?? []).length, 1)
    assert.ok(html.includes(`<title>${meta.title}</title>`))
    assert.ok(html.includes(`rel="canonical" href="${site.url}${meta.path}"`))
    assert.ok(html.includes(`property="og:url" content="${site.url}${meta.path}"`))
    assert.match(body, /href="\/companies"/)
    assert.match(body, /href="\/lawyers"/)
    assert.match(body, /사기 피해회복 자주 묻는 질문/)
    assert.match(body, /href="tel:15517202"/)
    assert.match(body, /data-prerendered=""/)
    if (route === 'home') {
      assert.match(body, /<span class="hero-typing-text">수많은 사기 피해 대응 경험,\n그 차이를 증명합니다\.<\/span>/)
      assert.match(body, /주식\/코인 사기/)
      assert.match(body, /로맨스스캠 사기/)
      assert.match(body, /<p class="hero-subcopy">잘못된 초기 대응은 <strong>수사중지·불송치·무혐의<\/strong>/)
    } else {
      for (const name of ['서지원 대표변호사', '최지연 변호사', '정이든 변호사']) assert.ok(body.includes(name))
      assert.match(body, /서울도봉경찰서 경미범죄 심사위원회 위원/)
      assert.doesNotMatch(body, /class="hero-section"/)
    }
    assert.doesNotMatch(html, /https:\/\/www\.naranfintech(?:news\.co\.kr|\.com)/)
    // SSR image/CSS/JS references must point at assets produced by the client build.
    for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
      await access(path.join(dist, decodeURIComponent(match[1])))
    }
    for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      JSON.parse(match[1])
    }
    const head = response()
    await handler({ method: 'HEAD', url: `/api/site-page?route=${route}`, headers: { host } }, head)
    assert.equal(head.statusCode, 200)
    assert.equal(head.body, '')
  }
}

const rejected = response()
await handler({ method: 'POST', url: '/', headers: {} }, rejected)
assert.equal(rejected.statusCode, 405)
const missing = response()
await handler({ method: 'GET', url: '/api/site-page?route=../../index', headers: {} }, missing)
assert.equal(missing.statusCode, 404)

const detail = buildCompanyCasePageHtml(shell, {
  id: 'public-page-regression', name: '회귀 확인 업체', service: '사례',
  description: '업체 상세 본문', image: '/logo.png',
})
assert.match(detail, /<h1>회귀 확인 업체 피해 관련 확인 사항<\/h1>/)
assert.doesNotMatch(detail, /class="hero-section"|data-prerendered/)
const home = await readFile(path.join(dist, 'index.html'), 'utf8')
assert.match(home, /<span class="hero-typing-text">수많은 사기 피해 대응 경험,\n그 차이를 증명합니다\.<\/span>/)
assert.ok(home.includes(`rel="canonical" href="${site.url}/"`))
const lawyers = await readFile(path.join(dist, 'lawyers.html'), 'utf8')
assert.ok(lawyers.includes(`rel="canonical" href="${site.url}/lawyers"`))
for (const tag of shell.matchAll(/<meta\s+name="(?:naver|google)-site-verification"[^>]*>/g)) {
  assert.ok(home.includes(tag[0]), 'Search engine verification tags must be preserved')
}
await access(path.join(dist, 'logo.png'))

const routes = JSON.parse(await readFile('vercel.json', 'utf8'))
for (const [source, route] of [['/', 'home'], ['/lawyers', 'lawyers']]) {
  assert.ok(routes.rewrites.some((rule) => rule.source === source && rule.destination === `/api/site-page?route=${route}`))
}
assert.equal(routes.functions['api/company-page.js'].includeFiles, 'dist/app-shell.html')
assert.equal(routes.functions['api/site-page.js'].includeFiles, 'dist/prerender/**')
assert.deepEqual((await readdir(path.join(dist, 'prerender'))).sort(), ['home.html', 'lawyers.html'])
console.log('Public initial HTML verified: fixed canonical domain, 2 routes, metadata, content, assets, HEAD and company-page isolation.')
