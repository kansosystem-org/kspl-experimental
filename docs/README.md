# docs — documents for the whole repository

**This folder covers Kanso as a whole: how to learn, use, build and change the language.** Find the row for your task.

| Document | Contents | Who reads it |
| :-- | :-- | :-- |
| [`TUTORIAL-programming-language.md`](TUTORIAL-programming-language.md) | The language one step at a time, each step a declaration of one program. | Whoever is learning to write KSPL |
| [`SPEC-programming-language.md`](SPEC-programming-language.md) | The language specification: syntax, type system, semantics. | Whoever writes KSPL |
| [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) | Running programs, other folders, executables, several files, VS Code, and opening a `.ksmd` document on a double-click. | Whoever writes KSPL and has `ksplc`; the last section needs a clone that builds |
| [`SPEC-local-server.md`](SPEC-local-server.md) | The protocol a page opened in a browser uses to ask the local machine for files. | Whoever writes such a page or client, in any language |
| [`SECURITY.md`](SECURITY.md) | Where to report a vulnerability, and what counts as one. | Whoever finds input that causes unauthorized execution or writing |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Where to start changing Kanso: the first commands, your git identity, how a change gets in, AI-written work. | Whoever is about to change Kanso for the first time |
| [`HOWTO-build.md`](HOWTO-build.md) | Building from source, the formatter, linter and tests, and the environment for each platform. | Whoever changes Kanso, or has no prebuilt `ksplc`; both need a C compiler and Make |
| [`HOWTO-add-a-package.md`](HOWTO-add-a-package.md) | The steps to add a top-level package: its folder, the checks that must learn its name, and what nothing checks. | Whoever adds a package; needs a clone that builds |
| [`HOWTO-add-a-gate.md`](HOWTO-add-a-gate.md) | The steps to add a CI gate, and the message each forgotten place prints. | Whoever adds a check; needs a clone that builds |
| [`HOWTO-release.md`](HOWTO-release.md) | Publishing a release: the checks before the tag, the tag, and what the workflow builds. | Whoever publishes a release; needs push access |
| [`SPEC-gates.md`](SPEC-gates.md) | What continuous integration (CI) runs on each platform. The verdict line, each item’s pass/fail line, and what the convention checks count. | Whoever changes Kanso |
| [`DESIGN-principles.md`](DESIGN-principles.md) | The Development Principles, why each purpose has one notation, and how a model reads and writes KSPL. | Whoever changes Kanso |
| [`DESIGN-programming-language.md`](DESIGN-programming-language.md) | The reasons for the language’s design: symbols, types, traits, ownership, concurrency, visibility, and the boundary with C. | Whoever changes the language or finds an ambiguity in its specification |
| [`DESIGN-notation.md`](DESIGN-notation.md) | The reasons for the source notation: the indentation notation, names, keywords, line ends, long strings and documentation comments. | Whoever changes the language's notation or the formatter |
| [`DESIGN-repository.md`](DESIGN-repository.md) | Why the documents, the packages, the one repository and the gates have their shape. | Whoever changes a document, a package's boundary or a gate |
| [`SPEC-documents.md`](SPEC-documents.md) | Shared technical vocabulary, the six document kinds, wording and formatting, and reference direction. | Whoever adds or changes a document |
| [`SPEC-plain-language.md`](SPEC-plain-language.md) | Reusable writing rules, followed by replaceable chapters for software and Kanso. | Whoever writes any text in the repository |
| [`PLAN.md`](PLAN.md) | What is left, a section per package with work left. | Whoever changes Kanso and looks for the next step |

## Further reading

* ["Repository layout" in `../README.md`](../README.md#-repository-layout) — every folder, with a link to each package's `README.md`.
* [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md) — the compiler's options, the formatter and the linter.
* [`../ksplc/docs/SPEC-diagnostics.md`](../ksplc/docs/SPEC-diagnostics.md) — what each diagnostic code means.
* [`../tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md) — the steps to add a suite.
* [`../LICENSE.md`](../LICENSE.md) and [`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) — the MIT license, and the attribution for files under another license.
* "A document's name says what it is for" and "A column, not a folder, says who reads a document" in [`DESIGN-repository.md`](DESIGN-repository.md).
