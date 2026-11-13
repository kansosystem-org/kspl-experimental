// A stand-in for VS Code's extension host: it runs the KSPL extension's client side under node
//
// Not a suite; `tests/suite/vscode_test.kspl` runs it as `node vscode_host.js <extension.js>`.
// **The `vscode` module and the language server are both fakes.** The module answers only what the
// extension asks of it. The server records every message the extension writes. It answers each
// request with nothing, but `prepareRename` with a refusal. It plays one editing session and
// prints one JSON object: the messages in the order the server read them, how often the output
// panel was brought forward, and what the editor was told when the rename was refused. Then it
// changes a setting the server starts with, and stops the server again and again: `starts` holds
// the `KSPLC_DEFINES` of each start, `restarted` the methods sent meanwhile, and `errors` what the
// editor was told.
// Caution: **Answer `initialize` late**, on a later turn, as a real server does. If it is answered
// at once, a message sent during the handshake cannot be told from one sent after it.
'use strict';
const Module = require('module');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

const extPath = path.resolve(process.argv[2]);
const extDir = path.dirname(extPath);
// Function declarations, function types and closures share the keyword scope.
const grammar = require(path.join(extDir, 'tmLanguage.json')).repository.functions;
const fnPattern = new RegExp(grammar.match);
for (const [source, name] of [
    ['pub typedef Erase_sector = fn(at: Sz): Bool', undefined],
    ['fn(x: I32;): I32 { return x; }', undefined],
    ['pub fn erase(at: Sz): Bool', 'erase'],
]) {
    const match = fnPattern.exec(source);
    if (!match || match[1] !== 'fn' || match[2] !== name ||
        grammar.captures['1'].name !== 'storage.type.function.kspl')
        throw Error('function keyword or declaration name lost its scope: ' + source);
}
if (fnPattern.test('fn_extra') || fnPattern.test('myfn(x)'))
    throw Error('an identifier was mistaken for the fn keyword');

const root = path.resolve('/workspace');

// The settings are the extension's own defaults, from its `package.json`, as a fresh install has.
const settings = {};
const declared = require(path.join(extDir, 'package.json')).contributes.configuration.properties;
for (const key of Object.keys(declared)) settings[key] = declared[key].default;
// **The program started is a fake**, so the path need only exist.
settings['kspl.serverPath'] = extPath;

const seen = { sent: [], shown: 0, refusal: '', starts: [], errors: [] };
let server = null;
const refusal = 'refused by the fake server';
let definitionUri;

function frame(obj, tail = '') {
    const body = JSON.stringify(obj) + tail;
    return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function fakeServer() {
    const proc = new EventEmitter();
    proc.exitCode = null;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => { proc.exitCode = 0; };
    let buf = Buffer.alloc(0);
    proc.stdin = {
        write(chunk) {
            buf = Buffer.concat([buf, Buffer.from(chunk)]);
            for (;;) {
                const end = buf.indexOf('\r\n\r\n');
                if (end < 0) return;
                const len = Number(/Content-Length: (\d+)/i.exec(buf.toString('ascii', 0, end))[1]);
                if (buf.length < end + 4 + len) return;
                const msg = JSON.parse(buf.toString('utf8', end + 4, end + 4 + len));
                buf = buf.subarray(end + 4 + len);
                seen.sent.push(msg);
                if (msg.id !== undefined) {
                    const answer = { jsonrpc: '2.0', id: msg.id,
                        result: msg.method === 'initialize' ? { capabilities: {} } : null };
                    if (msg.method === 'textDocument/prepareRename') {
                        proc.stdout.emit('data', frame({ jsonrpc: '2.0', id: msg.id, result: null }, '\0'));
                        delete answer.result;
                        answer.error = { code: -32803, message: refusal };
                    }
                    if (msg.method === 'textDocument/definition') {
                        answer.result = { uri: definitionUri, range: {
                            start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } };
                    }
                    setTimeout(() => proc.stdout.emit('data', frame(answer)), 20);
                }
            }
        }
    };
    return proc;
}
cp.spawn = (exe, args, options) => {
    seen.starts.push(options.env.KSPLC_DEFINES || '');
    server = fakeServer();
    return server;
};

class Uri {
    constructor(fsPath) { this.fsPath = fsPath; this.scheme = 'file'; }
    toString() { return 'file://' + this.fsPath; }
    static file(p) { return new Uri(p); }
    static parse(s) { return new Uri(s.replace(/^file:\/\//, '')); }
}

const listeners = { open: [], change: [], close: [], config: [] };
const providers = {};
const disposable = { dispose() {} };
const on = (kind) => (fn) => { listeners[kind].push(fn); return disposable; };
// **Whatever the extension asks that is not written here is a harmless stub**: a constructor for a
// type (`Range`, `Hover`), a registration that keeps its provider. A new use of the API then runs
// rather than failing a test about something else.
const stubType = class { constructor(...args) { this.args = args; } };
const vscode = new Proxy({
    Uri,
    workspace: {
        workspaceFolders: [{ uri: Uri.file(root) }],
        textDocuments: [],
        getConfiguration: (section) => ({
            get: (key, fallback) => {
                const value = settings[section + '.' + key];
                return value === undefined ? fallback : value;
            }
        }),
        onDidOpenTextDocument: on('open'),
        onDidChangeTextDocument: on('change'),
        onDidCloseTextDocument: on('close'),
        onDidChangeConfiguration: on('config'),
        findFiles: async () => [],
    },
    window: {
        visibleTextEditors: [],
        createOutputChannel: () => ({ appendLine() {}, show() { seen.shown += 1; }, dispose() {} }),
        showErrorMessage: (msg) => { seen.errors.push(msg); },
    },
    commands: {
        registerCommand: () => disposable,
    },
    languages: new Proxy({
        createDiagnosticCollection: () => ({ set() {}, clear() {}, dispose() {} }),
    }, {
        get: (own, key) => key in own ? own[key] : (selector, provider) => {
            providers[key] = provider;
            return disposable;
        }
    }),
}, { get: (own, key) => key in own ? own[key] : stubType });

const load = Module._load;
Module._load = function (request, ...rest) {
    return request === 'vscode' ? vscode : load.call(this, request, ...rest);
};

function doc(name, version, text) {
    return { uri: Uri.file(path.join(root, name)), languageId: 'kspl', version,
        getText: () => text, lineAt: () => ({ text }) };
}
const fire = (kind, arg) => listeners[kind].forEach((fn) => fn(arg));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const token = { isCancellationRequested: false, onCancellationRequested: () => disposable };

// One session: open during the handshake, edit, ask, ask to rename, edit and close at once, open
// again. The last wait outlasts the extension's own delay before it sends a change. So a change it
// kept for the closed document would arrive before the end.
async function session() {
    const ext = require(extPath);
    ext.activate({ extensionPath: extDir, subscriptions: [] });
    fire('open', doc('a.kspl', 1, 'first'));
    await wait(100);
    fire('change', { document: doc('a.kspl', 2, 'second') });
    await providers.registerHoverProvider.provideHover(doc('a.kspl', 2, 'second'),
        { line: 0, character: 0 }, token);
    try {
        await providers.registerRenameProvider.prepareRename(doc('a.kspl', 2, 'second'),
            { line: 0, character: 0 }, token);
    } catch (err) {
        seen.refusal = String(err && err.message);
    }
    const outside = path.resolve(root, '..', 'outside.kspl');
    for (const [uri, expected] of [['lib.kspl', path.join(root, 'lib.kspl')],
        [outside, outside], [Uri.file(outside).toString(), outside]]) {
        definitionUri = uri;
        const location = await providers.registerDefinitionProvider.provideDefinition(
            doc('a.kspl', 2, 'second'), { line: 0, character: 0 }, token);
        if (location.args[0].fsPath !== expected) throw Error('definition resolved to another file');
    }
    fire('change', { document: doc('a.kspl', 3, 'unsaved') });
    fire('close', doc('a.kspl', 3, 'unsaved'));
    fire('open', doc('a.kspl', 1, 'from disk'));
    await wait(2000);
    const session_sent = seen.sent.slice();
    const session_shown = seen.shown;
    // A changed `kspl.defines` starts the server again with it. Then the server stops by itself
    // five times: it is started again four times, and the editor is told once that it is not.
    // **The first stop comes before that server answers `initialize`.**
    settings['kspl.defines'] = ['blas'];
    fire('config', { affectsConfiguration: (key) => key === 'kspl.defines' });
    for (let i = 0; i < 5; i++) {
        server.exitCode = 1;
        server.emit('exit', 1);
        await wait(50);
    }
    ext.deactivate();
    const sent = session_sent.map((m) => {
        const td = (m.params && m.params.textDocument) || {};
        const change = m.params && m.params.contentChanges && m.params.contentChanges[0];
        return { method: m.method, uri: td.uri, version: td.version,
            text: td.text !== undefined ? td.text : change && change.text };
    });
    process.stdout.write(JSON.stringify({ sent, shown: session_shown, refusal: seen.refusal,
        starts: seen.starts, errors: seen.errors,
        restarted: seen.sent.slice(session_sent.length).map((m) => m.method) }) + '\n');
}

session().catch((err) => {
    process.stdout.write(JSON.stringify({ error: String(err && err.stack || err) }) + '\n');
    process.exitCode = 1;
});
