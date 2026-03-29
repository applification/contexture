import { posthog } from './posthog'
import { getVisitorId } from './visitor-id'

export const analytics = {
  heroCTAClick() {
    posthog.capture('hero_cta_click', { platform: 'web' })
  },

  downloadClick(os: string) {
    posthog.capture('download_click', { os, platform: 'web', visitor_id: getVisitorId() })
  },

  pricingPageView() {
    posthog.capture('pricing_page_view', { platform: 'web' })
  },

  githubClick() {
    posthog.capture('github_click', { platform: 'web' })
  },

  featuresSectionView() {
    posthog.capture('features_section_view', { platform: 'web' })
  },
}
