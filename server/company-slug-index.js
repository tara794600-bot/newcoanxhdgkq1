import { buildCompanySlugIndex } from '../shared/company-slug.js'

// Every keyword URL is resolved through one index of all posts' names. Only the
// name and createdAt fields are read, and the result is kept per server
// instance for a few minutes. A request for an unknown keyword rebuilds it
// sooner, so a post opened right after it is written is still found.
const INDEX_TTL_MS = 5 * 60 * 1000
const MISS_REFRESH_AFTER_MS = 15 * 1000

let cached = null
let pending = null

export const toCompanySlugRecord = (snapshot) => {
  const data = snapshot.data() ?? {}
  return { id: snapshot.id, name: data.name, createdAt: data.createdAt }
}

// Pages that already read the whole collection hand their result over here.
export const rememberCompanySlugIndex = (snapshots) => {
  const index = buildCompanySlugIndex(snapshots.map(toCompanySlugRecord))
  cached = { index, builtAt: Date.now() }
  return index
}

const loadIndex = async (collectionRef) => {
  const snapshot = await collectionRef.select('name', 'createdAt').get()
  return rememberCompanySlugIndex(snapshot.docs)
}

export const getCompanySlugIndex = async (collectionRef, { refreshIfOlderThanMs = INDEX_TTL_MS } = {}) => {
  if (cached && Date.now() - cached.builtAt < refreshIfOlderThanMs) {
    return cached.index
  }

  if (!pending) {
    pending = loadIndex(collectionRef).finally(() => {
      pending = null
    })
  }

  return pending
}

export const refreshCompanySlugIndexAfterMiss = (collectionRef) =>
  getCompanySlugIndex(collectionRef, { refreshIfOlderThanMs: MISS_REFRESH_AFTER_MS })

export const clearCompanySlugIndex = () => {
  cached = null
  pending = null
}
