export type CompanySeoItem = {
  name?: string
  keyword?: string
  service?: string
  description?: string
  isPublic?: boolean
  datePublished?: string
  dateModified?: string
}
export type CompanyGuide = {
  checklistTitle: string
  checklist: string[]
  faqTitle: string
  faq: { question: string; answer: string }[]
  disclaimer: string
}
export const SEARCH_RESULT_SITE_NAME: string
export const SEARCH_RESULT_SECTION_NAME: string
export const LAW_FIRM_NAME: string
export const COMPANY_CORRECTION_PHONE_NUMBER: string
export function getCompanySeoTitle(item: CompanySeoItem): string
export function getCompanySeoDescription(item: CompanySeoItem): string
export function getCompanySeoKeywords(item: CompanySeoItem): string
export function getCompanyDisclaimer(item: CompanySeoItem): string
export function getCompanyGuide(item: CompanySeoItem): CompanyGuide
export function buildCompanyCaseStructuredData(input: {
  siteUrl: string
  canonicalUrl: string
  imageUrl?: string
  item: CompanySeoItem
}): Record<string, unknown>
