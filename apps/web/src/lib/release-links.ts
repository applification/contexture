const BARE_URL_PATTERN = /^https?:\/\/\S+$/;

export function getReleaseLinkLabel(href: string | undefined, visibleText: string): string {
  const trimmedText = visibleText.trim();
  if (!href || trimmedText !== href || !BARE_URL_PATTERN.test(trimmedText)) {
    return visibleText;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return visibleText;
  }

  if (url.hostname === 'github.com') {
    const pathParts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const [owner, repo, section, id, tag] = pathParts;
    const isContextureRepo = owner === 'applification' && repo === 'contexture';

    if (isContextureRepo && section === 'pull' && id) {
      return `Pull request #${id}`;
    }

    if (isContextureRepo && section === 'issues' && id) {
      return `Issue #${id}`;
    }

    if (isContextureRepo && section === 'compare') {
      return 'Compare changes';
    }

    if (isContextureRepo && section === 'releases' && id === 'tag' && tag) {
      return `Release ${tag}`;
    }

    if (isContextureRepo && section === 'commit' && id) {
      return `Commit ${id.slice(0, 7)}`;
    }

    if (isContextureRepo && !section) {
      return 'Contexture on GitHub';
    }
  }

  return url.hostname.replace(/^www\./, '');
}
