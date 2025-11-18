import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import MarkdownIt from "markdown-it";
import * as cheerio from "cheerio";
import katex from "markdown-it-katex";
import prism from "markdown-it-prism";
import * as minimatch from "minimatch";
import { PrismAliasResolver } from "./prism-alias-resolver";
import { get } from "http";

const prismjs_version = "1.30.0";

interface PrettyPrintMarkdownEnv {
  prettyPrintBaseDir?: string;
}

function createMarkdownRenderer(
  enableLineNumbers: boolean
): MarkdownIt {
  const md = MarkdownIt({
    html: false,
  });
  md.use(katex);
  if (enableLineNumbers) {
    md.use(prism, { plugins: ["line-numbers"] });
  } else {
    md.use(prism);
  }

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const baseDir =
      (env as PrettyPrintMarkdownEnv | undefined)?.prettyPrintBaseDir;
    if (baseDir) {
      const token = tokens[idx];
      const src = token.attrGet("src");
      const inlinedSrc = convertImageSourceToDataUri(src, baseDir);
      if (inlinedSrc) {
        token.attrSet("src", inlinedSrc);
      }
    }

    return self.renderToken(tokens, idx, options);
  };

  return md;
}

export function activate(context: vscode.ExtensionContext) {
  const prettyPrint = async (resource?: vscode.Uri) => {
      // Get settings from the vscode workspace
      const config = vscode.workspace.getConfiguration("prettyprintcode");
      const ignorePatterns = config.get<string[]>("ignore") || [];
      const fontSize = config.get<number>("fontSize") || 16;
      const headerTemplate =
        config.get<string>("documentHeader") ??
        "<p><strong>{{displayPath}}</strong></p>";
      const footerTemplate = config.get<string>("documentFooter") ?? "";
      const headerFooterStyles =
        config.get<string>("headerFooterStyles") ?? "";
      const codeThemePreset =
        config.get<string>("codeThemePreset") ??
        config.get<string>("codeTheme") ??
        "prism";
      const customCodeThemeUrl =
        config.get<string>("codeThemeCustomUrl")?.trim() || undefined;
      const prismThemeStylesheet = getPrismThemeStylesheet(
        codeThemePreset,
        customCodeThemeUrl
      );
      const showLineNumbers =
        config.get<boolean>("showLineNumbers") ?? true;
      const md = createMarkdownRenderer(showLineNumbers);
      const lineNumberStyles = showLineNumbers
        ? `
        .line-numbers-container {
          display: flex;
          align-items: flex-start;
          margin: -10px 0px -30px 0px;
        }

        /* Line number styles */
        .line-numbers-rows {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          margin-right: 10px;
          font-family: monospace;
          color: #999;
          user-select: none;
          margin-right: 1em;
          white-space: nowrap;
          border-right: #bbb 1px solid;
        }

        /* Each line number */
        .line-number {
          display: block;
          padding-right: 0.8em;
          text-align: right;
        }
        `
        : "";
      const headerTemplateHasContent = headerTemplate.trim().length > 0;
      const footerTemplateHasContent = footerTemplate.trim().length > 0;

      // Determine if the command was invoked from the explorer or command palette
      let targetUri: vscode.Uri | undefined = resource;

      if (!targetUri) {
        // Let the user select a file or folder
        const pickedEntries = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select File or Folder for Processing",
        });

        if (!pickedEntries || pickedEntries.length === 0) {
          vscode.window.showErrorMessage("No file or folder selected.");
          return;
        }

        targetUri = pickedEntries[0];
      }

      if (!targetUri) {
        vscode.window.showErrorMessage("No file or folder selected.");
        return;
      }

      const selectedPath = targetUri.fsPath;
      const selectionStats = fs.existsSync(selectedPath)
        ? fs.statSync(selectedPath)
        : undefined;

      if (!selectionStats) {
        vscode.window.showErrorMessage(
          "Unable to access the selected file or folder."
        );
        return;
      }

      const normalizedSelectedPath = path.normalize(selectedPath);
      const targetRoot = selectionStats.isDirectory()
        ? normalizedSelectedPath
        : path.dirname(normalizedSelectedPath);

      vscode.window.showInformationMessage(`Processing: ${selectedPath}`);

      // Normalize the folder path to ensure consistency
      const printFolderPath = path.resolve(targetRoot, "print");

      let codeFiles: string[] = [];
      let markdownFiles: string[] = [];
      const markdownSourceDirectories = new Map<string, string>();

      if (selectionStats.isDirectory()) {
        // Get all files recursively when a folder is selected
        codeFiles = getAllCodeFiles(selectedPath, ignorePatterns);
        markdownFiles = getAllMarkdownFiles(selectedPath, ignorePatterns);
      } else {
        // Respect ignore patterns for single file selections
        if (isIgnored(selectedPath, ignorePatterns)) {
          vscode.window.showWarningMessage(
            "Selected file is ignored by the current settings."
          );
          return;
        }

        if (isMarkdownFile(selectedPath)) {
          markdownFiles = [selectedPath];
        } else if (path.basename(selectedPath) === "combined_output.html") {
          vscode.window.showWarningMessage(
            "The generated combined_output.html file cannot be reprinted directly."
          );
          return;
        } else {
          codeFiles = [selectedPath];
        }
      }

      if (codeFiles.length === 0 && markdownFiles.length === 0) {
        vscode.window.showWarningMessage("No code or markdown files found.");
        return;
      }

      if (codeFiles.length === 0 && selectionStats.isDirectory()) {
        vscode.window.showWarningMessage("No code files found.");
      } else if (codeFiles.length > 0) {
        vscode.window.showInformationMessage(
          `Found ${codeFiles.length} code files. Converting to Markdown`
        );
      }

      // Create "print" directory if it does not exist
      if (!fs.existsSync(printFolderPath)) {
        fs.mkdirSync(printFolderPath);
      }

      // Copy existing .md files to the print directory
      markdownFiles = markdownFiles.map((file) => {
        try {
          let mdFile = fs.readFileSync(file, "utf-8");
          const newPath = path.resolve(
            printFolderPath,
            getPrintFileName(file, path.extname(file))
          );
          fs.writeFileSync(newPath, mdFile);
          markdownSourceDirectories.set(newPath, path.dirname(file));
          return newPath;
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to copy ${file} into printing direcotry.`
          );
          return file;
        }
      });

      // Convert each code file to markdown
      for (const file of codeFiles) {
        try {
          let markdownContent = convertCodeToMarkdown(file);
          markdownContent = addLineBreaksToLongLines(
            markdownContent,
            400 / (fontSize / 2)
          );
          const markdownFilePath = path.resolve(
            printFolderPath,
            getPrintFileName(file, ".md")
          );
          fs.writeFileSync(markdownFilePath, markdownContent);
          markdownSourceDirectories.set(markdownFilePath, path.dirname(file));
          if (!markdownFiles.includes(markdownFilePath)) {
            markdownFiles.push(markdownFilePath);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to convert ${file} to Markdown.`
          );
        }
      }

      const prismjsComponentsPath = getPrismjsComponentsPath(markdownFiles);
      // Convert each Markdown file to HTML
      // Initialize the HTML template with basic styles and structure
      let combinedHtmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-16">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Markdown Files</title>
      <link rel="stylesheet" href="${prismThemeStylesheet}">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/${prismjs_version}/prism.min.js"></script>
      ${prismjsComponentsScriptTags(prismjsComponentsPath)}

      <script>
        // Ensure Prism is activated after the page load
        document.addEventListener("DOMContentLoaded", function() {
      Prism.highlightAll(); // This triggers the highlighting for all code blocks
        window.onload = function() {
          window.print(); // Automatically triggers the print dialog
        }
        });
      </script>
      <style>
        body {
          font-size: ${fontSize || 16}px;
          font-family: Helvetica, sans-serif;
          line-height: 1.6;
          max-width: 100%;
          overflow-x: hidden;
        }
        .page-break {
          page-break-before: always;
          break-before: page;
        }
        .katex-html {
          display: none;
        }
        pre[class*="language-" ],
        :not(pre)>code[class*=language-],
        code[class*="language-"] {
            white-space: pre-wrap;
            overflow: auto;
            word-break: break-word;
        }
        ${lineNumberStyles}
        ${headerFooterStyles}
      </style>
    </head>
    <body>
    `;

      // Process each markdown file
      markdownFiles.sort((a, b) => {
        const aName = path.basename(a).toLowerCase();
        const bName = path.basename(b).toLowerCase();
      
        const isAReadme = aName.includes('readme');
        const isBReadme = bName.includes('readme');
      
        if (isAReadme && !isBReadme) {return -1;};
        if (!isAReadme && isBReadme) {return 1;};
        return 0;
      });

      for (const file of markdownFiles) {
        try {
          // Read the markdown content
          const markdownContent = fs.readFileSync(file, "utf-8");
          const markdownDir =
            markdownSourceDirectories.get(file) ?? path.dirname(file);
          const normalizedMarkdown = replaceObsidianImageLinks(
            markdownContent,
            markdownDir
          );

          // Convert the markdown content to HTML using markdown-it
          const renderEnv: PrettyPrintMarkdownEnv = {
            prettyPrintBaseDir: markdownDir,
          };
          let htmlContent = md.render(normalizedMarkdown, renderEnv);

          const templateContext = buildTemplateContext(file, targetRoot);
          if (headerTemplateHasContent) {
            const resolvedHeader = renderTemplate(
              headerTemplate,
              templateContext
            );
            if (resolvedHeader.trim().length > 0) {
              htmlContent = `${resolvedHeader}\n${htmlContent}`;
            }
          }

          if (footerTemplateHasContent) {
            const resolvedFooter = renderTemplate(
              footerTemplate,
              templateContext
            );
            if (resolvedFooter.trim().length > 0) {
              htmlContent = `${htmlContent}\n${resolvedFooter}`;
            }
          }

          // Add a page-break before each new file content (except the first one)
          combinedHtmlContent += htmlContent;
          combinedHtmlContent += `<div class="page-break"></div>`;
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to process ${file}: ${error}`);
        }
      }

      // Close the HTML structure
      combinedHtmlContent += `
    </body></html>`;
      if (showLineNumbers) {
        combinedHtmlContent =
          addManualLineNumbersToCodeBlocks(combinedHtmlContent);
      }

      const outputPath = path.resolve(printFolderPath, "combined_output.html");

      // Write the combined HTML to the output file
      try {
        fs.writeFileSync(outputPath, combinedHtmlContent);
        vscode.window.showInformationMessage(
          `Combined HTML written to: ${outputPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to write combined HTML: ${error}`
        );
      }

      // Open the combined HTML file in the default web browser
      try {
        const open = await import("open");
        open.default(outputPath, { wait: false });
        vscode.window.showInformationMessage(
          `Opening combined HTML in browser: ${outputPath}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open combined HTML in browser: ${error}`
        );
      }

      // Clear the print folder after processing
      cleanPrintFolder(printFolderPath);
    };

  const commandIds = ["extension.prettyPrint", "extensions.prettyPrint"];
  for (const commandId of commandIds) {
    const disposable = vscode.commands.registerCommand(commandId, prettyPrint);
    context.subscriptions.push(disposable);
  }
}
export function deactivate() {}

// Helper: check if a file or folder should be ignored
function isIgnored(fullPath: string, ignorePatterns: string[]): boolean {
  const normalizedPath = fullPath.replace(/\\/g, "/"); // <-- Normalize the path for Windows
  return ignorePatterns.some((pattern) =>
    minimatch.minimatch(normalizedPath, pattern, { matchBase: true })
  );
}

// Helper function: Get all .md files recursively
function getAllMarkdownFiles(dir: string, ignorePatterns: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.resolve(dir, file);
    if (isIgnored(fullPath, ignorePatterns)) {
      return;
    }

    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory() && path.basename(fullPath) !== "print") {
      results = results.concat(getAllMarkdownFiles(fullPath, ignorePatterns));
    } else if (isMarkdownFile(fullPath)) {
      results.push(fullPath);
    }
  });

  return results;
}

// Helper: Get all code files (non-Markdown)
function getAllCodeFiles(dir: string, ignorePatterns: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.resolve(dir, file);
    const stat = fs.statSync(fullPath);
    if (isIgnored(fullPath, ignorePatterns)) {
      return;
    }

    if (stat && stat.isDirectory()) {
      results = results.concat(getAllCodeFiles(fullPath, ignorePatterns)); // Recurse into subdirectories
    } else if (
      file === "combined_output.html" ||
      isMarkdownFile(fullPath)
    ) {
      return; // Skip the combined output file and markdown files
    } else {
      results.push(fullPath); // Only add code files
    }
  });

  return results;
}

function buildTemplateContext(
  filePath: string,
  rootPath: string
): Record<string, string> {
  const fileName = path.basename(filePath);
  const parentDirectory = path.basename(path.dirname(filePath));
  const relativePathRaw = path.relative(rootPath, filePath) || fileName;
  const normalizedRelativePath =
    relativePathRaw === "" ? fileName : relativePathRaw.replace(/\\/g, "/");
  const displayPath = getDisplayPath(filePath);

  return {
    fileName: escapeHTML(fileName),
    filePath: escapeHTML(filePath),
    parentDirectory: escapeHTML(parentDirectory),
    relativePath: escapeHTML(normalizedRelativePath),
    displayPath: escapeHTML(displayPath),
    rawFileName: fileName,
    rawFilePath: filePath,
    rawParentDirectory: parentDirectory,
    rawRelativePath: normalizedRelativePath,
    rawDisplayPath: displayPath,
  };
}

function getDisplayPath(filePath: string): string {
  return (
    path.basename(path.dirname(filePath)) +
    path.sep +
    path.basename(filePath)
  );
}

function renderTemplate(
  template: string,
  context: Record<string, string>
): string {
  return template.replace(/{{\s*([\w]+)\s*}}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key];
    }
    return "";
  });
}

// Helper: Check if a file is a markdown file
function isMarkdownFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".md";
}

// Helper: Generate a predictable filename inside the print directory
function getPrintFileName(filePath: string, targetExtension: string): string {
  const parent = path.basename(path.dirname(filePath)).replaceAll(".", "-");
  const baseName =
    path.basename(filePath, path.extname(filePath)) + targetExtension;

  return parent ? `${parent}_${baseName}` : baseName;
}

// Helper: Convert code file content to markdown with code block and line numbers
function convertCodeToMarkdown(filePath: string) {
  const codeContent = fs.readFileSync(filePath, "utf-8");
  const language = path.extname(filePath).slice(1); // e.g., "js", "ts", "cpp"

  const safeLanguage = language || "plaintext";

  return `\n\`\`\`${safeLanguage}\n${escapeHTML(codeContent)}\n\`\`\``;
}

// Helper: Add line-numbers to all the codeblocks
function addManualLineNumbersToCodeBlocks(html: string): string {
  // Load the HTML content into cheerio
  const $ = cheerio.load(html);

  // Select all <pre> elements that have a class starting with "language-"
  $("pre[class*='language-']").each((index, element) => {
    // Get the code inside the <pre> element
    const code = $(element).text();

    // Split the code into lines
    const lines = code.split("\n");

    // Create the line number container (to be positioned next to the code)
    const lineNumbersHtml = lines
      .map((_, i) => {
        return `<span class="line-number">${i + 1}</span>`; // Each <span> will represent a line number
      })
      .join("\n");

    // Create the HTML structure for line numbers and code, adding a wrapper for the code itself
    const lineNumberedCode = `
      <div class="line-numbers-container">
        <div class="line-numbers-rows">${lineNumbersHtml}</div>
        <code>${lines.join("\n")}</code>
      </div>
    `;

    // Set the new HTML inside the <pre> element, adding the 'line-numbers' class
    $(element).addClass("line-numbers").html(lineNumberedCode);
  });

  // Return the modified HTML as a string
  return $.html();
}

// Helper: Add line breaks to long lines in code blocks. This to ensure the line numbering is aligned
function addLineBreaksToLongLines(
  codeContent: string,
  maxLineLength = 65
): string {
  // Split code into lines
  const lines = codeContent.split("\n");

  // Iterate through each line and check if it exceeds the max length
  const processedLines = lines.map((line) => {
    if (line.length > maxLineLength) {
      const chunks = [];
      let i = 0;

      // Loop until the whole line is processed
      while (i < line.length) {
        // Check the last whitespace within the maxLineLength range
        let splitPoint = line.lastIndexOf(" ", i + maxLineLength);

        // If no whitespace is found, split at maxLineLength
        if (splitPoint === -1 || splitPoint <= i) {
          splitPoint = i + maxLineLength;
        }

        // Push the chunk into the array
        chunks.push(line.slice(i, splitPoint).trim());

        // Update i to the new split point
        i = splitPoint;

        // Stop if the remaining portion is smaller than the maxLineLength
        if (line.length - i <= maxLineLength) {
          chunks.push(line.slice(i).trim());
          break;
        }
      }

      // Join the chunks with line breaks and return
      return chunks.join("\n");
    }
    return line;
  });

  // Join the processed lines back into a single string
  return processedLines.join("\n");
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPrismjsComponentsPath(mdFiles: Array<string>): Array<string> {
  const prismjsComponentsPath = `https://cdnjs.cloudflare.com/ajax/libs/prism/${prismjs_version}/components/`;
  const resolver = new PrismAliasResolver();

  let componentPaths: Array<string> = [];

  getAllLanguages(mdFiles).forEach((lang: string) => {
    const resolvedLang = resolver.resolveLanguage(lang);
    if (resolvedLang) {
      const componentPath = prismjsComponentsPath.concat(`prism-${resolvedLang}.min.js`);
      console.log(`Adding component path: ${componentPath}`);
      componentPaths.push(componentPath);
    }
  });
  return componentPaths;
}

function getAllLanguages(mdFiles: Array<string>): Set<string> {
  const CODE_BLOCK_REGEX = /```([a-zA-Z0-9_-]+)?[\s\S]*?```/g;
  const codeBlockLangs = new Set<string>();

  for (const file of mdFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const matches = content.match(CODE_BLOCK_REGEX);
    if (matches) {
      for (const match of matches) {
        const langMatch = match.match(/```([a-zA-Z0-9_-]+)/);
        if (langMatch && langMatch[1]) {
          codeBlockLangs.add(langMatch[1]);
        }
      }
    }
  }
  return codeBlockLangs;
}

function prismjsComponentsScriptTags(prismjsComponentsPath: Array<string>): string {
  return prismjsComponentsPath
    .map((componentPath) => {
      return `<script src="${componentPath}"></script>`;
    })
    .join("\n");
}

function replaceObsidianImageLinks(
  markdownContent: string,
  markdownDir: string
): string {
  const OBSIDIAN_IMAGE_REGEX = /!\[\[([^[\]]+)\]\]/g;

  return markdownContent.replace(OBSIDIAN_IMAGE_REGEX, (match, inner) => {
    const [target] = inner.split("|");
    const trimmedTarget = target?.trim();

    if (!trimmedTarget) {
      return match;
    }

    if (!getImageMimeType(trimmedTarget)) {
      return match;
    }

    const resolvedPath = resolveObsidianImagePath(trimmedTarget, markdownDir);
    if (!resolvedPath) {
      return match;
    }

    const altText = path.basename(trimmedTarget);
    const normalizedPath = resolvedPath.replace(/\\/g, "/");
    return `![${altText}](<${normalizedPath}>)`;
  });
}

function resolveObsidianImagePath(
  requestedPath: string,
  markdownDir: string
): string | undefined {
  const normalizedRequestedPath = requestedPath.replace(/\\/g, "/");
  const candidatePaths: string[] = [];

  if (path.isAbsolute(normalizedRequestedPath)) {
    candidatePaths.push(normalizedRequestedPath);
  } else {
    candidatePaths.push(path.resolve(markdownDir, normalizedRequestedPath));
    candidatePaths.push(
      path.resolve(markdownDir, "attachments", normalizedRequestedPath)
    );
  }

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return undefined;
}

function convertImageSourceToDataUri(
  src: string | null,
  baseDir: string
): string | undefined {
  if (!src) {
    return undefined;
  }

  let cleanedSource = src.trim();
  if (!cleanedSource) {
    return undefined;
  }

  if (cleanedSource.startsWith("data:") || /^[a-z]+:\/\//i.test(cleanedSource)) {
    return undefined; // Already inline or remote resource
  }

  if (cleanedSource.startsWith("<") && cleanedSource.endsWith(">")) {
    cleanedSource = cleanedSource.slice(1, -1);
  }

  const sanitizedSource = cleanedSource.replace(/[?#].*$/, "");
  let resolvedPath = sanitizedSource;

  if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.resolve(baseDir, resolvedPath);
  }

  if (!fs.existsSync(resolvedPath)) {
    return undefined;
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return undefined;
  }

  const mimeType = getImageMimeType(resolvedPath);
  if (!mimeType) {
    return undefined;
  }

  try {
    const buffer = fs.readFileSync(resolvedPath);
    const base64 = buffer.toString("base64");
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Failed to inline image at ${resolvedPath}:`, error);
    return undefined;
  }
}

function getImageMimeType(filePath: string): string | undefined {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".apng": "image/apng",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
  };

  return mimeTypes[extension];
}

function getPrismThemeStylesheet(
  themePreset?: string,
  customThemeUrl?: string
): string {
  const defaultTheme = `https://cdnjs.cloudflare.com/ajax/libs/prism/${prismjs_version}/themes/prism.min.css`;

  if (customThemeUrl) {
    const trimmedCustom = customThemeUrl.trim();
    if (/^https?:\/\//i.test(trimmedCustom)) {
      return trimmedCustom;
    }
  }

  if (!themePreset) {
    return defaultTheme;
  }

  const trimmed = themePreset.trim();
  if (!trimmed) {
    return defaultTheme;
  }

  const sanitized = trimmed.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!sanitized) {
    return defaultTheme;
  }

  return `https://cdnjs.cloudflare.com/ajax/libs/prism/${prismjs_version}/themes/${sanitized}.min.css`;
}

function cleanPrintFolder(printFolderPath: string) {
  if (!fs.existsSync(printFolderPath)) {return;};

  const files = fs.readdirSync(printFolderPath);

  for (const file of files) {
    if (file !== 'combined_output.html') {
      const filePath = path.join(printFolderPath, file);
      const stat = fs.statSync(filePath);

      try {
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
        console.log(`Deleted: ${filePath}`);
      } catch (error) {
        console.error(`Failed to delete ${filePath}:`, error);
      }
    }
  }
}
