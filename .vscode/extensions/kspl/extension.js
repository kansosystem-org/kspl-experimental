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
// document already open; the URIs sent are recorded so each is sent once, and so a didClose goes
// only for a document the server was told is open.
let openedUris = new Set();

// Caution: **Send nothing before `initialize` is answered.** The protocol forbids it, and the
// documents open at start-up would otherwise race the handshake. What is sent meanwhile waits here,
// in order, and goes out after `initialized`; null once the answer has come.
let heldMessages = null;

// The language a KSPL source is opened as (`languages` in package.json).
const KSPL_LANG = 'kspl';
// The documents the providers serve.
const KSPL_SELECTOR = [{ scheme: 'file', language: KSPL_LANG }];

// Whether this is a document to send to the language server.
function isKsplDoc(document) {
    return document.languageId === KSPL_LANG;
}

function sendDidOpenOnce(document) {
    if (!isKsplDoc(document)) return;
    const uri = getRelativeUri(document.uri);
    if (openedUris.has(uri)) return;
    openedUris.add(uri);
    sendNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: document.languageId, version: document.version,
            text: document.getText() }
    });
}

// Caution: **Tell the server a document is closed.** It analyses every other file against an open
// document's text, not the disk's; left open, a file changed on disk afterwards (a checkout, `make
// fmt`) stays the old text for every other file's errors, references and renames.
// **A change still waiting belongs to text the editor has discarded**, so it is dropped, not sent.
function sendDidClose(document) {
    if (!isKsplDoc(document)) return;
    pendingChanges.delete(document.uri.toString());
    const uri = getRelativeUri(document.uri);
    if (!openedUris.delete(uri)) return;
    sendNotification("textDocument/didClose", { textDocument: { uri } });
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

// **The panel comes forward only for an error**, or when the person turns the trace on: brought
// forward on every start, it covers the terminal for nothing.
function logError(msg) {
    if (outputChannel) {
        outputChannel.appendLine(msg);
        outputChannel.show(true);
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
        for (const doc of pendingChanges.values()) {
            const uri = getRelativeUri(doc.uri);
            // A document opened before the extension started was never announced; its first
            // change announces it whole.
            if (!openedUris.has(uri)) {
                sendDidOpenOnce(doc);
                continue;
            }
            sendNotification("textDocument/didChange", {
                textDocument: { uri, version: doc.version },
                contentChanges: [{ text: doc.getText() }]
            });
        }
        pendingChanges.clear();
    }
}

function resolveUri(uriStr) {
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
        logError(`[Error] LSP Server executable not found at: ${exePath}`);
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
        logError(`[LSP Process Error] ${err.message}`);
        lspProcess = null;
        settlePendingRequests();
    });
    // A stop of our own takes the listeners off first (`disposePreviousActivation`), so an exit
    // seen here is the server going by itself.
    lspProcess.on('exit', (code) => {
        logError(`[LSP Process Exit] Code: ${code}`);
        lspProcess = null;
        settlePendingRequests();
    });
    // Caution: **Take the legend from the answer; do not copy it here.** A token's number means
    // what `initialize`'s legend says (`ksplc/lsp/semtok.kspl`); a copied roster puts the colours
    // on the wrong names the day a kind is added, with nothing saying so.
    heldMessages = [];
    sendRequest("initialize", {
        capabilities: { textDocument: { rename: { prepareSupport: true } } }
    }).then((result) => {
        const caps = result && result.capabilities;
        const said = caps && caps.semanticTokensProvider;
        if (said && said.legend && Array.isArray(said.legend.tokenTypes)) {
            registerSemanticTokens(said.legend);
        }
    }, (err) => {
        logError(`[Error] initialize failed: ${err.message}`);
    }).then(() => {
        const held = heldMessages || [];
        heldMessages = null;
        sendNotification("initialized", {});
        for (const msgObj of held) writeMessage(msgObj);
    });
}

// The colours of meaning (type, function, field) **lie over the grammar's colours**: the grammar
// tells a word from a string, this tells one identifier from another.
// **Register it only once the legend has come**: with a roster of our own, a server naming its
// kinds in another order paints every name the wrong colour.
function registerSemanticTokens(said) {
    const legend = new vsc.SemanticTokensLegend(said.tokenTypes, said.tokenModifiers || []);
    track(vsc.languages.registerDocumentSemanticTokensProvider(KSPL_SELECTOR, {
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
        
        let msg;
        // A frame holds one JSON value. Repairing bytes can settle a request with a damaged
        // reply before the server's real answer arrives.
        try {
            msg = JSON.parse(bodyBuf.toString('utf8'));
        } catch (e) {
            logMessage(`[JSON Parse Failed] ${e.message}`, 'messages');
            continue;
        }
        
        if (msg) {
            logJsonRpc("[RECV]", msg);
            dispatchMessage(msg);
        }
    }
}

function dispatchMessage(msg) {
    if (msg.id !== undefined && pendingRequests.has(msg.id)) {
        const waiting = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        // **A refusal carries its reason**: a rename the server turns down says why, and the
        // editor shows that message only from a rejected promise.
        if (msg.error) {
            waiting.reject(new Error(msg.error.message));
        } else {
            waiting.resolve(msg.result);
        }
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
// to go does not have to remember the table (Principle 6 in `docs/DESIGN-principles.md`).
function settlePendingRequests() {
    const waiting = pendingRequests;
    pendingRequests = new Map();
    for (const one of waiting.values()) {
        one.resolve(null);
    }
}

// Caution: **Do not put a deadline of our own on a request.** The supervisor counts *silence*
// against a 10-second window, with a liveness marker during a long answer (10.2 of
// `ksplc/docs/DESIGN-compiler.md`); a timer counts elapsed time and cannot tell slow from hung, while a
// workspace call hierarchy legitimately runs tens of seconds and a discarded answer draws as "no
// results". `vscode-languageclient` holds no per-request deadline either.
function sendRequest(method, params, token) {
    flushPendingChanges();
    return new Promise((resolve, reject) => {
        if (!lspProcess || lspProcess.exitCode !== null) return resolve(null);

        const id = reqId++;
        pendingRequests.set(id, { resolve, reject });
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
        if (method === "initialize") {
            writeMessage(msgObj);
        } else {
            postMessage(msgObj);
        }
    });
}

function sendNotification(method, params) {
    const msgObj = { jsonrpc: "2.0", method, params };
    if (method === "initialized") {
        writeMessage(msgObj);
    } else {
        postMessage(msgObj);
    }
}

// Sends a message, or holds it while `initialize` is unanswered (`heldMessages`).
function postMessage(msgObj) {
    if (heldMessages) {
        heldMessages.push(msgObj);
        return;
    }
    writeMessage(msgObj);
}

function writeMessage(msgObj) {
    if (!lspProcess || lspProcess.exitCode !== null) return;
    logJsonRpc(msgObj.id !== undefined ? "[SEND]" : "[SEND NOTIFY]", msgObj);
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
    heldMessages = null;
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
    context.subscriptions.push(
        track(vsc.languages.registerHoverProvider(KSPL_SELECTOR, {
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

        track(vsc.languages.registerDefinitionProvider(KSPL_SELECTOR, {
            async provideDefinition(document, position, token) {
                const lineText = document.lineAt(position.line).text;
                const importMatch = lineText.match(/import\s+["']([^"']+)["']/);
                if (importMatch) {
                    const importPath = importMatch[1];
                    const stringStart = lineText.indexOf(importPath);
                    if (position.character >= stringStart && position.character <= stringStart + importPath.length) {
                        // An import writes no extension; ksplc adds `.kspl` (`base/locate.kspl`).
                        const searchPattern = `**/${importPath}.kspl`;
                        const files = await vsc.workspace.findFiles(searchPattern, '**/out/**');
                        if (files.length > 0) return new vsc.Location(files[0], new vsc.Position(0, 0));
                    }
                }

                const result = await sendRequest("textDocument/definition", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character }
                }, token);

                if (result && result.uri) {
                    return new vsc.Location(resolveUri(result.uri), toRange(result.range));
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
            sendDidClose(document);
        }))
    );
    vsc.window.visibleTextEditors.forEach(editor => {
        sendDidOpenOnce(editor.document);
    });
    context.subscriptions.push(
        // The outline is the server's, read from the syntax tree it already keeps for the document
        // (`ksplc/lsp/outline.kspl`): no guess from the text, and nothing parsed twice.
        track(vsc.languages.registerDocumentSymbolProvider(KSPL_SELECTOR, {
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
        track(vsc.languages.registerCompletionItemProvider(KSPL_SELECTOR, {
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

        track(vsc.languages.registerReferenceProvider(KSPL_SELECTOR, {
            async provideReferences(document, position, context, token) {
                const result = await sendRequest("textDocument/references", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character },
                    context: { includeDeclaration: context.includeDeclaration !== false }
                }, token);
                if (!Array.isArray(result)) return null;
                return result.map(one => new vsc.Location(resolveUri(one.uri), toRange(one.range)));
            }
        })),

        track(vsc.languages.registerCallHierarchyProvider(KSPL_SELECTOR, {
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

        // **The server decides what can be renamed, and to what.** A refusal (a name in the
        // standard library, a keyword, a name already taken) rejects the promise with the server's
        // reason, which the editor shows in place of the rename.
        track(vsc.languages.registerRenameProvider(KSPL_SELECTOR, {
            async prepareRename(document, position, token) {
                const result = await sendRequest("textDocument/prepareRename", {
                    textDocument: { uri: getRelativeUri(document.uri) },
                    position: { line: position.line, character: position.character }
                }, token);
                if (!result || !result.range) return null;
                return { range: toRange(result.range), placeholder: result.placeholder };
            },
            async provideRenameEdits(document, position, newName, token) {
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
