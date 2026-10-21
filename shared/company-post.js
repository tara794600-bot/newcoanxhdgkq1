// Blog-style company posts are written in the admin editor, stored as HTML and
// rendered both in the browser and in server-rendered pages. Everything that is
// shown publicly goes through this allowlist, so the same rules apply everywhere.

const HANGEUL_FONT_CSS = 'https://hangeul.pstatic.net/hangeul_static/css'

export const COMPANY_POST_FONTS = [
  { label: '기본서체', family: '', href: '' },
  { label: '나눔고딕', family: 'NanumGothic, sans-serif', href: `${HANGEUL_FONT_CSS}/nanum-gothic.css` },
  { label: '나눔명조', family: 'NanumMyeongjo, serif', href: `${HANGEUL_FONT_CSS}/nanum-myeongjo.css` },
  { label: '나눔바른고딕', family: 'NanumBarunGothic, sans-serif', href: `${HANGEUL_FONT_CSS}/nanum-barun-gothic.css` },
  { label: '나눔스퀘어', family: 'NanumSquare, sans-serif', href: `${HANGEUL_FONT_CSS}/nanum-square.css` },
  { label: '마루부리', family: 'MaruBuri, serif', href: `${HANGEUL_FONT_CSS}/maru-buri.css` },
  { label: '다시시작해', family: 'NanumDaSiSiJagHae, cursive', href: `${HANGEUL_FONT_CSS}/NanumDaSiSiJagHae.css` },
  { label: '바른히피', family: 'NanumBaReunHiPi, cursive', href: `${HANGEUL_FONT_CSS}/NanumBaReunHiPi.css` },
  { label: '나눔펜', family: 'NanumPen, cursive', href: `${HANGEUL_FONT_CSS}/nanum-pen.css` },
]

const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'cite', 'code', 'del', 'div', 'em', 'figcaption', 'figure', 'h2', 'h3', 'h4',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'u', 'ul',
])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
const DROPPED_ELEMENTS =
  /<(script|style|template|iframe|frame|frameset|object|embed|applet|noscript|noembed|svg|math|textarea|title|xmp|select|head|plaintext)\b[\s\S]*?(?:<\/\1\s*>|$)/gi
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+)))?/g

const COLOR_VALUE =
  /^(?:#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}(?:\.\d+)?%?\s*(?:,\s*\d{1,3}(?:\.\d+)?%?\s*){2}(?:,\s*(?:0|1|0?\.\d+)\s*)?\)|[a-z]{3,20})$/i
const TEXT_DECORATION_VALUE = /^(?:none|underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*$/i
const STYLE_RULES = {
  color: COLOR_VALUE,
  'background-color': COLOR_VALUE,
  'font-size': /^\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%)$/i,
  'font-family': /^[\w\s,'"가-힣-]{1,160}$/,
  'font-weight': /^(?:normal|bold|bolder|lighter|[1-9]00)$/i,
  'font-style': /^(?:normal|italic|oblique)$/i,
  'text-decoration': TEXT_DECORATION_VALUE,
  'text-decoration-line': TEXT_DECORATION_VALUE,
  'text-align': /^(?:left|right|center|justify|start|end)$/i,
  'line-height': /^(?:normal|\d{1,2}(?:\.\d{1,2})?(?:px|em|%)?|\d{3}%)$/i,
  'letter-spacing': /^(?:normal|-?\d{1,2}(?:\.\d{1,3})?(?:px|em))$/i,
  'vertical-align': /^(?:baseline|sub|super|top|middle|bottom|text-top|text-bottom)$/i,
}
const UNSAFE_STYLE_VALUE = /[<>{}\\]|url\s*\(|expression|javascript:|@import|\/\*/i
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:)[^\s<>"'`]*$/i
const SAFE_IMAGE_SRC = /^https:\/\/[^\s<>"'`]+$/i
const CLASS_TOKEN = /^se-[a-z0-9-]{1,40}$/

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decodeEntities = (value) =>
  value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (match, entity) => {
    const name = entity.toLowerCase()

    if (name.startsWith('#')) {
      const code = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }

    return NAMED_ENTITIES[name] ?? match
  })

const escapeText = (value) =>
  value
    .replace(/&(?!(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeAttribute = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const sanitizeClassName = (value) =>
  value
    .split(/\s+/)
    .filter((token) => CLASS_TOKEN.test(token))
    .slice(0, 8)
    .join(' ')

const sanitizeStyle = (value) =>
  value
    .split(';')
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':')

      if (separatorIndex < 0) {
        return ''
      }

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase()
      const propertyValue = declaration.slice(separatorIndex + 1).trim()
      const rule = STYLE_RULES[property]

      if (!rule || !propertyValue || UNSAFE_STYLE_VALUE.test(propertyValue) || !rule.test(propertyValue)) {
        return ''
      }

      return `${property}: ${propertyValue};`
    })
    .filter(Boolean)
    .join(' ')

const readAttributes = (source) => {
  const attributes = new Map()

  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase()

    if (!attributes.has(name)) {
      attributes.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim())
    }
  }

  return attributes
}

const renderAttributes = (tagName, source) => {
  const attributes = readAttributes(source)
  const output = []
  const className = sanitizeClassName(attributes.get('class') ?? '')
  const style = sanitizeStyle(attributes.get('style') ?? '')

  if (tagName === 'a') {
    const href = attributes.get('href') ?? ''

    if (SAFE_HREF.test(href)) {
      output.push(`href="${escapeAttribute(href)}"`, 'target="_blank"', 'rel="noopener noreferrer nofollow"')
    }
  }

  if (tagName === 'img') {
    const src = attributes.get('src') ?? ''

    if (!SAFE_IMAGE_SRC.test(src)) {
      return null
    }

    output.push(`src="${escapeAttribute(src)}"`, `alt="${escapeAttribute((attributes.get('alt') ?? '').slice(0, 300))}"`)
  }

  if (tagName === 'td' || tagName === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const span = attributes.get(name) ?? ''

      if (/^[1-9]\d?$/.test(span)) {
        output.push(`${name}="${span}"`)
      }
    }
  }

  if (className) {
    output.push(`class="${escapeAttribute(className)}"`)
  }

  if (style) {
    output.push(`style="${escapeAttribute(style)}"`)
  }

  return output.length ? ` ${output.join(' ')}` : ''
}

export const sanitizeCompanyPostHtml = (html) => {
  const source = (typeof html === 'string' ? html : '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(DROPPED_ELEMENTS, '')
  const openTags = []
  let output = ''
  let cursor = 0

  for (const match of source.matchAll(TAG_PATTERN)) {
    output += escapeText(source.slice(cursor, match.index))
    cursor = match.index + match[0].length

    const isClosing = match[1] === '/'
    const tagName = match[2].toLowerCase()

    if (!ALLOWED_TAGS.has(tagName)) {
      continue
    }

    if (isClosing) {
      const openIndex = openTags.lastIndexOf(tagName)

      if (openIndex >= 0) {
        output += openTags.splice(openIndex).reverse().map((name) => `</${name}>`).join('')
      }

      continue
    }

    const attributes = renderAttributes(tagName, match[3])

    if (attributes === null) {
      continue
    }

    output += `<${tagName}${attributes}>`

    if (!VOID_TAGS.has(tagName)) {
      openTags.push(tagName)
    }
  }

  output += escapeText(source.slice(cursor))
  return output + openTags.reverse().map((name) => `</${name}>`).join('')
}

export const companyPostToPlainText = (html) => {
  const text = sanitizeCompanyPostHtml(html)
    .replace(/<br\b[^>]*>/g, '\n')
    .replace(/<\/(?:p|div|h[2-4]|li|tr|blockquote|figcaption|pre|table|ul|ol|figure)>/g, '\n')
    .replace(/<\/t[dh]>/g, ' ')
    .replace(/<[^>]+>/g, '')

  return decodeEntities(text)
    .replace(/[​﻿]/g, '')
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Firestore limits are checked against UTF-16 length, so count the same way
// while never cutting a character in half.
export const summarizeCompanyPostText = (text, maxLength) => {
  if (text.length <= maxLength) {
    return text
  }

  let summary = ''

  for (const character of text) {
    if (summary.length + character.length > maxLength - 1) {
      break
    }

    summary += character
  }

  return `${summary.trimEnd()}…`
}

export const getCompanyPostImageUrls = (html) =>
  Array.from(sanitizeCompanyPostHtml(html).matchAll(/<img src="([^"]*)"/g), (match) => decodeEntities(match[1]))

export const getCompanyPostFontHrefs = (html) =>
  COMPANY_POST_FONTS.filter((font) => font.href && html.includes(font.family.split(',')[0])).map((font) => font.href)
