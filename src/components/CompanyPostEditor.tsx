import {
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CompanyVisibility } from '../App'
import { resolveCompanyContent } from '../../shared/company-content.js'
import {
  COMPANY_POST_FONTS,
  companyPostToPlainText,
  getCompanyPostImageUrls,
  sanitizeCompanyPostHtml,
  summarizeCompanyPostText,
} from '../../shared/company-post.js'
import { loadCompanyPostFonts } from './companyPostFonts'
import './company-post-content.css'
import './CompanyPostEditor.css'

export type CompanyPostSource = {
  caseId: string
  name: string
  service: string
  visibility: CompanyVisibility
  html: string
  description: string
  image: string
}

export type CompanyPostPayload = Omit<CompanyPostSource, 'caseId'>

type Props = {
  source: CompanyPostSource
  visibilityOptions: ReadonlyArray<{ value: CompanyVisibility; label: string; description: string }>
  serviceSuggestions: string[]
  limits: { name: number; service: number; description: number; html: number }
  onUploadImage: (file: File) => Promise<string>
  onDiscardImages: (urls: string[]) => void
  onPublish: (post: CompanyPostPayload) => Promise<void>
  onClose: () => void
}

type MenuId =
  | 'sticker'
  | 'quote'
  | 'divider'
  | 'place'
  | 'link'
  | 'schedule'
  | 'table'
  | 'textStyle'
  | 'font'
  | 'fontSize'
  | 'color'
  | 'background'
  | 'align'
  | 'lineHeight'
  | 'letterSpacing'
  | 'list'
  | 'special'
  | 'inlineLink'
  | 'publish'
  | 'drafts'

type ToolbarMenu = { id: MenuId; left: number; top: number }
type Align = 'left' | 'center' | 'right' | 'justify'
type ComponentType = 'image' | 'sticker' | 'quote' | 'divider' | 'place' | 'link' | 'schedule' | 'code' | 'table'

type FormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strikeThrough: boolean
  superscript: boolean
  subscript: boolean
  unorderedList: boolean
  orderedList: boolean
  heading: boolean
  inLink: boolean
  fontSize: number
  fontLabel: string
  color: string
  align: Align
}

type Draft = {
  id: string
  caseId: string
  title: string
  service: string
  visibility: string
  html: string
  representative: string
  savedAt: number
}

type SelectionPath = { anchor: number[]; anchorOffset: number; focus: number[]; focusOffset: number }
type Snapshot = { html: string; selection: SelectionPath | null }
type DialogState = { kind: 'restore'; draft: Draft } | { kind: 'loadDraft'; draft: Draft } | { kind: 'exit' }

const DEFAULT_FONT_SIZE = 15
const FONT_SIZES = [11, 13, 15, 16, 19, 24, 28, 30, 34, 38]
const LINE_HEIGHTS = ['100%', '150%', '180%', '200%', '250%', '300%']
const LETTER_SPACINGS = ['-2px', '-1px', '1px', '2px', '3px', '4px']
const COLOR_PALETTE = [
  '#000000', '#333333', '#555555', '#777777', '#999999', '#bbbbbb', '#dddddd', '#ffffff',
  '#ff0010', '#ff6c00', '#ffd400', '#00c73c', '#00a3ff', '#0047ff', '#7e00ff', '#ff00a8',
  '#ffd2d2', '#ffe2c6', '#fff4bf', '#d4f5dc', '#cceeff', '#ccdaff', '#e6ccff', '#ffccee',
  '#ff8080', '#ffb27f', '#ffe680', '#80e39e', '#80d1ff', '#80a3ff', '#be80ff', '#ff80d4',
  '#99000a', '#994100', '#997f00', '#007724', '#006299', '#002b99', '#4c0099', '#990065',
]
const SPECIAL_CHARACTERS = Array.from(
  '※☆★○●◎◇◆□■△▲▽▼→←↑↓↔↕↗↙↖↘〓◁◀▷▶♤♠♡♥♧♣⊙◈▣◐◑▒▤▥▨▧▦▩♨☏☎☜☞¶†‡♭♩♪♬㉿㈜№㏇™㏂㏘℡®「」『』【】《》〈〉〔〕‘’“”·‥…〃―∼',
)
const STICKER_GROUPS = [
  {
    label: '표정',
    items: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 😲 😴 🤐 😷'.split(' '),
  },
  {
    label: '손짓',
    items: '👍 👎 👏 🙌 👐 🤲 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 ✍️ 🫶'.split(' '),
  },
  {
    label: '기호',
    items: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 ✅ ❌ ⭕ ❗ ❓ ⚠️ 🚫 ⛔ 💯 🔥 ✨ ⭐ 🌟 💡 📌 📍 📢 🔔 💰 💸 💳 📈 📉 ⚖️ 🏛️ 👮 🚨 📞 📝'.split(' '),
  },
]
const QUOTE_STYLES = [
  { value: 'quotation', label: '따옴표' },
  { value: 'line', label: '버티컬 라인' },
  { value: 'bubble', label: '말풍선' },
  { value: 'underline', label: '라인&따옴표' },
  { value: 'postit', label: '포스트잇' },
  { value: 'frame', label: '프레임' },
]
const DIVIDER_STYLES = ['1', '2', '3', '4', '5', '6', '7', '8']
const IMAGE_SIZES = [
  { value: 'original', label: '원본' },
  { value: 'full', label: '문서 너비' },
  { value: 'small', label: '작게' },
]
const COMPONENT_TYPES: ComponentType[] = ['image', 'sticker', 'quote', 'divider', 'place', 'link', 'schedule', 'code', 'table']
const COMPONENT_SELECTOR = '.se-component'
const EDITABLE_PART_SELECTOR =
  '.se-caption, .se-quote-text, .se-quote-cite, .se-code-source, .se-table-content td, .se-table-content th'
const PLACEHOLDER_PART_SELECTOR = '.se-caption, .se-quote-text, .se-quote-cite, .se-code-source'
const SINGLE_LINE_PART_SELECTOR = '.se-caption, .se-quote-cite'
const INLINE_TAGS = new Set(['A', 'B', 'BR', 'CODE', 'DEL', 'EM', 'I', 'S', 'SPAN', 'STRIKE', 'STRONG', 'SUB', 'SUP', 'U'])
const PASTE_BLOCK_SELECTOR = 'p, div, h1, h2, h3, h4, h5, h6, li, ul, ol, blockquote, pre, table, tr, td, th, figure'
const PASTE_STYLE_PROPERTIES = ['color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line']
const INTERNAL_CLIPBOARD_TYPE = 'application/x-naran-company-post'
const DRAFT_STORAGE_KEY = 'naran:company-post-drafts'
const DRAFT_LIMIT = 10
const AUTO_SAVE_INTERVAL_MS = 30_000
const HISTORY_LIMIT = 100
const EDITOR_STATE_CLASSES = ['se-is-selected', 'se-is-represent', 'se-is-empty', 'se-is-uploading']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const DEFAULT_FORMAT: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  superscript: false,
  subscript: false,
  unorderedList: false,
  orderedList: false,
  heading: false,
  inLink: false,
  fontSize: DEFAULT_FONT_SIZE,
  fontLabel: COMPANY_POST_FONTS[0].label,
  color: '#333333',
  align: 'left',
}

const ICONS = {
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M21 15.5l-4.5-4.5L7 19" />
    </>
  ),
  sticker: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.2c.9 1.3 2.1 1.9 3.5 1.9s2.6-.6 3.5-1.9" />
      <path d="M9 9.8v.6M15 9.8v.6" />
    </>
  ),
  quote: (
    <path
      fill="currentColor"
      stroke="none"
      d="M5 17v-4.3C5 9.6 6.6 7.6 9.7 7l.5 1.5C8.5 9.1 7.7 10 7.6 11.6H10V17H5zm9 0v-4.3c0-3.1 1.6-5.1 4.7-5.7l.5 1.5c-1.7.6-2.5 1.5-2.6 3.1H19V17h-5z"
    />
  ),
  divider: (
    <>
      <path d="M3 12h18" />
      <path d="M7 7h10M7 17h10" opacity="0.35" />
    </>
  ),
  place: (
    <>
      <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  schedule: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  code: <path d="M8.5 8l-4 4 4 4M15.5 8l4 4-4 4M13.5 6l-3 12" />,
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15" />
    </>
  ),
  alignLeft: <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />,
  alignCenter: <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />,
  alignRight: <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />,
  alignJustify: <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
  lineHeight: <path d="M11 6h9M11 12h9M11 18h9M5.5 5v14M3.5 7l2-2 2 2M3.5 17l2 2 2-2" />,
  letterSpacing: <path d="M7 14l3.5-9 3.5 9M8.3 11h4.4M3 19h18M5 17l-2 2 2 2M19 17l2 2-2 2" />,
  listBullet: (
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <circle cx="5" cy="6" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="18" r="1" fill="currentColor" />
    </>
  ),
  listNumber: (
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 4.5l1.5-.8V8M3.6 10.6c.4-.7 2.4-.8 2.4.4 0 .9-2.4 2-2.4 3h2.6M3.7 16.3h2.2l-1.2 1.4c1 0 1.6.4 1.6 1.1 0 1-1.7 1.3-2.6.6" />
    </>
  ),
  clear: <path d="M6 5h11M11.5 5L8 19M14 13l6 6M20 13l-6 6" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 10.5v5M13.5 10.5v5" />,
  pen: <path d="M4 20l1-4 11-11 3 3-11 11-4 1zM14 7l3 3" />,
}

type IconName = keyof typeof ICONS

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="se-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

const isElement = (node: Node | null | undefined): node is HTMLElement => node instanceof HTMLElement
const isComponent = (node: Node | null | undefined): node is HTMLElement =>
  isElement(node) && node.classList.contains('se-component')
const isEmptyTextBlock = (node: Node | null | undefined): node is HTMLElement =>
  isElement(node) &&
  (node.tagName === 'P' || node.tagName === 'H3') &&
  !node.textContent?.replace(/​/g, '').trim() &&
  !node.querySelector('img')

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const make = <K extends keyof HTMLElementTagNameMap>(tagName: K, className = '', text = '') => {
  const element = document.createElement(tagName)

  if (className) {
    element.className = className
  }

  if (text) {
    element.textContent = text
  }

  return element
}

const createParagraph = () => {
  const paragraph = make('p')
  paragraph.append(make('br'))
  return paragraph
}

// Components are islands inside the document: the wrapper is not editable and
// only the text parts inside it (captions, quotes, code, table cells) are.
const prepareComponent = (component: HTMLElement) => {
  component.contentEditable = 'false'

  if (component.classList.contains('se-image') && !component.querySelector('.se-caption')) {
    component.append(make('p', 'se-caption'))
  }

  if (component.classList.contains('se-quote') && !component.querySelector('.se-quote-cite')) {
    component.append(make('p', 'se-quote-cite'))
  }

  component.querySelectorAll<HTMLElement>(EDITABLE_PART_SELECTOR).forEach((part) => {
    part.contentEditable = 'true'
  })
  component.querySelectorAll('img').forEach((image) => {
    image.draggable = false
  })
  return component
}

const createImageComponent = (src: string) => {
  const component = make('div', 'se-component se-image se-image--original se-align-center')
  const figure = make('figure', 'se-image-figure')
  const image = make('img')
  image.src = src
  image.alt = ''
  figure.append(image)
  component.append(figure)
  return prepareComponent(component)
}

const createStickerComponent = (sticker: string) => {
  const component = make('div', 'se-component se-sticker se-align-center')
  component.append(make('span', 'se-sticker-emoji', sticker))
  return prepareComponent(component)
}

const createQuoteComponent = (style: string) => {
  const component = make('div', `se-component se-quote se-quote--${style}`)
  component.append(make('blockquote', 'se-quote-text'))
  return prepareComponent(component)
}

const createDividerComponent = (style: string) => {
  const component = make('div', `se-component se-divider se-divider--${style}`)
  component.append(make('hr'))
  return prepareComponent(component)
}

const createPlaceComponent = (name: string, address: string) => {
  const component = make('div', 'se-component se-place')
  const link = make('a', 'se-place-link')
  const info = make('span', 'se-place-info')
  link.href = `https://map.naver.com/p/search/${encodeURIComponent(address || name)}`
  info.append(make('span', 'se-place-name', name))

  if (address) {
    info.append(make('span', 'se-place-address', address))
  }

  link.append(info)
  component.append(link)
  return prepareComponent(component)
}

const createLinkComponent = (url: URL, title: string) => {
  const component = make('div', 'se-component se-link')
  const link = make('a', 'se-link-card')
  const info = make('span', 'se-link-info')
  let path = url.pathname === '/' ? '' : url.pathname

  try {
    path = decodeURI(path)
  } catch {
    // Keep the encoded path when it is not valid UTF-8.
  }

  link.href = url.href
  info.append(make('span', 'se-link-title', title || url.hostname), make('span', 'se-link-url', `${url.hostname}${path}`))
  link.append(info)
  component.append(link)
  return prepareComponent(component)
}

const formatScheduleDate = (date: string, time: string) => {
  const [year, month, day] = date.split('-').map(Number)
  let text = `${year}년 ${month}월 ${day}일 (${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`

  if (time) {
    const [hour, minute] = time.split(':').map(Number)
    text += ` ${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(minute).padStart(2, '0')}`
  }

  return text
}

const createScheduleComponent = (schedule: { title: string; date: string; time: string; place: string; memo: string }) => {
  const component = make('div', 'se-component se-schedule')
  const card = make('div', 'se-schedule-card')
  const dateBox = make('span', 'se-schedule-date')
  const info = make('span', 'se-schedule-info')
  const [, month, day] = schedule.date.split('-').map(Number)
  dateBox.append(make('span', 'se-schedule-month', `${month}월`), make('span', 'se-schedule-day', String(day)))
  info.append(
    make('span', 'se-schedule-title', schedule.title),
    make('span', 'se-schedule-time', formatScheduleDate(schedule.date, schedule.time)),
  )

  if (schedule.place) {
    info.append(make('span', 'se-schedule-place', schedule.place))
  }

  if (schedule.memo) {
    info.append(make('span', 'se-schedule-memo', schedule.memo))
  }

  card.append(dateBox, info)
  component.append(card)
  return prepareComponent(component)
}

const createCodeComponent = () => {
  const component = make('div', 'se-component se-code')
  component.append(make('pre', 'se-code-source'))
  return prepareComponent(component)
}

const createTableComponent = (rows: number, columns: number) => {
  const component = make('div', 'se-component se-table')
  const table = make('table', 'se-table-content')
  const body = make('tbody')

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = make('tr')

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      row.append(make('td'))
    }

    body.append(row)
  }

  table.append(body)
  component.append(table)
  return prepareComponent(component)
}

const createEditorNodes = (html: string) => {
  const container = make('div')
  container.innerHTML = sanitizeCompanyPostHtml(html)
  container.querySelectorAll<HTMLElement>(COMPONENT_SELECTOR).forEach(prepareComponent)
  return Array.from(container.childNodes)
}

// Posts written before the editor existed are a single image plus plain text.
const createLegacyNodes = (description: string, image: string) => {
  const nodes: Node[] = /^https:\/\//i.test(image) ? [createImageComponent(image)] : []

  description.split(/\r?\n/).forEach((line) => {
    const paragraph = make('p')

    if (line.trim()) {
      paragraph.textContent = line
    } else {
      paragraph.append(make('br'))
    }

    nodes.push(paragraph)
  })

  return nodes
}

const removeClasses = (root: HTMLElement, classNames: string[]) => {
  root.querySelectorAll(classNames.map((className) => `.${className}`).join(', ')).forEach((element) => {
    element.classList.remove(...classNames)
  })
}

const serializeEditorHtml = (container: HTMLElement) => {
  const clone = container.cloneNode(true) as HTMLElement
  removeClasses(clone, EDITOR_STATE_CLASSES)
  clone.querySelectorAll('[contenteditable]').forEach((element) => element.removeAttribute('contenteditable'))
  clone.querySelectorAll(SINGLE_LINE_PART_SELECTOR).forEach((part) => {
    if (!part.textContent?.replace(/​/g, '').trim()) {
      part.remove()
    }
  })
  clone.querySelectorAll('.se-image').forEach((component) => {
    if (!component.querySelector('img')?.getAttribute('src')?.startsWith('https://')) {
      component.remove()
    }
  })

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  textNodes.forEach((node) => {
    if (node.data.includes('​')) {
      node.data = node.data.replace(/​/g, '')
    }
  })

  while (isEmptyTextBlock(clone.lastElementChild)) {
    clone.lastElementChild.remove()
  }

  return sanitizeCompanyPostHtml(clone.innerHTML)
}

const buildSignature = (title: string, service: string, visibility: string, html: string) =>
  [title.trim(), service.trim(), visibility, html].join('\u0000')

const closestEditablePart = (node: Node | null, root: HTMLElement) => {
  const element = node ? (isElement(node) ? node : node.parentElement) : null
  const part = element?.closest<HTMLElement>(EDITABLE_PART_SELECTOR)
  return part && root.contains(part) ? part : null
}

const getEditingHost = (node: Node, root: HTMLElement) => closestEditablePart(node, root) ?? root

// A selected component is held as a range around the whole node, the way the
// browser selects an image, so the caret never jumps elsewhere in the text.
const getSelectedComponentNode = (range: Range) => {
  const node =
    !range.collapsed && range.startContainer === range.endContainer && range.endOffset - range.startOffset === 1
      ? range.startContainer.childNodes[range.startOffset]
      : null
  return isComponent(node) ? node : null
}

const isAtBlockEdge = (block: HTMLElement, range: Range, edge: 'start' | 'end') => {
  const probe = document.createRange()
  probe.selectNodeContents(block)

  if (edge === 'start') {
    probe.setEnd(range.startContainer, range.startOffset)
  } else {
    probe.setStart(range.endContainer, range.endOffset)
  }

  return !probe.toString().replace(/​/g, '').trim() && !probe.cloneContents().querySelector('img')
}

const splitBlock = (block: HTMLElement, range: Range) => {
  const tail = document.createRange()
  tail.setStart(range.startContainer, range.startOffset)
  tail.setEnd(block, block.childNodes.length)
  const tailBlock = block.cloneNode(false) as HTMLElement
  tailBlock.append(tail.extractContents())
  return tailBlock
}

const getNodePath = (root: Node, node: Node | null) => {
  const path: number[] = []
  let current = node

  while (current && current !== root) {
    const parent: Node | null = current.parentNode

    if (!parent) {
      return null
    }

    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current) as number)
    current = parent
  }

  return current === root ? path : null
}

const resolveNodePath = (root: Node, path: number[]) =>
  path.reduce<Node | null>((node, index) => node?.childNodes[index] ?? null, root)

const toHttpUrl = (value: string) => {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

const toHexColor = (value: string) => {
  const channels = value.match(/\d+(?:\.\d+)?/g)

  if (!value.startsWith('rgb') || !channels || channels.length < 3) {
    return value
  }

  return `#${channels
    .slice(0, 3)
    .map((channel) => Math.round(Number(channel)).toString(16).padStart(2, '0'))
    .join('')}`
}

const matchFontLabel = (fontFamily: string) =>
  COMPANY_POST_FONTS.find((font) => font.family && fontFamily.includes(font.family.split(',')[0]))?.label ??
  COMPANY_POST_FONTS[0].label

const toAlign = (textAlign: string): Align =>
  textAlign === 'center' || textAlign === 'right' || textAlign === 'justify' ? textAlign : 'left'

const getComponentType = (component: HTMLElement) =>
  COMPONENT_TYPES.find((type) => component.classList.contains(`se-${type}`)) ?? null

const replaceClassWithPrefix = (element: HTMLElement, prefix: string, nextClass: string) => {
  Array.from(element.classList)
    .filter((className) => className.startsWith(prefix))
    .forEach((className) => element.classList.remove(className))
  element.classList.add(nextClass)
}

const getClassSuffix = (element: HTMLElement, prefix: string) =>
  Array.from(element.classList).find((className) => className.startsWith(prefix))?.slice(prefix.length) ?? ''

const replaceFontElement = (font: HTMLFontElement) => {
  const span = make('span')
  span.style.cssText = font.style.cssText

  if (font.face) {
    span.style.fontFamily = font.face
  }

  if (font.color) {
    span.style.color = font.color
  }

  span.append(...Array.from(font.childNodes))
  font.replaceWith(span)
}

const textToParagraphs = (text: string) => {
  const container = make('div')

  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((line) => {
      const paragraph = make('p')

      if (line) {
        paragraph.textContent = line
      } else {
        paragraph.append(make('br'))
      }

      container.append(paragraph)
    })

  return container
}

const appendInlineRun = (nodes: Node[], output: HTMLElement) => {
  if (nodes.some((node) => node.nodeName === 'BR' || node.textContent?.trim())) {
    const paragraph = make('p')
    paragraph.append(...nodes)
    output.append(paragraph)
  }
}

const appendFlattenedBlocks = (parent: ParentNode, output: HTMLElement) => {
  let run: Node[] = []

  Array.from(parent.childNodes).forEach((child) => {
    if (isElement(child) && (child.tagName === 'UL' || child.tagName === 'OL')) {
      appendInlineRun(run, output)
      run = []
      const list = document.createElement(child.tagName === 'UL' ? 'ul' : 'ol')

      child.querySelectorAll(':scope > li').forEach((item) => {
        const listItem = make('li')

        if (item.querySelector(PASTE_BLOCK_SELECTOR)) {
          listItem.textContent = item.textContent?.trim() ?? ''
        } else {
          listItem.append(...Array.from(item.childNodes))
        }

        list.append(listItem)
      })

      output.append(list)
      return
    }

    if (isElement(child) && (!INLINE_TAGS.has(child.tagName) || child.querySelector(PASTE_BLOCK_SELECTOR))) {
      appendInlineRun(run, output)
      run = []
      appendFlattenedBlocks(child, output)
      return
    }

    run.push(child)
  })

  appendInlineRun(run, output)
}

// Pasted web content keeps only basic emphasis; layout, fonts, images and
// component classes from other sites are dropped.
const convertPastedHtml = (html: string) => {
  const template = make('template')
  const output = make('div')
  template.innerHTML = sanitizeCompanyPostHtml(html)
  template.content.querySelectorAll('img, hr').forEach((element) => element.remove())
  template.content.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const style = PASTE_STYLE_PROPERTIES.map((property) => {
      const value = element.style.getPropertyValue(property)
      return value ? `${property}: ${value};` : ''
    })
      .join(' ')
      .trim()
    element.removeAttribute('class')

    if (style) {
      element.setAttribute('style', style)
    } else {
      element.removeAttribute('style')
    }
  })
  appendFlattenedBlocks(template.content, output)
  return output
}

const getRangeFromPoint = (x: number, y: number) => {
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(x, y)

    if (!position) {
      return null
    }

    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }

  return typeof document.caretRangeFromPoint === 'function' ? document.caretRangeFromPoint(x, y) : null
}

const preloadImage = (src: string) =>
  new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = src
  })

const isDraft = (value: unknown): value is Draft => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const draft = value as Record<string, unknown>
  return (
    ['id', 'caseId', 'title', 'service', 'visibility', 'html', 'representative'].every(
      (key) => typeof draft[key] === 'string',
    ) && typeof draft.savedAt === 'number'
  )
}

const readDrafts = (): Draft[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isDraft) : []
  } catch {
    return []
  }
}

const writeDrafts = (drafts: Draft[]) => {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
    return true
  } catch {
    return false
  }
}

const readContextDrafts = (caseId: string) => readDrafts().filter((draft) => draft.caseId === caseId)

const formatSavedTime = (time: number) =>
  new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(time)

const formatSavedDate = (time: number) =>
  new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(time)

const keepSelection = (event: ReactMouseEvent) => {
  if (!(event.target as HTMLElement).closest('input, textarea, select, label')) {
    event.preventDefault()
  }
}

export default function CompanyPostEditor({
  source,
  visibilityOptions,
  serviceSuggestions,
  limits,
  onUploadImage,
  onDiscardImages,
  onPublish,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toolbarLayerRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const historyRef = useRef<{ stack: Snapshot[]; index: number }>({ stack: [], index: 0 })
  const historyTimerRef = useRef(0)
  const toastTimerRef = useRef(0)
  const activeCellRef = useRef<HTMLTableCellElement | null>(null)
  const sessionUploadsRef = useRef(new Set<string>())
  const pendingBlobUrlsRef = useRef(new Set<string>())
  const draggingFromCanvasRef = useRef(false)
  const nativeCommandRef = useRef(false)
  const draftIdRef = useRef('')
  const savedSignatureRef = useRef('')
  const initialImageUrlsRef = useRef<string[]>([])
  const serviceListId = useId()

  const [title, setTitle] = useState(source.name)
  const [service, setService] = useState(source.service)
  const [visibility, setVisibility] = useState(source.visibility)
  const [representative, setRepresentative] = useState(source.image)
  const [imageSources, setImageSources] = useState<string[]>([])
  const [canvasEmpty, setCanvasEmpty] = useState(false)
  const [composing, setComposing] = useState(false)
  const [titleFocused, setTitleFocused] = useState(false)
  const [menu, setMenu] = useState<ToolbarMenu | null>(null)
  const [format, setFormat] = useState<FormatState>(DEFAULT_FORMAT)
  const [selectedComponent, setSelectedComponent] = useState<HTMLElement | null>(null)
  const [componentMenu, setComponentMenu] = useState<HTMLElement | null>(null)
  const [componentTop, setComponentTop] = useState(0)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [pendingUploads, setPendingUploads] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast] = useState('')
  const [drafts, setDrafts] = useState(() => readContextDrafts(source.caseId))
  const [dialog, setDialog] = useState<DialogState | null>(() => {
    const latestDraft = readContextDrafts(source.caseId)[0]
    return latestDraft ? { kind: 'restore', draft: latestDraft } : null
  })
  const [lastSavedAt, setLastSavedAt] = useState(0)
  const [stickerGroupIndex, setStickerGroupIndex] = useState(0)
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 })
  const [customColor, setCustomColor] = useState('#000000')
  const [inlineLinkUrl, setInlineLinkUrl] = useState('')
  const [placeForm, setPlaceForm] = useState({ name: '', address: '' })
  const [linkForm, setLinkForm] = useState({ url: '', title: '' })
  const [scheduleForm, setScheduleForm] = useState({ title: '', date: '', time: '', place: '', memo: '' })

  const effectiveRepresentative = imageSources.includes(representative) ? representative : (imageSources[0] ?? '')
  const publicTitle = resolveCompanyContent({ name: title }).name
  const selectedType = selectedComponent ? getComponentType(selectedComponent) : null

  const showToast = (message: string) => {
    window.clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800)
  }

  const getSignature = () => {
    const root = canvasRef.current
    return root ? buildSignature(title, service, visibility, serializeEditorHtml(root)) : savedSignatureRef.current
  }

  const normalizeCanvas = () => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    const selection = window.getSelection()
    const caret =
      selection && selection.rangeCount
        ? { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset }
        : null
    let changed = false
    let run: ChildNode[] = []

    const flushRun = (before: Node | null) => {
      if (!run.length) {
        return
      }

      if (run.every((node) => node.nodeType === Node.TEXT_NODE && !node.textContent?.trim())) {
        run.forEach((node) => node.remove())
      } else {
        const paragraph = make('p')
        root.insertBefore(paragraph, before)
        paragraph.append(...run)
      }

      run = []
      changed = true
    }

    root.querySelectorAll('font').forEach((font) => {
      replaceFontElement(font)
      changed = true
    })
    root.querySelectorAll<HTMLElement>('.se-component:not([contenteditable])').forEach((component) => {
      prepareComponent(component)
      changed = true
    })

    Array.from(root.childNodes).forEach((node) => {
      if (isComponent(node) || (isElement(node) && ['P', 'H3', 'UL', 'OL'].includes(node.tagName))) {
        flushRun(node)
        return
      }

      if (isElement(node) && !INLINE_TAGS.has(node.tagName)) {
        flushRun(node)
        const block = make(node.tagName === 'H1' || node.tagName === 'H2' ? 'h3' : 'p')
        block.style.cssText = node.style.cssText

        if (node.querySelector(PASTE_BLOCK_SELECTOR) || node.tagName === 'TABLE') {
          block.textContent = node.textContent ?? ''
        } else {
          block.append(...Array.from(node.childNodes))
        }

        node.replaceWith(block)
        changed = true
        return
      }

      if (node.nodeType === Node.TEXT_NODE || isElement(node)) {
        run.push(node)
      } else {
        node.remove()
      }
    })
    flushRun(null)

    if (!root.firstChild || isComponent(root.lastChild)) {
      root.append(createParagraph())
      changed = true
    }

    root.querySelectorAll(':scope > p, :scope > h3').forEach((block) => {
      if (!block.firstChild) {
        block.append(make('br'))
        changed = true
      }
    })

    if (changed && selection && caret?.anchor?.isConnected && caret.focus?.isConnected && root.contains(caret.anchor)) {
      try {
        selection.setBaseAndExtent(caret.anchor, caret.anchorOffset, caret.focus, caret.focusOffset)
      } catch {
        // The previous caret offset no longer exists after normalization.
      }
    }
  }

  const syncCanvasState = () => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    root.querySelectorAll<HTMLElement>('.se-image').forEach((component) => {
      const src = component.querySelector('img')?.getAttribute('src') ?? ''

      if (src.startsWith('blob:') && !pendingBlobUrlsRef.current.has(src)) {
        component.remove()
        return
      }

      component.classList.toggle('se-is-uploading', src.startsWith('blob:'))
    })
    root.querySelectorAll<HTMLElement>(PLACEHOLDER_PART_SELECTOR).forEach((part) => {
      part.classList.toggle('se-is-empty', !part.textContent?.replace(/​/g, '').trim())
    })

    const blocks = Array.from(root.children)
    const sources = Array.from(root.querySelectorAll('.se-image img'), (image) => image.getAttribute('src') ?? '').filter(
      (src) => src.startsWith('https://'),
    )
    setCanvasEmpty(blocks.length <= 1 && (!blocks[0] || isEmptyTextBlock(blocks[0])))
    setImageSources((current) =>
      current.length === sources.length && current.every((src, index) => src === sources[index]) ? current : sources,
    )
    setLayoutVersion((version) => version + 1)
  }

  const takeSnapshot = (): Snapshot => {
    const root = canvasRef.current!
    const clone = root.cloneNode(true) as HTMLElement
    const selection = window.getSelection()
    let path: SelectionPath | null = null
    removeClasses(clone, ['se-is-selected', 'se-is-represent'])

    if (selection && selection.rangeCount && root.contains(selection.anchorNode) && root.contains(selection.focusNode)) {
      const anchor = getNodePath(root, selection.anchorNode)
      const focus = getNodePath(root, selection.focusNode)

      if (anchor && focus) {
        path = { anchor, anchorOffset: selection.anchorOffset, focus, focusOffset: selection.focusOffset }
      }
    }

    return { html: clone.innerHTML, selection: path }
  }

  const recordHistory = () => {
    window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = 0

    if (!canvasRef.current) {
      return
    }

    const history = historyRef.current
    const snapshot = takeSnapshot()
    const current = history.stack[history.index]

    if (current?.html === snapshot.html) {
      current.selection = snapshot.selection
      return
    }

    history.stack = [...history.stack.slice(0, history.index + 1), snapshot].slice(-HISTORY_LIMIT)
    history.index = history.stack.length - 1
  }

  const scheduleHistory = () => {
    window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = window.setTimeout(recordHistory, 500)
  }

  const flushHistory = () => {
    if (historyTimerRef.current) {
      recordHistory()
    }
  }

  const refreshFormat = () => {
    const root = canvasRef.current
    const selection = window.getSelection()
    const node = selection && selection.rangeCount ? selection.anchorNode : null

    if (!root || !node || !root.contains(node)) {
      return
    }

    const element = isElement(node) ? node : node.parentElement

    if (!element) {
      return
    }

    const style = window.getComputedStyle(element)
    const query = (command: string) => {
      try {
        return document.queryCommandState(command)
      } catch {
        return false
      }
    }

    setFormat({
      bold: query('bold'),
      italic: query('italic'),
      underline: query('underline'),
      strikeThrough: query('strikeThrough'),
      superscript: query('superscript'),
      subscript: query('subscript'),
      unorderedList: query('insertUnorderedList'),
      orderedList: query('insertOrderedList'),
      heading: element.closest('h3') !== null,
      inLink: element.closest('a') !== null,
      fontSize: Math.round(Number.parseFloat(style.fontSize)) || DEFAULT_FONT_SIZE,
      fontLabel: matchFontLabel(style.fontFamily),
      color: toHexColor(style.color),
      align: toAlign(style.textAlign),
    })
  }

  const afterMutation = () => {
    normalizeCanvas()
    syncCanvasState()
    recordHistory()
    refreshFormat()
  }

  const placeCaret = (target: Node, atStart = true) => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection) {
      return
    }

    getEditingHost(target, root).focus({ preventScroll: true })
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(atStart)
    selection.removeAllRanges()
    selection.addRange(range)
    savedRangeRef.current = range.cloneRange()
  }

  const restoreSelection = () => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection) {
      return false
    }

    if (selection.rangeCount && root.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      return true
    }

    const saved = savedRangeRef.current

    if (!saved || !root.contains(saved.commonAncestorContainer)) {
      return false
    }

    getEditingHost(saved.startContainer, root).focus({ preventScroll: true })
    selection.removeAllRanges()
    selection.addRange(saved)
    return true
  }

  const restoreSnapshot = (snapshot: Snapshot) => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    root.innerHTML = snapshot.html
    setSelectedComponent(null)
    const path = snapshot.selection
    const anchor = path ? resolveNodePath(root, path.anchor) : null
    const focus = path ? resolveNodePath(root, path.focus) : null

    if (path && anchor && focus) {
      getEditingHost(anchor, root).focus({ preventScroll: true })

      try {
        window.getSelection()?.setBaseAndExtent(anchor, path.anchorOffset, focus, path.focusOffset)
      } catch {
        placeCaret(root.lastChild ?? root, false)
      }
    }

    normalizeCanvas()
    syncCanvasState()
    refreshFormat()
  }

  const undo = () => {
    flushHistory()
    const history = historyRef.current

    if (history.index > 0) {
      history.index -= 1
      restoreSnapshot(history.stack[history.index])
    }
  }

  const redo = () => {
    flushHistory()
    const history = historyRef.current

    if (history.index < history.stack.length - 1) {
      history.index += 1
      restoreSnapshot(history.stack[history.index])
    }
  }

  // execCommand fires input events synchronously; callers normalize once the
  // whole edit is done, so the input handler must not rewrite markup midway.
  const execNative = (command: string, value?: string) => {
    nativeCommandRef.current = true

    try {
      return document.execCommand(command, false, value)
    } finally {
      nativeCommandRef.current = false
    }
  }

  const runCommand = (command: string, value?: string) => {
    if (!restoreSelection()) {
      return
    }

    const selection = window.getSelection()

    if (command !== 'delete' && selection?.rangeCount && getSelectedComponentNode(selection.getRangeAt(0))) {
      return
    }

    flushHistory()
    execNative('styleWithCSS', 'true')
    execNative(command, value)
    afterMutation()
  }

  const isSelectionInComponent = () => {
    const root = canvasRef.current
    const range = savedRangeRef.current
    return Boolean(root && range && closestEditablePart(range.startContainer, root))
  }

  const runBlockCommand = (command: string, value?: string) => {
    if (isSelectionInComponent()) {
      showToast('사진 설명, 인용구, 표 안에서는 사용할 수 없는 기능입니다.')
      return
    }

    runCommand(command, value)
  }

  // Font size and letter spacing have no native command, so the selection is
  // wrapped through the legacy fontSize command and then rewritten as spans.
  const applyInlineStyle = (property: 'font-size' | 'letter-spacing', value: string) => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection || !restoreSelection()) {
      return
    }

    const range = selection.getRangeAt(0)
    flushHistory()

    if (range.collapsed) {
      const span = make('span', '', '​')

      if (value) {
        span.style.setProperty(property, value)
      }

      range.insertNode(span)
      placeCaret(span.firstChild!, false)
    } else {
      execNative('styleWithCSS', 'false')
      execNative('fontSize', '7')
      execNative('styleWithCSS', 'true')
      const created = Array.from(root.querySelectorAll<HTMLElement>('font[size="7"], span[style*="xxx-large"]')).map(
        (wrapper) => {
          const span = make('span')

          if (wrapper.tagName === 'SPAN') {
            span.style.cssText = wrapper.style.cssText
            span.style.removeProperty('font-size')
          }

          if (value) {
            span.style.setProperty(property, value)
          }

          wrapper.querySelectorAll<HTMLElement>('[style]').forEach((child) => {
            child.style.removeProperty(property)

            if (!child.getAttribute('style')) {
              child.removeAttribute('style')
            }
          })
          span.append(...Array.from(wrapper.childNodes))
          wrapper.replaceWith(span)
          return span
        },
      )

      if (created.length) {
        const nextRange = document.createRange()
        nextRange.setStartBefore(created[0])
        nextRange.setEndAfter(created[created.length - 1])
        selection.removeAllRanges()
        selection.addRange(nextRange)
      }
    }

    afterMutation()
  }

  const getSelectedBlocks = () => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection || !selection.rangeCount) {
      return []
    }

    const range = selection.getRangeAt(0)
    const part = closestEditablePart(range.startContainer, root)

    if (part) {
      return [part]
    }

    return Array.from(root.children).flatMap((child) => {
      if (!isElement(child) || !range.intersectsNode(child)) {
        return []
      }

      if (child.tagName === 'UL' || child.tagName === 'OL') {
        return Array.from(child.children).filter(
          (item): item is HTMLElement => isElement(item) && range.intersectsNode(item),
        )
      }

      return child.tagName === 'P' || child.tagName === 'H3' ? [child] : []
    })
  }

  const applyLineHeight = (value: string) => {
    setMenu(null)

    if (!restoreSelection()) {
      return
    }

    const blocks = getSelectedBlocks()

    if (!blocks.length) {
      return
    }

    flushHistory()
    blocks.forEach((block) => {
      block.style.lineHeight = value

      if (!block.getAttribute('style')) {
        block.removeAttribute('style')
      }
    })
    afterMutation()
  }

  const getTopLevelBlock = (node: Node | null) => {
    const root = canvasRef.current
    let current = node

    while (current && current.parentNode !== root) {
      current = current.parentNode
    }

    return current && root && current.parentNode === root ? (current as ChildNode) : null
  }

  // Inserts whole blocks at the caret the way the blog editor does: an empty
  // line is replaced, and a line with text is split at the caret.
  const insertBlocks = (nodes: Node[]) => {
    const root = canvasRef.current!
    const saved = savedRangeRef.current
    const range = saved && root.contains(saved.commonAncestorContainer) ? saved : null
    const block = !range
      ? root.lastChild
      : range.startContainer === root
        ? (root.childNodes[Math.max(0, range.endOffset - 1)] ?? null)
        : getTopLevelBlock(range.startContainer)
    const fragment = document.createDocumentFragment()
    fragment.append(...nodes)

    if (!block) {
      root.append(fragment)
    } else if (isEmptyTextBlock(block)) {
      block.replaceWith(fragment)
    } else if (
      isElement(block) &&
      (block.tagName === 'P' || block.tagName === 'H3') &&
      range?.collapsed &&
      block.contains(range.startContainer)
    ) {
      if (isAtBlockEdge(block, range, 'start')) {
        block.before(fragment)
      } else if (isAtBlockEdge(block, range, 'end')) {
        block.after(fragment)
      } else {
        block.after(splitBlock(block, range))
        block.after(fragment)
      }
    } else {
      block.after(fragment)
    }
  }

  const insertComponent = (component: HTMLElement, focusTarget?: HTMLElement | null) => {
    if (!canvasRef.current) {
      return
    }

    flushHistory()
    setMenu(null)
    insertBlocks([component])

    if (!component.nextElementSibling || isComponent(component.nextElementSibling)) {
      component.after(createParagraph())
    }

    normalizeCanvas()
    syncCanvasState()

    if (focusTarget) {
      placeCaret(focusTarget)
      setSelectedComponent(component)
    } else if (component.nextElementSibling) {
      placeCaret(component.nextElementSibling)
      setSelectedComponent(null)
    }

    recordHistory()
    component.scrollIntoView({ block: 'nearest' })
  }

  const insertImages = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'))

    if (!images.length) {
      showToast('이미지 파일만 올릴 수 있습니다.')
      return
    }

    const blobUrls = images.map((file) => {
      const blobUrl = URL.createObjectURL(file)
      pendingBlobUrlsRef.current.add(blobUrl)
      insertComponent(createImageComponent(blobUrl))
      return blobUrl
    })
    setPendingUploads((count) => count + images.length)

    await Promise.all(
      images.map(async (file, index) => {
        const blobUrl = blobUrls[index]
        let uploadedUrl = ''

        try {
          uploadedUrl = await onUploadImage(file)
          sessionUploadsRef.current.add(uploadedUrl)
          await preloadImage(uploadedUrl)
        } catch (error) {
          showToast(error instanceof Error && error.message ? error.message : '사진 업로드에 실패했습니다.')
        }

        pendingBlobUrlsRef.current.delete(blobUrl)

        if (uploadedUrl) {
          const escapedUrl = uploadedUrl.replace(/&/g, '&amp;')
          canvasRef.current?.querySelectorAll('img').forEach((image) => {
            if (image.getAttribute('src') === blobUrl) {
              image.setAttribute('src', uploadedUrl)
            }
          })
          historyRef.current.stack.forEach((snapshot) => {
            snapshot.html = snapshot.html.split(blobUrl).join(escapedUrl)
          })
        }

        URL.revokeObjectURL(blobUrl)
        setPendingUploads((count) => count - 1)
        normalizeCanvas()
        syncCanvasState()

        if (!uploadedUrl) {
          recordHistory()
        }
      }),
    )
  }

  const handlePhotoInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (files.length) {
      void insertImages(files)
    }
  }

  const insertQuote = (style: string) => {
    const component = createQuoteComponent(style)
    insertComponent(component, component.querySelector<HTMLElement>('.se-quote-text'))
  }

  const insertCode = () => {
    const component = createCodeComponent()
    insertComponent(component, component.querySelector<HTMLElement>('.se-code-source'))
  }

  const insertTable = (rows: number, columns: number) => {
    const component = createTableComponent(rows, columns)
    insertComponent(component, component.querySelector<HTMLElement>('td'))
  }

  const handlePlaceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = placeForm.name.trim()

    if (!name) {
      showToast('장소 이름을 입력해주세요.')
      return
    }

    insertComponent(createPlaceComponent(name, placeForm.address.trim()))
    setPlaceForm({ name: '', address: '' })
  }

  const handleLinkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = toHttpUrl(linkForm.url)

    if (!url) {
      showToast('올바른 URL을 입력해주세요.')
      return
    }

    insertComponent(createLinkComponent(url, linkForm.title.trim()))
    setLinkForm({ url: '', title: '' })
  }

  const handleScheduleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const scheduleTitle = scheduleForm.title.trim()

    if (!scheduleTitle || !scheduleForm.date) {
      showToast('일정 제목과 날짜를 입력해주세요.')
      return
    }

    insertComponent(
      createScheduleComponent({
        title: scheduleTitle,
        date: scheduleForm.date,
        time: scheduleForm.time,
        place: scheduleForm.place.trim(),
        memo: scheduleForm.memo.trim(),
      }),
    )
    setScheduleForm({ title: '', date: '', time: '', place: '', memo: '' })
  }

  const handleInlineLinkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = toHttpUrl(inlineLinkUrl)

    if (!url) {
      showToast('올바른 URL을 입력해주세요.')
      return
    }

    setMenu(null)
    setInlineLinkUrl('')

    if (!restoreSelection()) {
      return
    }

    if (window.getSelection()?.isCollapsed) {
      runCommand('insertHTML', `<a href="${escapeHtml(url.href)}">${escapeHtml(url.href)}</a>`)
    } else {
      runCommand('createLink', url.href)
    }
  }

  const applyColor = (command: 'foreColor' | 'hiliteColor', color: string) => {
    setMenu(null)
    runCommand(command, color)
  }

  const selectComponent = (component: HTMLElement) => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection) {
      return
    }

    if (document.activeElement !== root) {
      root.focus({ preventScroll: true })
    }

    const range = document.createRange()
    range.selectNode(component)
    selection.removeAllRanges()
    selection.addRange(range)
    savedRangeRef.current = range.cloneRange()
    setSelectedComponent(component)
  }

  const removeComponent = (component: HTMLElement) => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    flushHistory()
    const next = component.nextElementSibling ?? component.previousElementSibling
    component.remove()
    setSelectedComponent(null)
    normalizeCanvas()
    syncCanvasState()
    const target = next?.isConnected ? next : root.lastElementChild

    if (isComponent(target)) {
      selectComponent(target)
    } else if (target) {
      placeCaret(target)
    }

    recordHistory()
  }

  const mutateSelectedComponent = (mutate: (component: HTMLElement) => void) => {
    if (!selectedComponent?.isConnected) {
      return
    }

    const component = selectedComponent
    flushHistory()
    mutate(component)
    setComponentMenu(null)
    afterMutation()

    const selection = window.getSelection()

    if (component.isConnected && !(selection?.rangeCount && component.contains(selection.getRangeAt(0).startContainer))) {
      selectComponent(component)
    }
  }

  const moveSelectedComponent = (direction: -1 | 1) => {
    mutateSelectedComponent((component) => {
      const sibling = direction < 0 ? component.previousElementSibling : component.nextElementSibling

      if (direction < 0) {
        sibling?.before(component)
      } else {
        sibling?.after(component)
      }
    })
    selectedComponent?.scrollIntoView({ block: 'nearest' })
  }

  const editTable = (action: 'addRow' | 'addColumn' | 'removeRow' | 'removeColumn') => {
    mutateSelectedComponent((component) => {
      const table = component.querySelector('table')

      if (!table || !table.rows.length) {
        return
      }

      const lastRow = table.rows[table.rows.length - 1]
      const cell =
        activeCellRef.current && table.contains(activeCellRef.current)
          ? activeCellRef.current
          : lastRow.cells[lastRow.cells.length - 1]
      const row = cell.parentElement as HTMLTableRowElement
      const columnIndex = cell.cellIndex

      if (action === 'addRow') {
        const newRow = table.insertRow(row.rowIndex + 1)

        for (let index = 0; index < row.cells.length; index += 1) {
          newRow.insertCell().contentEditable = 'true'
        }
      }

      if (action === 'addColumn') {
        Array.from(table.rows).forEach((tableRow) => {
          tableRow.insertCell(Math.min(columnIndex + 1, tableRow.cells.length)).contentEditable = 'true'
        })
      }

      if (action === 'removeRow' && table.rows.length > 1) {
        table.deleteRow(row.rowIndex)
        activeCellRef.current = null
      }

      if (action === 'removeColumn' && row.cells.length > 1) {
        Array.from(table.rows).forEach((tableRow) => {
          if (tableRow.cells[columnIndex]) {
            tableRow.deleteCell(columnIndex)
          }
        })
        activeCellRef.current = null
      }
    })
  }

  const moveToAdjacentCell = (cell: HTMLTableCellElement, direction: -1 | 1) => {
    const table = cell.closest('table')

    if (!table) {
      return
    }

    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('td, th'))
    const nextCell = cells[cells.indexOf(cell) + direction]

    if (nextCell) {
      placeCaret(nextCell, false)
      activeCellRef.current = nextCell
      return
    }

    if (direction > 0) {
      activeCellRef.current = cell
      editTable('addRow')
      const lastRow = table.rows[table.rows.length - 1]

      if (lastRow?.cells[0]) {
        placeCaret(lastRow.cells[0])
      }
    }
  }

  const insertFragment = (html: string) => {
    const template = make('template')
    template.innerHTML = sanitizeCompanyPostHtml(html)

    if (!template.content.querySelector(COMPONENT_SELECTOR)) {
      runCommand('insertHTML', template.innerHTML)
      return
    }

    if (!restoreSelection()) {
      return
    }

    flushHistory()

    if (!window.getSelection()?.isCollapsed) {
      execNative('delete')
    }

    const selection = window.getSelection()

    if (selection?.rangeCount) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    }

    const nodes = Array.from(template.content.childNodes)
    const lastNode = nodes[nodes.length - 1]
    insertBlocks(nodes)
    normalizeCanvas()

    if (isComponent(lastNode) && lastNode.nextElementSibling) {
      placeCaret(lastNode.nextElementSibling)
    } else if (lastNode?.isConnected) {
      placeCaret(lastNode, false)
    }

    syncCanvasState()
    recordHistory()
  }

  const loadDraft = (draft: Draft) => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    const nextVisibility = visibilityOptions.find((option) => option.value === draft.visibility)?.value ?? 'public'
    flushHistory()
    setTitle(draft.title)
    setService(draft.service)
    setVisibility(nextVisibility)
    setRepresentative(draft.representative)
    setSelectedComponent(null)
    root.replaceChildren(...createEditorNodes(draft.html))
    afterMutation()
    draftIdRef.current = draft.id
    savedSignatureRef.current = buildSignature(draft.title, draft.service, nextVisibility, serializeEditorHtml(root))
    setLastSavedAt(draft.savedAt)
    setMenu(null)
    setDialog(null)
  }

  const requestLoadDraft = (draft: Draft) => {
    if (getSignature() !== savedSignatureRef.current) {
      setMenu(null)
      setDialog({ kind: 'loadDraft', draft })
      return
    }

    loadDraft(draft)
  }

  const saveDraft = (auto: boolean) => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    const html = serializeEditorHtml(root)
    const signature = buildSignature(title, service, visibility, html)
    const hasContent = Boolean(title.trim() || companyPostToPlainText(html) || getCompanyPostImageUrls(html).length)

    if (auto && (signature === savedSignatureRef.current || !hasContent)) {
      return
    }

    const draft: Draft = {
      id: draftIdRef.current || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      caseId: source.caseId,
      title: title.trim(),
      service: service.trim(),
      visibility,
      html,
      representative: effectiveRepresentative,
      savedAt: Date.now(),
    }
    const allDrafts = [draft, ...readDrafts().filter((item) => item.id !== draft.id)].slice(0, DRAFT_LIMIT)

    if (!writeDrafts(allDrafts)) {
      if (!auto) {
        showToast('임시저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요.')
      }
      return
    }

    draftIdRef.current = draft.id
    savedSignatureRef.current = signature
    setDrafts(allDrafts.filter((item) => item.caseId === source.caseId))
    setLastSavedAt(draft.savedAt)

    if (!auto) {
      showToast('임시저장 되었습니다.')
    }
  }

  const deleteDraft = (id: string) => {
    const allDrafts = readDrafts().filter((draft) => draft.id !== id)
    writeDrafts(allDrafts)

    if (draftIdRef.current === id) {
      draftIdRef.current = ''
    }

    setDrafts(allDrafts.filter((draft) => draft.caseId === source.caseId))
  }

  const discardUnusedUploads = (usedUrls: string[]) => {
    const keep = new Set([...usedUrls, ...readDrafts().flatMap((draft) => getCompanyPostImageUrls(draft.html))])
    const unused = Array.from(sessionUploadsRef.current).filter((url) => !keep.has(url))

    if (unused.length) {
      onDiscardImages(unused)
    }
  }

  const closeEditor = () => {
    discardUnusedUploads(initialImageUrlsRef.current)
    onClose()
  }

  const requestClose = () => {
    if (publishing) {
      return
    }

    if (pendingUploads > 0) {
      showToast('사진 업로드가 끝난 뒤 나갈 수 있습니다.')
      return
    }

    if (getSignature() !== savedSignatureRef.current) {
      setMenu(null)
      setDialog({ kind: 'exit' })
      return
    }

    closeEditor()
  }

  const handlePublish = async () => {
    const root = canvasRef.current

    if (!root || publishing) {
      return
    }

    const name = title.trim()
    const category = service.trim()
    const html = serializeEditorHtml(root)
    const text = companyPostToPlainText(html)
    const images = getCompanyPostImageUrls(html)
    const problem = !name
      ? '제목(업체명)을 입력해주세요.'
      : name.length > limits.name
        ? `제목(업체명)은 ${limits.name}자 이하로 입력해주세요.`
        : !category
          ? '유형을 입력해주세요.'
          : category.length > limits.service
            ? `유형은 ${limits.service}자 이하로 입력해주세요.`
            : pendingUploads > 0
              ? '사진 업로드가 끝난 뒤 발행해주세요.'
              : !text
                ? '본문 내용을 입력해주세요.'
                : !images.length
                  ? '본문에 사진을 1장 이상 넣어주세요. 대표 사진이 목록 썸네일로 사용됩니다.'
                  : html.length > limits.html
                    ? '본문이 너무 깁니다. 내용을 줄여주세요.'
                    : ''

    if (problem) {
      showToast(problem)

      if (!name) {
        setMenu(null)
        titleRef.current?.focus()
      }
      return
    }

    setPublishing(true)

    try {
      await onPublish({
        name,
        service: category,
        visibility,
        html,
        description: summarizeCompanyPostText(text, limits.description),
        image: images.includes(representative) ? representative : images[0],
      })
    } catch (error) {
      showToast(error instanceof Error && error.message ? error.message : '발행에 실패했습니다.')
      setPublishing(false)
      return
    }

    if (draftIdRef.current) {
      writeDrafts(readDrafts().filter((draft) => draft.id !== draftIdRef.current))
    }

    discardUnusedUploads(images)
    setPublishing(false)
  }

  const toggleMenu = (id: MenuId, trigger?: HTMLElement) => {
    if (menu?.id === id) {
      setMenu(null)
      return
    }

    const layer = toolbarLayerRef.current

    if (trigger && layer) {
      const layerRect = layer.getBoundingClientRect()
      const triggerRect = trigger.getBoundingClientRect()
      setMenu({ id, left: triggerRect.left - layerRect.left, top: triggerRect.bottom - layerRect.top + 4 })
    } else {
      setMenu({ id, left: 0, top: 0 })
    }

    if (id === 'inlineLink') {
      const anchor = savedRangeRef.current?.startContainer
      const element = anchor ? (isElement(anchor) ? anchor : anchor.parentElement) : null
      setInlineLinkUrl(element?.closest('a')?.getAttribute('href') ?? '')
    }
  }

  const handleCanvasInput = (event: FormEvent<HTMLDivElement>) => {
    if (nativeCommandRef.current || (event.nativeEvent as InputEvent).isComposing) {
      return
    }

    normalizeCanvas()
    syncCanvasState()
    scheduleHistory()
  }

  const handleCompositionEnd = () => {
    setComposing(false)
    normalizeCanvas()
    syncCanvasState()
    scheduleHistory()
  }

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    const key = event.key.toLowerCase()

    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault()

      if (key === 'y' || event.shiftKey) {
        redo()
      } else {
        undo()
      }
      return
    }

    if (event.nativeEvent.isComposing) {
      return
    }

    const selection = window.getSelection()
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null
    // Chrome can collapse a selection around a component to some other caret
    // as the key is pressed, so the selected component state decides here.
    // Clicking elsewhere clears that state before another key can arrive.
    const caretInSelectedPart = Boolean(
      range &&
        selectedComponent?.contains(range.startContainer) &&
        closestEditablePart(range.startContainer, root),
    )

    if (selectedComponent?.isConnected && !caretInSelectedPart) {
      const previous = selectedComponent.previousElementSibling
      const next = selectedComponent.nextElementSibling

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        removeComponent(selectedComponent)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        flushHistory()
        const paragraph = createParagraph()
        selectedComponent.after(paragraph)
        setSelectedComponent(null)
        afterMutation()
        placeCaret(paragraph)
      } else if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && previous) {
        event.preventDefault()

        if (isComponent(previous)) {
          selectComponent(previous)
        } else {
          setSelectedComponent(null)
          placeCaret(previous, false)
        }
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && next) {
        event.preventDefault()

        if (isComponent(next)) {
          selectComponent(next)
        } else {
          setSelectedComponent(null)
          placeCaret(next)
        }
      } else if ((event.key.length === 1 || event.key === 'Process') && !event.ctrlKey && !event.metaKey) {
        // Typing while a component is selected starts a new line after it,
        // including Korean IME input whose keydown reports "Process".
        flushHistory()
        const paragraph = isEmptyTextBlock(next) ? next : createParagraph()

        if (paragraph !== next) {
          selectedComponent.after(paragraph)
        }

        setSelectedComponent(null)
        placeCaret(paragraph)
      }
      return
    }

    if (!range) {
      return
    }

    const part = closestEditablePart(range.startContainer, root)

    if (part) {
      if (event.key === 'Enter') {
        event.preventDefault()

        if (part.matches(SINGLE_LINE_PART_SELECTOR)) {
          const nextBlock = part.closest(COMPONENT_SELECTOR)?.nextElementSibling

          if (nextBlock && !isComponent(nextBlock)) {
            placeCaret(nextBlock)
          }
        } else {
          runCommand('insertLineBreak')
        }
      } else if (event.key === 'Tab' && part.matches('.se-code-source')) {
        event.preventDefault()
        runCommand('insertText', '\t')
      } else if (event.key === 'Tab' && part instanceof HTMLTableCellElement) {
        event.preventDefault()
        moveToAdjacentCell(part, event.shiftKey ? -1 : 1)
      } else if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        range.collapsed &&
        !part.textContent?.replace(/​/g, '')
      ) {
        event.preventDefault()
      }
      return
    }

    const block = getTopLevelBlock(range.startContainer)

    if (!range.collapsed || !isElement(block) || (block.tagName !== 'P' && block.tagName !== 'H3')) {
      return
    }

    const previous = block.previousElementSibling
    const next = block.nextElementSibling

    if (event.key === 'Backspace' && isComponent(previous) && isAtBlockEdge(block, range, 'start')) {
      event.preventDefault()

      if (isEmptyTextBlock(block) && next) {
        flushHistory()
        block.remove()
        afterMutation()
      }

      selectComponent(previous)
    } else if (event.key === 'Delete' && isComponent(next) && isAtBlockEdge(block, range, 'end')) {
      event.preventDefault()

      if (isEmptyTextBlock(block)) {
        flushHistory()
        block.remove()
        afterMutation()
      }

      selectComponent(next)
    }
  }

  const handleCanvasMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const root = canvasRef.current
    const target = event.target as HTMLElement
    const component = target.closest<HTMLElement>(COMPONENT_SELECTOR)

    if (!root || !component || !root.contains(component)) {
      return
    }

    const part = target.closest(EDITABLE_PART_SELECTOR)

    if (part && component.contains(part)) {
      setSelectedComponent(component)
      return
    }

    event.preventDefault()
    selectComponent(component)
  }

  const handleCanvasClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const root = canvasRef.current
    const target = event.target as HTMLElement
    const component = target.closest<HTMLElement>(COMPONENT_SELECTOR)

    if (target.closest('a')) {
      event.preventDefault()
    }

    // Chrome may place a focus caret after mousedown, so the component is
    // selected again once the click completes.
    if (root && component && root.contains(component) && !target.closest(EDITABLE_PART_SELECTOR)) {
      selectComponent(component)
    }
  }

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const root = canvasRef.current
    event.preventDefault()

    if (!root || !restoreSelection()) {
      return
    }

    const data = event.clipboardData
    const selection = window.getSelection()
    const part = selection?.rangeCount ? closestEditablePart(selection.getRangeAt(0).startContainer, root) : null
    const text = data.getData('text/plain')

    if (part) {
      if (part.matches(SINGLE_LINE_PART_SELECTOR)) {
        runCommand('insertText', text.replace(/\s*[\r\n]+\s*/g, ' '))
      } else if (text) {
        runCommand('insertHTML', escapeHtml(text).replace(/\r?\n/g, '<br>'))
      }
      return
    }

    const files = Array.from(data.files).filter((file) => file.type.startsWith('image/'))

    if (files.length) {
      void insertImages(files)
      return
    }

    const internalHtml = data.getData(INTERNAL_CLIPBOARD_TYPE)

    if (internalHtml) {
      insertFragment(internalHtml)
      return
    }

    const html = data.getData('text/html')
    const container = html ? convertPastedHtml(html) : textToParagraphs(text)
    const onlyChild = container.children.length === 1 ? container.firstElementChild : null

    if (!container.childNodes.length) {
      return
    }

    runCommand('insertHTML', onlyChild?.tagName === 'P' ? onlyChild.innerHTML : container.innerHTML)
  }

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection || !selection.rangeCount || selection.isCollapsed) {
      return
    }

    const range = selection.getRangeAt(0)

    if (!root.contains(range.commonAncestorContainer) || closestEditablePart(range.commonAncestorContainer, root)) {
      return
    }

    const container = make('div')
    container.append(range.cloneContents())
    const html = serializeEditorHtml(container)
    event.preventDefault()
    event.clipboardData.setData('text/html', html)
    event.clipboardData.setData('text/plain', companyPostToPlainText(html))
    event.clipboardData.setData(INTERNAL_CLIPBOARD_TYPE, html)

    if (cut) {
      runCommand('delete')
    }
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const root = canvasRef.current
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))

    if (!files.length) {
      // Only text dragged inside the document may move; outside content would
      // bring in markup and hotlinked images that bypass the paste cleanup.
      if (!draggingFromCanvasRef.current) {
        event.preventDefault()
      }
      return
    }

    event.preventDefault()
    const range = getRangeFromPoint(event.clientX, event.clientY)

    if (root && range && root.contains(range.startContainer)) {
      savedRangeRef.current = range
    }

    void insertImages(files)
  }

  const handleTitleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      const firstBlock = canvasRef.current?.firstElementChild

      if (isComponent(firstBlock)) {
        selectComponent(firstBlock)
      } else if (firstBlock) {
        placeCaret(firstBlock)
      }
    }
  }

  const initializeCanvas = useEffectEvent(() => {
    const root = canvasRef.current

    if (!root) {
      return
    }

    root.replaceChildren(...(source.html ? createEditorNodes(source.html) : createLegacyNodes(source.description, source.image)))
    normalizeCanvas()
    syncCanvasState()
    historyRef.current = { stack: [takeSnapshot()], index: 0 }
    initialImageUrlsRef.current = getCompanyPostImageUrls(serializeEditorHtml(root))
    savedSignatureRef.current = buildSignature(source.name, source.service, source.visibility, serializeEditorHtml(root))
    document.execCommand('defaultParagraphSeparator', false, 'p')
  })

  const handleSelectionChange = useEffectEvent(() => {
    const root = canvasRef.current
    const selection = window.getSelection()

    if (!root || !selection || !selection.rangeCount) {
      return
    }

    const range = selection.getRangeAt(0)

    if (!root.contains(range.commonAncestorContainer)) {
      return
    }

    savedRangeRef.current = range.cloneRange()
    const element = isElement(range.startContainer) ? range.startContainer : range.startContainer.parentElement
    const component = getSelectedComponentNode(range) ?? element?.closest<HTMLElement>(COMPONENT_SELECTOR) ?? null
    const cell = element?.closest<HTMLTableCellElement>('td, th')
    setSelectedComponent(component && root.contains(component) ? component : null)

    if (cell && root.contains(cell)) {
      activeCellRef.current = cell
    }

    refreshFormat()
  })

  const handleBeforeInput = useEffectEvent((event: InputEvent) => {
    const selection = window.getSelection()
    const component = selection?.rangeCount ? getSelectedComponentNode(selection.getRangeAt(0)) : null

    if (event.inputType === 'historyUndo') {
      event.preventDefault()
      undo()
    } else if (event.inputType === 'historyRedo') {
      event.preventDefault()
      redo()
    } else if (component && event.cancelable && event.inputType !== 'deleteByCut') {
      event.preventDefault()
    }
  })

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      saveDraft(false)
    } else if (event.key === 'Escape') {
      if (dialog) {
        setDialog(null)
      } else if (menu || componentMenu) {
        setMenu(null)
        setComponentMenu(null)
      } else {
        setSelectedComponent(null)
      }
    }
  })

  const handleWindowMouseDown = useEffectEvent((event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null

    if (menu && target?.closest('[data-se-menu]')?.getAttribute('data-se-menu') !== menu.id) {
      setMenu(null)
    }

    if (componentMenu && !target?.closest('.se-component-toolbar')) {
      setComponentMenu(null)
    }
  })

  const handleBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (getSignature() !== savedSignatureRef.current) {
      event.preventDefault()
    }
  })

  const autoSave = useEffectEvent(() => {
    if (!publishing && pendingUploads === 0) {
      saveDraft(true)
    }
  })

  useLayoutEffect(() => {
    initializeCanvas()
  }, [])

  useEffect(() => {
    const root = canvasRef.current
    const previousOverflow = document.body.style.overflow
    const onSelectionChange = () => handleSelectionChange()
    const onBeforeInput = (event: InputEvent) => handleBeforeInput(event)
    const onKeyDown = (event: KeyboardEvent) => handleWindowKeyDown(event)
    const onMouseDown = (event: MouseEvent) => handleWindowMouseDown(event)
    const onBeforeUnload = (event: BeforeUnloadEvent) => handleBeforeUnload(event)
    const autoSaveTimer = window.setInterval(() => autoSave(), AUTO_SAVE_INTERVAL_MS)
    const resizeObserver = new ResizeObserver(() => setLayoutVersion((version) => version + 1))

    document.body.style.overflow = 'hidden'
    loadCompanyPostFonts(COMPANY_POST_FONTS.flatMap((font) => (font.href ? [font.href] : [])))
    document.addEventListener('selectionchange', onSelectionChange)
    root?.addEventListener('beforeinput', onBeforeInput)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('beforeunload', onBeforeUnload)

    if (root) {
      resizeObserver.observe(root)
    }

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('selectionchange', onSelectionChange)
      root?.removeEventListener('beforeinput', onBeforeInput)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.clearInterval(autoSaveTimer)
      window.clearTimeout(historyTimerRef.current)
      window.clearTimeout(toastTimerRef.current)
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    canvasRef.current?.querySelectorAll<HTMLElement>('.se-image').forEach((component) => {
      const src = component.querySelector('img')?.getAttribute('src')
      component.classList.toggle('se-is-represent', Boolean(effectiveRepresentative) && src === effectiveRepresentative)
    })
  }, [effectiveRepresentative, layoutVersion])

  useEffect(() => {
    if (!selectedComponent) {
      return
    }

    selectedComponent.classList.add('se-is-selected')
    return () => selectedComponent.classList.remove('se-is-selected')
  }, [selectedComponent])

  useLayoutEffect(() => {
    if (selectedComponent?.isConnected) {
      setComponentTop(selectedComponent.offsetTop)
    } else if (selectedComponent) {
      setSelectedComponent(null)
    }
  }, [selectedComponent, layoutVersion])

  useLayoutEffect(() => {
    const popover = popoverRef.current
    const layer = toolbarLayerRef.current

    if (popover && layer && menu) {
      const maxLeft = layer.clientWidth - popover.offsetWidth - 8
      popover.style.left = `${Math.max(8, Math.min(menu.left, maxLeft))}px`
    }
  }, [menu])

  useLayoutEffect(() => {
    const titleInput = titleRef.current

    if (titleInput) {
      titleInput.style.height = 'auto'
      titleInput.style.height = `${titleInput.scrollHeight}px`
    }
  }, [title])

  const renderPopover = (id: MenuId, className: string, content: ReactNode) =>
    menu?.id === id ? (
      <div
        ref={popoverRef}
        className={`se-popover ${className}`}
        data-se-menu={id}
        style={{ top: menu.top, left: menu.left }}
        onMouseDown={keepSelection}
      >
        {content}
      </div>
    ) : null

  const insertTool = (id: MenuId | 'photo' | 'code', icon: IconName, label: string, onClick: (trigger: HTMLElement) => void) => (
    <button
      type="button"
      className={`se-insert-button${menu?.id === id ? ' is-active' : ''}`}
      data-se-menu={id}
      onMouseDown={keepSelection}
      onClick={(event) => onClick(event.currentTarget)}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )

  const propertyButton = (label: string, active: boolean, onClick: () => void, content: ReactNode) => (
    <button
      type="button"
      className={`se-property-button${active ? ' is-active' : ''}`}
      onMouseDown={keepSelection}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={titleFocused}
    >
      {content}
    </button>
  )

  const menuButton = (id: MenuId, label: string, content: ReactNode, className = '') => (
    <button
      type="button"
      className={`se-property-button se-property-menu ${className}${menu?.id === id ? ' is-active' : ''}`}
      data-se-menu={id}
      onMouseDown={keepSelection}
      onClick={(event) => toggleMenu(id, event.currentTarget)}
      aria-label={label}
      title={label}
      disabled={titleFocused}
    >
      {content}
    </button>
  )

  const renderColorPalette = (command: 'foreColor' | 'hiliteColor') => (
    <>
      <div className="se-color-grid">
        {COLOR_PALETTE.map((color) => (
          <button
            type="button"
            key={color}
            className="se-color-chip"
            style={{ background: color }}
            onClick={() => applyColor(command, color)}
            aria-label={color}
            title={color}
          />
        ))}
      </div>
      <div className="se-color-custom">
        {command === 'hiliteColor' ? (
          <button type="button" className="se-color-none" onClick={() => applyColor(command, 'transparent')}>
            색상 없음
          </button>
        ) : null}
        <label className="se-color-picker">
          <input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} />
          <span>{customColor}</span>
        </label>
        <button type="button" className="se-popover-submit" onClick={() => applyColor(command, customColor)}>
          적용
        </button>
      </div>
    </>
  )

  const renderComponentToolbar = () => {
    if (!selectedComponent || !selectedType) {
      return null
    }

    const component = selectedComponent
    const imageSrc = component.querySelector('img')?.getAttribute('src') ?? ''
    const align = getClassSuffix(component, 'se-align-') || 'center'
    const styleMenuOpen = componentMenu === component
    const componentButton = (label: string, onClick: () => void, content: ReactNode, active = false) => (
      <button
        key={label}
        type="button"
        className={`se-component-button${active ? ' is-active' : ''}`}
        onClick={onClick}
        aria-label={label}
        title={label}
      >
        {content}
      </button>
    )

    return (
      <div className="se-component-toolbar" style={{ top: componentTop - 48 }} onMouseDown={keepSelection}>
        {selectedType === 'image' || selectedType === 'sticker' ? (
          <div className="se-component-group">
            {(['left', 'center', 'right'] as const).map((value) =>
              componentButton(
                { left: '왼쪽 정렬', center: '가운데 정렬', right: '오른쪽 정렬' }[value],
                () => mutateSelectedComponent((target) => replaceClassWithPrefix(target, 'se-align-', `se-align-${value}`)),
                <Icon name={value === 'left' ? 'alignLeft' : value === 'center' ? 'alignCenter' : 'alignRight'} />,
                align === value,
              ),
            )}
          </div>
        ) : null}
        {selectedType === 'image' ? (
          <>
            <div className="se-component-group">
              {IMAGE_SIZES.map((size) =>
                componentButton(
                  `${size.label} 크기`,
                  () => mutateSelectedComponent((target) => replaceClassWithPrefix(target, 'se-image--', `se-image--${size.value}`)),
                  <span className="se-component-text">{size.label}</span>,
                  component.classList.contains(`se-image--${size.value}`),
                ),
              )}
            </div>
            <div className="se-component-group">
              {componentButton(
                '대표 사진으로 지정',
                () => {
                  if (imageSrc.startsWith('https://')) {
                    setRepresentative(imageSrc)
                  } else {
                    showToast('업로드가 끝난 사진만 대표로 지정할 수 있습니다.')
                  }
                },
                <span className="se-component-text se-represent-text">대표</span>,
                imageSrc === effectiveRepresentative,
              )}
            </div>
          </>
        ) : null}
        {selectedType === 'quote' || selectedType === 'divider' ? (
          <div className="se-component-group se-component-style">
            {componentButton(
              '스타일 변경',
              () => setComponentMenu(styleMenuOpen ? null : component),
              <span className="se-component-text">
                스타일 <Icon name="chevron" />
              </span>,
              styleMenuOpen,
            )}
            {styleMenuOpen ? (
              <div className="se-component-menu">
                {selectedType === 'quote'
                  ? QUOTE_STYLES.map((style) => (
                      <button
                        type="button"
                        key={style.value}
                        className={component.classList.contains(`se-quote--${style.value}`) ? 'is-active' : ''}
                        onClick={() =>
                          mutateSelectedComponent((target) => replaceClassWithPrefix(target, 'se-quote--', `se-quote--${style.value}`))
                        }
                      >
                        {style.label}
                      </button>
                    ))
                  : DIVIDER_STYLES.map((style) => (
                      <button
                        type="button"
                        key={style}
                        className={`se-divider-option${component.classList.contains(`se-divider--${style}`) ? ' is-active' : ''}`}
                        onClick={() =>
                          mutateSelectedComponent((target) => replaceClassWithPrefix(target, 'se-divider--', `se-divider--${style}`))
                        }
                        aria-label={`구분선 ${style}`}
                      >
                        <span className={`se-divider se-divider--${style}`}>
                          <hr />
                        </span>
                      </button>
                    ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {selectedType === 'table' ? (
          <div className="se-component-group">
            {componentButton('아래에 행 추가', () => editTable('addRow'), <span className="se-component-text">행 추가</span>)}
            {componentButton('오른쪽에 열 추가', () => editTable('addColumn'), <span className="se-component-text">열 추가</span>)}
            {componentButton('행 삭제', () => editTable('removeRow'), <span className="se-component-text">행 삭제</span>)}
            {componentButton('열 삭제', () => editTable('removeColumn'), <span className="se-component-text">열 삭제</span>)}
          </div>
        ) : null}
        <div className="se-component-group">
          {componentButton('위로 이동', () => moveSelectedComponent(-1), <Icon name="up" />)}
          {componentButton('아래로 이동', () => moveSelectedComponent(1), <Icon name="down" />)}
        </div>
        <div className="se-component-group">
          {componentButton('삭제', () => removeComponent(component), <Icon name="trash" />)}
        </div>
      </div>
    )
  }

  const renderDialog = () => {
    if (!dialog) {
      return null
    }

    const content =
      dialog.kind === 'restore'
        ? { message: '작성 중인 글이 있습니다.\n이어서 작성하시겠습니까?', confirm: '확인', onConfirm: () => loadDraft(dialog.draft) }
        : dialog.kind === 'loadDraft'
          ? {
              message: '작성 중인 내용이 임시저장 글로 바뀝니다.\n불러오시겠습니까?',
              confirm: '불러오기',
              onConfirm: () => loadDraft(dialog.draft),
            }
          : {
              message: '저장하지 않은 내용이 있습니다.\n작성을 그만두고 나가시겠습니까?',
              confirm: '나가기',
              onConfirm: closeEditor,
            }

    return (
      <div className="se-dialog-backdrop">
        <div className="se-dialog" role="alertdialog" aria-modal="true" aria-label={content.message}>
          <p>{content.message}</p>
          <div className="se-dialog-actions">
            <button type="button" className="se-dialog-cancel" onClick={() => setDialog(null)}>
              취소
            </button>
            <button type="button" className="se-dialog-confirm" onClick={content.onConfirm}>
              {content.confirm}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const visibilityOption = visibilityOptions.find((option) => option.value === visibility)

  return (
    <div className="se-editor" role="dialog" aria-modal="true" aria-label={source.caseId ? '사기업체 글 수정' : '사기업체 글쓰기'}>
      <header className="se-header">
        <div className="se-header-left">
          <button type="button" className="se-header-back" onClick={requestClose} aria-label="나가기" title="나가기">
            <Icon name="back" />
          </button>
          <strong className="se-header-title">{source.caseId ? '사기업체 글 수정' : '사기업체 글쓰기'}</strong>
          {lastSavedAt ? <span className="se-header-saved">임시저장 {formatSavedTime(lastSavedAt)}</span> : null}
        </div>
        <div className="se-header-right">
          <div className="se-save-group" data-se-menu="drafts">
            <button type="button" className="se-save-button" onClick={() => saveDraft(false)} disabled={publishing}>
              저장
            </button>
            <button
              type="button"
              className={`se-save-count${menu?.id === 'drafts' ? ' is-active' : ''}`}
              onClick={() => toggleMenu('drafts')}
              aria-label="임시저장 글 목록"
              disabled={publishing}
            >
              {drafts.length}
            </button>
            {menu?.id === 'drafts' ? (
              <div className="se-header-panel se-drafts-panel">
                <p className="se-panel-title">
                  임시저장 글 <span>{drafts.length}</span>
                </p>
                {drafts.length ? (
                  <ul className="se-draft-list">
                    {drafts.map((draft) => (
                      <li key={draft.id}>
                        <button type="button" className="se-draft-load" onClick={() => requestLoadDraft(draft)}>
                          <strong>{draft.title || '제목 없음'}</strong>
                          <span>{formatSavedDate(draft.savedAt)}</span>
                        </button>
                        <button
                          type="button"
                          className="se-draft-delete"
                          onClick={() => deleteDraft(draft.id)}
                          aria-label={`${draft.title || '제목 없음'} 임시저장 글 삭제`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="se-panel-empty">임시저장된 글이 없습니다.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="se-publish-group" data-se-menu="publish">
            <button
              type="button"
              className={`se-publish-button${menu?.id === 'publish' ? ' is-active' : ''}`}
              onClick={() => toggleMenu('publish')}
              disabled={publishing}
            >
              {publishing ? '발행 중...' : '발행'}
              <Icon name="chevron" />
            </button>
            {menu?.id === 'publish' ? (
              <div className="se-header-panel se-publish-panel" onMouseDown={keepSelection}>
                <dl className="se-publish-rows">
                  <div className="se-publish-row">
                    <dt>유형</dt>
                    <dd>
                      <input
                        type="text"
                        className="se-publish-input"
                        value={service}
                        onChange={(event) => setService(event.target.value)}
                        list={serviceListId}
                        maxLength={limits.service}
                        placeholder="예: 코인 리딩방 사기"
                      />
                      <datalist id={serviceListId}>
                        {serviceSuggestions.map((suggestion) => (
                          <option value={suggestion} key={suggestion} />
                        ))}
                      </datalist>
                    </dd>
                  </div>
                  <div className="se-publish-row">
                    <dt>공개 설정</dt>
                    <dd>
                      <div className="se-radio-group">
                        {visibilityOptions.map((option) => (
                          <label className="se-radio" key={option.value}>
                            <input
                              type="radio"
                              name={`${serviceListId}-visibility`}
                              checked={visibility === option.value}
                              onChange={() => setVisibility(option.value)}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                      {visibilityOption ? <p className="se-publish-help">{visibilityOption.description}</p> : null}
                    </dd>
                  </div>
                  <div className="se-publish-row">
                    <dt>대표 사진</dt>
                    <dd className="se-publish-thumb-row">
                      {effectiveRepresentative ? (
                        <img className="se-publish-thumb" src={effectiveRepresentative} alt="대표 사진" />
                      ) : (
                        <span className="se-publish-thumb is-empty">없음</span>
                      )}
                      <p className="se-publish-help">본문 사진을 클릭한 뒤 ‘대표’를 누르면 목록 썸네일이 바뀝니다.</p>
                    </dd>
                  </div>
                  <div className="se-publish-row">
                    <dt>공개 제목</dt>
                    <dd className="se-publish-title">{publicTitle || '제목을 입력하면 표시됩니다.'}</dd>
                  </div>
                </dl>
                <div className="se-publish-actions">
                  <button type="button" className="se-publish-confirm" onClick={handlePublish} disabled={publishing}>
                    {publishing ? '발행 중...' : '✓ 발행'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="se-toolbar-layer" ref={toolbarLayerRef}>
        <div className="se-insert-toolbar" role="toolbar" aria-label="구성요소 추가">
          {insertTool('photo', 'photo', '사진', () => fileInputRef.current?.click())}
          {insertTool('sticker', 'sticker', '스티커', (trigger) => toggleMenu('sticker', trigger))}
          <div className="se-insert-split">
            {insertTool('quote', 'quote', '인용구', () => insertQuote('quotation'))}
            <button
              type="button"
              className="se-insert-more"
              data-se-menu="quote"
              onMouseDown={keepSelection}
              onClick={(event) => toggleMenu('quote', event.currentTarget)}
              aria-label="인용구 스타일 선택"
            >
              <Icon name="chevron" />
            </button>
          </div>
          <div className="se-insert-split">
            {insertTool('divider', 'divider', '구분선', () => insertComponent(createDividerComponent('1')))}
            <button
              type="button"
              className="se-insert-more"
              data-se-menu="divider"
              onMouseDown={keepSelection}
              onClick={(event) => toggleMenu('divider', event.currentTarget)}
              aria-label="구분선 스타일 선택"
            >
              <Icon name="chevron" />
            </button>
          </div>
          {insertTool('place', 'place', '장소', (trigger) => toggleMenu('place', trigger))}
          {insertTool('link', 'link', '링크', (trigger) => toggleMenu('link', trigger))}
          {insertTool('schedule', 'schedule', '일정', (trigger) => toggleMenu('schedule', trigger))}
          {insertTool('code', 'code', '소스코드', insertCode)}
          {insertTool('table', 'table', '표', (trigger) => toggleMenu('table', trigger))}
        </div>

        <div className={`se-property-toolbar${titleFocused ? ' is-disabled' : ''}`} role="toolbar" aria-label="글자 서식">
          {menuButton('textStyle', '문단 스타일', <span className="se-select-label">{format.heading ? '소제목' : '본문'}</span>, 'se-select se-select-style')}
          {menuButton('font', '글꼴', <span className="se-select-label">{format.fontLabel}</span>, 'se-select se-select-font')}
          {menuButton('fontSize', '글자 크기', <span className="se-select-label">{format.fontSize}</span>, 'se-select se-select-size')}
          <span className="se-toolbar-divider" />
          {propertyButton('굵게', format.bold, () => runCommand('bold'), <b className="se-glyph">B</b>)}
          {propertyButton('기울임', format.italic, () => runCommand('italic'), <i className="se-glyph se-glyph-italic">I</i>)}
          {propertyButton('밑줄', format.underline, () => runCommand('underline'), <u className="se-glyph">U</u>)}
          {propertyButton('취소선', format.strikeThrough, () => runCommand('strikeThrough'), <s className="se-glyph">S</s>)}
          {menuButton(
            'color',
            '글자색',
            <span className="se-glyph se-glyph-color">
              T<span style={{ background: format.color }} />
            </span>,
          )}
          {menuButton('background', '배경색', <span className="se-glyph se-glyph-background">T</span>)}
          <span className="se-toolbar-divider" />
          {menuButton(
            'align',
            '정렬',
            <Icon
              name={
                format.align === 'center'
                  ? 'alignCenter'
                  : format.align === 'right'
                    ? 'alignRight'
                    : format.align === 'justify'
                      ? 'alignJustify'
                      : 'alignLeft'
              }
            />,
          )}
          {menuButton('lineHeight', '줄간격', <Icon name="lineHeight" />)}
          {menuButton('letterSpacing', '자간', <Icon name="letterSpacing" />)}
          {menuButton('list', '목록', <Icon name={format.orderedList ? 'listNumber' : 'listBullet'} />, format.unorderedList || format.orderedList ? 'is-on' : '')}
          <span className="se-toolbar-divider" />
          {propertyButton('위 첨자', format.superscript, () => runCommand('superscript'), <span className="se-glyph">x<sup>2</sup></span>)}
          {propertyButton('아래 첨자', format.subscript, () => runCommand('subscript'), <span className="se-glyph">x<sub>2</sub></span>)}
          {menuButton('special', '특수문자', <span className="se-glyph">Ω</span>)}
          {menuButton('inlineLink', '링크', <Icon name="link" />, format.inLink ? 'is-on' : '')}
          {propertyButton('서식 지우기', false, () => runCommand('removeFormat'), <Icon name="clear" />)}
        </div>

        {renderPopover(
          'sticker',
          'se-sticker-popover',
          <>
            <div className="se-popover-tabs">
              {STICKER_GROUPS.map((group, index) => (
                <button
                  type="button"
                  key={group.label}
                  className={index === stickerGroupIndex ? 'is-active' : ''}
                  onClick={() => setStickerGroupIndex(index)}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="se-sticker-grid">
              {STICKER_GROUPS[stickerGroupIndex].items.map((sticker) => (
                <button type="button" key={sticker} onClick={() => insertComponent(createStickerComponent(sticker))}>
                  {sticker}
                </button>
              ))}
            </div>
          </>,
        )}
        {renderPopover(
          'quote',
          'se-style-popover',
          <div className="se-content se-quote-options">
            {QUOTE_STYLES.map((style) => (
              <button type="button" key={style.value} onClick={() => insertQuote(style.value)}>
                <span className={`se-quote se-quote--${style.value} se-quote-preview`}>
                  <span className="se-quote-text">{style.label}</span>
                </span>
              </button>
            ))}
          </div>,
        )}
        {renderPopover(
          'divider',
          'se-style-popover',
          <div className="se-content se-divider-options">
            {DIVIDER_STYLES.map((style) => (
              <button
                type="button"
                key={style}
                className="se-divider-option"
                onClick={() => insertComponent(createDividerComponent(style))}
                aria-label={`구분선 ${style}`}
              >
                <span className={`se-divider se-divider--${style}`}>
                  <hr />
                </span>
              </button>
            ))}
          </div>,
        )}
        {renderPopover(
          'place',
          'se-form-popover',
          <form onSubmit={handlePlaceSubmit}>
            <p className="se-popover-title">장소</p>
            <label>
              장소 이름
              <input
                type="text"
                value={placeForm.name}
                onChange={(event) => setPlaceForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="예: 서울중앙지방법원"
                maxLength={80}
                autoFocus
              />
            </label>
            <label>
              주소 (선택)
              <input
                type="text"
                value={placeForm.address}
                onChange={(event) => setPlaceForm((form) => ({ ...form, address: event.target.value }))}
                placeholder="예: 서울 서초구 서초중앙로 157"
                maxLength={120}
              />
            </label>
            <p className="se-popover-help">클릭하면 네이버 지도 검색 결과로 연결됩니다.</p>
            <button type="submit" className="se-popover-submit">
              확인
            </button>
          </form>,
        )}
        {renderPopover(
          'link',
          'se-form-popover',
          <form onSubmit={handleLinkSubmit}>
            <p className="se-popover-title">링크</p>
            <label>
              URL
              <input
                type="text"
                value={linkForm.url}
                onChange={(event) => setLinkForm((form) => ({ ...form, url: event.target.value }))}
                placeholder="URL을 입력하세요."
                maxLength={1000}
                autoFocus
              />
            </label>
            <label>
              제목 (선택)
              <input
                type="text"
                value={linkForm.title}
                onChange={(event) => setLinkForm((form) => ({ ...form, title: event.target.value }))}
                placeholder="링크 카드에 표시할 제목"
                maxLength={100}
              />
            </label>
            <button type="submit" className="se-popover-submit">
              확인
            </button>
          </form>,
        )}
        {renderPopover(
          'schedule',
          'se-form-popover',
          <form onSubmit={handleScheduleSubmit}>
            <p className="se-popover-title">일정</p>
            <label>
              일정 제목
              <input
                type="text"
                value={scheduleForm.title}
                onChange={(event) => setScheduleForm((form) => ({ ...form, title: event.target.value }))}
                placeholder="예: 피해자 설명회"
                maxLength={80}
                autoFocus
              />
            </label>
            <div className="se-popover-row">
              <label>
                날짜
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, date: event.target.value }))}
                />
              </label>
              <label>
                시간 (선택)
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, time: event.target.value }))}
                />
              </label>
            </div>
            <label>
              장소 (선택)
              <input
                type="text"
                value={scheduleForm.place}
                onChange={(event) => setScheduleForm((form) => ({ ...form, place: event.target.value }))}
                maxLength={80}
              />
            </label>
            <label>
              메모 (선택)
              <input
                type="text"
                value={scheduleForm.memo}
                onChange={(event) => setScheduleForm((form) => ({ ...form, memo: event.target.value }))}
                maxLength={200}
              />
            </label>
            <button type="submit" className="se-popover-submit">
              확인
            </button>
          </form>,
        )}
        {renderPopover(
          'table',
          'se-table-popover',
          <>
            <div className="se-table-grid" onMouseLeave={() => setTableSize({ rows: 3, columns: 3 })}>
              {Array.from({ length: 64 }, (_, index) => {
                const row = Math.floor(index / 8) + 1
                const column = (index % 8) + 1
                return (
                  <button
                    type="button"
                    key={index}
                    className={row <= tableSize.rows && column <= tableSize.columns ? 'is-active' : ''}
                    onMouseEnter={() => setTableSize({ rows: row, columns: column })}
                    onFocus={() => setTableSize({ rows: row, columns: column })}
                    onClick={() => insertTable(row, column)}
                    aria-label={`${row}행 ${column}열 표`}
                  />
                )
              })}
            </div>
            <p className="se-popover-help">
              {tableSize.rows} × {tableSize.columns}
            </p>
          </>,
        )}
        {renderPopover(
          'textStyle',
          'se-list-popover',
          <>
            <button type="button" className={!format.heading ? 'is-active' : ''} onClick={() => { setMenu(null); runBlockCommand('formatBlock', '<p>') }}>
              본문
            </button>
            <button
              type="button"
              className={`se-option-heading${format.heading ? ' is-active' : ''}`}
              onClick={() => {
                setMenu(null)
                runBlockCommand('formatBlock', '<h3>')
              }}
            >
              소제목
            </button>
          </>,
        )}
        {renderPopover(
          'font',
          'se-list-popover',
          COMPANY_POST_FONTS.map((font) => (
            <button
              type="button"
              key={font.label}
              className={format.fontLabel === font.label ? 'is-active' : ''}
              style={font.family ? { fontFamily: font.family } : undefined}
              onClick={() => {
                setMenu(null)
                runCommand('fontName', font.family || 'inherit')
              }}
            >
              {font.label}
            </button>
          )),
        )}
        {renderPopover(
          'fontSize',
          'se-list-popover se-size-popover',
          FONT_SIZES.map((size) => (
            <button
              type="button"
              key={size}
              className={format.fontSize === size ? 'is-active' : ''}
              onClick={() => {
                setMenu(null)
                applyInlineStyle('font-size', size === DEFAULT_FONT_SIZE ? '' : `${size}px`)
              }}
            >
              {size}
            </button>
          )),
        )}
        {renderPopover('color', 'se-color-popover', renderColorPalette('foreColor'))}
        {renderPopover('background', 'se-color-popover', renderColorPalette('hiliteColor'))}
        {renderPopover(
          'align',
          'se-icon-popover',
          (
            [
              ['justifyLeft', 'left', 'alignLeft', '왼쪽 정렬'],
              ['justifyCenter', 'center', 'alignCenter', '가운데 정렬'],
              ['justifyRight', 'right', 'alignRight', '오른쪽 정렬'],
              ['justifyFull', 'justify', 'alignJustify', '양쪽 정렬'],
            ] as const
          ).map(([command, value, icon, label]) => (
            <button
              type="button"
              key={command}
              className={format.align === value ? 'is-active' : ''}
              onClick={() => {
                setMenu(null)
                runBlockCommand(command)
              }}
              aria-label={label}
              title={label}
            >
              <Icon name={icon} />
            </button>
          )),
        )}
        {renderPopover(
          'lineHeight',
          'se-list-popover',
          <>
            <button type="button" onClick={() => applyLineHeight('')}>
              기본
            </button>
            {LINE_HEIGHTS.map((value) => (
              <button type="button" key={value} onClick={() => applyLineHeight(value)}>
                {value}
              </button>
            ))}
          </>,
        )}
        {renderPopover(
          'letterSpacing',
          'se-list-popover',
          <>
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                applyInlineStyle('letter-spacing', '')
              }}
            >
              기본
            </button>
            {LETTER_SPACINGS.map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setMenu(null)
                  applyInlineStyle('letter-spacing', value)
                }}
              >
                {value.replace('px', '')}
              </button>
            ))}
          </>,
        )}
        {renderPopover(
          'list',
          'se-icon-popover',
          <>
            <button
              type="button"
              className={format.unorderedList ? 'is-active' : ''}
              onClick={() => {
                setMenu(null)
                runBlockCommand('insertUnorderedList')
              }}
              aria-label="글머리 기호"
              title="글머리 기호"
            >
              <Icon name="listBullet" />
            </button>
            <button
              type="button"
              className={format.orderedList ? 'is-active' : ''}
              onClick={() => {
                setMenu(null)
                runBlockCommand('insertOrderedList')
              }}
              aria-label="번호 매기기"
              title="번호 매기기"
            >
              <Icon name="listNumber" />
            </button>
          </>,
        )}
        {renderPopover(
          'special',
          'se-special-popover',
          SPECIAL_CHARACTERS.map((character) => (
            <button type="button" key={character} onClick={() => runCommand('insertText', character)}>
              {character}
            </button>
          )),
        )}
        {renderPopover(
          'inlineLink',
          'se-form-popover se-inline-link-popover',
          <form onSubmit={handleInlineLinkSubmit}>
            <label>
              <span className="visually-hidden">링크 URL</span>
              <input
                type="text"
                value={inlineLinkUrl}
                onChange={(event) => setInlineLinkUrl(event.target.value)}
                placeholder="URL을 입력하세요."
                maxLength={1000}
                autoFocus
              />
            </label>
            <div className="se-popover-row">
              {format.inLink ? (
                <button
                  type="button"
                  className="se-popover-secondary"
                  onClick={() => {
                    setMenu(null)
                    runCommand('unlink')
                  }}
                >
                  링크 삭제
                </button>
              ) : null}
              <button type="submit" className="se-popover-submit">
                확인
              </button>
            </div>
          </form>,
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoInput} />

      <div className="se-scroll">
        <div className="se-document">
          <div className="se-title-area">
            <textarea
              ref={titleRef}
              className="se-title-input"
              rows={1}
              value={title}
              onChange={(event) => setTitle(event.target.value.replace(/[\r\n]+/g, ' '))}
              onKeyDown={handleTitleKeyDown}
              onFocus={() => {
                setTitleFocused(true)
                setSelectedComponent(null)
              }}
              onBlur={() => setTitleFocused(false)}
              maxLength={limits.name}
              placeholder="제목"
              aria-label="제목(업체명)"
            />
            <p className="se-title-hint">
              제목에는 업체명을 입력하세요. 공개 페이지에는 <strong>{publicTitle || '○○ 피해 관련 확인 사항'}</strong>
              으로 표시됩니다.
            </p>
          </div>
          <div className="se-canvas-wrap">
            {canvasEmpty && !composing ? (
              <p className="se-canvas-placeholder" aria-hidden="true">
                피해 사례와 대응 방법을 기록해보세요!
              </p>
            ) : null}
            <div
              ref={canvasRef}
              className="se-content se-canvas"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              role="textbox"
              aria-multiline="true"
              aria-label="본문"
              onInput={handleCanvasInput}
              onKeyDown={handleCanvasKeyDown}
              onMouseDown={handleCanvasMouseDown}
              onClick={handleCanvasClick}
              onPaste={handlePaste}
              onCopy={(event) => handleCopy(event, false)}
              onCut={(event) => handleCopy(event, true)}
              onDrop={handleDrop}
              onDragStart={() => {
                draggingFromCanvasRef.current = true
              }}
              onDragEnd={() => {
                draggingFromCanvasRef.current = false
              }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={handleCompositionEnd}
            />
            {renderComponentToolbar()}
          </div>
        </div>
      </div>

      {toast ? (
        <div className="se-toast" role="status">
          {toast}
        </div>
      ) : null}
      {renderDialog()}
    </div>
  )
}
