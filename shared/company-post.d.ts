export type CompanyPostFont = { label: string; family: string; href: string }
export const COMPANY_POST_FONTS: ReadonlyArray<CompanyPostFont>
export function sanitizeCompanyPostHtml(html: unknown): string
export function companyPostToPlainText(html: unknown): string
export function summarizeCompanyPostText(text: string, maxLength: number): string
export function getCompanyPostImageUrls(html: unknown): string[]
export function getCompanyPostFontHrefs(html: string): string[]
