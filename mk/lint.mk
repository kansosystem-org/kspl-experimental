# ==================================================================
# mk/lint.mk — formatting and static analysis (fmt / lint)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==================================================================
# fmt takes every *.kspl but `FMT_UNTOUCHED`: ksplc/tests/negative/ (broken on purpose) and
# ksplc/tests/lint/, whose disordered columns **disappear once formatted**.
FMT_UNTOUCHED := ksplc/tests/negative ksplc/tests/lint
FMT_JOBS ?= $(HOST_CORES)

# The files fmt takes, one a line: the tracked and the untracked that are not
# ignored, as git lists them, less `FMT_UNTOUCHED`, and only those that stand.
# Caution: **Ask git, do not walk the folder.** A walk also enters what is ignored, an ignored
# worktree nested inside the clone among it, and there `FMT_UNTOUCHED`'s paths no longer match,
# so another checkout's broken-on-purpose fixtures are formatted. **Exclude what is ignored but not
# the untracked**: a new file is formatted before its `git add`.
FMT_LIST = { git ls-files '*.kspl'; \
    git ls-files --others --exclude-standard '*.kspl'; } \
    $(foreach d,$(FMT_UNTOUCHED),| grep -v '^$(d)/') | sort -u \
    | while IFS= read -r f; do if [ -f "$$f" ]; then printf '%s\n' "$$f"; fi; done

# **Where git cannot list the files, fmt and lint stop**, as the suites do (`tracked` in
# `tests/support/harness.kspl`). An empty list would pass, having formatted or found nothing, and
# lint would check only the files named by hand. A copy without `.git` (a downloaded archive)
# needs one `git init`: the untracked files are listed then too. The check costs one `git ls-files`.
# Caution: **Stop in a recipe, not when the file is read**: every other target must still work.
# **`GIT_UNLISTED` comes first among the prerequisites**, so it stops the run before a lint starts.
git_unlisted := $(shell git ls-files > /dev/null 2>&1 || echo 1)
GIT_UNLISTED := $(if $(git_unlisted),git-unlisted)
define git_unlisted_help
git cannot list this folder's files (git ls-files), so make cannot find what to format or lint.
  In a copy without .git, run `git init` once: git then lists the files that are not committed too
endef
git-unlisted:
	$(if $(git_unlisted),$(error $(git_unlisted_help)))

## Local-cycle|fmt|Format every tracked `.kspl` (`FMT_JOBS=1` for one at a time)
fmt: $(GIT_UNLISTED) $(SEED_EXE)
	@set -o pipefail; mkdir -p $(TMP_DIR); log=$(TMP_DIR)/fmt.log; : > "$$log"; \
	list=$(TMP_DIR)/fmt_files; \
	$(FMT_LIST) | tr '\n' '\0' > "$$list"; \
	n=$$(tr -cd '\0' < "$$list" | wc -c); \
	echo "# RUNNING KSPL FORMATTER ($$n files, $(FMT_JOBS) jobs)"; \
	xargs -0 -P $(FMT_JOBS) -n 32 "$$PWD/$(SEED_EXE)" fmt $(KSPL_FMT) < "$$list" \
		> /dev/null 2>> "$$log" \
		|| { cat "$$log" >&2; exit 1; }

# **A source is an entry point by its `fn main`**: a line that opens with `fn main(` or
# `pub fn main(`, outside a `"""` string (a suite writes the programs it runs into such strings).
# So a new program is linted with no list to edit. The sources are those `FMT_LIST` takes, for its
# reasons, less `LINT_FIXTURES`. `make test-conventions` holds this rule to its own copy, `is_entry`.
# Caution: **Count no `"""` on a `//` line outside a string**, as `is_entry` does.
# The pattern is a variable, since a `(` written inside `$(shell …)` would end the call.
lint_main_re := ^(pub )?fn main[(]
lint_main_prog := FNR == 1 { raw = 0 } \
  !raw && /$(lint_main_re)/ && !(FILENAME in hit) { hit[FILENAME] = 1; print FILENAME } \
  !raw && /^[ \t]*\/\// { next } \
  { if (gsub(/"""/, "&") % 2) raw = !raw }

# The folders of a suite's material, each linted by its suite and not here: the sources diagnose by
# design (`negative/`, `parse/`, `lint/`), stop on purpose (`runtime/`), or import what the suite
# writes beside them (`ship/`). `make test-conventions` reads this list.
LINT_FIXTURES := ksplc/tests/negative ksplc/tests/parse ksplc/tests/lint ksplc/tests/runtime \
  ksplc/tests/ship

# Caution: **Pass the paths through a pipe, not as arguments**: hundreds of them on one command line
# pass the length Windows allows. git's own complaint is left out: `git_unlisted` above says why.
LINT_MAINS := $(shell { git ls-files; git ls-files --others --exclude-standard; } 2> /dev/null \
  | grep '\.kspl$$' | grep -v $(foreach d,$(LINT_FIXTURES),-e '^$(d)/') \
  | while IFS= read -r f; do if [ -f "$$f" ]; then printf '%s\n' "$$f"; fi; done \
  | tr '\n' '\0' | xargs -0 grep -lE '$(lint_main_re)' | tr '\n' '\0' \
  | xargs -0 awk '$(lint_main_prog)')

# Entries called from outside their I0402 package: linted with it off, their callers with it on.
# Every ksplc suite stands on its harness, which the root's suites call too.
LINT_SUITES_OWN := $(wildcard ksplc/tests/suite/*.kspl)
LINT_TARGETS_OWN := ksplc/tests/main.kspl ksos/tests/main.kspl ksagent/tests/main.kspl \
	tools/tests/main.kspl tools/repo_stat.kspl tools/seed_sum.kspl $(LINT_SUITES_OWN)

# The bare-metal demos and the page's wasm bridge, linted with `--freestanding`. They hold no `main`.
LINT_TARGETS_FREE := $(wildcard ksos/demo/cortex_m/*.kspl) \
	$(wildcard ksos/demo/rp2040/*.kspl) $(wildcard ksos/demo/nrf51/*.kspl) \
	ksmd/port/web/bridge.kspl

# The entries named by hand hold no `main`: libraries also linted on their own (`ksos/net/` and the
# opener's two files), and every file of `ksplc/tests/prog/`, its helpers too. **`ksplc/main.kspl`
# comes first**: its lint takes longest, so `make -j` starts it first.
lint_named := ksplc/main.kspl ksos/net/mini_ipv4.kspl ksos/net/tcp_conn.kspl \
	tools/opener_aim.kspl tools/opener.kspl $(wildcard ksplc/tests/prog/*.kspl)
LINT_TARGETS := $(lint_named) \
	$(filter-out $(lint_named) $(LINT_TARGETS_OWN) $(LINT_TARGETS_FREE),$(LINT_MAINS))

# **Only ksai holds a `#cfg(blas)` branch** (`make test-conventions` holds it there), so its tests
# are linted a second time with the branch on. The item's name ends in `-blas`, as the file is
# also a plain item of `LINT_TARGETS`.
LINT_TARGETS_BLAS := ksai/tests/main.kspl

# $(call lint_clean,<log>,<what was linted>,<ksplc's exit status>): passes where ksplc ended with 0
# and the log's whole tally line counts nothing down to Hint, and otherwise shows it and fails.
# Caution: **Match the whole line.** A count is written in digits, so a part of the line matches
# "10 error(s), 0 warning(s), …" too, and 50 is where ksplc stops counting.
LINT_TALLY_CLEAN := Finished with 0 error(s), 0 warning(s), 0 information(s), and 0 hint(s).
lint_clean = if [ $(3) -eq 0 ] && grep -qxF "$(LINT_TALLY_CLEAN)" $(1); then :; \
	else cat $(1); echo "LINT FAILED: $(2)"; exit 1; fi

# $(call lint_run,<file>,<options>,<log name>): one lint of one file, judged by `lint_clean`.
# Caution: **Zero down to Hint**, one run = one log (a shared log is overwritten).
lint_run = echo "  -> $(1) $(2)"; log=$(LINT_LOG_DIR)/$(3).log; \
	./$(STAGE1_EXE) lint $(2) $(1) > $$log 2>&1; status=$$?; \
	$(call lint_clean,$$log,$(strip $(1) $(2)),$$status)

# $(call lint_one_rule,<file>,<options>[,<name suffix>]): the item `lint-one-<file><suffix>`.
define lint_one_rule
lint-one-$(subst /,_,$(1))$(3): $$(STAGE1_EXE)
	@$$(call lint_run,$(1),$(2),$(subst /,_,$(1))$(3))
endef
$(foreach f,$(LINT_TARGETS),$(eval $(call lint_one_rule,$(f),)))
$(foreach f,$(LINT_TARGETS_FREE),$(eval $(call lint_one_rule,$(f),--freestanding)))
$(foreach f,$(LINT_TARGETS_OWN),$(eval $(call lint_one_rule,$(f),--lint=I0402=off)))
$(foreach f,$(LINT_TARGETS_BLAS),$(eval $(call lint_one_rule,$(f),--define=blas,-blas)))
LINT_ONE_TARGETS := $(addprefix lint-one-,$(subst /,_,$(LINT_TARGETS) $(LINT_TARGETS_FREE) \
  $(LINT_TARGETS_OWN)) $(addsuffix -blas,$(subst /,_,$(LINT_TARGETS_BLAS))))

## Local-cycle|lint|Static analysis. Zero down to hints is a pass
lint: $(GIT_UNLISTED) $(LINT_ONE_TARGETS)
	@echo "RESULT: ALL PASS ($(words $(LINT_ONE_TARGETS)) lint targets clean)"

## Per-item|lint-one-*|One file's worth of `make lint` (named by its path, `/` becoming `_`; `-blas` ends the `#cfg(blas)` reading)
.PHONY: $(LINT_ONE_TARGETS)
