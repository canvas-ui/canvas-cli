# Canvas CLI Release Guide

This document explains how to create and manage releases for Canvas CLI.

## Release Strategy

We use **GitHub Actions** for automated builds and releases, triggered by Git tags. This ensures consistent, reproducible builds across all platforms.

### Release Types

- **Stable releases**: `v1.0.0`, `v1.2.3` - Full releases
- **Pre-releases**: `v1.0.0-alpha.1`, `v1.2.0-beta.2` - Automatically marked as pre-release
- **Development builds**: Built on every push to `main`/`develop` (available as artifacts)

## Creating a Release

### 1. Prepare for Release

```bash
# Ensure you're on main branch and up to date
git checkout main
git pull origin main

# Run tests and build locally
npm run lint
npm run build:dev
./dist/canvas-dev --version

# Update version in package.json if needed
npm version patch  # or minor, major
```

### 2. Create and Push Tag

```bash
# Create a new tag (this triggers the release workflow)
git tag v1.0.0

# Push the tag to GitHub
git push origin v1.0.0
```

### 3. Automated Release Process

Once you push a tag, GitHub Actions will automatically:

1. ✅ **Extract version** from the tag
2. ✅ **Update version** in source code
3. ✅ **Build binaries** for all platforms:
    - Linux x64 & ARM64
    - macOS x64 & ARM64 (Apple Silicon)
    - Windows x64
4. ✅ **Test binaries** to ensure they work
5. ✅ **Create archives** (.tar.gz for Unix, .zip for Windows)
6. ✅ **Generate checksums** for verification
7. ✅ **Create GitHub Release** with:
    - Professional release notes
    - Download links for all platforms
    - Installation instructions
    - Checksum verification

### 4. Post-Release

After the automated release:

1. **Verify the release** on GitHub
2. **Test downloads** on different platforms
3. **Update documentation** if needed
4. **Announce the release** (social media, Discord, etc.)

## Manual Release (Emergency/Testing)

If you need to create a release manually:

```bash
# Build all platforms
npm run build:all

# Create release directory
mkdir -p release-assets

# Copy and rename binaries
cp dist/canvas-linux release-assets/canvas-linux-x64
cp dist/canvas-linux-arm release-assets/canvas-linux-arm64
cp dist/canvas-macos release-assets/canvas-macos-x64
cp dist/canvas-macos-arm release-assets/canvas-macos-arm64
cp dist/canvas-windows.exe release-assets/canvas-windows-x64.exe

# Create archives
cd release-assets
tar -czf canvas-1.0.0-linux-x64.tar.gz canvas-linux-x64
tar -czf canvas-1.0.0-linux-arm64.tar.gz canvas-linux-arm64
tar -czf canvas-1.0.0-macos-x64.tar.gz canvas-macos-x64
tar -czf canvas-1.0.0-macos-arm64.tar.gz canvas-macos-arm64
zip canvas-1.0.0-windows-x64.zip canvas-windows-x64.exe

# Generate checksums
sha256sum *.tar.gz *.zip > checksums.txt

# Upload to GitHub manually via web interface
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., `v1.2.3`)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Pre-release Versions

- **Alpha**: `v1.0.0-alpha.1` - Early testing
- **Beta**: `v1.0.0-beta.1` - Feature complete, testing
- **RC**: `v1.0.0-rc.1` - Release candidate

## Release Checklist

Before creating a release:

- [ ] All tests pass locally
- [ ] Version number updated in `package.json`
- [ ] CHANGELOG updated (if maintained)
- [ ] Documentation updated
- [ ] No critical issues in GitHub Issues
- [ ] Main branch is stable

After release:

- [ ] GitHub release created successfully
- [ ] All binary downloads work
- [ ] Binaries are executable and functional
- [ ] Checksums verify correctly
- [ ] Release notes are accurate

## Hotfix Releases

For critical bug fixes:

1. Create a hotfix branch from the release tag
2. Apply the minimal fix
3. Test thoroughly
4. Create a new patch version tag
5. The automation will handle the rest

```bash
git checkout v1.0.0
git checkout -b hotfix/v1.0.1
# Make fixes
git commit -m "Fix critical bug"
git tag v1.0.1
git push origin v1.0.1
```

## Rollback Strategy

If a release has critical issues:

1. **Immediate**: Mark the GitHub release as "Pre-release" to reduce visibility
2. **Short-term**: Create a new hotfix release
3. **Long-term**: Delete the problematic release if necessary

```bash
# Delete a tag locally and remotely (use carefully!)
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
```

## Monitoring Releases

- **GitHub Actions**: Monitor build status at `/actions`
- **Downloads**: Track download stats on the releases page
- **Issues**: Watch for reports of broken binaries
- **Feedback**: Monitor community channels for release feedback

## Security Considerations

- **Code signing**: Future enhancement for macOS/Windows
- **Checksums**: Always verify with provided SHA256 hashes
- **Supply chain**: All builds happen in clean GitHub Actions environments
- **Provenance**: Full build logs available in GitHub Actions

## Future Enhancements

Planned improvements to the release process:

- [ ] **Automated changelog generation**
- [ ] **Code signing** for macOS and Windows binaries
- [ ] **Auto-update mechanism** in the CLI
- [ ] **Release candidates** workflow
- [ ] **Homebrew formula** auto-update
- [ ] **Package manager integrations** (APT, Chocolatey, etc.)
