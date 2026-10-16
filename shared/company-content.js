const text = (value) => typeof value === 'string' ? value.trim() : ''

// Keep the Korean site's existing public copy and the stored original separate,
// so editing a post never saves its generated title or introduction twice.
export const resolveCompanyContent = (data) => {
  const name = text(data.name)
  const service = text(data.service)
  const description = text(data.description)
  return {
    ...data,
    name: name ? `${name} 피해 관련 확인 사항` : '',
    description: description
      ? `${name || '해당 업체'} 피해 관련 확인 사항${service ? `\n유형: ${service}` : ''}\n\n${description}`
      : '',
  }
}

export const matchesCompanySearch = (data, query) => {
  const search = text(query).toLocaleLowerCase('ko-KR')
  if (!search) return true
  const item = resolveCompanyContent(data)
  return [item.name, text(item.service), item.description]
    .some((value) => value.toLocaleLowerCase('ko-KR').includes(search))
}
