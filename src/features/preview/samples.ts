/** Made-up repository paths for the simulated path picker. Nothing here exists in any AEM instance. */
export function samplePaths(rootPath: string): string[] {
  const root = rootPath || '/content'
  if (root.startsWith('/content/dam')) return [`${root}/sample-site/hero.jpg`, `${root}/sample-site/team.png`, `${root}/sample-site/logo.svg`]
  if (root.startsWith('/content/cq:tags')) return [`${root}/marketing/campaign`, `${root}/marketing/product`, `${root}/topic/news`]
  return [`${root}/sample-site/en`, `${root}/sample-site/en/about`, `${root}/sample-site/en/contact`]
}
