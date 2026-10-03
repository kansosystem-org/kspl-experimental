# ==================================================================
# mk/lint.mk — formatting and static analysis (fmt / lint / lint-cfg)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==================================================================
# fmt takes every *.kspl and *.kspls, **both notations**, but `FMT_UNTOUCHED`:
# ksplc/tests/negative/ (broken on purpose) and ksplc/tests/lint/, whose disordered columns
# **disappear once formatted**.
FMT_UNTOUCHED := ksplc/tests/negative ksplc/tests/lint
FMT_JOBS ?= $(HOST_CORES)

# The files fmt and test-fmt-tree take, one a line: the tracked and the untracked that are not
# ignored, as git lists them, less `FMT_UNTOUCHED`, and only those that stand.
# Caution: **Ask git, do not walk the folder.** A walk also enters what is ignored, an ignored
# worktree nested inside the clone among it, and there `FMT_UNTOUCHED`'s paths no longer match,
# so another checkout's broken-on-purpose fixtures are formatted. **Exclude what is ignored but not
# the untracked**: a leftover would fail CI, and a new file would pass until `git add`.
FMT_LIST = { git ls-files '*.kspl' '*.kspls'; \
    git ls-files --others --exclude-standard '*.kspl' '*.kspls'; } \
    $(foreach d,$(FMT_UNTOUCHED),| grep -v '^$(d)/') | sort -u \
    | while IFS= read -r f; do if [ -f "$$f" ]; then printf '%s\n' "$$f"; fi; done

## Local-cycle|fmt|Format every tracked `.kspl` / `.kspls` (`FMT_JOBS=1` for one at a time)
fmt: $(SEED_EXE)
	@set -o pipefail; mkdir -p $(TMP_DIR); log=$(TMP_DIR)/fmt.log; : > "$$log"; \
	list=$(TMP_DIR)/fmt_files; \
	$(FMT_LIST) | tr '\n' '\0' > "$$list"; \
	n=$$(tr -cd '\0' < "$$list" | wc -c); \
	echo "# RUNNING KSPL FORMATTER ($$n files, $(FMT_JOBS) jobs)"; \
	xargs -0 -P $(FMT_JOBS) -n 32 ./$(SEED_EXE) fmt $(KSPL_FMT) < "$$list" \
		> /dev/null 2>> "$$log" \
		|| { cat "$$log" >&2; exit 1; }

# Checks the tree is formatted, in a copy (formatting in place would erase what failed).
# The files are `FMT_LIST`'s. **Compare the sizes too**: a one-byte shift across files cancels
# out in the joined stream (`wc`'s `total` lines are left out: where the list splits varies).
# **The formatter's path comes from `$$PWD`, quoted**: a bare `$(CURDIR)` splits at a space.
define fmt_tree_fail_help
FMT CHECK FAILED: some files change when formatted. Run `make fmt` and take the difference in.
endef
export FMT_TREE_FAIL_HELP := $(fmt_tree_fail_help)

## Gates|test-fmt-tree|See whether the tracked sources are already formatted (it does not format)
test-fmt-tree: $(SEED_EXE)
	@echo "# CHECKING KSPL FORMATTING (sources must already be formatted)"
	@set -o pipefail; work=$(TMP_DIR)/fmt_check; rm -rf $$work; mkdir -p $$work; \
	seed="$$PWD/$(SEED_EXE)"; \
	files=$$($(FMT_LIST)); \
	if [ -z "$$files" ]; then echo "FMT CHECK FAILED: no source found"; exit 1; fi; \
	printf '%s\n' $$files | tar -cf - -T - | (cd $$work && tar -xf -); \
	(cd $$work && printf '%s\n' $$files | tr '\n' '\0' \
		| xargs -0 -P $(FMT_JOBS) -n 32 "$$seed" fmt $(KSPL_FMT)) \
		> /dev/null 2> $$work/fmt.log \
		|| { echo "FMT CHECK FAILED: ksplc fmt itself failed"; cat $$work/fmt.log >&2; exit 1; }; \
	{ printf '%s\n' $$files | tr '\n' '\0' | xargs -0 wc -c | awk '$$2 != "total" { print $$1, $$2 }'; \
	  printf '%s\n' $$files | tr '\n' '\0' | xargs -0 cat; } > $(TMP_DIR)/fmt_before; \
	(cd $$work && { printf '%s\n' $$files | tr '\n' '\0' | xargs -0 wc -c \
	  | awk '$$2 != "total" { print $$1, $$2 }'; \
	  printf '%s\n' $$files | tr '\n' '\0' | xargs -0 cat; }) > $(TMP_DIR)/fmt_after; \
	if ! cmp -s $(TMP_DIR)/fmt_before $(TMP_DIR)/fmt_after; then \
		bad=""; \
		for f in $$files; do cmp -s "$$f" "$$work/$$f" || bad="$$bad $$f"; done; \
		printf '%s\n' "$$FMT_TREE_FAIL_HELP"; \
		for f in $$bad; do echo "  -> $$f"; done; \
		exit 1; \
	fi; \
	echo "RESULT: ALL PASS ($$(printf '%s\n' $$files | wc -l) files already formatted)"

# Entries called from outside their I0402 package: linted with it off, their callers with it on.
LINT_SUITES_OWN := ksplc/tests/suite/lsp_test.kspls ksplc/tests/suite/kspls_test.kspls \
	ksplc/tests/suite/ast_cache_test.kspls
LINT_TARGETS_OWN := ksplc/tests/main.kspls kspage/tests/main.kspls ksos/tests/main.kspls \
	kspage/tests/fuzz_main.kspls tools/repo_stat.kspls tools/code_table.kspls $(LINT_SUITES_OWN)

# Caution: **Keep tests/debug/main.kspls**: some code (std/regex, generics) is reached only from it.
# **Suites, `ksplc/tests/prog/`, `tests/debug/pkg/` and the POSIX demos come by wildcard**: nothing
# else lints their routes, and a named list leaks a new one out of the gate.
LINT_TARGETS := ksplc/main.kspls tests/debug/main.kspls ksai/examples/llama_engine/main.kspls \
	ksai/examples/qwen_infer/main.kspls ksai/examples/fim_coder/main.kspls \
	ksai/benches/bench_train.kspls \
	ksos/net/mini_ipv4.kspls ksos/net/mini_mqtt.kspls ksos/net/tcp_conn.kspls kssrv/main.kspls \
	tools/ai_assist/build_corpus.kspls tools/ai_assist/eval_fim.kspls tools/ai_assist/make_fim.kspls \
	tools/ai_assist/make_error_fix.kspls tools/ai_assist/train_bpe.kspls \
	ksos/port/rp2040/pad_checksum.kspls ksos/port/rp2040/elf2uf2.kspls tools/mqtt_stub.kspls \
	tools/kspage_open.kspls tools/kspage_aim.kspls \
	tools/kspage_plugin_sort.kspls \
	tools/surface.kspls \
	tools/tour.kspls \
	tools/kspage_doc.kspls \
	ksai/benches/run_bench.kspls tools/lsp_client.kspls \
	kspage/port/web/bundle.kspls kspage/tests/open_prog.kspls ksai/tests/read_prog.kspls \
	std/tests/read_prog.kspls $(filter-out $(LINT_TARGETS_OWN),$(wildcard */tests/fuzz_main.kspls)) \
	ksai/tests/main.kspls ksdb/tests/main.kspls kspeg/tests/main.kspls kssrv/tests/main.kspls \
	std/tests/main.kspls \
	kssrv/tests/copy.kspls kssrv/tests/spew.kspls ksai/tests/examples_main.kspls \
	$(wildcard ksos/demo/posix/*.kspls) \
	$(wildcard tests/suite/*.kspls) \
	$(filter-out $(LINT_SUITES_OWN),$(wildcard ksplc/tests/suite/*.kspls)) \
	$(wildcard tests/tools/*.kspls) \
	$(wildcard ksplc/tests/prog/*.kspls) \
	$(wildcard tests/debug/pkg/*.kspls) \
	$(wildcard ksplc/tests/kspls/*.kspl) $(wildcard ksplc/tests/kspls/*.kspls) \
	$(PRIVATE_LINT_TARGETS)

LINT_TARGETS_FREE := $(wildcard ksos/demo/cortex_m/*.kspls) \
	$(wildcard ksos/demo/rp2040/*.kspls) kspage/port/web/bridge.kspls

# $(call lint_clean,<log>,<what was linted>): passes where the log counts nothing down to Hint,
# and otherwise shows it and fails.
lint_clean = if grep -q "0 error(s), 0 warning(s), 0 information(s), and 0 hint(s)" $(1); then :; \
	else cat $(1); echo "LINT FAILED: $(2)"; exit 1; fi

# Caution: **Zero down to Hint**, one file = one target and log (a shared log is overwritten).
define lint_one_rule
lint-one-$(subst /,_,$(1)): $$(STAGE1_EXE)
	@echo "  -> $(1) $(2)"
	@log=$$(LINT_LOG_DIR)/$(subst /,_,$(1)).log; \
	./$$(STAGE1_EXE) lint $(2) $(1) > $$$$log 2>&1; \
	$$(call lint_clean,$$$$log,$(1))
endef
$(foreach f,$(LINT_TARGETS),$(eval $(call lint_one_rule,$(f),)))
$(foreach f,$(LINT_TARGETS_FREE),$(eval $(call lint_one_rule,$(f),--freestanding)))
$(foreach f,$(LINT_TARGETS_OWN),$(eval $(call lint_one_rule,$(f),--lint=I0402=off)))
LINT_ONE_TARGETS := $(addprefix lint-one-,$(subst /,_,$(LINT_TARGETS) $(LINT_TARGETS_FREE) \
  $(LINT_TARGETS_OWN)))

## Local-cycle|lint|Static analysis. Zero down to hints is a pass
lint: $(LINT_ONE_TARGETS)
	@echo "RESULT: ALL PASS ($(words $(LINT_ONE_TARGETS)) lint targets clean)"

## Local-cycle|lint-one-*|One file's worth of `make lint` (named by its path, `/` becoming `_`)
.PHONY: $(LINT_ONE_TARGETS)

LINT_CFG_VARIANTS := tls db blas llvm tls_db_blas

define lint_cfg_rule
lint-cfg-$(1): $$(STAGE1_EXE)
	@echo "  -> tests/debug/main.kspls [$(1)]"
	@log=$$(LINT_LOG_DIR)/cfg_$(1).log; \
	./$$(STAGE1_EXE) lint $$(addprefix --define=,$$(subst _, ,$(1))) tests/debug/main.kspls > $$$$log 2>&1; \
	$$(call lint_clean,$$$$log,tests/debug/main.kspls [$(1)])
endef
$(foreach v,$(LINT_CFG_VARIANTS),$(eval $(call lint_cfg_rule,$(v))))
LINT_CFG_TARGETS := $(addprefix lint-cfg-,$(LINT_CFG_VARIANTS))

## Local-cycle|lint-cfg|All the `#cfg` branches' semantic analysis (TLS/DB/BLAS/LLVM)
lint-cfg: $(LINT_CFG_TARGETS)
	@echo "RESULT: ALL PASS ($(words $(LINT_CFG_VARIANTS)) #cfg variants clean)"

## Local-cycle|lint-cfg-*|One combination only (the sets are `LINT_CFG_VARIANTS` in `mk/lint.mk`)
.PHONY: $(LINT_CFG_TARGETS)
