# ==================================================================
# mk/help.mk — `make help` (the list of what can be typed)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# **The make files are the list's canonical source**: a target's description is the one line
# above its rule, `## <group>|<target>|<description>`, `<group>` being a name in $(HELP_GROUPS).
# A `<target>` ending in `*` is a **family** (`debug-*`); **the `*` goes at the end and nowhere
# else**: `tests/suite/recipe_bytes_test.kspl` reads what precedes it as a prefix, and matches the
# descriptions against `.PHONY`: **leave no typable target without one**. **The plain name
# carries the whole job, and a variant takes a suffix**; **leave no alias behind on a rename**, so
# an old spelling answers "No rule to make target" rather than quietly doing something else.
# ==================================================================
# The files searched: `$(MAKEFILE_LIST)` holds only those read so far (so this comes last), and
# macOS's make can drop `mk/` files from it or `$(wildcard)`, so **the union** is taken. **No check
# that stops here**: run at load, it would stop whatever target was typed.
HELP_FILES := $(sort Makefile $(MAKEFILE_LIST) $(wildcard */*.mk))

export HELP_GROUPS := Build-and-install Local-cycle Gates Run Measure-and-inspect Per-item
# **`Per-item` is described but not listed**: one item of a gate, made so `-j` can run them side by
# side (`lint-one-*`). Listed, they would outnumber what a person types.
export HELP_UNLISTED := Per-item

# Caution: **ASCII only, `#` as `\#`, no tab heading a continuation** (above Makefile's `include`).
help_prog := function pad(s, n) { while (length(s) < n) { s = s " " } return s } \
  /^\#\# / { s = substr($$0, 4); \
    i = index(s, "|"); if (i == 0) { next } \
    g = substr(s, 1, i - 1); sub(/ +$$/, "", g); s = substr(s, i + 1); \
    i = index(s, "|"); if (i == 0) { next } \
    spec = substr(s, 1, i - 1); sub(/ +$$/, "", spec); \
    c[g]++; SP[g, c[g]] = spec; DE[g, c[g]] = substr(s, i + 1); \
    if (length(spec) > w) { w = length(spec) } } \
  END { n = split(ENVIRON["HELP_GROUPS"], ord, " "); \
    for (k = 1; k <= n; k++) { g = ord[k]; if (!(g in c) || index(" " ENVIRON["HELP_UNLISTED"] " ", " " g " ")) { continue } \
      printf "\n%s\n", g; \
      for (j = 1; j <= c[g]; j++) { printf "  make %s  %s\n", pad(SP[g, j], w), DE[g, j] } } }

define help_head
What can be typed with make. Within a group they are ordered from what is typed most often.
endef
define help_foot

The options and variables (PREFIX / LLVM / FMT_JOBS and the like) are explained in docs/CONTRIBUTING.md.
What each one does is written just above that target's rule (the notation is in mk/help.mk's header).
What one target is made of, its variables and settings included: make explain T=<target>.
One item of a gate (the group Per-item, there for -j) is described beside its rule but not listed.
endef
export help_head
export help_foot

## Measure-and-inspect|help|List what can be typed, by group (this listing)
help:
	@printf '%s\n' "$$help_head"
	@awk '$(help_prog)' $(HELP_FILES)
	@printf '%s\n' "$$help_foot"

# --- What one target is made of (`tools/make_explain.kspl`) --- **Make answers, not this file**:
# the tool reads make's own database and `make -n`, so it cannot drift from the make files. The
# settings typed with it (`MODEL=`) reach it in `MAKEFLAGS`; `T` and `LOGGING` are this call's own.
# **The seed runs it**, so a compiler broken by the change at hand does not stop the explanation.
## Measure-and-inspect|explain|Say what one target is made of: where it is written, what it needs, its commands filled in, the variables it reads and the settings it takes (`T=<target>`, `T=<folder>:<target>`)
explain: $(SEED_EXE)
	@./$(SEED_EXE) run tools/make_explain.kspl --make=$(call shq,$(ci_make)) --not-settings=T,LOGGING -- $(call shq,$(T))

.PHONY: help explain
