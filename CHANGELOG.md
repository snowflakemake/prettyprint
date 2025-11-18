# Change Log

## Unreleased

- No unreleased changes.

## v0.2.1 - 2025-11-18

### Added

- Added Obsidian-style embedded image support; `![[imagename.extension]]` references are resolved from the `./attachment` subdirectory located alongside the Markdown file.
- Added the `prettyprintcode.codeThemePreset` quick-pick setting (plus the optional `prettyprintcode.codeThemeCustomUrl` override) so users can either choose from curated Prism themes or supply their own CSS.
- Added the `prettyprintcode.showLineNumbers` toggle so code block numbering can be turned on or off per user preference.

## v0.2.0 - 2025-10-08

### Added

- Allow running Pretty Print on either a single file or an entire folder from the explorer or command palette
- Added configurable header and footer templates with placeholder support so the generated pages can display custom metadata
- Added the `prettyprintcode.headerFooterStyles` setting for injecting custom CSS that targets the header/footer templates

### Changed

- Default header template now mirrors the previous filename banner while remaining overrideable through settings
- Explorer context menu command is now available for both files and folders

## v0.1.0 - 2025-04-30

### Added

- Added support for all languages supported by [PrismJS Supported Languages](https://prismjs.com/#supported-languages)
- Added an icon
- Added context menu entry on folders

### Fixed

- Better html escaping in code blocks

## v0.0.3 - 2025-04-22

- Added support for jsx/tsx files. As issued by @jamesritzman [#1](https://github.com/snowflakemake/prettyprint/issues/1)
- Added setting for setting font-size: As issued by @jamesritzman [#2](https://github.com/snowflakemake/prettyprint/issues/2)
- Fixed problem where settings didn't update until restart

## v0.0.2 - 2025-04-05

- Fixed a bug where the line numbers didn't align properly when long lines were wrapped.
- Added settings for ignoring certain files / folders. You can find these settings under `prettyprintcode.ignore` in your VSCode settings.
- Removed unessesary page-break at the top of the file.

## v0.0.1 - 2025-04-03

- Initial release

[README.md](./README.md)
