import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import MarkdownIt from "markdown-it";
import katex from "markdown-it-katex";

const md = MarkdownIt();
md.use(katex);

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
          const markdownContent = convertCodeToMarkdown(file);
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
  <style>
    body {
        font-size: 16px;
        font-family: monospace;
        line-height: 1.6;
    }
    code {
        font-size: 16px;
    }
    pre {
        font-size: 16px;
        border: 1px solidrgba(160, 160, 160, 0.98);
        border-radius: 4px;
        padding: 6px 8px;
        background-color: #f4f4f4;
    }
    .page-break {
        page-break-before: always;
        break-before: page;
    }
    .katex-html{
        display: none;
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
  const codeExtensions = [".js", ".ts", ".cpp", ".py", ".java", ".go", ".c"];
  return codeExtensions.includes(path.extname(file));
}

// Helper: Convert code file content to markdown with code block and line numbers
function convertCodeToMarkdown(filePath: string): string {
  const codeContent = fs.readFileSync(filePath, "utf-8");
  const language = path.extname(filePath).slice(1); // e.g., "js", "ts", "cpp"

  // Extract the full file name with extension to use as the title
  const fileNameWithExtension = path.basename(filePath); // This includes the extension

  // Get the parent directory name
  const parentDirectory = path.basename(path.dirname(filePath)); // e.g., "src", "lib"

  // Create a title for the markdown file (you can customize this title)
  const title = `_${parentDirectory}/${fileNameWithExtension}_\n`;

  // Split the code into lines
  const codeLines = codeContent.split("\n");

  // Calculate the maximum number of digits needed for line numbers
  const maxLineNumberLength = String(codeLines.length).length;

  // Add line numbers to each line with consistent width
  const codeWithLineNumbers = codeLines
    .map((line, index) => {
      const lineNumber = (index + 1)
        .toString()
        .padStart(maxLineNumberLength, " ");
      return `${lineNumber}: ${line}`;
    })
    .join("\n");

  // Wrap the code in a Markdown code block
  return `${title}\n\`\`\`${language}\n${codeWithLineNumbers}\n\`\`\``;
}
