// Font stylesheets are only requested once a post (or the editor) needs them,
// so public pages that use the default font load nothing extra.
export const loadCompanyPostFonts = (hrefs: string[]) => {
  hrefs.forEach((href) => {
    if (document.head.querySelector(`link[data-company-post-font="${href}"]`)) {
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.companyPostFont = href
    document.head.append(link)
  })
}
