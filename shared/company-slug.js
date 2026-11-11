// Detail pages live at /companies/<keyword>, where the keyword is the company
// name as typed in the admin (e.g. /companies/더라운지). Slugs are computed from
// the stored name, never saved, so no Firestore field or rule change is needed.
//
// Two posts can share a name. The earliest one (by createdAt, then id) owns the
// plain keyword and later ones get "<keyword>-<document id>", which stays stable
// even if other posts with the same name are deleted.

export const COMPANIES_PATH = '/companies'
const SLUG_MAX_LENGTH = 80

const URL_HOSTILE_CHARACTERS = /[\u0000-\u001f\u007f/\\?#%&=+<>"'`|^{}[\];:,!*@$~()·•ㆍ|.]+/g

export const toCompanySlug = (name) => {
  const slug = String(typeof name === 'string' ? name : '')
    .normalize('NFC')
    .replace(URL_HOSTILE_CHARACTERS, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '')
}

const toTime = (value) => {
  if (value && typeof value.toMillis === 'function') return value.toMillis()
  if (value && typeof value.toDate === 'function') return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim()) {
    const time = new Date(value).getTime()
    if (!Number.isNaN(time)) return time
  }
  // Posts without a date (e.g. a pending server timestamp) sort last.
  return Number.POSITIVE_INFINITY
}

// records: [{ id, name, createdAt }] for every post in companyCases.
export const buildCompanySlugIndex = (records) => {
  const sorted = records
    .filter((record) => record && typeof record.id === 'string' && record.id)
    .map((record) => ({ id: record.id, base: toCompanySlug(record.name), time: toTime(record.createdAt) }))
    .sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const slugById = new Map()
  const idBySlug = new Map()
  const slugByLowerKey = new Map()

  for (const { id, base } of sorted) {
    let slug = base && !idBySlug.has(base) ? base : base ? `${base}-${id}` : id

    if (idBySlug.has(slug)) {
      slug = id
    }

    slugById.set(id, slug)
    idBySlug.set(slug, id)

    if (!slugByLowerKey.has(slug.toLowerCase())) {
      slugByLowerKey.set(slug.toLowerCase(), slug)
    }
  }

  return { slugById, idBySlug, slugByLowerKey }
}

export const getCompanySlug = (index, id) => index?.slugById.get(id) ?? id

// Returns { id, slug, redirect } or null. redirect is true when the request
// used an old document-id URL or a differently written keyword.
export const resolveCompanySlug = (index, key) => {
  const requested = typeof key === 'string' ? key.normalize('NFC').trim() : ''

  if (!index || !requested) {
    return null
  }

  if (index.idBySlug.has(requested)) {
    return { id: index.idBySlug.get(requested), slug: requested, redirect: false }
  }

  if (index.slugById.has(requested)) {
    const slug = index.slugById.get(requested)
    return { id: requested, slug, redirect: slug !== requested }
  }

  const alternative =
    index.slugByLowerKey.get(requested.toLowerCase()) ?? index.slugByLowerKey.get(toCompanySlug(requested))

  if (alternative) {
    return { id: index.idBySlug.get(alternative), slug: alternative, redirect: true }
  }

  return null
}

// Names that could produce this keyword, for a direct `name in [...]` lookup.
export const getCompanyNameCandidates = (key) => {
  const requested = typeof key === 'string' ? key.normalize('NFC').trim() : ''
  return Array.from(new Set([requested, requested.replace(/-/g, ' ')].filter(Boolean)))
}

export const getCompanyCasePath = (slugOrId) => `${COMPANIES_PATH}/${encodeURIComponent(slugOrId)}`
