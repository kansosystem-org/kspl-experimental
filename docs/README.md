# docs — the documents that belong to no single source folder

**This folder routes; it does not explain.** What each document says stays in that document, and nothing below restates it.

| Document | Contents | Who reads it |
| :-- | :-- | :-- |
| [`TOUR.md`](TOUR.md) | The language one step at a time, each step a declaration of one program. | Whoever is learning to write KSPL |
| [`SPEC-language.md`](SPEC-language.md) | The language specification: syntax, type system, semantics. | Whoever writes KSPL |
| [`SPEC-local-server.md`](SPEC-local-server.md) | The protocol a page opened in a browser uses to ask the local machine for files and processes. | Whoever writes such a page or client, in any language |
| [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) | After the quick start: running a program, working in another folder, an executable to distribute, splitting into files, VS Code with the language server and debugger. The last section opens a `.kspage` document on a double-click. | Whoever writes KSPL and has `ksplc`, unpacked or built. For the last section, whoever wants a document to open from the file manager, with a clone that builds from source |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Where to start changing Kanso: which document to read for what, naming yourself, AI-written work. | Whoever is about to change Kanso for the first time |
| [`SECURITY.md`](SECURITY.md) | Where to report a vulnerability, and what counts as one. | Whoever has found a way to make an input take over execution or writing |
| [`HOWTO-build.md`](HOWTO-build.md) | Building from source, the compiler rebuilding itself, the formatter, linter and tests, and the Windows environment without Docker. | Whoever changes Kanso, and whoever writes KSPL with no prebuilt `ksplc` for their system; both need a C compiler and Make |
| [`SPEC-gates.md`](SPEC-gates.md) | What CI runs on each platform, the verdict line, the per-item pass/fail line, and what the convention checks count. | Whoever changes Kanso |
| [`DESIGN.md`](DESIGN.md) | The Development Principles, then why Kanso is as it is, in four bands: the language, the notation, the project, the aim. | Whoever changes Kanso |
| [`SPEC-documents.md`](SPEC-documents.md) | What every document must satisfy: the terms of art, the six kinds, wording and formatting, reference direction. | Whoever adds or changes a document |
| [`PLAN.md`](PLAN.md) | What is left that spans packages, and links to each package's own plan. | Whoever changes Kanso and looks for the next step |

## Further reading

* ["Repository layout" in `../README.md`](../README.md#-repository-layout) — every folder, with a link to each package's `README.md`.
* [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md) — the compiler's options and the formatter's and linter's diagnostic codes.
* [`../LICENSE.md`](../LICENSE.md) and [`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) — the root's own files: the MIT license, and the attribution for files under another license.
* Why the documents are laid out this way: "A document's name says what it is for" and "Who reads a document is said by a column, not a folder" in [`DESIGN.md`](DESIGN.md).
