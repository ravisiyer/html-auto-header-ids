import * as vscode from 'vscode';

const usedIds = new Set<string>();

export function activate(context: vscode.ExtensionContext) {

  // Command 1: Add IDs to headers without one
  let addIdsDisposable = vscode.commands.registerCommand('auto-header-ids.addIds', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const headersToProcess = getHeadersToProcess();
    const document = editor.document;
    const fullText = document.getText();
    usedIds.clear();

    const headerRegex = new RegExp(`<h(${headersToProcess.join('|')})([^>]*)>([\\s\\S]*?)<\\/h\\1>`, 'gi');
    const matches = Array.from(fullText.matchAll(headerRegex));
    if (matches.length === 0) {
      vscode.window.showInformationMessage('No matching headers found to add IDs.');
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
        vscode.window.showInformationMessage('IDs added to headers without one!');
        } else {
        vscode.window.showErrorMessage('Failed to add IDs.');
        }
    });
  });

  // Command 2: Mark all matching headers as no-toc with a confirmation
  let markIdsDisposable = vscode.commands.registerCommand('auto-header-ids.markExistingIds', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    const confirmation = await vscode.window.showInformationMessage(
      'This command will add the class="no-toc" attribute to all selected headers. Do you want to proceed?',
      { modal: true },
      'Proceed'
    );

    if (confirmation !== 'Proceed') {
      return;
    }
    
    const headersToProcess = getHeadersToProcess();
    const document = editor.document;
    const fullText = document.getText();

    const headerRegex = new RegExp(`<h(${headersToProcess.join('|')})([^>]*)>([\\s\\S]*?)<\\/h\\1>`, 'gi');
    const matches = Array.from(fullText.matchAll(headerRegex));
    if (matches.length === 0) {
      vscode.window.showInformationMessage('No matching headers found to mark.');
      return;
    }

    editor.edit(editBuilder => {
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const fullMatch = match[0];
        const tagType = match[1];
        const attributes = match[2];
        const headerText = match[3];

          if (!attributes.includes('class=')) {
            const replacement = `<h${tagType}${attributes} class="no-toc">${headerText}</h${tagType}>`;
            const startOffset = match.index;
            const endOffset = startOffset + fullMatch.length;
            const startPosition = document.positionAt(startOffset);
            const endPosition = document.positionAt(endOffset);
            editBuilder.replace(new vscode.Range(startPosition, endPosition), replacement);
          } else {
            const classRegex = /class="([^"]*)"/i;
            const classMatch = attributes.match(classRegex);
            if (classMatch) {
              const existingClasses = classMatch[1];
              const updatedClasses = existingClasses.includes('no-toc') ? existingClasses : `${existingClasses} no-toc`;
              const replacement = `<h${tagType}${attributes.replace(classRegex, `class="${updatedClasses}"`)}>${headerText}</h${tagType}>`;
              const startOffset = match.index;
              const endOffset = startOffset + fullMatch.length;
              const startPosition = document.positionAt(startOffset);
              const endPosition = document.positionAt(endOffset);
              editBuilder.replace(new vscode.Range(startPosition, endPosition), replacement);
            }
          }
        }
    }).then(success => {
      if (success) {
        vscode.window.showInformationMessage('All selected headers marked with no-toc class!');
      } else {
        vscode.window.showErrorMessage('Failed to mark headers.');
      }
    });
  });

  // Command 3: Create the TOC, skipping unwanted headers
  let tocDisposable = vscode.commands.registerCommand('auto-header-ids.createTOC', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const document = editor.document;
    const fullText = document.getText();
    const headersToProcess = getHeadersToProcess();
    
    const headerRegex = new RegExp(`<h(${headersToProcess.join('|')})([^>]*)id="([^"]*)"([^>]*)>([\\s\\S]*?)<\\/h\\1>`, 'gi');
    const matches = Array.from(fullText.matchAll(headerRegex));
    if (matches.length === 0) {
        vscode.window.showInformationMessage('No header tags with IDs found to create a Table of Contents.');
        return;
    }

    const tocLines: string[] = [];
    let lastLevel = 0;
    
    for (const match of matches) {
      const attributes = match[2] + match[4];
      if (attributes.includes('class="no-toc"')) {
        continue;
      }
        const tagType = match[1];
      const id = match[3];
      const headerText = match[5].replace(/<[^>]*>/g, '').trim();
        const currentLevel = parseInt(tagType);
        
      while (currentLevel < lastLevel) {
        tocLines.push('  '.repeat(lastLevel) + '</ul>');
        lastLevel--;
      }

      while (currentLevel > lastLevel) {
        tocLines.push('  '.repeat(lastLevel) + '<ul>');
        lastLevel++;
        }
        
      tocLines.push('  '.repeat(currentLevel) + `<li><a href="#${id}">${headerText}</a></li>`);
        lastLevel = currentLevel;
    }

    while (lastLevel > 0) {
      tocLines.push('  '.repeat(lastLevel) + '</ul>');
      lastLevel--;
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

  context.subscriptions.push(addIdsDisposable, markIdsDisposable, tocDisposable);
}

function getHeadersToProcess(): string[] {
    const config = vscode.workspace.getConfiguration('auto-header-ids');
    const headers = config.get<string[]>('headersToProcess');
    return Array.isArray(headers) ? headers.filter(h => typeof h === 'string' && h.match(/^[1-6]$/)) : ['1', '2'];
}

function slugify(text: string): string {
  const MAX_LENGTH = 15;
  let decodedText = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  let slug = decodedText.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

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