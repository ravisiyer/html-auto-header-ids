import * as vscode from 'vscode';

const usedIds = new Set<string>();

export function activate(context: vscode.ExtensionContext) {

  let idDisposable = vscode.commands.registerCommand('auto-header-ids.addIds', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    // Get the headers to process from the user's settings
    const headersToProcess = getHeadersToProcess();
    if (headersToProcess.length === 0) {
        vscode.window.showInformationMessage('No header tags specified in settings to process.');
        return;
    }

    const document = editor.document;
    const fullText = document.getText();
    usedIds.clear();

    const headerRegex = new RegExp(`<h(${headersToProcess.join('|')})([^>]*)>([\\s\\S]*?)<\\/h\\1>`, 'gi');
    const matches = Array.from(fullText.matchAll(headerRegex));

    if (matches.length === 0) {
      vscode.window.showInformationMessage('No matching header tags found.');
      return;
    }

    editor.edit(editBuilder => {
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const fullMatch = match[0];
            const tagType = match[1];
            const attributes = match[2];
            const headerText = match[3];

            if (attributes.includes('id=')) {
                continue;
            }
            
            // Extract text by removing all HTML tags from the content
            const textContent = headerText.replace(/<[^>]*>/g, '').trim();

            const id = slugify(textContent);
            const replacement = `<h${tagType}${attributes} id="${id}">${headerText}</h${tagType}>`;

            const startOffset = match.index;
            const endOffset = startOffset + fullMatch.length;
            const startPosition = document.positionAt(startOffset);
            const endPosition = document.positionAt(endOffset);

            editBuilder.replace(new vscode.Range(startPosition, endPosition), replacement);
        }
    }).then(success => {
        if (success) {
            vscode.window.showInformationMessage('ID attributes added to specified headers!');
        } else {
            vscode.window.showErrorMessage('Failed to add ID attributes.');
        }
    });
  });

  let tocDisposable = vscode.commands.registerCommand('auto-header-ids.createTOC', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const fullText = document.getText();
    const headersToProcess = getHeadersToProcess();
    
    // Regex to find headers with existing IDs
    const headerRegex = new RegExp(`<h(${headersToProcess.join('|')})[^>]*id="([^"]*)"[^>]*>([\\s\\S]*?)<\\/h\\1>`, 'gi');
    const matches = Array.from(fullText.matchAll(headerRegex));

    if (matches.length === 0) {
        vscode.window.showInformationMessage('No header tags with IDs found to create a Table of Contents.');
        return;
    }

    const tocLines: string[] = ['<ul>'];
    let lastLevel = 0;
    
    // Indentation for list items
    const indentation = '  ';

    for (const match of matches) {
        const tagType = match[1];
        const id = match[2];
        const headerText = match[3].replace(/<[^>]*>/g, '').trim();
        const currentLevel = parseInt(tagType);
        
        // Adjust list nesting
        if (currentLevel > lastLevel) {
            for (let i = 0; i < currentLevel - lastLevel; i++) {
                tocLines.push(indentation.repeat(currentLevel - 1) + '<ul>');
            }
        } else if (currentLevel < lastLevel) {
            for (let i = 0; i < lastLevel - currentLevel; i++) {
                tocLines.push(indentation.repeat(currentLevel - 1) + '</ul>');
            }
        }
        
        tocLines.push(indentation.repeat(currentLevel) + `<li><a href="#${id}">${headerText}</a></li>`);
        lastLevel = currentLevel;
    }

    // Close any open lists
    for (let i = 0; i < lastLevel; i++) {
      tocLines.push(indentation.repeat(i) + '</ul>');
    }

    const tocContent = tocLines.join('\n');

    editor.edit(editBuilder => {
        const currentPosition = editor.selection.active;
        editBuilder.insert(currentPosition, tocContent);
    }).then(success => {
        if (success) {
            vscode.window.showInformationMessage('Table of Contents created successfully!');
        } else {
            vscode.window.showErrorMessage('Failed to create Table of Contents.');
        }
    });
  });

  context.subscriptions.push(idDisposable, tocDisposable);
}

function getHeadersToProcess(): string[] {
    const config = vscode.workspace.getConfiguration('auto-header-ids');
    const headers = config.get<string[]>('headersToProcess');
    // Ensure the returned value is an array of strings, or an empty array if undefined.
    return Array.isArray(headers) ? headers.filter(h => typeof h === 'string' && h.match(/^[1-6]$/)) : ['1', '2'];
}

function slugify(text: string): string {
  const MAX_LENGTH = 15;
  // Decode HTML entities to standard characters before slugifying.
  let decodedText = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  
  let slug = decodedText.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^\w-]+/g, '') // Remove all non-word characters except hyphens
    .replace(/--+/g, '-') // Replace multiple hyphens with a single one
    .replace(/^-+/, '') // Remove leading hyphens
    .replace(/-+$/, ''); // Remove trailing hyphens

  if (slug.length > MAX_LENGTH) {
    slug = slug.substring(0, MAX_LENGTH);
    if (slug.endsWith('-')) {
        slug = slug.slice(0, -1);
    }
  }

  let uniqueSlug = slug;
  let counter = 1;
  while (usedIds.has(uniqueSlug)) {
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }
  usedIds.add(uniqueSlug);
  return uniqueSlug;
}

export function deactivate() {}