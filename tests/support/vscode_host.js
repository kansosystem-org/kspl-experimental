// A stand-in for VS Code's extension host: it runs the KSPL extension's client side under node
//
// Not a suite; `tests/suite/vscode_test.kspls` runs it as `node vscode_host.js <extension.js>`.
// **The `vscode` module and the language server are both fakes**: the module answers only what the
// extension asks of it, and the server records every message the extension writes, answering each
// request with nothing, but `prepareRename` with a refusal. It plays one editing session and
// prints, as one JSON object, the messages in the order the server read them, how often the output
// panel was brought forward, and what the editor was told when the rename was refused.
// Caution: **Answer `initialize` late**, on a later turn, as a real server does: answered at once,
// a message sent during the handshake could not be told from one sent after it.
'use strict';
const Module = require('module');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

const extPath = path.resolve(process.argv[2]);
const extDir = path.dirname(extPath);
const root = path.resolve('/workspace');

// The settings are the extension's own defaults, from its `package.json`, as a fresh install has.
const settings = {};
const declared = require(path.join(extDir, 'package.json')).contributes.configuration.properties;
for (const key of Object.keys(declared)) settings[key] = declared[key].default;
// **The program started is a fake**, so the path need only exist.
settings['kspl.serverPath'] = extPath;

const seen = { sent: [], shown: 0, refusal: '' };
const refusal = 'refused by the fake server';

function frame(obj) {
    const body = JSON.stringify(obj);
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
                        delete answer.result;
                        answer.error = { code: -32803, message: refusal };
                    }
                    setTimeout(() => proc.stdout.emit('data', frame(answer)), 20);
                }
            }
        }
    };
    return proc;
}
cp.spawn = fakeServer;

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
    },
    languages: new Proxy({
        createDiagnosticCollection: () => ({ set() {}, dispose() {} }),
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
    return { uri: Uri.file(path.join(root, name)), languageId: 'kspls', version,
        getText: () => text };
}
const fire = (kind, arg) => listeners[kind].forEach((fn) => fn(arg));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const token = { isCancellationRequested: false, onCancellationRequested: () => disposable };

// One session: open during the handshake, edit, ask, ask to rename, edit and close at once, open
// again. The last wait outlasts the extension's own delay before it sends a change, so a change it
// kept for the closed document would arrive before the end.
async function session() {
    const ext = require(extPath);
    ext.activate({ extensionPath: extDir, subscriptions: [] });
    fire('open', doc('a.kspls', 1, 'first'));
    await wait(100);
    fire('change', { document: doc('a.kspls', 2, 'second') });
    await providers.registerHoverProvider.provideHover(doc('a.kspls', 2, 'second'),
        { line: 0, character: 0 }, token);
    try {
        await providers.registerRenameProvider.prepareRename(doc('a.kspls', 2, 'second'),
            { line: 0, character: 0 }, token);
    } catch (err) {
        seen.refusal = String(err && err.message);
    }
    fire('change', { document: doc('a.kspls', 3, 'unsaved') });
    fire('close', doc('a.kspls', 3, 'unsaved'));
    fire('open', doc('a.kspls', 1, 'from disk'));
    await wait(2000);
    ext.deactivate();
    const sent = seen.sent.map((m) => {
        const td = (m.params && m.params.textDocument) || {};
        const change = m.params && m.params.contentChanges && m.params.contentChanges[0];
        return { method: m.method, uri: td.uri, version: td.version,
            text: td.text !== undefined ? td.text : change && change.text };
    });
    process.stdout.write(JSON.stringify({ sent, shown: seen.shown, refusal: seen.refusal }) +
        '\n');
}

session().catch((err) => {
    process.stdout.write(JSON.stringify({ error: String(err && err.stack || err) }) + '\n');
    process.exitCode = 1;
});
