# Plain language for technical documents and reports

This specification sets rules for clear, consistent writing. It covers instructions, descriptions, messages and reports. The general and language rules apply across fields. Separate chapters add the rules for a field and a project.

## How the chapters fit together

| Chapter | What it sets | Reuse |
| :-- | :-- | :-- |
| The core | Meaning, vocabulary, instructions and structure | Keep across fields and languages |
| English | Grammar, wording and length limits | Keep for English; replace for another language |
| Field rules: software | Software text, names, comments and messages | Replace for another field |
| Project rules: Kanso | Scope, terminology sources, notation and checks | Replace for another project |

**The core and English chapters stand alone.** They require no software convention, project document or local glossary name. The field and project chapters supply those details without repeating the general rules.

### What a replacement chapter contains

A field chapter defines its technical terms, protected text and rules for its document types. It includes examples from that field. A project chapter names its readers, working language, terminology sources, document conventions and checks.

**Additional chapters must not silently change the general rules.** State each exception with the affected rule, its scope and the rule that applies instead. A narrower rule adds a requirement; an exception replaces one only within its stated scope. Examples do not create exceptions.

**Keep references pointing from specific chapters to general chapters.** Replacing a field or project chapter must not require edits to the core or language chapters. Keep general examples independent of local tools and names.

## The core

### Write for the reader's task

State who the text is for and what the reader must already know. Put the information needed for the task before background. Use headings that name what the reader can find or do.

**Preserve the meaning when simplifying text.** Keep conditions, limits, exceptions, responsibilities and uncertainty. Do not remove a necessary fact to meet a length limit. Split the sentence or explain the term instead.

### One word, one meaning

**Use each word with one meaning only, and use one word for each thing within the subject.** Use the same term in text, labels and tables. Do not alternate synonyms for variety.

| Avoid | Use |
| :-- | :-- |
| The form arrives. Check the document. Return the sheet. | The form arrives. Check the form. Return the form. |
| Use "close" for both ending an order and shutting a door | Use "complete the order" and "close the door" |

**Define a new technical term in the applicable glossary before using it.** Give its meaning and permitted use. Use ordinary words from a general dictionary where a technical term is unnecessary. The field and project chapters identify the applicable glossaries.

### Plain words

**Use the plain, common word that preserves the meaning.** Avoid idioms, metaphors, jokes and clever wording. Keep a necessary technical term and explain it for a reader who does not know it.

| Avoid | Use |
| :-- | :-- |
| kick off the inspection | start the inspection |
| give the proposal the green light | approve the proposal |
| under the hood | inside |

**Use the language's usual expression.** Do not translate a phrase word by word from another language. Use examples that readers can understand without local or cultural knowledge.

### One topic, one sentence

**Put one topic in a sentence.** Split independent facts into separate sentences. Keep a condition with the action it controls. An instruction gives one action; ordered actions belong in separate steps. The language chapter sets the length limits.

### The actor and the action come first

**Name who or what acts, then the action.** Make each pronoun's reference clear. Repeat a noun where "it", "this" or "they" could refer to more than one thing.

Put a condition before the instruction that depends on it. Write "If the form is incomplete, return it to the applicant." Prefer a sentence that names the actor.

### Instructions

**Write an instruction as a command:** "Complete the form." **Give one instruction per step.** Use a numbered list when order matters. State prerequisites before the steps that need them.

Put a caution before the action to which it applies. State a result separately when the reader must check it. Describe how the reader can recognize completion or failure. Keep an explanation separate from the action it explains.

### Requirement and possibility

**Distinguish a requirement, a prohibition, a recommendation and a possibility.** Do not present an uncertain outcome as a promise. The language chapter specifies the words for these meanings.

### Quantities and conditions

**Give the unit with a quantity where its meaning depends on that unit.** State whether a limit includes its endpoint. Use an unambiguous date format where readers could interpret a numeric date differently. Do not replace a stated tolerance or condition with a vague word such as "about".

### Paragraphs and structure

* **Give the result or rule first, then the details.** A report states the outcome, supporting evidence and remaining limits.
* **Keep each paragraph to one topic and at most six sentences.**
* **Use lists for parallel items and tables for comparisons.** A comparison of before and after belongs in a table.
* **Use parallel wording for parallel items.** If one instruction starts with a command, the others do too.

### What the rules do not touch

**Keep required names, labels, symbols and exact quotations unchanged.** Identify quoted text as a quotation. Explain an unfamiliar term outside the protected text. Do not alter a required name to make it simpler.

The field chapter identifies text that must keep its exact spelling. Protected text is exempt from rewriting and word limits. The surrounding explanation follows the writing rules. Ordinary prose must not be marked as protected text to avoid a rule.

## English

### Length

| Kind of sentence | At most |
| :-- | :-- |
| An instruction | 20 words |
| A description | 25 words |
| A heading | 10 words |

**A list item and a table cell follow the same limits.** Exclude protected text when counting words. Keep the necessary meaning when dividing a long sentence. A short sentence must still identify the action and its conditions.

### Voice

**Write in the active voice.** Write "The inspector checks the form", not "The form is checked by the inspector". Use the passive only in a description where the actor is unknown or does not matter. Do not use it in an instruction.

### Verbs

* **Use simple tenses.** Use the present for current facts, the past for past events, and the future for future actions.
* **Use a verb instead of a noun made from it.** Write "inspect the container", not "perform an inspection of the container".
* **Prefer one verb to a longer phrase with the same meaning.** Use "remove" instead of "get rid of". Keep an established term when substitution would change its meaning.

### Words for requirements

| Meaning | Wording |
| :-- | :-- |
| Required action | must |
| Forbidden action | must not |
| Possibility or permitted action | can; state permission explicitly when the distinction matters |
| Recommendation | recommend; identify who recommends the action |
| Uncertain outcome | can occur, or an explicit statement of uncertainty |

**Do not use "may", "should" or "might" in a rule.** A direct command states the required action in a procedure. Do not use "cannot" when the intended meaning is a prohibition.

### Short forms

**Do not use contractions:** write "does not", not "doesn't". Expand an abbreviation at first use, followed by its short form. An abbreviation needs no expansion if the applicable glossary defines it or the intended readers know it as the usual name.

### Articles and small words

**Keep articles and other words needed for clear grammar.** Keep "the", "a" and "an", and keep "that" where it marks a clause. Do not shorten a sentence by removing words that show how its parts relate.

### Noun groups

**A noun group contains at most three words.** Break a longer group with a preposition. Write "the date for replacing the filter", not "the filter replacement target date".

### Joined facts

**Check sentences joined by "and", "but", "which" or a semicolon.** Split them when they contain independent topics. Keep a necessary condition or qualification with the fact it limits.

## Field rules: software

### Protected software text

Keep code, identifiers, file names, paths, commands and options exactly as required. Keep quoted program output unchanged. Keep product, standard and programming-language names, including their technical terms.

A code block or a span in backquotes does not count toward word limits. Do not put ordinary explanatory prose in backquotes to avoid a limit.

### Software terminology

Use established software terms with their technical meanings. Write "the caller", not "the calling side", and "an entry point", not "a mouth". Define terms that are specific to the product in its glossary.

### Comments in source

Comments follow the general and English rules. Each comment line follows the sentence limits. Keep code separate from prose. The project chapter sets comment markers, summary conventions and size limits.

### Diagnostic messages

**State what is wrong, then what the reader can do.** Use separate sentences for the problem and the action. For example: "This byte does not form a valid character. Save the file as UTF-8."

Do not claim an action succeeded unless the program has established that result. If no recovery action is known, state the failure without inventing a remedy.

## Project rules: Kanso

### Scope and language

These rules apply to every Kanso document, source comment, diagnostic message and report to a person. Repository text is written in English. The core, English and software chapters all apply.

[`SPEC-documents.md`](SPEC-documents.md) sets document names, headings, markers and links.

### Terminology sources

Kanso's canonical terminology sources are:

* "Terms of art" in [`SPEC-documents.md`](SPEC-documents.md).
* "Words used throughout" in [`SPEC-documents.md`](SPEC-documents.md).
* Each package's glossary for its own terms.

Use "fire" for a check and "raise" for an interrupt. Keep another product's vocabulary in that product's terms. The rule is "Another language's vocabulary stays in that language's words" in [`SPEC-documents.md`](SPEC-documents.md).

### Comment notation and limits

The first line of a `//<` comment is its one-line summary, and the detail starts on the next line with no empty `//<` between them ("2.1 Comments" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). Write a short sentence or phrase without a final full stop. **Keep each comment to at most six lines, or ten lines for a file's opening header.** Every comment line before the next code line counts. A blank line does not start a new comment. A section divider opening with `---` or `===` starts a new subject and a new comment. A `//<` run's summary and a line a gate reads (`// EXPECT:`) do not count. An empty `//<` parts two paragraphs of a detail, and the count starts again after it. `ksplc explain H0806` gives the whole count.

**Comments occupy at most 30% of the hand-written source.** This is the repository-wide share, shown as `cmt%` on `tools/repo_stat.kspl`'s `total (hand-written)` line. Individual files may exceed it.

### Document tense and reports

Documents state the present behavior and its reasons. Use the past in reports of completed work and the future in plans. A work report states the result, supporting checks and anything not checked.

### Checking the rules

`make test-conventions` checks published document sentence and heading lengths. `make lint` checks a comment's length. Neither establishes compliance with every writing rule. Review meaning, terminology, instructions and the remaining limits separately. The checks and their scope are specified in [`SPEC-gates.md`](SPEC-gates.md).
