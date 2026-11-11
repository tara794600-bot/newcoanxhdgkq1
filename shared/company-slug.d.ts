export type CompanySlugRecord = { id: string; name?: unknown; createdAt?: unknown }
export type CompanySlugIndex = {
  slugById: Map<string, string>
  idBySlug: Map<string, string>
  slugByLowerKey: Map<string, string>
}
export const COMPANIES_PATH: '/companies'
export function toCompanySlug(name: unknown): string
export function buildCompanySlugIndex(records: CompanySlugRecord[]): CompanySlugIndex
export function getCompanySlug(index: CompanySlugIndex | null | undefined, id: string): string
export function resolveCompanySlug(
  index: CompanySlugIndex | null | undefined,
  key: string,
): { id: string; slug: string; redirect: boolean } | null
export function getCompanyNameCandidates(key: string): string[]
export function getCompanyCasePath(slugOrId: string): string
