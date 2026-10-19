# ==================================================================
# mk/lint.mk — formatting and static analysis (fmt / lint / lint-cfg)
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

## Local-cycle|fmt|Format every tracked `.kspl` (`FMT_JOBS=1` for one at a time)
fmt: $(SEED_EXE)
	@set -o pipefail; mkdir -p $(TMP_DIR); log=$(TMP_DIR)/fmt.log; : > "$$log"; \
	list=$(TMP_DIR)/fmt_files; \
	$(FMT_LIST) | tr '\n' '\0' > "$$list"; \
	n=$$(tr -cd '\0' < "$$list" | wc -c); \
	echo "# RUNNING KSPL FORMATTER ($$n files, $(FMT_JOBS) jobs)"; \
	xargs -0 -P $(FMT_JOBS) -n 32 "$$PWD/$(SEED_EXE)" fmt $(KSPL_FMT) < "$$list" \
		> /dev/null 2>> "$$log" \
		|| { cat "$$log" >&2; exit 1; }

# **A tool is an entry point by its `fn main`**, so a new one cannot leak out of the gate; a file of
# tools/ without one is a library, linted through the tools that import it.
TOOL_MAINS := $(shell grep -lE '^(pub )?fn main\b' tools/*.kspl)

# Entries called from outside their I0402 package: linted with it off, their callers with it on.
# Every ksplc suite stands on its harness, which the root's suites call too.
LINT_SUITES_OWN := $(wildcard ksplc/tests/suite/*.kspl)
LINT_TARGETS_OWN := ksplc/tests/main.kspl kspage/tests/main.kspl ksos/tests/main.kspl \
	tools/tests/main.kspl \
	kspage/tests/fuzz_main.kspl tools/repo_stat.kspl tools/seed_sum.kspl $(LINT_SUITES_OWN)

# Caution: **Keep tests/debug/main.kspl**: some code (std/regex, generics) is reached only from it.
# **Suites, `ksplc/tests/prog/` and the POSIX demos come by wildcard**: nothing else lints their
# routes, and a named list leaks a new one out of the gate.
LINT_TARGETS := ksplc/main.kspl tests/debug/main.kspl ksai/examples/llama_engine/main.kspl \
	ksai/examples/qwen_infer/main.kspl ksai/examples/fim_coder/main.kspl \
	ksai/benches/bench_train.kspl \
	ksos/net/mini_ipv4.kspl ksos/net/tcp_conn.kspl kssrv/main.kspl \
	tools/ai_assist/build_corpus.kspl tools/ai_assist/eval_fim.kspl tools/ai_assist/make_fim.kspl \
	tools/ai_assist/train_bpe.kspl \
	ksos/port/rp2040/pad_checksum.kspl ksos/port/rp2040/elf2uf2.kspl \
	$(filter-out $(LINT_TARGETS_OWN),$(TOOL_MAINS)) tools/kspage_aim.kspl tools/tests/open_together.kspl \
	ksai/benches/run_bench.kspl \
	kspage/port/web/bundle.kspl kspage/content/example.kspl kspage/tests/open_prog.kspl ksai/tests/read_prog.kspl \
	std/tests/read_prog.kspl $(filter-out $(LINT_TARGETS_OWN),$(wildcard */tests/fuzz_main.kspl)) \
	ksai/tests/main.kspl ksbind/tests/main.kspl ksdb/tests/main.kspl kspeg/tests/main.kspl \
	kssrv/tests/main.kspl \
	std/tests/main.kspl \
	kssrv/tests/copy.kspl ksai/tests/examples_main.kspl \
	ksai/tests/stops_main.kspl ksai/tests/stops.kspl ksplc/tests/filepath/main.kspl \
	$(wildcard ksos/demo/posix/*.kspl) \
	$(wildcard tests/suite/*.kspl) \
	$(wildcard tests/tools/*.kspl) \
	$(wildcard ksplc/tests/prog/*.kspl) \
	$(wildcard ksplc/tests/notation/*.kspl) \
	$(EXTRA_LINT_TARGETS)

LINT_TARGETS_FREE := $(wildcard ksos/demo/cortex_m/*.kspl) \
	$(wildcard ksos/demo/rp2040/*.kspl) $(wildcard ksos/demo/nrf51/*.kspl) \
	kspage/port/web/bridge.kspl

# $(call lint_clean,<log>,<what was linted>,<ksplc's exit status>): passes where ksplc ended with 0
# and the log's whole tally line counts nothing down to Hint, and otherwise shows it and fails.
# Caution: **Match the whole line.** A count is written in digits, so a part of the line matches
# "10 error(s), 0 warning(s), …" too, and 50 is where ksplc stops counting.
LINT_TALLY_CLEAN := Finished with 0 error(s), 0 warning(s), 0 information(s), and 0 hint(s).
lint_clean = if [ $(3) -eq 0 ] && grep -qxF "$(LINT_TALLY_CLEAN)" $(1); then :; \
	else cat $(1); echo "LINT FAILED: $(2)"; exit 1; fi

# Caution: **Zero down to Hint**, one file = one target and log (a shared log is overwritten).
define lint_one_rule
lint-one-$(subst /,_,$(1)): $$(STAGE1_EXE)
	@echo "  -> $(1) $(2)"
	@log=$$(LINT_LOG_DIR)/$(subst /,_,$(1)).log; \
	./$$(STAGE1_EXE) lint $(2) $(1) > $$$$log 2>&1; status=$$$$?; \
	$$(call lint_clean,$$$$log,$(1),$$$$status)
endef
$(foreach f,$(LINT_TARGETS),$(eval $(call lint_one_rule,$(f),)))
$(foreach f,$(LINT_TARGETS_FREE),$(eval $(call lint_one_rule,$(f),--freestanding)))
$(foreach f,$(LINT_TARGETS_OWN),$(eval $(call lint_one_rule,$(f),--lint=I0402=off)))
LINT_ONE_TARGETS := $(addprefix lint-one-,$(subst /,_,$(LINT_TARGETS) $(LINT_TARGETS_FREE) \
  $(LINT_TARGETS_OWN)))

## Local-cycle|lint|Static analysis. Zero down to hints is a pass
lint: $(LINT_ONE_TARGETS)
	@echo "RESULT: ALL PASS ($(words $(LINT_ONE_TARGETS)) lint targets clean)"

## Per-item|lint-one-*|One file's worth of `make lint` (named by its path, `/` becoming `_`)
.PHONY: $(LINT_ONE_TARGETS)

# **Only ksai holds a `#cfg(blas)` branch** (`make test-conventions` holds it there), so its tests
# are the program read with the branch on.
## Local-cycle|lint-cfg|The semantic analysis inside the `#cfg(blas)` branch
lint-cfg: $(STAGE1_EXE)
	@echo "  -> ksai/tests/main.kspl [blas]"
	@log=$(LINT_LOG_DIR)/cfg_blas.log; \
	./$(STAGE1_EXE) lint --define=blas ksai/tests/main.kspl > $$log 2>&1; status=$$?; \
	$(call lint_clean,$$log,ksai/tests/main.kspl [blas],$$status)
	@echo "RESULT: ALL PASS (the #cfg(blas) branch is clean)"

.PHONY: lint-cfg
