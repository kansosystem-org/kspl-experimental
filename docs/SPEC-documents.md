# The specification for the documents

**What every document in this repository must satisfy**: the words it uses, the name it takes, how it is worded and laid out, and which other documents it may point at. Read this before adding one.

**It is a specification, not a guide**: the agreement that `make test-docref` and `make test-conventions` guard. Why each rule was chosen is in [`DESIGN.md`](DESIGN.md); which document to read for what is in [`README.md`](README.md).

* [Terms of art](#terms-of-art) — the words that carry one meaning each
* [Names for units](#names-for-units) — file, folder, package, all
* [Document naming](#document-naming) — the six kinds, where documents sit, the names fixed from outside, what every README contains, where a splitting plan is written
* [Wording and formatting rules](#wording-and-formatting-rules) — where a fact goes, the two labels, how a trap is written, another product named only for its behavior, no hand wrapping, the vertical bar inside a table
* [Reference direction between documents](#reference-direction-between-documents) — the layers, naming is not depending, what a SPEC may point at, how a reference is written
* [Linking documents to source](#linking-documents-to-source) — one direction, by name

## Terms of art

These words carry one meaning each in every document and source comment.

Caution: **Do not reach for a synonym.** Given two names for one thing, the reader has to work out whether they are the same thing.

| Term | What it means |
| :-- | :-- |
| **canonical source** | The single place a fact lives. Everything else points at it and never copies it |
| **rule** | A settled decision: not a suggestion, and not a description of how things happen to be |
| **gate** | One check that CI runs and that can fail the build |
| **fire** | What a check does when it catches a violation. A check that cannot fire is not a guarantee (Principle 8) |
| **guard** | What a check does for a rule: it watches for the rule being broken |
| **pass silently** | A gate that runs but checks nothing, or skips itself. **Indistinguishable from green**, which is why it gets its own word |
| **reject** | What the compiler does to a program it refuses to translate. Distinct from failing at run time |
| **literal text** | The characters as written, as opposed to what they mean. A check that reads literal text misses forms it does not spell out |
| **declare** | What a file or type does when it states its own identity, so a reader need not infer it |
| **block** | A region delimited by indentation or braces. **Not a stage and not a table column** — see below |
| **stage** | One step of a `PLAN.md`, numbered within that plan. The counting starts again in every plan, and a stage that branches gets a letter (`stage 6a`) |
| **phase** | One step of the project's status in the root [`../README.md`](../README.md) (`Phase N`), and nothing else. A `PLAN.md`'s stage 2 and the README's Phase 2 are different things |
| **entry point** | Where control enters: a `main`, a folder's `README.md`, the first file a tool reads |
| **interface** | The way one part is reached from another. Narrowing something to one interface is a design act, so it gets a name |
| **leaf** | The layer that only points upward (`tests/` / `tools/`). See the layer table below |

**Another language's vocabulary stays in that language's words.** Java's package, Go's module and apt's package are not paraphrased: a paraphrase cannot be matched against that language's own documentation.

## Names for units

Across every document and source comment, these four words name the units.

| Word | What it names |
| :-- | :-- |
| file | One `.kspls`. The unit `import` names, and the extent `priv` closes over |
| folder | One directory. The extent within which circular imports are allowed |
| package | Each of `ksplc/` `std/` … listed under "implementation" in the layer table below. It is the unit of distribution, and the extent that unspecified visibility closes over. **Packages do not nest**: only a top-level folder is one, and `kspage/lay/` is a folder (Java's and Python's packages nest; that is the one difference) |
| all | The extent `pub` opens |

**When naming another product's unit, name its owner too** (`MSYS2's package` / `Java's package` / `an ES module`). A bare `package` is KSPL's.

The rules for visibility and `import` are in [`SPEC-language.md`](SPEC-language.md); this section only sets which word to use.

### A folder's name is plural where it names its contents

**A folder takes the plural where its name is a plural noun for what it holds, and the singular where it names a step or an aspect of the thing it sits in.** `tests/` `tools/` `docs/` `examples/` `benches/` `boards/` `drivers/` hold many of a kind and say so; `parse/` `sema/` `lower/` `gen/` `fmt/` `lsp/` `model/` `lay/` `write/` `port/` `kernel/` each name one part of the package around them.

**Which spelling is picked matters less than that a check guards it**: where no build tool fixes the name, every project differs and a reader has to look first. So `make test-conventions` guards the rule, not anyone's memory.

**Do not give a folder and a file beside it the same name** (a `verdict/` beside `verdict.kspls`). An import resolves by appending the extension, so both names resolve and nothing refuses them, but `ls` cannot tell which is which.

**A folder inside a package may share a name with one at the root** (`std/tests/` beside `tests/`, `std/docs/` beside `docs/`), and that is intended: one word means one thing wherever it is written. So code that reads a path takes its first folder from where the path begins, not from the first folder name it recognises.

## Document naming

**Every document is one of six kinds, and the kind is the file's name.** Then a folder's listing tells the reader what each document is for before any is opened, and no document holds what another kind is for.

| Name | The kind — what the reader does with it | Who reads it | What it holds | What it does not hold |
| :-- | :-- | :-- | :-- | :-- |
| `README.md` | **Route.** Arrive, and find the way | Everyone arriving; the one kind that greets all of them at once | What is here, the smallest usage example, further reading | An explanation, a manual, a rule of its own — it routes to the document that holds them |
| `TOUR.md` | **Learn.** Read the whole once | Whoever is learning to write KSPL | A walk through the language, generated from a program the gates compile and run in both notations | Anything written by hand |
| `HOWTO-<task>.md` | **Do.** Carry out one task | Varies with the task, so its first sentence says what you must already have | The steps in order, each with its command line and what it prints | Why a step is what it is, past the sentence that stops it being skipped |
| `SPEC-<subject>.md` | **Look up.** Rely on an agreement | Whoever relies on the subject and cannot change it — the language, a tool's options, a board's wiring | The rules others can rely on, which change only with care | The reason a rule was chosen; anything not in place |
| `DESIGN.md` | **Understand.** Change it without breaking what it protects | Whoever changes Kanso | Decisions, their grounds, and what each gives up, in the present tense | A rule's statement, a roadmap, a history |
| `PLAN.md` | **See what is left.** Know what is not done, and in what order | Whoever changes Kanso | The stages ahead, what marks each as done, and what is still undecided. **One per package, in its `docs/`**, and [`PLAN.md`](PLAN.md) here for what spans packages | Anything done — a done stage is deleted, and its result lands in the document of its kind |

**The name is in capitals, and a subject follows the kind only where one folder can hold several of it** (`SPEC-language.md`, `HOWTO-bring-up.md`). The subject may run to any number of words: choose the form the reader will understand ([`SPEC-local-server.md`](SPEC-local-server.md)), since a name that does not say what the document is fails as an entry point, however short.

**One file, one kind.** A passage written for another kind moves to that kind's document once it is longer than a sentence. The smallest usage example stays inside a `README.md`, but a manual does not; a sentence of why stays inside a `HOWTO-`, but a chapter does not. The gates guard what a count can decide. Every tracked `.md` carries one of the six names or one fixed from outside, and a heading that names a roadmap (`roadmap`, `milestone`, `not started`, `what is left`, `what is to be added`, `next step`) stands only in a `PLAN.md` (`make test-conventions`). A `SPEC-<subject>.md` cites no `PLAN.md` (`make test-docref`).

**Do not move a kind into a differently named document.** Splitting the grounds into `RATIONALE.md` or the entry point into `OVERVIEW.md` makes two documents of one kind, with nothing to decide which is canonical. The six names are closed.

**A package with nothing left to do carries no `PLAN.md`.** A plan with nothing in it is one more name to read past, and the package also leaves the table in the root [`PLAN.md`](PLAN.md).

### Where documents sit

**Every folder that carries a document carries a `README.md`, and a package's is its entry point.** GitHub shows it without being asked, so it is always for the arriving reader. The root README routes to every package's README, and a package's README to the deeper folders that have one.

**A package's other documents sit under `<package>/docs/`, and only its `README.md` stands beside the sources.** People open a package's folder to find a source, and each document beside the sources is one more name to read past. The `README.md` stays there because an arriving reader must meet it without being told where to look, and GitHub shows it on the way in.

### Documents whose name is fixed from outside

A tool or a convention outside the repository looks for these by name, so renaming one hides it from the way people arrive at it. Each is listed in the entry point's table, since its name does not state its kind.

| Name | Who fixes it | What it is among the six |
| :-- | :-- | :-- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | GitHub picks it up only under this name, from the entry point, `docs/`, and `.github/` | The `README.md` for the reader changing Kanso: it routes to the requirements, the gates and the rules |
| [`../LICENSE.md`](../LICENSE.md), [`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) | The license's own terms, and the tooling that reads them | None — the text is the license's, not Kanso's to write |
| [`SECURITY.md`](SECURITY.md) | GitHub's `Security` tab shows a policy only under this name, from the entry point, `docs/`, and `.github/` | The `SPEC-` for whoever reports a vulnerability: where to report it, and what counts |

### What every README contains

**Every `README.md` carries these four.** Sections on particular subjects may sit between them.

| Element | Contents |
| :-- | :-- |
| **What is here** | A map of what the folder contains (a file table, a reading order, or an index organized by purpose). |
| **The smallest usage example** | A code block that can be copied and run, or one line of `make`. |
| **Further reading** | A guide at the end, under that heading, listing the same folder's other documents and the entry points of closely related folders. |
| **Who reads it** | A column on that guide **wherever the answer differs between the folder's documents**: who each one is for, and what they must already have (a toolchain, a browser, the board itself). Where every document has the same answer, the guide says it once instead of in a column. `make test-conventions` refuses a document the folder's README never names. |

**A `docs/README.md` that only routes to its folder's documents carries no usage example.** The documents it routes to hold the examples, and one copied into the index would be a second copy to keep in step.

**A folder in which nothing works says so at the top instead of carrying a usage example.** An example that does not run, or an empty section, sends the reader looking for something that is not there.

**One skeleton is offered for a README's headings.** A README need not have every section, but the sections it has take these headings, in this order. A section on a particular subject may sit between them.

| Heading | What it holds |
| :-- | :-- |
| `Run it` | The smallest usage example |
| `The idea` | The whole picture in a few paragraphs |
| `What is here` | The map |
| `Reading order` | Which document or file to read first, and what next |
| `Common changes` | Which files a typical change touches |
| `Pitfalls` | The traps the next person is likely to hit |
| `Files near the limit and how they split` | Where the folder needs it (below) |
| `Further reading` | The guide, always last |

**A README's heading carries no number and no time estimate** ("(30 seconds)"). A time estimate is a figure nobody can check, and a number has to change whenever a section is added.

### Where a file's splitting plan is written

**For a file near the line cap, the `README.md` of its top-level folder says how it splits**, under the heading "Files near the limit and how they split". The reason is Principle 3 in [`DESIGN.md`](DESIGN.md). How to choose the cut is "Choosing where to split a file" in [`DESIGN.md`](DESIGN.md), and what counts as near is "Principle 3 - what is counted, and how" in [`SPEC-gates.md`](SPEC-gates.md). The check is `make test-conventions`.

**A top-level folder's README with no file near the cap may say so in one line**, in the form "No file in `<folder>` exceeds 900 lines". `make test-conventions` checks that line against the tree: it fails if a file under the named folder is over 900 lines, or if the line's number differs from the check's.

**Do not write a file's line count there**: it drifts with every edit, so only what is split out and where it goes are written.

Caution: **Read the plan before touching a file it names.** A file named there is touched only once "what is split out" and "where it goes" are written for it.

**Write where it goes as a name plus the folder it will sit in**, not as a path: "a new `locate.kspls` under `ksplc/base/`". A path reads as pointing at an existing file, and `make test-docref` reports one that does not exist. A destination is a file nobody has made, so there is nothing to point at.

## Wording and formatting rules

**Adding to the documents without reading this makes them inconsistent**: what the markers mean and how lines are wrapped start to vary by section.

### A fact goes where its neighbours already are

**Where a table already carries the subject, a new fact about it is a column or a row of that table.** Written as a paragraph beside the table, the subject is stated in two places, and when one is edited nothing says the other is stale. The reader pays first: they read the table, believe they have the whole subject, and skip the paragraph.

**A paragraph beside a table says only what the table cannot hold**: why a column exists, a caution about filling one in, or the one consequence that does not fit a cell.

**A passage restating what another document states is deleted, not reworded.** What replaces it is a pointer, so there is one place to edit.

**No count decides this.** A person reads for it, as with "one file, one kind": a machine sees that a table and a paragraph sit side by side, not that they say the same thing. Other projects' style guides set the shape a list takes and stop there.

### Caution markers go only on things that break if ignored

**This rule applies to source comments too**, with the same scope as Principle 7 (comments, README, DESIGN, SPEC: all of them).

Two words carry the marking, and both are plain ASCII.

| Label | What it goes on |
| :-- | :-- |
| `Caution:` | **An instruction or a prohibition** ("do X", "do not do X", "X must never happen"), or a warning that it breaks silently: if it is not obeyed, the mistake stays invisible ("silently", "no one notices", "it passes anyway") |
| `Note:` | **A supplement that names somewhere the reader can go** — a link, a section, a document, a path, or a `make` target. It never carries an obligation |

**A name in backquotes on its own does not count as a place.** To a person, `check_line_wrap` reads as a pointer; to a machine, it is just another backquoted word. What earns the label is a destination that can be opened: a link, a `§`, a document's name, a path holding a `/`, or a backquoted `make` target.

**A supplement that names nowhere is still written; only the label goes.** A measured figure is still stated, and a rationale still gives its reason.

**A fact or a rule of the specification gets no label** ("X is Y", "there is no X", "X becomes Y"): a bold opening sentence already does that job. No other lead word is a label either: a paragraph opening with "The rule:", "The decision:" or "Settlement:" drops that word and keeps its bold sentence.

**Do not rewrite the sentence when removing a label**: only the label goes, and the sentence keeps its position and its words.

Caution: **Do not put a label on every assertion.** Then the reader cannot pick out what to obey, and in the end skips the labels altogether.

#### Where a label goes

**The label comes first, and a line holds only one.** In a source comment it follows the comment opener directly, whether the comment has the line to itself or follows code. In a document, where a paragraph is one line, it opens its own paragraph. Two labels on one line are two thoughts sharing a line, so the second takes a line of its own.

**A label stands alone**: two within four lines are read as one, and readers learn to skip them. Where two are needed at one place, the second keeps its words and drops its label: a bolded `**Do not X.**` still reads as a prohibition with nothing before it.

**Do not put a label inside a table cell or a heading.** A cell is short, and a label in one cell throws it out of balance with the cell beside it; a heading is already the loudest line on the screen. In a comparison table every cell is a contrast, so every label there would carry the same weight.

#### The two exceptions

**One alert box stands in the whole tree: the root `README.md`'s status notice**, written as GitHub's alert (`> [!CAUTION]`) directly under the title. It is the one caution every arriving reader must see before anything else, and a coloured box is what reaches them. Repeated elsewhere, the box would stop standing out, so every other caution keeps the plain label. `make test-conventions` refuses an alert anywhere else.

**The two words are not the compiler's.** A diagnostic carries `error` / `warning` / `information` / `hint`, and neither label is one of them. So `warning` in a line of text is always the compiler speaking, and a label is always a person speaking to the reader. That is why `Warning:`, which Google's style guide offers, is not used here. A few diagnostics use the bare word `Note:` inside their own message text; that is the compiler, not a label.

#### What the check counts

**The check (`make test-conventions`) counts; it does not judge.** It catches a label that does not come first in its line or its comment, a second label on the same line, a label inside a table cell or a heading, a label within four lines of another, and a `Note:` that names no place to go.

**It reads every file a person writes, using each file's own comment marks**: `//`, `#`, `/* */` and `<!-- -->`, as the file type has them. A label inside a string is not read (a Python docstring included), but the rule applies to it all the same.

**Whether a clause is a fact is not gated.** A check that reads a clause's opening for a subject and a copula catches too few cases to be worth its upkeep, and it reopens the judgement every time the tree's wording changes. So no check guards this rule: a reader catches a marker on a fact, not CI (Principle 8 names that gap rather than closing it). A word list pays where a judgement does not. "This word is refused, write that one instead" is literal text and cheap, and the other checks in this section take that shape.

### A trap is written as why it is dangerous

**A trap is written in the present tense, as why it is dangerous**, never as how it came to be found.

* ✓ "Walk inside the struct too. The outermost layer alone misses a slice buried inside"
* ✗ The same content told as a past-tense experience

### Another product is named for its behavior, not judged

**A named product, language or company stays in the text only where what it does grounds a decision here, and it is described as behavior**: "Excel and Word put redo and repeat on one key, so which a press does cannot be told beforehand" grounds a choice; "Excel is complained about for this" does not. Where only the complaint grounds it, the complaint stays and the name goes ("a common complaint is …").

**Do not write a verdict on another product**, nor that this one does better: "a classic accident", "not well regarded", "ahead of". A verdict reads as a claim against that product's users, a behavior as a fact anyone can check, and only the fact grounds a decision. `make test-conventions` refuses the phrases that only ever judge, in documents and comments alike. A phrase that also has a neutral use ("ahead of", "better than") is left to the reader to catch.

### A word-for-word idiom gives way to the plain word

**Write the plain English word, not a phrase built word by word that English does not use**: `the caller`, not `the calling side`; `an entry point`, not `a mouth` or `an entrance`. The reader has to translate such a phrase back before the sentence says anything, and a model reading it has nothing to translate it from.

**Do not copy the list here.** Its canonical source is `idiom_words` in `tests/support/conventions_prose.kspls`, which pairs each word with its replacement and names the replacement when it refuses a line. Only a word with a single replacement goes in: where the right word depends on the sentence, a refusal cannot say what to write. The check is `make test-conventions`, in documents and comments alike; a span in backquotes is code and is not read.

### Do not hard-wrap paragraphs

One paragraph, or one bullet item, is **written on one line**; wrapping is left to the width of the reader's window.

**Do not pick a column and wrap by hand.** Markdown renders a newline inside a paragraph as a space, so a stray space appears mid-sentence. The wrap positions also move every time the text is edited, so the diff looks like a change in content.

### Escape vertical bars only inside tables

A notation containing `|`, such as the generic `<|T|>`, takes a preceding backslash **only inside a table row**. In prose it is written bare.

```
prose       `Option<|T|>`
table cell  `Option<\|T\|>`
```

* **A bare `|` inside a table splits the cell**, even inside backticks (GFM cuts the cells before reading their contents). Cells beyond the header's count are discarded, so the prose after `<|` disappears in the rendered page, and reading the source does not reveal it.
* **A backslash before it in prose shows up literally**: inside a code span (backticks) it is not an escape.
* To show the escaping itself, put it in a code block, where it comes out as written.
* The check is `make test-conventions`, which also checks that a table row's column count agrees with the header.

### A heading holds no double quote

**Write a quote inside a heading as `'`**, outside a code span. A comment or a document cites a heading by its text in double quotes, so a `"` inside the heading ends the citation early, and nothing checks that the citation still matches. `make test-docref` refuses such a heading. A code span may hold the notation it names (`` `~"..."` ``).

## Reference direction between documents

References are an asset: they are the shortest path to "why is it this way". The trouble is that they drift silently. So rather than cutting their number, **`make test-docref` checks every reference**, and the rules below also fix their direction.

### The layers

The layers, from the top, are these three.

| Layer | Contents | Role |
| :-- | :-- | :-- |
| index | The root `README.md`, `docs/` | Shows where everything is. **May point downward** |
| implementation | `ksplc/` / `std/` / `ksai/` / `kspeg/` / `ksos/` / `kssrv/` / `ksdb/` / `kspage/` | References among them go **only in the direction of import** (`ksplc→std`, `ksai→std`, `kspeg→std`, `ksos→std`, `kssrv→std`, `ksdb→std`, `kspage→std`, `ksplc→kspeg`, `ksos→ksai`, `kssrv→ksai`, `ksos→ksdb`, `kspage→ksdb`) |
| leaf | `tests/` / `tools/` | Point upward only |

`ksos→ksdb` and `kspage→ksdb` exist because both packages keep an append-only record (the record inside a device, and a document's change history). `ksdb/` itself uses only `std/`.

**Do not create the reverse.** Once `ksdb/` knows a particular device or document, the point of being able to use it anywhere is lost.

Caution: **Do not create sideways references between packages.** Pointing from `std/` at `ksplc/` or `ksos/` has no dependency behind it, so moving one end goes unnoticed. The same holds between `ksplc/`, `kssrv/` and the other packages.

**No edge goes from implementation to leaf, data included.** A package's examples and benchmarks stand inside it, so whatever is built on its parts goes with them ("13.8 A package's examples and benchmarks stand inside it" in [`DESIGN.md`](DESIGN.md)). The `ksos` Cortex-M demo embeds the weights in `ksai/examples/` through `ksos→ksai`, an arrow in the table. Do not copy the weights into `ksos/`: a copy makes two sets, and only the retrained one is current.

**Do not build a documentation signpost from implementation toward leaf.** "Which tool is built on these parts" and "which suite runs them" belong to the leaf (which may point upward) and the index (which may point downward). If an implementation holds them, a lower layer knows the names of its users and needs editing every time a user is added.

**When adding an edge of this shape, fix both the table and the check** (`make test-conventions` checks that they agree; the machine-readable list the check holds is `layer_to` in `tests/suite/docref_test.kspls`).

Note: **The code is read against the same table.** `embed` (baking contents in) is a reference between packages just as `import` is. So the check "import's and embed's directions are as the convention says too" in `make test-docref` reads both, and only those two, in `.kspls`. A path string opened at run time (one passed to `io.read_file`) and names written in build files escape it. A form that escapes is still a violation (Principle 8).

### Naming is not depending

**Keep "naming" and "depending" apart.** What the layer table forbids is creating a tie in a direction with no dependency. The two kinds below are dependencies in themselves, so the source names them even in a direction absent from the table.

| May be named | Example | What happens if it is not written |
| :-- | :-- | :-- |
| **One half of an implementation** | The bodies behind `std`'s `extern` are in `ksplc/gen/runtime/`, and the region holding the panic record is defined by `ksos/port/*/link.ld` | If a name drifts, it breaks silently. Whoever fixes one half cannot fix the other |
| **A premise behind a rule** | `Map`'s hashing is not randomized because `kssrv/`, `ksdb/`, and `kspage/` do not use `Map` | When the premise changes, the rule stays with nothing to show why |

**Anything whose name one package alone cannot fix is also "one half of an implementation"**: `ksplc/` matches names written in `std` (trait and operator names), desugars into calls on `std` (string interpolation, `for..in`, inserting `retain`/`release`), and rejects certain forms on sight (deciding use-after-free). In each case the pair is split across two packages, and when one half is renamed the other silently comes loose.

**Do not add these to the arrow table**: naming is not depending, so the set of directions `make test-docref` allows does not grow.

**Do not name anything that is not one of those.** "Who uses this" and "which test guards this" are not dependencies but signposts: the first belongs with the user, and the second is stated by the name of the make target (as in `make debug` / `make test-conventions`).

**Do not name a test's file**: when the test moves, the annotation in the lower layer is left stale.

**Links between documents are not made even for the two above.** Between `.md` files the check refuses on direction alone, so it allows no exception: an implementation half or a premise is named in the source (in an annotation), and documents link through the index.

Note: `make test-docref` checks that what is named exists, so a deleted name cannot rot silently.

### What a SPEC may point at

**`SPEC-<subject>.md` does not point at the `DESIGN.md` / `SPEC-*.md` of a folder below or beside it.** Once a specification depends on an implementation's design, replacing the implementation means editing the specification, and nothing decides which is canonical. Only the three below are allowed, and `make test-docref` accepts exactly these.

| Allowed reference | Reason |
| :-- | :-- |
| To an index (`README.md`) | Where things are is outside the specification's concern |
| Upward (to the language specification or design rationale in `docs/`) | A specification may rely only on agreements above it |
| **To the `DESIGN.md` in the same folder** (a `PLAN.md` there is treated the same) | They are edited together, so the same person notices when they drift |

Even within one folder, **do not copy the rule itself**: the specification holds the rule, and `DESIGN.md` holds why that rule was chosen. Written in both, the rule sooner or later loses an exception in only one of them.

**A `SPEC-<subject>.md` cites no `PLAN.md`, in any folder.** A specification relies only on what exists, and a plan holds only what does not; `make test-docref` refuses the reference.

### Writing a reference

**If a section number is written, name the document in the same sentence.** `make test-docref` reads two forms: a number with its document named, and a number in the current document. A bare `§N` that is neither has nothing to match against. Where the number can be avoided, pointing by the heading's name is sturdier.

| Form | Check |
| :-- | :-- |
| `SPEC-language.md §6.1`, or a link to the heading | Checks that it exists in that document |
| `§6.1` in this document | Checks that it exists here |
| `§6.1` with no document named nearby | **Fails** (nothing to match against) |

**There are gaps.** A paragraph that names document A is exempt as a whole, so a section number from document B written there escapes the check. A form that escapes still violates the rule.

**A link's destination is relative to the file it is written in.** The bare form (`kspage/README.md`) may also count from the repository root, but the destination of `[…](…)` counts from that file's folder, per Markdown's rules. `make test-docref` checks that it exists.

Caution: **Do not write `[I0301](description)`**: a `(` directly after `]` makes a link, so what was meant as a description becomes a link to a file that does not exist. To add a description, separate it: `[I0301] the description`.

**If you point at a heading by name, prefer a link.** A link's `](…#anchor)` must match a heading exactly, so it is the tightest check.

**A name in quotes beside the document is checked too**: `` `X.md`'s "Name" ``, `"Name" in X.md` and `` (`X.md`, "Name") `` alike. `make test-docref` accepts the name only where that document names things: inside a heading, inside a bold span, or at the head of a table cell or a list item. A mention anywhere else does not count: a document mentions its partner's names when it cites them back, and such a citation must not keep a renamed name alive. A quoted name is still looser than a link, because any part of a heading matches, so a wrong name survives as long as its words stay inside some heading.

**The anchor of a heading that starts with an emoji carries a leading hyphen.** The id of `## 🏗 Architecture` is `#-architecture`: the symbol drops out and the one remaining space becomes `-`. It looks like a typo but is correct; removing the hyphen makes `make test-docref` report that the heading does not exist.

**A `Phase N` is named with `README.md` nearby**, so the reader can trace the numbering to the root README ("Terms of art" above); `make test-docref` checks this too.

**A stage in another document is named with its document** ("the board material's stage 8", "the tools plan's stage 1"), since every plan counts its stages from 1.

## Linking documents to source

References are needed not only between documents but **between a document and the source**: from a design document to its implementation, from a specification to its check.

Caution: **Do not make it a round trip.** The grounds, and what is given up, are in [`DESIGN.md`](DESIGN.md), "Linking a design document to the source"; what lives here is only the rules.

* **The canonical source is the source, and there is one.** A document points at it and never copies it.
* **The direction is document → source only.** No marker on a symbol names a document.
* **Point by name** (file and symbol names), never by line number.
* **If what is pointed at is absent, it fails**: `make test-docref` refuses a deleted or renamed name.
* **A comment that points is read the same way** as a document's link.
* **Do not copy an example; point at the test.**

**Do not add markers in the source.** Markers are for things only a machine can tell (the provenance of a generated artifact, and a few others like it).

**What the check reads of a name** is a name in backticks tied to a file in backticks: `` `name` in `file` `` (or `of` / `inside`), a run `` `a` / `b` in `file` ``, and `` `name`(`file`) ``, in documents and comments alike. The file must exist and hold the name as a word; for `` `Owner.member` `` it must hold the member as well as the owner (why is "A comment that points is checked as a document is" in [`DESIGN.md`](DESIGN.md)). A form that escapes is still a violation: a name joined by "and", or a file named without backticks, is not read, but the rule applies to it all the same.

**In a comment, the compiler reads a dotted name tied to no file** through the commenting file's own scope, member and all. One that leads nowhere gets a warning (`[W0211]`; `ksplc explain W0211` gives what is read and what is left alone), and the same reading links it in the editor's hover (why is "A pointer that names no file is read through the commenting file's own scope" in [`DESIGN.md`](DESIGN.md)). A name another product owns is introduced as its owner's ("Python's `` `json.dumps` ``"); that is the one wording both readers leave alone.

**A description written in a source is read where it is written**: `ksplc doc` prints it as it stands, with nothing rendered beside it, so a relative link in it resolves from the source's folder, as in any comment.
