# Pretty Print VS Code Extension

This is a Visual Studio Code extension that helps users process code and Markdown files in a selected folder by converting them into a printable format. The extension:

1. **Converts code files to Markdown**: Any supported code file (See Supported Languages) in the selected folder is converted to a Markdown file with syntax highlighting and line numbers.
2. **Converts Markdown files to HTML**: Markdown files are then converted to HTML, combining them into one file.
3. **Prepares a Printable HTML**: It generates an HTML file that can be printed directly, with styled code blocks, line numbers, and integrated with the Katex library for rendering LaTeX.

## Features

[Change log](CHANGELOG.md)

- **Supports multiple programming languages**: See Supported Languages for more information
- **Line Numbers in Code**: Code blocks are automatically numbered for better readability when printed.
- **LaTeX Support**: Uses Katex to render LaTeX expressions in Markdown.
- **Print-Friendly HTML**: Converts Markdown to HTML with an automatic print trigger, allowing users to print the document directly from their browser.
- **Ignore files that you don't want to print**: (`Ctrl+Shift+P`) and type `Preferences: Open User Settings`. Search for `prettyprintcode.ignore` and add your patterns to ignore.

## Installation

Install the extension from Visual Studio Marketplace: [Pretty Print - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ViktorLinden.prettyprintcode)

## Usage

1. **Activate the Extension**: Open the Command Palette (`Ctrl+Shift+P`) and type `Pretty Print`. Choose the `Pretty Print` command to activate it.
2. **Select Folder**: You'll be prompted to select a folder containing code and Markdown files. The extension will process all code and Markdown files in the folder, including sub directories.

3. **Markdown Conversion**: The extension will convert code files to Markdown and place them in a new folder named `print` inside the selected folder.

4. **Generate HTML**: After converting the files to Markdown, the extension combines them into a single HTML file, which is saved in the same `print` folder.

5. **Open & Print**: The HTML file will automatically open in your default web browser, where you can print the document.

## Key Functions

- **convertCodeToMarkdown**: Converts code files to Markdown with syntax highlighting and formatted code blocks.
- **getAllCodeFiles**: Recursively retrieves all code files (with extensions like `.js`, `.ts`, `.cpp`, etc.) in a selected directory.
- **getAllMarkdownFiles**: Recursively retrieves all Markdown files (`.md`) in the selected directory.
- **addManualLineNumbersToCodeBlocks**: Adds line numbers to code blocks in the HTML output to improve readability.
- **Pretty Print HTML Output**: Combines converted Markdown content into an HTML file ready for printing.

## Supported Languages

The extension supports the following languages for code syntax highlighting:

- JavaScript (`.js`, `.jsx`)
- TypeScript (`.ts`, `.tsx`)
- Python (`.py`)
- C++ (`.cpp`)
- Java (`.java`)
- Go (`.go`)
- C (`.c`)
- Rust (`.rs`)
- Shell scripts (`.sh`)
- JSON files (`.json`)

## Dependencies

This extension uses the following libraries:

- **`markdown-it`**: A markdown parser that renders Markdown content into HTML.
- **`markdown-it-katex`**: A plugin for rendering LaTeX expressions in Markdown.
- **`markdown-it-prism`**: A plugin for syntax highlighting in Markdown using Prism.
- **`cheerio`**: A library for manipulating HTML.
- **`open`**: Opens the generated HTML file in the default web browser.

## Contribution

Contributions are welcome! Feel free to submit issues, pull requests, or suggestions to improve the extension.
