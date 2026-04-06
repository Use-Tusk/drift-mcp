#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch

BUMP_TYPE="${1:-patch}"
DEFAULT_BRANCH="main"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { printf '%b\n' "${GREEN}[INFO]${NC} $1"; }
warn() { printf '%b\n' "${YELLOW}[WARN]${NC} $1"; }
error() { printf '%b\n' "${RED}[ERROR]${NC} $1"; exit 1; }

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  error "Invalid bump type: $BUMP_TYPE. Use 'patch', 'minor', or 'major'."
fi

for cmd in git node npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    error "$cmd is required."
  fi
done

GH_AVAILABLE=true
if ! command -v gh >/dev/null 2>&1; then
  warn "GitHub CLI (gh) is not installed. You can create the GitHub release manually."
  GH_AVAILABLE=false
elif ! gh auth status >/dev/null 2>&1; then
  warn "GitHub CLI is not authenticated. You can create the GitHub release manually."
  GH_AVAILABLE=false
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  error "Not in a git repository."
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ]]; then
  error "Must be on $DEFAULT_BRANCH branch. Current: $CURRENT_BRANCH"
fi

if ! git diff --quiet || ! git diff --staged --quiet; then
  error "Tracked files have uncommitted changes. Commit or stash them first."
fi

UNTRACKED=$(git ls-files --others --exclude-standard)
if [[ -n "$UNTRACKED" ]]; then
  warn "Untracked files present (continuing anyway):"
  echo "$UNTRACKED" | sed -n '1,5p'
fi

info "Fetching latest changes and tags..."
git fetch origin "$DEFAULT_BRANCH" --tags

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse "origin/$DEFAULT_BRANCH")
if [[ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]]; then
  error "Local branch is not up to date with origin/$DEFAULT_BRANCH. Run 'git pull' first."
fi

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [[ -n "$LAST_TAG" ]]; then
  COMMITS_SINCE_TAG=$(git rev-list "$LAST_TAG"..HEAD --count)
  if [[ "$COMMITS_SINCE_TAG" -eq 0 ]]; then
    error "No commits since last tag ($LAST_TAG). Nothing to release."
  fi
  info "Commits since $LAST_TAG: $COMMITS_SINCE_TAG"
else
  info "No previous tags found; this appears to be the first release."
fi

info "Running preflight checks..."
npm run typecheck
npm run build
npm pack --dry-run >/dev/null

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
if [[ -z "$MAJOR" || -z "$MINOR" || -z "$PATCH" ]]; then
  error "Failed to parse semantic version: $CURRENT_VERSION"
fi

case "$BUMP_TYPE" in
  patch)
    PATCH=$((PATCH + 1))
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
NEW_TAG="v${NEW_VERSION}"

if git rev-parse "$NEW_TAG" >/dev/null 2>&1; then
  error "Tag $NEW_TAG already exists."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Ready to release: $NEW_VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will:"
echo "  1. Bump package version ($CURRENT_VERSION -> $NEW_VERSION)"
echo "  2. Commit the version bump and create tag $NEW_TAG"
echo "  3. Rebuild the package with the new version embedded"
echo "  4. Verify the publish artifact with npm pack --dry-run"
echo "  5. Push the commit and tag to origin"
if [[ "$GH_AVAILABLE" == "true" ]]; then
  echo "  6. Create a GitHub release (triggers the npm publish workflow)"
else
  echo "  6. Skip GitHub release creation here (gh unavailable)"
  echo "     You must create the GitHub release manually to trigger the npm publish workflow"
fi
echo ""

read -r -p "Proceed? [y/N] " REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  info "Aborted."
  exit 0
fi

info "Bumping $BUMP_TYPE version..."
npm version "$BUMP_TYPE" -m "bump to v%s"

info "Rebuilding package with updated version..."
npm run build

info "Verifying publish artifact..."
npm pack --dry-run

info "Pushing commit and tag..."
git push origin "$DEFAULT_BRANCH"
git push origin "$NEW_TAG"

if [[ "$GH_AVAILABLE" != "true" ]]; then
  info "Tag $NEW_TAG pushed successfully."
  info "Create the GitHub release manually for tag $NEW_TAG to trigger the npm publish workflow."
  exit 0
fi

info "Creating GitHub release..."
if gh release create "$NEW_TAG" --generate-notes --title "$NEW_TAG"; then
  info "Release $NEW_TAG created successfully."
  info "The npm publish workflow should now run from GitHub Actions."
else
  warn "Tag was pushed, but GitHub release creation failed."
  warn "Create the GitHub release manually for tag $NEW_TAG to trigger the npm publish workflow."
fi
