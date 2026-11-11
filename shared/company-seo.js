// Title, description, on-page guide and structured data for a company detail
// page. The server-rendered HTML and the browser app both build from here, so
// what crawlers read before and after JavaScript runs is the same.

import { getCompanyOriginalDescription } from './company-content.js'

export const SEARCH_RESULT_SITE_NAME = '법무법인나란'
export const SEARCH_RESULT_SECTION_NAME = '핀테크전문'
export const LAW_FIRM_NAME = '법무법인 나란'
export const COMPANY_CORRECTION_PHONE_NUMBER = '1551-7203'
const DESCRIPTION_MAX_LENGTH = 155

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const oneLine = (value) => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const clip = (value, maxLength) => {
  if (value.length <= maxLength) return value
  const clipped = value.slice(0, maxLength).trim()
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace >= Math.floor(maxLength * 0.6) ? clipped.slice(0, lastSpace) : clipped).trim()}...`
}

// "라는" after a vowel, "이라는" after a final consonant, both forms otherwise.
const withCopula = (word) => {
  const code = word.charCodeAt(word.length - 1)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? '이라는' : '라는'
  return '(이)라는'
}

const getKeyword = (item) => text(item?.keyword) || text(item?.name).replace(/\s*피해 관련 확인 사항$/, '') || '해당 업체'

// Category-specific advice; the first matching rule wins.
const CATEGORY_RULES = [
  {
    pattern: /코인|가상자산|암호화폐|비트|거래소|토큰|nft|디파이/i,
    label: '코인·가상자산',
    firstStep: '코인 입금 내역(거래소 출금 기록, 지갑 주소, 트랜잭션 해시)을 화면째 저장합니다.',
    question: (keyword) => `${keyword}에서 출금하려면 세금이나 수수료를 먼저 내라고 합니다.`,
    answer: '출금 조건으로 추가 입금을 요구하면 응하지 말고 그 안내 화면과 지갑 주소를 저장해 두세요. 원화로 송금한 계좌가 있다면 그 계좌를 기준으로 지급정지 가능 여부를 먼저 확인합니다.',
  },
  {
    pattern: /리딩|주식|증권|종목|공모주|자산운용|투자/,
    label: '투자·리딩방',
    firstStep: '리딩방 대화방, 수익 인증 화면, 투자 앱 주소와 입금 계좌를 캡처합니다.',
    question: (keyword) => `${keyword} 투자 앱에 수익이 보이는데 출금이 안 됩니다.`,
    answer: '앱 화면의 수익은 실제 계좌 잔고와 다를 수 있습니다. 앱 주소, 입금 계좌, 담당자 대화 기록을 정리해 두시면 지급정지와 반환 청구 순서를 함께 검토합니다.',
  },
  {
    pattern: /로맨스|만남|채팅|연애|데이트/,
    label: '로맨스 스캠',
    firstStep: '상대 프로필, 메신저 아이디, 대화 기록과 송금 요청 메시지를 저장합니다.',
    question: (keyword) => `${keyword} 관련 상대를 실제로 만난 적이 없습니다. 대응이 가능할까요?`,
    answer: '만난 적이 없어도 송금 내역과 대화 기록이 있으면 검토할 수 있습니다. 상대가 쓰던 계정과 송금 계좌를 시간순으로 정리해 주세요.',
  },
  {
    pattern: /부업|알바|팀미션|미션|쇼핑|구매대행|리뷰/,
    label: '부업·팀미션',
    firstStep: '부업 사이트의 미션·정산 대기 화면과 입금을 요구한 메시지를 저장합니다.',
    question: (keyword) => `${keyword}에서 정산을 받으려면 미션 금액을 더 넣으라고 합니다.`,
    answer: '정산 조건으로 입금을 더 요구한다면 응하지 말고 그 안내 화면을 저장해 두세요. 지금까지 보낸 계좌를 기준으로 대응 순서를 함께 정리합니다.',
  },
  {
    pattern: /대출|캐피탈|저축은행|은행|보험|카드/,
    label: '금융기관 사칭',
    firstStep: '대출·금융 상담 연락처, 받은 문자와 서류, 송금을 요구한 계좌를 저장합니다.',
    question: (keyword) => `${keyword}에서 대출 실행 전에 보증금이나 수수료를 요구했습니다.`,
    answer: '정상적인 금융회사는 대출 전에 개인 계좌로 돈을 보내라고 하지 않습니다. 송금했다면 그 계좌의 지급정지 가능 여부를 먼저 확인해야 합니다.',
  },
]

const DEFAULT_RULE = {
  label: '금융사기',
  firstStep: '송금 내역과 상대와의 대화 기록, 안내받은 사이트 주소를 날짜가 보이게 캡처합니다.',
  question: (keyword) => `${keyword}에 보낸 돈을 돌려받을 수 있나요?`,
  answer: '상대 계좌에 자금이 남아 있거나 추적 가능한 재산이 있으면 지급정지·가압류·민사 청구로 반환을 검토할 수 있습니다. 가능 여부는 자료에 따라 달라지므로 송금 내역부터 정리해 주세요.',
}

const getCategoryRule = (service) => CATEGORY_RULES.find((rule) => rule.pattern.test(service)) ?? DEFAULT_RULE

export const getCompanySeoTitle = (item) =>
  `${getKeyword(item)} 사기 피해 확인 — 지급정지·피해금 반환 절차 | ${LAW_FIRM_NAME}`

export const getCompanySeoDescription = (item) => {
  const keyword = getKeyword(item)
  const service = text(item?.service)
  const lead = `${keyword}${service ? ` 관련 ${service}` : ''} 피해가 의심된다면 지급정지·고소·피해금 반환 청구 순서와 보관할 자료를 ${LAW_FIRM_NAME}이 안내합니다.`
  const original = oneLine(getCompanyOriginalDescription(item))
  return clip(original ? `${lead} ${original}` : lead, DESCRIPTION_MAX_LENGTH)
}

export const getCompanySeoKeywords = (item) => {
  const keyword = getKeyword(item)
  const service = text(item?.service)
  return Array.from(new Set([
    keyword,
    `${keyword} 사기`,
    `${keyword} 사기 피해`,
    `${keyword} 피해 회복`,
    `${keyword} 환불`,
    `${keyword} 출금`,
    service,
    getCategoryRule(service).label,
    '사기 피해 대응',
    '피해금 반환',
    LAW_FIRM_NAME,
  ].filter(Boolean))).join(', ')
}

export const getCompanyDisclaimer = (item) => {
  const keyword = getKeyword(item)
  return `※ 이 게시물은 "${keyword}" 명칭과 관련해 피해 상담·온라인 언급이 확인된 사례를 안내하는 글이며, 사기 사실이 확정되었다는 뜻이 아닙니다. 같은 이름을 쓰는 정식 업체·기관·인물을 사기 주체로 지칭하지 않으며, 해당 업체 역시 명칭을 도용당한 피해자일 수 있습니다. 정정·삭제 요청은 ${COMPANY_CORRECTION_PHONE_NUMBER}으로 연락 주세요.`
}

// Visible guide shown under every public post; the FAQ is also sent as FAQPage data.
export const getCompanyGuide = (item) => {
  const keyword = getKeyword(item)
  const rule = getCategoryRule(text(item?.service))

  return {
    checklistTitle: `${keyword} 피해가 의심될 때 먼저 할 일`,
    checklist: [
      `${keyword} 측의 추가 입금 요구에는 응하지 말고, 대화방과 앱을 지우지 않습니다.`,
      rule.firstStep,
      '송금 직후라면 송금한 은행에 바로 지급정지를 요청하고, 받는 계좌가 여러 개라면 계좌마다 정리합니다.',
      '언제, 어떤 계좌로, 얼마를 보냈는지 시간순으로 적어 두면 고소와 반환 청구 준비가 빨라집니다.',
    ],
    faqTitle: `${keyword} 관련 자주 묻는 질문`,
    faq: [
      {
        question: `${keyword}${withCopula(keyword)} 이름을 쓰는 곳이 모두 사기라는 뜻인가요?`,
        answer: `아닙니다. 이 글은 ${keyword} 명칭과 관련된 피해 상담에 대비한 안내이며, 같은 이름의 정식 업체를 사기 주체로 지칭하지 않습니다. 명칭이 도용된 경우일 수 있습니다.`,
      },
      { question: rule.question(keyword), answer: rule.answer },
      {
        question: '경찰에 신고하면 돈이 돌아오나요?',
        answer: '형사 절차의 목적은 처벌입니다. 보낸 돈을 돌려받으려면 지급정지·보전 조치·민사 청구·강제집행을 별도로 검토해야 하며, 어느 단계가 가능한지는 자료에 따라 다릅니다.',
      },
      {
        question: '피해 금액이 작아도 상담할 수 있나요?',
        answer: '네. 상대가 쓰던 아이디·연락처·계좌 중 하나라도 남아 있다면 확인할 부분이 있습니다. 피해 금액과 예상 비용을 비교해 진행할 실익이 있는지부터 안내합니다.',
      },
    ],
    disclaimer: getCompanyDisclaimer(item),
  }
}

const breadcrumb = ({ siteUrl, canonicalUrl, item }) => ({
  '@type': 'BreadcrumbList',
  '@id': `${canonicalUrl}#breadcrumb`,
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: SEARCH_RESULT_SITE_NAME, item: `${siteUrl}/` },
    { '@type': 'ListItem', position: 2, name: SEARCH_RESULT_SECTION_NAME, item: `${siteUrl}/companies` },
    { '@type': 'ListItem', position: 3, name: text(item?.name) || getKeyword(item), item: canonicalUrl },
  ],
})

// item: resolved company content (name, keyword, service, description, isPublic,
// datePublished?, dateModified?).
export const buildCompanyCaseStructuredData = ({ siteUrl, canonicalUrl, imageUrl, item }) => {
  const title = getCompanySeoTitle(item)
  const description = getCompanySeoDescription(item)
  const keyword = getKeyword(item)
  const disclaimer = getCompanyDisclaimer(item)
  const datePublished = text(item?.datePublished)
  const dateModified = text(item?.dateModified)
  const isPublic = item?.isPublic !== false
  const graph = [
    {
      '@type': 'Article',
      '@id': `${canonicalUrl}#article`,
      headline: text(item?.name) || keyword,
      name: title,
      description,
      url: canonicalUrl,
      inLanguage: 'ko-KR',
      ...(imageUrl ? { image: imageUrl } : {}),
      articleSection: text(item?.service),
      keywords: getCompanySeoKeywords(item),
      ...(datePublished ? { datePublished } : {}),
      ...(dateModified ? { dateModified } : {}),
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
      author: { '@type': 'Organization', name: LAW_FIRM_NAME, url: siteUrl },
      publisher: { '@type': 'Organization', '@id': `${siteUrl}/#legalservice`, name: LAW_FIRM_NAME, url: siteUrl },
      about: [
        { '@type': 'Thing', name: `${keyword} 사기 피해` },
        text(item?.service),
        '사기 피해 대응',
        '피해회복 상담',
      ].filter(Boolean),
      disambiguatingDescription: disclaimer,
      isPartOf: { '@id': `${siteUrl}/#website` },
      breadcrumb: { '@id': `${canonicalUrl}#breadcrumb` },
    },
    breadcrumb({ siteUrl, canonicalUrl, item }),
  ]

  if (isPublic) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${canonicalUrl}#faq`,
      inLanguage: 'ko-KR',
      isPartOf: { '@id': `${canonicalUrl}#article` },
      mainEntity: getCompanyGuide(item).faq.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    })
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
