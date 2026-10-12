// The entry point of the VS Code extension for KSPL.
//
// **It cannot be written in anything but JavaScript.** VS Code loads it with `require()` from its
// own Node runtime, and the `vscode` module exists only there.
'use strict';
const vsc = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");

let lspProcess = null;
let reqId = 1;
let pendingRequests = new Map();
let messageBuffer = Buffer.alloc(0);
let diagnosticCollection = null;
let outputChannel = null;
let didChangeTimeout = null;
let pendingChanges = new Map();
// Every register*/on* return value (Disposable) is pushed here through track(), so a re-entry into
// activate() (deactivate not yet run) disposes of the previous round's providers and listeners at
// once; a new registration only needs wrapping in track().
let activeDisposables = [];

function track(disposable) {
    activeDisposables.push(disposable);
    return disposable;
}

// Hover fires with every mouse move, and answers come back from the child process late; this
// generation counter keeps only the newest request's result valid, so an old answer arriving after
// a new one is not shown on top of it.
let hoverRequestSeq = 0;

// At activate() both onDidOpenTextDocument and visibleTextEditors.forEach can send didOpen for a
// document already open; the URIs sent are recorded so each is sent once.
let openedUris = new Set();

// Whether this is a document to send to the language server.
// **Send the indented notation (.kspls) too.** ksplc fixes the source into the brace notation
// right after reading it, with the line numbers unmoved, so this side treats them as one language;
// this is the one place the notations are split.
const KSPL_LANGS = new Set(['kspl', 'kspls']);

function isKsplDoc(document) {
    return KSPL_LANGS.has(document.languageId);
}

function sendDidOpenOnce(document) {
    if (!isKsplDoc(document)) return;
    const uri = getRelativeUri(document.uri);
    if (openedUris.has(uri)) return;
    openedUris.add(uri);
    sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: document.languageId, version: 1,
            text: document.getText() }
    });
}

function getLogLevel() {
    return vsc.workspace.getConfiguration('kspl').get('trace.server', 'off');
}

function logMessage(msg, level = 'messages') {
    const currentLevel = getLogLevel();
    if (currentLevel === 'off') return;
    if (currentLevel === 'messages' && level === 'verbose') return;
    
    if (outputChannel) {
        outputChannel.appendLine(msg);
    }
}

function logSystem(msg) {
    if (outputChannel) {
        outputChannel.appendLine(msg);
    }
}

function logJsonRpc(prefix, msgObj) {
    const level = getLogLevel();
    if (level === 'off' || !outputChannel) return;
    const method = msgObj.method || (msgObj.id !== undefined ? `Response(id:${msgObj.id})` : 'Unknown');
    if (level === 'messages') {
        let summary = `${prefix} ${method}`;
        if (msgObj.method === "textDocument/publishDiagnostics" && msgObj.params) {
            summary += ` (${msgObj.params.diagnostics.length} issues)`;
        }
        logMessage(summary, 'messages');
        return;
    }
    
    let clone = JSON.parse(JSON.stringify(msgObj));
    if (clone.params && clone.params.textDocument && typeof clone.params.textDocument.text === 'string') {
        clone.params.textDocument.text = "<source code omitted>";
    }
    if (clone.params && clone.params.contentChanges && clone.params.contentChanges[0]) {
        clone.params.contentChanges[0].text = "<source code omitted>";
    }
    logMessage(`${prefix} ${JSON.stringify(clone)}`, 'verbose');
}

function flushPendingChanges() {
    if (didChangeTimeout) {
        clearTimeout(didChangeTimeout);
        didChangeTimeout = null;
    }
    if (pendingChanges.size > 0) {
        for (const [uriStr, doc] of pendingChanges.entries()) {
            sendNotification("textDocument/didChange", {
                textDocument: { uri: getRelativeUri(doc.uri) },
                contentChanges: [{ text: doc.getText() }]
            });
        }
        pendingChanges.clear();
    }
}

function resolveUri(uriStr) {
    let normalizedUri = uriStr.replace(/\\/g, '/');
    if (normalizedUri.startsWith("src/")) {
        normalizedUri = "ksplc/" + normalizedUri.substring(4);
    }
    for (const doc of vsc.workspace.textDocuments) {
        if (getRelativeUri(doc.uri) === uriStr || doc.uri.toString() === uriStr) {
            return doc.uri;
        }
    }
    if (uriStr.startsWith("file://")) {
        return vsc.Uri.parse(uriStr);
    }
    const workspacePath = vsc.workspace.workspaceFolders ? vsc.workspace.workspaceFolders[0].uri.fsPath : "";
    return vsc.Uri.file(path.isAbsolute(uriStr) ? uriStr : path.join(workspacePath, uriStr));
}

function getRelativeUri(documentUri) {
    if (!vsc.workspace.workspaceFolders) return documentUri.fsPath;
    const workspacePath = vsc.workspace.workspaceFolders[0].uri.fsPath;
    return path.relative(workspacePath, documentUri.fsPath).replace(/\\/g, '/');
}

function startLspServer(context) {
    const config = vsc.workspace.getConfiguration('kspl');
    // Caution: **Never take the program from the opened folder.** A repository can carry its own
    // `out/ksplc_server.exe`, and starting it on open runs whatever it holds. Only a person's own
    // setting (`kspl.serverPath`, machine-scoped) names another server; to try a compiler built in
    // a checkout, put its path there.
    let exePath = config.get('serverPath');
    if (!exePath) {
        exePath = path.join(context.extensionPath, 'bin', process.platform, 'ksplc_server.exe');
    }

    if (!fs.existsSync(exePath)) {
        logSystem(`[Error] LSP Server executable not found at: ${exePath}`);
        return;
    }

    let args = ['lsp'];
    const workspacePath = vsc.workspace.workspaceFolders ? vsc.workspace.workspaceFolders[0].uri.fsPath : context.extensionPath;
    // The #cfg() flags for analysis (the compiler's --define): a declaration under an unset flag is
    // dropped, so hover and jump-to-definition go blank there. They go by environment variable, as
    // --std-dir does, since the analysis worker is a separate process the CLI does not reach.
    const defines = (config.get('defines') || []).join(',');
    const lspEnv = Object.assign({}, process.env);
    if (defines) {
        lspEnv.KSPLC_DEFINES = defines;
    }
    logMessage(`[Extension] Starting LSP Process: ${exePath} ${args.join(' ')}` +
        (defines ? ` (KSPLC_DEFINES=${defines})` : ''), 'messages');
    lspProcess = cp.spawn(exePath, args, { cwd: workspacePath, env: lspEnv });
    lspProcess.stdout.on('data', (data) => {
        messageBuffer = Buffer.concat([messageBuffer, data]);
        processBuffer();
    });
    lspProcess.stderr.on('data', (data) => {
        const text = data.toString().trimEnd();
        if (text && !text.includes("[LSP Capturing]") && !text.includes("[LSP] Semantic error") && !text.includes("[LSP Hover]")) {
            logMessage("[Kanso stderr] " + text, 'messages');
        }
    });
    // Caution: **Settle whatever is in flight.** With no deadline of our own, a request left in the
    // table when the process goes never answers, and the editor spins for ever.
    lspProcess.on('error', (err) => {
        logSystem(`[LSP Process Error] ${err.message}`);
        lspProcess = null;
        settlePendingRequests();
    });
    lspProcess.on('exit', (code) => {
        logMessage(`[LSP Process Exit] Code: ${code}`, 'messages');
        lspProcess = null;
        settlePendingRequests();
    });
    // Caution: **Take the legend from the answer; do not copy it here.** A token's number means
    // what `initialize`'s legend says (`ksplc/lsp/semtok.kspls`); a copied roster puts the colours
    // on the wrong names the day a kind is added, with nothing saying so.
    sendRequest("initialize", { capabilities: {} }).then((result) => {
        const caps = result && result.capabilities;
        const said = caps && caps.semanticTokensProvider;
        if (said && said.legend && Array.isArray(said.legend.tokenTypes)) {
            registerSemanticTokens(said.legend);
        }
    });
}

// The colours of meaning (type, function, field) **lie over the grammar's colours**: the grammar
// tells a word from a string, this tells one identifier from another.
// **Register it only once the legend has come**: with a roster of our own, a server naming its
// kinds in another order paints every name the wrong colour.
function registerSemanticTokens(said) {
    const legend = new vsc.SemanticTokensLegend(said.tokenTypes, said.tokenModifiers || []);
    const selector = [...KSPL_LANGS].map(function (id) {
        return { scheme: 'file', language: id };
    });
    track(vsc.languages.registerDocumentSemanticTokensProvider(selector, {
        async provideDocumentSemanticTokens(document, token) {
            const result = await sendRequest("textDocument/semanticTokens/full", {
                textDocument: { uri: getRelativeUri(document.uri) }
            }, token);
            // **An answer that is not there is not an empty one.** Give an empty set back and the
            // colours already painted are wiped; give null and what is there stays.
            if (!result || !Array.isArray(result.data)) return null;
            return new vsc.SemanticTokens(Uint32Array.from(result.data));
        }
    }, legend));
}

function processBuffer() {
    while (true) {
        const headerEndIdx = messageBuffer.indexOf('\r\n\r\n');
        if (headerEndIdx === -1) {
            if (messageBuffer.length > 5 * 1024 * 1024) messageBuffer = Buffer.alloc(0);
            break;
        }
        
        const headerLen = headerEndIdx + 4;
        const headerStr = messageBuffer.toString('ascii', 0, headerLen);
        const lenMatch = headerStr.match(/Content-Length:\s*(\d+)/i);
        if (!lenMatch) {
            messageBuffer = messageBuffer.subarray(1);
            continue;
        }
        
        const contentLength = parseInt(lenMatch[1], 10);
        const totalMsgLen = headerLen + contentLength;
        
        if (messageBuffer.length < totalMsgLen) {
            break;
        }
        
        const bodyBuf = messageBuffer.subarray(headerLen, totalMsgLen);
        messageBuffer = messageBuffer.subarray(totalMsgLen);
        
        let bodyStr = bodyBuf.toString('utf8');
        let msg = null;
        try {
            msg = JSON.parse(bodyStr);
        } catch (e) {
            bodyStr = bodyStr.replace(/\0/g, '').trim();
            const firstBrace = bodyStr.indexOf('{');
            const lastBrace = bodyStr.lastIndexOf('}');
            
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
                let cleanJson = bodyStr.substring(firstBrace, lastBrace + 1);
                while (cleanJson.length > 0) {
                    try {
                        msg = JSON.parse(cleanJson);
                        break;
                    } catch (err) {
                        const nextLastBrace = cleanJson.lastIndexOf('}', cleanJson.length - 2);
                        if (nextLastBrace === -1) {
                            logMessage(`[JSON Parse Failed] ${err.message}. Raw: ${bodyStr}`, 'messages');
                            break;
                        }
                        cleanJson = cleanJson.substring(0, nextLastBrace + 1);
                    }
                }
            } else {
                logMessage(`[JSON Parse Failed] Invalid payload. Raw: ${bodyStr}`, 'messages');
            }
        }
        
        if (msg) {
            logJsonRpc("[RECV]", msg);
            dispatchMessage(msg);
        }
    }
}

function dispatchMessage(msg) {
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        pendingRequests.get(msg.id)(msg.result);
        pendingRequests.delete(msg.id);
    } else if (msg.method === "textDocument/publishDiagnostics") {
        const uriStr = msg.params.uri;
        const uri = resolveUri(uriStr);

        const severityMap = {
            1: vsc.DiagnosticSeverity.Error,
            2: vsc.DiagnosticSeverity.Warning,
            3: vsc.DiagnosticSeverity.Information,
            4: vsc.DiagnosticSeverity.Hint
        };
        const diags = msg.params.diagnostics.map(d => {
            const range = toRange(d.range);
            const severity = severityMap[d.severity] || vsc.DiagnosticSeverity.Error;
            const diag = new vsc.Diagnostic(range, d.message, severity);
            if (d.tags && d.tags.includes(1)) {
                diag.tags = [vsc.DiagnosticTag.Unnecessary];
            }
            return diag;
        });
        diagnosticCollection.set(uri, diags);
    }
}

// Answers everything still waiting with nothing. **One function does it**, so a new way for the process
// to go does not have to remember the table (Principle 6 in `docs/DESIGN.md`).
function settlePendingRequests() {
    const waiting = pendingRequests;
    pendingRequests = new Map();
    for (const resolve of waiting.values()) {
        resolve(null);
    }
}

// Caution: **Do not put a deadline of our own on a request.** The supervisor counts *silence*
// against a 10-second window, with a liveness marker during a long answer (10.2 of
// `ksplc/docs/DESIGN.md`); a timer counts elapsed time and cannot tell slow from hung, while a
// workspace call hierarchy legitimately runs tens of seconds and a discarded answer draws as "no
// results". `vscode-languageclient` holds no per-request deadline either.
function sendRequest(method, params, token) {
    flushPendingChanges();
    return new Promise((resolve) => {
        if (!lspProcess || lspProcess.exitCode !== null) return resolve(null);

        const id = reqId++;
        pendingRequests.set(id, resolve);
        // For a reader who will not wait, **the answer is merely let go of**: the server has no
        // `$/cancelRequest`, and a late answer finds its id gone from the table.
        if (token) {
            token.onCancellationRequested(() => {
                if (pendingRequests.delete(id)) {
                    logMessage(`[Cancelled] Request ${id} (${method}).`, 'messages');
                    resolve(null);
                }
            });
        }

        const msgObj = { jsonrpc: "2.0", id, method, params };
        logJsonRpc("[SEND]", msgObj); 

        const msgStr = JSON.stringify(msgObj);
        lspProcess.stdin.write(`Content-Length: ${Buffer.byteLength(msgStr)}\r\n\r\n${msgStr}`);
    });
}

function sendNotification(method, params) {
    if (!lspProcess || lspProcess.exitCode !== null) return;
    const msgObj = { jsonrpc: "2.0", method, params };
    logJsonRpc("[SEND NOTIFY]", msgObj); 

    const msgStr = JSON.stringify(msgObj);
    lspProcess.stdin.write(`Content-Length: ${Buffer.byteLength(msgStr)}\r\n\r\n${msgStr}`);
}

// When activate() is called again with the previous round left behind (an extension host restart,
// deactivate not run on a reload), everything pushed onto activeDisposables is disposed of before
// starting anew, so the LSP process, the providers and the listeners are never doubled.
function disposePreviousActivation() {
    if (lspProcess && lspProcess.exitCode === null) {
        lspProcess.removeAllListeners();
        lspProcess.kill();
    }
    lspProcess = null;
    settlePendingRequests();
    reqId = 1;
    messageBuffer = Buffer.alloc(0);
    if (didChangeTimeout) {
        clearTimeout(didChangeTimeout);
        didChangeTimeout = null;
    }
    pendingChanges = new Map();
    hoverRequestSeq = 0;
    openedUris = new Set();
    for (const d of activeDisposables) {
        try { d.dispose(); } catch (e) {}
    }
    activeDisposables = [];
}

// VS Code runs every extension in one Node process, so an extension loaded twice (an old install
// left enabled, a workspace copy beside a user install) registers its providers twice and shows
// both hovers, beyond activeDisposables' reach. So the last-activated instance's clean-up sits on
// the process-wide globalThis, and a new one calls it first (each copy has its own module scope).
const KSPL_GLOBAL = globalThis;

exports.deactivate = function () {
    if (KSPL_GLOBAL.__kansoKsplTeardown === disposePreviousActivation) {
        KSPL_GLOBAL.__kansoKsplTeardown = null;
    }
    disposePreviousActivation();
};

exports.activate = function (context) {
    if (typeof KSPL_GLOBAL.__kansoKsplTeardown === 'function' &&
        KSPL_GLOBAL.__kansoKsplTeardown !== disposePreviousActivation) {
        // Dispose of what another instance left behind, with its own clean-up.
        try { KSPL_GLOBAL.__kansoKsplTeardown(); } catch (e) {}
    }
    disposePreviousActivation();
    KSPL_GLOBAL.__kansoKsplTeardown = disposePreviousActivation;
    outputChannel = track(vsc.window.createOutputChannel("Kanso LSP"));
    if (getLogLevel() !== 'off') outputChannel.show(true);
    logSystem("🚀 Kanso Native LSP Extension Activated!");

    diagnosticCollection = track(vsc.languages.createDiagnosticCollection('kspl'));
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(outputChannel);
    context.subscriptions.push(
        track(vsc.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('kspl.trace.server')) {
                const newLevel = getLogLevel();
                if (newLevel !== 'off') {
                    outputChannel.show(true);
                }
                logSystem(`[Extension] Trace level changed to: ${newLevel}`);
            }
        }))
    );
    startLspServer(context);
    // **Register for both notations.** A provider is looked up per language, so with one alone
    // the indented notation gets neither hover nor a definition's destination.
    const selector = [...KSPL_LANGS].map(function (id) {
        return { scheme: 'file', language: id };
    });
    context.subscriptions.push(
        track(vsc.languages.registerHoverProvider(selector, {
            async provideHover(document, position, token) {
                const myRequestId = ++hoverRequestSeq;
                const result = await sendRequest("textDocument/hover", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character }
                }, token);
                // A newer hover request was issued while waiting, so this result is old (two
                // tooltips would stack).
                if (token.isCancellationRequested || myRequestId !== hoverRequestSeq) {
                    return null;
                }
                if (result && result.contents) {
                    return new vsc.Hover(new vsc.MarkdownString(result.contents.value));
                }
                return null;
            }
        })),

        track(vsc.languages.registerDefinitionProvider(selector, {
            async provideDefinition(document, position, token) {
                const lineText = document.lineAt(position.line).text;
                const importMatch = lineText.match(/import\s+["']([^"']+)["']/);
                if (importMatch) {
                    const importPath = importMatch[1];
                    const stringStart = lineText.indexOf(importPath);
                    if (position.character >= stringStart && position.character <= stringStart + importPath.length) {
                        // **Both notations**: an import writes no extension, so `.kspls` is
                        // looked for first, then the brace notation, as ksplc resolves
                        // (`base/locate.kspls`).
                        const searchPattern = `**/${importPath}.{kspls,kspl}`;
                        const files = await vsc.workspace.findFiles(searchPattern, '**/out/**');
                        if (files.length > 0) return new vsc.Location(files[0], new vsc.Position(0, 0));
                    }
                }

                const result = await sendRequest("textDocument/definition", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character }
                }, token);

                if (result && result.uri) {
                    let defUri;
                    if (!result.uri.startsWith("file://")) {
                        const workspacePath = vsc.workspace.workspaceFolders[0].uri.fsPath;
                        defUri = vsc.Uri.file(path.join(workspacePath, result.uri));
                    } else {
                        defUri = vsc.Uri.parse(result.uri);
                    }
                    return new vsc.Location(defUri, toRange(result.range));
                }
                // **No guess where the server knows none**: a text search lands on another thing of
                // the same name, shown with the same confidence as a real answer.
                return null;
            }
        })),
    );
    context.subscriptions.push(
        track(vsc.workspace.onDidChangeTextDocument(e => {
            if (isKsplDoc(e.document)) {
                pendingChanges.set(e.document.uri.toString(), e.document);
                if (didChangeTimeout) clearTimeout(didChangeTimeout);

                didChangeTimeout = setTimeout(() => {
                    flushPendingChanges();
                }, 1500);
            }
        })),
        track(vsc.workspace.onDidOpenTextDocument(document => {
            sendDidOpenOnce(document);
        })),
        track(vsc.workspace.onDidCloseTextDocument(document => {
            if (isKsplDoc(document)) {
                openedUris.delete(getRelativeUri(document.uri));
            }
        }))
    );
    vsc.window.visibleTextEditors.forEach(editor => {
        sendDidOpenOnce(editor.document);
    });
    context.subscriptions.push(
        // The outline is the server's, read from the syntax tree it already keeps for the document
        // (`ksplc/lsp/outline.kspls`): no guess from the text, and nothing parsed twice.
        track(vsc.languages.registerDocumentSymbolProvider(selector, {
            async provideDocumentSymbols(document, token) {
                const result = await sendRequest("textDocument/documentSymbol", {
                    textDocument: { uri: getRelativeUri(document.uri) }
                }, token);
                return Array.isArray(result) ? result.map(toDocumentSymbol) : [];
            }
        })),
        // The list of what can be written here.
        // **Register no trigger character.** The server declares none on purpose: a declared `.`
        // puts the list up unasked, this feature's most frequent complaint.
        track(vsc.languages.registerCompletionItemProvider(selector, {
            async provideCompletionItems(document, position, token) {
                // **Send what was typed before asking.** The server analyses the text it holds, so
                // unsent, the list answers for the text as it stood a keystroke ago.
                const result = await sendRequest("textDocument/completion", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character }
                }, token);
                if (!Array.isArray(result)) return null;
                return result.map(function (said) {
                    // **The numbers differ by one.** LSP counts its kinds from 1 and VS Code from
                    // 0, so handed over as they come every candidate wears the mark beside its own.
                    const item = new vsc.CompletionItem(said.label,
                        typeof said.kind === 'number' ? said.kind - 1 : undefined);
                    // **Keep the server's order.** It sends `sortText` as a digit-aligned number
                    // for exactly this; drop it and the editor sorts by its own fuzzy match, which
                    // is the "an unrelated candidate landed" complaint.
                    if (said.sortText) item.sortText = said.sortText;
                    if (said.filterText) item.filterText = said.filterText;
                    if (said.detail) item.detail = said.detail;
                    if (said.documentation && said.documentation.value) {
                        item.documentation = new vsc.MarkdownString(said.documentation.value);
                    }
                    return item;
                });
            }
        })),

        track(vsc.languages.registerReferenceProvider(selector, {
            async provideReferences(document, position, context, token) {
                sendNotification("textDocument/didChange", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    contentChanges: [{ text: document.getText() }]
                });

                const result = await sendRequest("textDocument/references", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character },
                    context: { includeDeclaration: context.includeDeclaration !== false }
                }, token);
                if (!Array.isArray(result)) return null;
                return result.map(one => new vsc.Location(resolveUri(one.uri), toRange(one.range)));
            }
        })),

        track(vsc.languages.registerCallHierarchyProvider(selector, {
            async prepareCallHierarchy(document, position, token) {
                const result = await sendRequest("textDocument/prepareCallHierarchy", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character }
                }, token);
                if (result && Array.isArray(result) && result.length > 0) {
                    return result.map(toCallItem);
                }
                return null;
            },
            provideCallHierarchyIncomingCalls(item, token) {
                return callsOf("callHierarchy/incomingCalls", item, "from", vsc.CallHierarchyIncomingCall,
                    token);
            },
            provideCallHierarchyOutgoingCalls(item, token) {
                return callsOf("callHierarchy/outgoingCalls", item, "to", vsc.CallHierarchyOutgoingCall,
                    token);
            }
        })),

        track(vsc.languages.registerRenameProvider(selector, {
            async provideRenameEdits(document, position, newName, token) {
                const ident = getIdentifierAtPosition(document, position);
                if (!ident) return null;

                sendNotification("textDocument/didChange", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    contentChanges: [{ text: document.getText() }]
                });

                const result = await sendRequest("textDocument/rename", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character },
                    newName: newName
                }, token);
                if (result && result.changes) {
                    const workspaceEdit = new vsc.WorkspaceEdit();
                    for (const uriStr of Object.keys(result.changes)) {
                        const fileUri = resolveUri(uriStr);
                        let targetDoc = null;
                        
                        try {
                            targetDoc = await vsc.workspace.openTextDocument(fileUri);
                        } catch (e) {}

                        for (const edit of result.changes[uriStr]) {
                            const at = new vsc.Position(edit.range.start.line, edit.range.start.character);
                            const word = targetDoc && targetDoc.getWordRangeAtPosition(at, /[a-zA-Z_]\w*/);
                            workspaceEdit.replace(fileUri, word || toRange(edit.range), edit.newText);
                        }
                    }
                    return workspaceEdit;
                }
                return null;
            }
        }))
    );
}

function getIdentifierAtPosition(document, position) {
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_]\w*/);
    if (!wordRange) return null;
    return { word: document.getText(wordRange), range: wordRange };
}

// A symbol kind from the server as VS Code numbers it; a function where the server sent none.
// Caution: **The protocol counts symbol kinds from 1, VS Code's enum from 0**, so the number is one
// lower here; passed as it is, a function would show as a variable. **Every answer that carries a
// kind goes through here** (the outline and the call hierarchy alike).
function vscodeKind(kind) {
    return kind ? kind - 1 : vsc.SymbolKind.Function;
}

// A range of the server's answer as VS Code holds it.
function toRange(r) {
    return new vsc.Range(r.start.line, r.start.character, r.end.line, r.end.character);
}

// One `CallHierarchyItem` of the server's answer. **It keeps the server's `data`**, which the
// next request about it sends back.
function toCallItem(said) {
    const item = new vsc.CallHierarchyItem(vscodeKind(said.kind), said.name, said.detail || "",
        resolveUri(said.uri), toRange(said.range), toRange(said.selectionRange));
    item.data = said.data;
    return item;
}

// The callers or the callees of `item`: `end` names the side of each answer that is the other
// function, and `Call` is the VS Code type each answer becomes.
async function callsOf(method, item, end, Call, token) {
    const result = await sendRequest(method, {
        item: { name: item.name, kind: item.kind, uri: getRelativeUri(item.uri), data: item.data }
    }, token);
    if (!Array.isArray(result)) return [];
    return result.map(c => new Call(toCallItem(c[end]), c.fromRanges.map(toRange)));
}

// One `DocumentSymbol` of the server's answer, its children turned likewise.
function toDocumentSymbol(said) {
    const symbol = new vsc.DocumentSymbol(said.name, "", vscodeKind(said.kind), toRange(said.range),
        toRange(said.selectionRange));
    symbol.children = (said.children || []).map(toDocumentSymbol);
    return symbol;
}
