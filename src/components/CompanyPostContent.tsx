import { useEffect, useMemo } from 'react'
import { fillCompanyPostImageAlt, getCompanyPostFontHrefs, sanitizeCompanyPostHtml } from '../../shared/company-post.js'
import { loadCompanyPostFonts } from './companyPostFonts'
import './company-post-content.css'

// imageAltTitle names images that were saved without a description, matching the server page.
type Props = { html: string; className?: string; imageAltTitle?: string }

export function CompanyPostContent({ html, className, imageAltTitle }: Props) {
  const safeHtml = useMemo(
    () => fillCompanyPostImageAlt(sanitizeCompanyPostHtml(html), imageAltTitle),
    [html, imageAltTitle],
  )

  useEffect(() => {
    loadCompanyPostFonts(getCompanyPostFontHrefs(safeHtml))
  }, [safeHtml])

  return (
    <div className={className ? `se-content ${className}` : 'se-content'} dangerouslySetInnerHTML={{ __html: safeHtml }} />
  )
}
