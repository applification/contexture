import { posthog } from './posthog'

export const analytics = {
  heroCTAClick() {
    posthog.capture('hero_cta_click')
  },

  downloadClick(os: string) {
    posthog.capture('download_click', { os })
  },

  pricingPageView() {
    posthog.capture('pricing_page_view')
  },

  githubClick() {
    posthog.capture('github_click')
  },

  featuresSectionView() {
    posthog.capture('features_section_view')
  },
}
