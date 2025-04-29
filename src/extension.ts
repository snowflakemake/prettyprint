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
const md = MarkdownIt({
  html: false,
});
md.use(katex);
md.use(prism, { plugins: ["line-numbers"] });

export function activate(context: vscode.ExtensionContext) {
  let command = vscode.commands.registerCommand(
    "extension.prettyPrint",
    async (resource: vscode.Uri) => {
      // Get settings from the vscode workspace
      const config = vscode.workspace.getConfiguration("prettyprintcode");
      const ignorePatterns = config.get<string[]>("ignore") || [];
      const fontSize = config.get<number>("fontSize") || 16;

      // Check if the user has selected a folder
      let folderUri: vscode.Uri | undefined = resource;
      
      if (!folderUri) {
        // Let the user select a folder
        const selectedFolder  = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Folder for Processing",
        });
        if (selectedFolder && selectedFolder[0]) {
          folderUri = selectedFolder[0];
        }
      }

      const folderPath = folderUri?.fsPath || '';
      vscode.window.showInformationMessage(
        `Processing files in: ${folderPath}`
      );

      // Normalize the folder path to ensure consistency
      const normalizedFolderPath = path.normalize(folderPath);
      const printFolderPath = path.resolve(normalizedFolderPath, "print");

      // Get all code files recursively
      const codeFiles = getAllCodeFiles(folderPath, ignorePatterns);
      let mdFiles = getAllMarkdownFiles(folderPath, ignorePatterns);

      if (codeFiles.length === 0 && mdFiles.length === 0) {
        vscode.window.showWarningMessage("No code or markdown files found.");
        return;
      }

      if (codeFiles.length === 0) {
        vscode.window.showWarningMessage("No code files found.");
      } else {
        vscode.window.showInformationMessage(
          `Found ${codeFiles.length} code files. Converting to Markdown`
        );
      }

      // Create "print" directory if it does not exist
      if (!fs.existsSync(printFolderPath)) {
        fs.mkdirSync(printFolderPath);
      }

      // Copy existing .md files to the print directory
      mdFiles = mdFiles.map((file) => {
        try {
          let mdFile = fs.readFileSync(file, "utf-8");
          const newPath = path.resolve(
            printFolderPath,
            path.basename(path.dirname(file)).replaceAll('.','-') + "_" + path.basename(file)
          );
          let content =
            `\n**${
              path.basename(path.dirname(file)) + path.sep + path.basename(file)
            }**\n` + mdFile;
          fs.writeFileSync(newPath, content);
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
          const markdownFileName =
            path.basename(file, path.extname(file)) + ".md";
          const markdownFilePath = path.resolve(
            printFolderPath,
            path.basename(path.dirname(file)).replaceAll('.','-') + "_" + path.basename(file, path.extname(file)) + ".md"
          );
          console.log(`Writing markdown file: ${markdownFilePath}`);
          fs.writeFileSync(markdownFilePath, markdownContent);
          if (!mdFiles.includes(markdownFilePath)) {
            mdFiles.push(markdownFilePath);
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to convert ${file} to Markdown.`
          );
        }
      }

      const prismjsComponentsPath = getPrismjsComponentsPath(mdFiles);
      // Convert each Markdown file to HTML
      // Initialize the HTML template with basic styles and structure
      let combinedHtmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-16">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Markdown Files</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/${prismjs_version}/themes/prism.min.css">
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
          margin-right: 10px; /* Space between numbers and code */
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
      </style>
    </head>
    <body>
    `;

      // Process each markdown file
      mdFiles.sort((a, b) => {
        const aName = path.basename(a).toLowerCase();
        const bName = path.basename(b).toLowerCase();
      
        const isAReadme = aName.includes('readme');
        const isBReadme = bName.includes('readme');
      
        if (isAReadme && !isBReadme) {return -1;};
        if (!isAReadme && isBReadme) {return 1;};
        return 0;
      });

      for (const file of mdFiles) {
        try {
          // Read the markdown content
          const markdownContent = fs.readFileSync(file, "utf-8");

          // Convert the markdown content to HTML using markdown-it
          const htmlContent = md.render(markdownContent);

          // Add a page-break before each new file content (except the first one)
          combinedHtmlContent += htmlContent;
          combinedHtmlContent += `<div class="page-break"></div>`;
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to process ${file}: ${error}`);
        }
      }

      // Close the HTML structure
      combinedHtmlContent += `</body></html>`;
      combinedHtmlContent =
        addManualLineNumbersToCodeBlocks(combinedHtmlContent);

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

      context.subscriptions.push(command);

      // Clear the print folder after processing
      cleanPrintFolder(printFolderPath);
    }
  );
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
    } else if (file.endsWith(".md")) {
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
    } else if (file === "combined_output.html"  || file.endsWith(".md")) {
      return; // Skip the combined output file and markdown files
    } else {
      results.push(fullPath); // Only add code files
    }
  });

  return results;
}

// Helper: Convert code file content to markdown with code block and line numbers
function convertCodeToMarkdown(filePath: string) {
  const codeContent = fs.readFileSync(filePath, "utf-8");
  const language = path.extname(filePath).slice(1); // e.g., "js", "ts", "cpp"

  return `\n**${
    path.basename(path.dirname(filePath)) + path.sep + path.basename(filePath)
  }**\n\`\`\`${language}\n${escapeHTML(codeContent)}\n\`\`\``;
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