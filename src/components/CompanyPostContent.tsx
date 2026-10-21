import { useEffect, useMemo } from 'react'
import { getCompanyPostFontHrefs, sanitizeCompanyPostHtml } from '../../shared/company-post.js'
import { loadCompanyPostFonts } from './companyPostFonts'
import './company-post-content.css'

type Props = { html: string; className?: string }

export function CompanyPostContent({ html, className }: Props) {
  const safeHtml = useMemo(() => sanitizeCompanyPostHtml(html), [html])

  useEffect(() => {
    loadCompanyPostFonts(getCompanyPostFontHrefs(safeHtml))
  }, [safeHtml])

  return (
    <div className={className ? `se-content ${className}` : 'se-content'} dangerouslySetInnerHTML={{ __html: safeHtml }} />
  )
}
