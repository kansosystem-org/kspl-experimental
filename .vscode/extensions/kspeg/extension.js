// The entry point of the VS Code extension for KSPEG.
//
// **It cannot be written in anything but JavaScript.** VS Code loads it with `require()` from its
// own Node runtime, and the `vscode` module exists only there.
'use strict';

const vsc = require("vscode");

exports.activate = function (context) {
    const selector = { scheme: 'file', language: "kspeg" };
    
    context.subscriptions.push(
        vsc.languages.registerDocumentSymbolProvider(selector, new DocumentSymbolProvider()),
        vsc.languages.registerDefinitionProvider(selector, new DefinitionProvider()),
    );
}

// The function that masks strings and comments, to prevent false positives
function getMaskedText(text) {
    // A KSPEG string literal holds no newline, so `\r\n` is excluded: a quote in a character class
    // (`[']`, `["]`) cannot turn the rest of the file into one huge masked string.
    const regex = /"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|\/\*[\s\S]*?\*\/|\/\/.*/g;
    return text.replace(regex, m => m.replace(/[^\r\n]/g, ' '));
}

class DocumentSymbolProvider {
    provideDocumentSymbols(document, token) {
        const symbols = [];
        const txt = document.getText();
        const maskedTxt = getMaskedText(txt);
        
        // Following the specification: "Identifier =" counts as a definition
        const re = /^([\t ]*)([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;
        
        let match;
        while ((match = re.exec(maskedTxt)) !== null) {
            const ruleName = match[2];
            const startOffset = match.index + match[1].length; 
            const endOffset = startOffset + ruleName.length;
            
            const range = new vsc.Range(
                document.positionAt(startOffset),
                document.positionAt(endOffset)
            );

            const isUnderScoreOnly = ruleName === '_';
            // Starting with _ -> a Void rule (transparent mode, no AST). `_` on its own is syntax
            // mode, though.
            const isVoid = ruleName.startsWith('_') && !isUnderScoreOnly;
            
            const checkChar = isVoid ? ruleName[1] : ruleName[0];
            const isLexical = /^[A-Z]/.test(checkChar); // upper case is lexical mode, lower case syntax mode
            
            // Assigning the icons: a Void rule is Event, lexical is Class, structural is Function
            const kind = isVoid ? vsc.SymbolKind.Event : (isLexical ? vsc.SymbolKind.Class : vsc.SymbolKind.Function);
            
            let detail = isLexical ? "Lexical (Raw mode)" : "Syntax (Skip mode)";
            if (isVoid) {
                detail = `Void (No AST) / ${detail}`;
            }

            const symbol = new vsc.DocumentSymbol(
                ruleName,
                detail,
                kind,
                range,
                range 
            );
            
            symbols.push(symbol);
        }

        return symbols;
    }
}

class DefinitionProvider {
    provideDefinition(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!wordRange) return;

        const currentWord = document.getText(wordRange);
        const maskedTxt = getMaskedText(document.getText());
        
        // The definition ("RuleName =") from the head of a line, to prevent false positives
        const definitionPattern = new RegExp(`^([\\t ]*)${escapeRegExp(currentWord)}\\s*=`, "m");
        const match = maskedTxt.match(definitionPattern);

        if (match) {
            const prefixLen = match[1].length;
            const targetPos = document.positionAt(match.index + prefixLen);
            
            return new vsc.Location(document.uri, targetPos);
        }
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}