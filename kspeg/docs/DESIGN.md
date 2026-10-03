# The design decisions of kspeg

`kspeg` reads a PEG grammar and runs it directly. This document holds **why it took this shape**, and what each choice gives up. The notation and what an engine must do are in [`SPEC-notation.md`](SPEC-notation.md); each file's job is in [kspeg](../README.md).

## Contents

* [The grammar is interpreted, not turned into code](#the-grammar-is-interpreted-not-turned-into-code)
* [A grammar is checked when it is read](#a-grammar-is-checked-when-it-is-read)
* [Lexical rules are not memoized](#lexical-rules-are-not-memoized)
* [A run of keywords is looked up once](#a-run-of-keywords-is-looked-up-once)
* [A rule that cannot begin with the next byte is not entered](#a-rule-that-cannot-begin-with-the-next-byte-is-not-entered)
* [Indentation becomes markers before the parse](#indentation-becomes-markers-before-the-parse)
* [The profile counts calls, not time](#the-profile-counts-calls-not-time)
* [How the engine is split across files](#how-the-engine-is-split-across-files)

---

## The grammar is interpreted, not turned into code

ANTLR and yacc turn a grammar into parser source with a tool of their own, which the build then runs. **kspeg has no such step**: the engine, written in KSPL, reads the `.kspeg` file at run time. So a program using it needs no generator, neither installed nor run in its build, and nothing but the engine and the grammar.

## A grammar is checked when it is read

**Every reference is checked once, as soon as the grammar is read.** A grammar is read once and reused, so this one walk costs nothing per parse.

**The check is not put off until parsing.** A name is looked up when its rule is applied, so an undefined name would show only on a run that reached that branch. A reference in an unmatched alternative, an optional or a repetition may never run: the parse succeeds, and the grammar's author believes the rule takes effect.

**A rule defined twice is refused** because one of the two definitions would never be used, and which one wins is not something the grammar's author can see.

**Left recursion is refused too.** A rule that can enter itself again before reading a character never matches: under PEG each entry enters it again at the same position, until the depth limit stops the parse, and only on inputs that reach it. Skipping rules by their first byte (below) would make that worse: a skipped entry does not stop, so whether the parse stopped would depend on the next byte. The analysis that works out what a rule can begin with also says what can match nothing, so finding the cycle costs one more walk.

**The report names the rule that refers to the missing name.** Several rules can refer to one name, and without the referrer there is no one place to look. The report holds no line and column inside the `.kspeg`: a grammar may be built into an executable, where a position could point at a file nobody can open.

## Lexical rules are not memoized

A lexical-mode rule (an upper-case initial) works one character at a time. Storing its answer in the memo table often costs more than the re-parse a hit saves, so only syntax-mode rules are memoized.

## A run of keywords is looked up once

A choice written as keywords, such as a language's built-in type names (`'int' | 'long' | ... | 'bool'`), is tried one keyword at a time as written. At a position holding an identifier, every keyword fails in turn, and a grammar may ask that choice at every position a type can stand. **As the grammar loads, each run of two or more keywords inside a choice becomes one rule**: cut out the run of boundary characters, then look it up once in a hash table (`fold_keyword_choices` in [`../rule.kspls`](../rule.kspls)). The synthesized `_Keyword` is folded the same way.

**Only where the result cannot differ.** A keyword matches only when no boundary character follows, so where `_Boundary` is one character class and every keyword is written with its characters, a keyword matches exactly when it equals the whole run. At most one keyword of the run can match at a position, so their order among themselves decides nothing. The alternatives around the run keep their places. Elsewhere the run stays a choice.

**Folding changes no syntax error either.** A choice records a label for each keyword it fails on, also before the one that matches, and then marks those as not what stopped the parse. The folded rule records the same labels in the same order. Those marks are read even on success, where unread text remains. Dropping them made a case in [`../tests/engine_test.kspls`](../tests/engine_test.kspls) fail: those cases parse each input under a grammar that folds and under its twin that cannot, and require the same tree and labels.

**What it buys depends on the grammar**: how many keywords a choice holds, and how often it is asked. Counting instructions under callgrind shows it where wall time varies too much to. The rest of a parse's cost is attempts that fail at their first byte on rules other than keywords (below).

## A rule that cannot begin with the next byte is not entered

Most of a parse is attempts that fail at their first byte. A grammar for a programming language tries several alternatives at each expression before the plain one, and each attempt enters the rule, looks in the memo, builds a node and throws it away; most of the nodes built never reach the tree. **As the grammar loads, the engine works out for each rule the bytes a match can begin with, and whether it can match nothing** (`compute_first_bytes` in [`../rule.kspls`](../rule.kspls), a fixed point because rules refer to each other). Before entering a rule that cannot match nothing, one bit test on the next byte decides whether it is entered at all.

**The bytes err only on the side of too many.** A lookahead reads nothing, so it adds none and can match nothing; `.` and a recovery branch allow every byte. In syntax mode the next byte is the one after whitespace, read where the engine skips it anyway. A syntax-mode rule entered from a lexical one skips whitespace itself before its first byte, so there it is always entered, and a lexical rule that begins with one allows every byte.

**A syntax error is read from a second run that skips nothing.** A skipped rule records no label, so the skipping run's `expected …` would come up short. A run that fails, or leaves text other than whitespace unread, is run again without skipping, and its report is the one returned. That run costs only where a file holds a syntax error, and it gives the message the engine gave before, byte for byte. `ran_twice` says when it happened: on input that parses, it would mean a rule was skipped where it could have matched.

**Only references are checked**, not every alternative. A reference is where an attempt costs most: the memo lookup, the node and the restore all sit behind it. A literal already fails at its first byte for the price of the check itself.

**What it buys depends on the grammar** too: the more of its attempts fail at their first byte, the more are skipped. A grammar that seldom guesses wrong gains little.

**What it gives up:** the depth limit counts the rules entered, so near the limit an input the engine stopped on before can pass. The limit is a safety valve at a depth ordinary code never reaches. The profile counts only the rules entered, too.

## Indentation becomes markers before the parse

**The engine sees bytes, not columns.** To read indentation itself, it would need four things it lacks.

| What is missing | Why it is needed |
| :-- | :-- |
| **A means of counting the column** | Nothing tells how many spaces a line begins with; the engine holds only the byte position |
| **A means of saying whether it is at a line's head** | Lookahead (`&` / `!`) only looks forward, so "the byte just before is a `\n`" cannot be written locally. A grammar where every line begins after a consumed newline guarantees it by its shape, but that **cannot be made a part** such as a `_LineStart` |
| **State during the parse** | Indentation needs a stack of columns. The engine holds only the position, the furthest failure position, the mode's options and the memo, so there is nowhere to put one |
| **A predicate that looks at a value** | The operators are concatenation, choice, repetition and lookahead; **none decides success from a value**, so "the current column > the top of the stack" cannot be written |

**State inside the engine is not taken, because it breaks two things at once.** Fixing only one of them still breaks silently.

* **The state must be restored on a backtrack.** The engine restores only the position. A stack would have to be restored with it wherever a choice, a `?`, a `*`, a `+` or a lookahead fails; otherwise a column a failed alternative pushed stays behind.
* **The state must go into the memo key**, for correctness, not speed. The key is `(rule, position, mode)`. Trying the same rule at the same position under a different column makes packrat return the first answer for the second.

PEG implementations that added such state (stack operations or semantic predicates) have known cases of breaking with memoization. Python, ANTLR's Python grammar and tree-sitter instead have a lexer or an external scanner emit indent tokens, which the parser consumes as ordinary terminals. The requirement in "13. How to handle a language that depends on indentation" in [`SPEC-notation.md`](SPEC-notation.md) takes that shape.

**The markers go at line ends so that positions survive.** PureScript, CoffeeScript and F# insert a zero-width token and leave the bytes alone, so no position moves. kspeg reads bytes, so a marker has to be text. Placed at a line's end, it leaves every line number as it is, and only the end of a marked line shifts.

**What this gives up is syntax where a parse failure closes a block.** Haskell's layout rule closes a block where the next token cannot continue under the grammar but a `}` could. So GHC handles indentation in both the lexer and the parser. One pass beforehand cannot do that, since that pass would have to know the grammar. PureScript leaves that syntax out, and so does KSPL's grammar; adding such syntax reopens this decision.

## The profile counts calls, not time

Reading the clock at each of a parse's million rule references would add work and skew the breakdown. **A count repeats exactly** for the same input and grammar, on any machine under any load. Failures are `calls - memo hits - successes` (`Rule_prof` in [`../engine.kspls`](../engine.kspls)).

## How the engine is split across files

**The imports run one way** (`engine` → `expected` and `engine` → `memo`), and each split keeps them so.

**`Target` holds `Fail_track` from [`../expected.kspls`](../expected.kspls) as one field (`fail`).** `is_suppressed` stays in `Target` as the mode of the engine applying the rules. `track_fail`, which decides whether to record a failure, stays in `engine`.

Caution: **Do not hand that decision to the callers.** If `is_suppressed` is passed around, one caller that forgets it records a failure inside a suppressed token as an expectation for the user.

**The memo table is generic over what it holds**: `Memo_table<|V|>` in [`../memo.kspls`](../memo.kspls) never names a node.
