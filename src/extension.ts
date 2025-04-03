import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import MarkdownIt from "markdown-it";
import * as cheerio from "cheerio";
import katex from "markdown-it-katex";
import prism from "markdown-it-prism";

const md = MarkdownIt();
md.use(katex);
md.use(prism, { plugins: ["line-numbers"] });

export function activate(context: vscode.ExtensionContext) {
  let command = vscode.commands.registerCommand(
    "extension.prettyPrint",
    async () => {
      // Step 1: Let the user select a folder
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Folder for Processing",
      });

      if (!folderUri || folderUri.length === 0) {
        vscode.window.showErrorMessage("No folder selected.");
        return;
      }

      const folderPath = folderUri[0].fsPath;
      vscode.window.showInformationMessage(
        `Processing files in: ${folderPath}`
      );

      // Normalize the folder path to ensure consistency
      const normalizedFolderPath = path.normalize(folderPath);
      const printFolderPath = path.resolve(normalizedFolderPath, "print");

      // Step 2: Get all code files recursively
      const codeFiles = getAllCodeFiles(folderPath);
      const mdFiles = getAllMarkdownFiles(folderPath);

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

      // Step 3: Convert each code file to markdown
      for (const file of codeFiles) {
        try {
          let markdownContent = convertCodeToMarkdown(file);
          markdownContent = addLineBreaksToLongLines(markdownContent);
          const markdownFileName =
            path.basename(file, path.extname(file)) + ".md";
          const markdownFilePath = path.resolve(
            printFolderPath,
            markdownFileName
          );
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

      // Step 4: Convert each Markdown file to HTML
      // Step 2: Initialize the HTML template with basic styles and structure
      let combinedHtmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Markdown Files</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markdown.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-c.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-cpp.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-java.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-go.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-rust.min.js"></script>

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
          font-size: 16px;
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

      // Step 3: Process each markdown file
      for (const file of mdFiles) {
        try {
          // Read the markdown content
          const markdownContent = fs.readFileSync(file, "utf-8");

          // Convert the markdown content to HTML using markdown-it
          const htmlContent = md.render(markdownContent);

          // Add a page-break before each new file content (except the first one)
          combinedHtmlContent += `<div class="page-break"></div>`;
          combinedHtmlContent += htmlContent;
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to process ${file}: ${error}`);
        }
      }

      // Step 4: Close the HTML structure
      combinedHtmlContent += `</body></html>`;
      combinedHtmlContent =
        addManualLineNumbersToCodeBlocks(combinedHtmlContent);

      const outputPath = path.resolve(printFolderPath, "combined_output.html");

      // Step 5: Write the combined HTML to the output file
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

      // Step 6: Open the combined HTML file in the default web browser
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
    }
  );
}
export function deactivate() {}

// Helper function: Get all .md files recursively
function getAllMarkdownFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.resolve(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getAllMarkdownFiles(fullPath));
    } else if (file.endsWith(".md")) {
      results.push(fullPath);
    }
  });

  return results;
}

// Helper: Get all code files (non-Markdown)
function getAllCodeFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getAllCodeFiles(fullPath)); // Recurse into subdirectories
    } else if (isCodeFile(file)) {
      results.push(fullPath); // Only add code files
    }
  });

  return results;
}

// Helper: Check if a file is a source code file (not markdown)
function isCodeFile(file: string): boolean {
  const codeExtensions = [
    ".js",
    ".ts",
    ".cpp",
    ".py",
    ".java",
    ".go",
    ".c",
    ".sh",
    ".rs",
  ];
  return codeExtensions.includes(path.extname(file));
}

// Helper: Convert code file content to markdown with code block and line numbers
function convertCodeToMarkdown(filePath: string) {
  const codeContent = fs.readFileSync(filePath, "utf-8");
  const language = path.extname(filePath).slice(1); // e.g., "js", "ts", "cpp"

  return `\n**${
    path.basename(path.dirname(filePath)) + path.sep + path.basename(filePath)
  }**\n\`\`\`${language}\n${codeContent}\n\`\`\``;
}

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
