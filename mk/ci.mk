# ==================================================================
# mk/ci.mk — the whole set of CI gates (ci / ci-linux / ci-macos)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==================================================================
# Caution: **No job server for a child make** (ksos/Makefile's ksos_run_gate: `-j1`), or several
# children build the same object at once. **One item = one target**: a shared log gets overwritten.
TEST_JOBS ?= $(HOST_CORES)

# **Every gate goes through this**, or $(ci_digest) misses it; **keep `pipefail` and `exit $$r`**.
define ci_gate
	@printf '# --- %s ---\n' "$(1)"
	set -o pipefail; t0=$$(date +%s); $(MAKE) $(1) 2>&1 | tee $(CI_LOG_DIR)/$(2).log; r=$$?; \
	  printf '%s\n' $$(($$(date +%s) - t0)) > $(CI_LOG_DIR)/$(2).sec; \
	  printf '%s\n' "$$r" > $(CI_LOG_DIR)/$(2).rc; \
	  $(call ci_annotate,$(2),$$r); exit $$r
endef

# One annotation per fallen gate (a step keeps 10): its log's first `FAIL ` line, or make's `*** [`.
define ci_annotate
	if [ "$(2)" != 0 ] && [ -n "$$GITHUB_ACTIONS" ]; then \
	  why="$(3)"; \
	  if [ -z "$$why" ]; then \
	    why=$$(grep -m1 '^FAIL ' $(CI_LOG_DIR)/$(1).log 2>/dev/null); fi; \
	  if [ -z "$$why" ]; then \
	    why=$$(grep -m1 '\*\*\* \[' $(CI_LOG_DIR)/$(1).log 2>/dev/null); fi; \
	  if [ -z "$$why" ]; then why="exit $(2)"; fi; \
	  printf '::error title=%s::%s\n' "$(1)" "$$why"; \
	fi
endef

# ci_gate plus the verdict line (one notation for all: "How a run is read" in docs/SPEC-gates.md).
define ci_check
	$(call ci_gate,$(1),$(2))
	@grep -q "^RESULT: ALL PASS" $(CI_LOG_DIR)/$(2).log || { \
	  printf '1\n' > $(CI_LOG_DIR)/$(2).rc; \
	  $(call ci_annotate,$(2),1,no RESULT line); exit 1; }
endef

define ci_reset_logs
	@rm -f $(CI_LOG_DIR)/*.log $(CI_LOG_DIR)/*.sec $(CI_LOG_DIR)/*.rc \
	  $(SUITE_LOG_DIR)/*.times
endef

export CI_DIGEST_HEAD := the gates that ran (one carrying a SKIP line is passing silently by its own account)
export CI_SUMMARY_NOTE := a fallen gate's reason is in the per-gate log among the same round's artifacts, log-*

# The gates that left a *.log, on the screen or the job summary (`fmt=`), each with its SKIP lines.
ci_digest_prog := FNR == 1 { \
  g = FILENAME; sub(/.*\/ci_/, "", g); sub(/\.log$$/, "", g); order[++n] = g; \
  base = FILENAME; sub(/\.log$$/, "", base); \
  d = 0; if ((getline v < (base ".sec")) > 0) { d = v + 0 } close(base ".sec"); \
  rc = 0; if ((getline v < (base ".rc")) > 0) { rc = v + 0 } close(base ".rc"); \
  sec[g] = d; tot += d; verdict[g] = (rc == 0 ? "PASS" : "FAIL"); if (rc != 0) { bad++ } } \
  /SKIP/ { skipped[g] = skipped[g] sep[g] $$0; sep[g] = "\n" } \
  END { for (i = 1; i <= n; i++) { if (skipped[order[i]] != "") { s++ } } \
  if (fmt == "md") { \
    printf "\#\# %s - %d PASS / %d FAIL   (%ds, -j%s)\n\n", title, n - bad, bad, tot, jobs; \
    print "| gate | verdict | sec |"; print "| :-- | :-- | --: |"; \
    for (i = 1; i <= n; i++) { g = order[i]; \
      printf "| %s | %s | %d |\n", g, (verdict[g] == "PASS" ? "PASS" : "**FAIL**"), sec[g] } \
    if (s > 0) { printf "\nSKIP:\n\n"; \
      for (i = 1; i <= n; i++) { if (skipped[order[i]] != "") { printf "* `%s`\n", order[i] } } } \
    printf "\n%s\n", note; exit } \
  printf "\# %s\n", head; \
  for (i = 1; i <= n; i++) { g = order[i]; \
    printf "\#   %-14s %-4s %5ds\n", g, verdict[g], sec[g]; \
    if (skipped[g] != "") { m = split(skipped[g], lines, "\n"); \
      for (j = 1; j <= m; j++) { printf "\#     %s\n", lines[j] } } } \
  printf "\# gates invoked: %d (%d FAIL, SKIP lines in %d), gate seconds: %d, -j%s\n", \
    n, bad, s, tot, jobs }

define ci_digest
	@awk -v fmt=plain -v jobs=$(TEST_JOBS) -v head="$$CI_DIGEST_HEAD" \
	  '$(ci_digest_prog)' $(CI_LOG_DIR)/*.log
endef

# Caution: **No log body** (near 1 MiB a summary fails silently); **with no log, say so, return 0**.
## Measure-and-inspect|ci-summary|Emit the previous round's gate listing again
ci-summary:
	@if ! ls $(CI_LOG_DIR)/*.log >/dev/null 2>&1; then \
	  echo "no gate log: the round fell before a gate ran (the cause is the step above)" \
	    >> "$${GITHUB_STEP_SUMMARY:-/dev/stdout}"; \
	  exit 0; \
	fi; \
	awk -v fmt=md -v jobs=$(TEST_JOBS) -v title="$${TITLE:-ci}" -v note="$$CI_SUMMARY_NOTE" \
	  '$(ci_digest_prog)' $(CI_LOG_DIR)/*.log \
	  >> "$${GITHUB_STEP_SUMMARY:-/dev/stdout}"

.PHONY: ci-summary

# --- Verifying GitHub Actions CI (the gates **shared** by linux / windows-ucrt64) ---
# **No `-B` on self-host**: it recompiles the seed, and `perf-log` then rebuilds all of stage1 (the
# caution in the root Makefile). Texts go by environment variable (above Makefile's `include`).
export CI_LINT_NOTE := (this repository itself requires zero down to Hint)
# `=`, not `:=`: SUITES is defined below, so `:=` counts 0 suites.
export CI_TESTS_NOTE = ($(words $(SUITES)) suites + ksos-link / llvm-abi / freestanding-math / simd / surface)

define ci_perf_note
(what settles the verdict is peak memory alone, and
#           build time is only recorded as a ratio against the baseline. The reason and the threshold
#           are at the head of tests/tools/perf_guard.kspls. A memory leak is detected separately by a
#           non-zero 'Final Global Heap' exit during self-hosting)
endef
export CI_PERF_NOTE := $(ci_perf_note)

# A stage is added or removed in CI_STEPS alone; a number typed into a heading goes stale.
CI_STEPS := selfhost debug lint tests tests_b ai llvm perf
# The indices ci_step tries: keep them at least as many as CI_STEPS.
ci_step_nums := 1 2 3 4 5 6 7 8 9 10 11 12
ci_step = $(or $(firstword $(foreach i,$(ci_step_nums),$(if $(filter $(1),$(word $(i),$(CI_STEPS))),$(i)))),$(error ci_step: '$(1)' is not in CI_STEPS))
ci_step_total = $(words $(CI_STEPS))

ci_head = @printf '\n\# [CI %s/%s] %s\n' $(call ci_step,$(1)) $(ci_step_total) "$(2)"

define ci_step_selfhost
	$(call ci_head,selfhost,self-host (C backend))
	$(call ci_check,self-host,selfhost)
endef

define ci_step_debug
	$(call ci_head,debug,debug tests)
	$(call ci_check,debug,debug)
endef

define ci_step_lint
	$(call ci_head,lint,lint $$CI_LINT_NOTE)
	# Caution: Check the formatting before lint. Of lint's findings, those about line wrapping
	# ([H0804] / [H0802]) appear in "the notation after formatting". With the order reversed, lint
	# goes through on pre-formatting notation and falls on somebody else's machine the moment the
	# next person runs `make fmt`.
	$(call ci_check,test-fmt-tree,fmt_tree)
	$(call ci_check,-j$(TEST_JOBS) lint,lint)
	$(call ci_check,-j$(TEST_JOBS) lint-cfg,lint_cfg)
endef

define ci_step_tests
	$(call ci_head,tests,regression tests $$CI_TESTS_NOTE)
	# Caution: Run them in parallel.
	# **Only the -j here has any effect.** The inside of a suite can be parallelized too with
	# `harness.run_all`, but only a few suites use it and even in total they are a few per cent of the
	# whole CPU (it has been measured and confirmed that parallelizing only the suite side while
	# staying at `-j1` is no different from serial).
	# **With one core, -j shrinks nothing.** The only thing that can shrink that is reducing
	# **the total amount of work**.
	# On top of that, the speed is settled by **the order they start in**. Keep SUITES in
	# order of length (how it is measured and the grounds for the order are at the caution on SUITES in
	# mk/test.mk; do not copy them here).
	# **Do not take --output-sync=target off.** Taken off, a suite's output is not gathered
	# one suite at a time and the `RESULT:` lines scatter among another suite's lines.
	# What keeps a line itself from being split is not this but `begin` in
	# `tests/support/harness.kspls` (which sends them out one line at a time).
	# Half of the suites. **The other half is a stage of its own** (`ci_step_tests_b` below), because
	# one job carrying every suite became CI's whole waiting time. Which suite is in which half, and
	# why the halves are cut to be even rather than to mean anything, are at `SUITES_B` in mk/test.mk.
	$(call ci_gate,-j$(TEST_JOBS) --output-sync=target test-suites-a,suites_a)
	# The CM demos are run all the way by test-ksos-qemu, so the link check is a duplicate. It is
	# kept anyway because this is the only place that can notice a demo falling out of QEMU's list
	# (RP2040's demos grow easily and fall out easily). They run in parallel, so removing it does not
	# shrink anything.
	# These two are piled into one make. What they write to is separate (the .ll in $(TMP_DIR)
	# and out/ksos_*/), and the only shared prerequisite is $(STAGE1_EXE), so in one make it is built
	# just once inside the job server (split, the check on $(STAGE1_EXE) is paid twice).
	# **Do not take --output-sync=target off.** Taken off, the two targets' output mixes
	# mid-line and which result is being read cannot be told (the log is the main clue for
	# a diagnosis).
	# Do not add a gate holding a marker check (ci_check) here. Gathered into one log, a grep
	# looks at another item's result (the caution at the head of this file).
	$(call ci_gate,-j$(TEST_JOBS) --output-sync=target test-ksos-link test-llvm-abi,link_abi)
	$(call ci_check,test-freestanding-math,fm)
	$(call ci_check,test-simd,simd)
	# The API record is where a change that breaks another package's build shows in the diff.
	# When this gate fails, remake the record with `make surface` and commit it, diff and all
	# (SURFACE_PKGS in mk/test.mk).
	$(call ci_check,test-surface,surface)
	# The tour page is generated from its program, and the gate refuses a page older than the
	# program (`make tour` remakes it).
	$(call ci_check,test-docs,docs)
endef

define ci_step_tests_b
	$(call ci_head,tests_b,the second half of the regression suites)
	$(call ci_gate,-j$(TEST_JOBS) --output-sync=target test-suites-b,suites_b)
endef

define ci_step_ai
	$(call ci_head,ai,AI engine smoke test)
	$(call ci_check,run,run)
endef

define ci_step_llvm
	$(call ci_head,llvm,self-host + debug tests (LLVM backend))
	$(call ci_check,LLVM=1 self-host STATS=1,selfhost_llvm)
	# Caution: Put the run-time tests through the LLVM backend as well. Self-hosting going through is
	# not enough: a shape ksplc itself does not use (an immutable const struct array and the like) is
	# not trodden by self-hosting even with the genllvm side broken, so an ICE and invalid
	# IR go unseen.
	# Include Windows in the scope too. Mistakes of the "hand an actual argument at the actual
	# argument expression's type" kind are exposed only there, because Win64 alone holds stack
	# arguments. At the IR stage test-llvm-abi catches them.
	$(call ci_check,LLVM=1 debug,debug_llvm)
endef

define ci_step_perf
	$(call ci_head,perf,peak memory regression guard + build time profile $$CI_PERF_NOTE)
	$(call ci_gate,perf-log,perf)
endef

## Gates|ci|Every gate runnable on this environment
ci:
	$(ci_reset_logs)
	$(foreach s,$(CI_STEPS),$(ci_step_$(s))$(nl))
	$(ci_digest)
	@echo "# CI (shared linux / windows-ucrt64 gates) equivalent: ALL GREEN"

# --- Shards: splitting the shared ci across several jobs ---
# Caution: **Shards are as many as the start-ups paid for** (checkout + msys2 + stage1, about one
# shard's work, costs more on Windows): **measure the usage time before adding one** ("Where CI's
# time goes" in docs/DESIGN.md). **"Everything ran" is a chain of three**: CI_STEPS ⊆ CI_SHARDS'
# stages (the $(error) below), CI_SHARDS ⊆ the workflow's matrix
# (tests/support/conventions_ci.kspls), and each matrix job green (keep `fail-fast: false`).
CI_SHARDS := core rest
ci_shard_core := selfhost tests
ci_shard_rest := debug lint tests_b ai llvm perf

ci_shard_all := $(foreach s,$(CI_SHARDS),$(ci_shard_$(s)))
ci_shard_missing := $(filter-out $(ci_shard_all),$(CI_STEPS))
ci_shard_unknown := $(filter-out $(CI_STEPS),$(ci_shard_all))
ifneq ($(ci_shard_missing),)
$(error there are stages in none of the shards: $(ci_shard_missing))
endif
ifneq ($(ci_shard_unknown),)
$(error a shard holds a name absent from CI_STEPS: $(ci_shard_unknown))
endif
ifneq ($(words $(ci_shard_all)),$(words $(sort $(ci_shard_all))))
$(error the same stage is in two shards: $(ci_shard_all))
endif

## Gates|ci-shard-*|One half of a split `ci` (so CI can run them side by side; the names are `CI_SHARDS` in `mk/ci.mk`)
define ci_shard_rule
ci-shard-$(1):
	$$(ci_reset_logs)
	@printf '# [ci-shard %s] %s\n' "$(1)" "$(ci_shard_$(1))"
	$$(foreach s,$(ci_shard_$(1)),$$(ci_step_$$(s))$$(nl))
	$$(ci_digest)
	@printf '# CI shard %s: ALL GREEN\n' "$(1)"
endef
$(foreach s,$(CI_SHARDS),$(eval $(call ci_shard_rule,$(s))))

.PHONY: $(addprefix ci-shard-,$(CI_SHARDS))

# --- The whole set of gates for the Linux runner (the linux job in .github/workflows/ci.yml) ---
# Caution: Once one is added, fix "What each platform runs" in docs/SPEC-gates.md too.
# ci_linux_only_body: gates whose tool only the devcontainer has. test-ksos-qemu: qemu-system-arm
# and arm-none-eabi's libgcc; test-ksos-posix: `<ucontext.h>`; TLS=1 DB=1 BLAS=1 debug: libssl,
# libsqlite3, libopenblas; test-kspage-*: wasm-ld, node, a browser; test-js-syntax: node;
# test-race: clang's ThreadSanitizer runtime.
define ci_linux_only_body
	$(call ci_gate,test-ksos-posix,ksos_posix)
	$(call ci_gate,test-ksos-qemu,ksos_qemu)
	# Caution: **Build and actually run the optional backends.** `lint-cfg` looks no further than
	# semantic analysis, so a mistake in the FFI notation (the order of the arguments, their types, the
	# library linked) goes through. The default build's tests can confirm only "at TLS=0 it returns
	# unsupported".
	# TLS, DB and BLAS are gathered into one build. They are independent of each other, so there is
	# no gain in splitting them and only debug's rebuild multiplies. BLAS's library comes from the
	# source (`#link` in ksai/tensor.kspls), so this is also where a named library is seen linked.
	# Sees that kspage's core assembles for wasm32 and actually runs.
	# Sees that the page's JS goes through as syntax.
	# **It needs `node`, so it sits here** (put into the shared `ci`, Windows and macOS on
	# hand, which have no node, would fall).
	$(call ci_check,test-js-syntax,js_syntax)
	$(call ci_check,test-kspage-wasm,kspage_wasm)
	# The input's intake (focus, visibility, how many times one keystroke goes in) can be seen
	# only in a real browser.
	# **A browser is made mandatory here** (`KSPAGE_REQUIRE_BROWSER`). The devcontainer bundles
	# one, so not finding it is not the environment's circumstance but a sign that the tool fell out
	# of the image. Allowing it to pass silently makes only the check disappear, on green
	# (the caution at `KSPAGE_REQUIRE_BROWSER` in kspage/Makefile).
	$(call ci_check,test-kspage-browser KSPAGE_REQUIRE_BROWSER=1,kspage_browser)
	# The route that asks the answering side on hand (`kssrv --local`) for a file does not come
	# out without actually having it served.
	# Caution: **It is no substitute for the `file://` gate.** That one sees "the shape with no
	# answering side", this one "the shape with one". Both are needed (that nothing is offered which
	# can be pressed yet has no effect can be seen only on the side with none).
	$(call ci_check,test-kspage-served KSPAGE_REQUIRE_BROWSER=1,kspage_served)
	$(call ci_check,TLS=1 DB=1 BLAS=1 debug,debug_optional)
	# The races the threaded tests reach, which the type system leaves unchecked. **Required here**
	# (`KANSO_REQUIRE_TSAN`, mk/test.mk): the image holds the sanitizer, so its absence is a fault.
	$(call ci_check,test-race,race)
endef

## Gates|ci-linux|Every Linux gate (`ci` plus what has its tool on Linux only)
ci-linux: ci
	$(ci_linux_only_body)
	$(ci_digest)
	@echo "# CI (linux job) equivalent: ALL GREEN"

## Gates|ci-linux-only|Only what has its tool on Linux alone
ci-linux-only:
	$(ci_reset_logs)
	@echo "# [ci-shard linux-only] ksos-posix ksos-qemu js-syntax kspage-wasm kspage-browser kspage-served debug-tls-db race"
	$(ci_linux_only_body)
	$(ci_digest)
	@echo "# CI shard linux-only: ALL GREEN"

.PHONY: ci-linux-only

# --- The short cut for when only the documents were touched ---
## Gates|ci-docs|The shorter one for when only `.md` was touched
ci-docs:
	@$(MAKE) test-docref test-conventions test-docsnippet test-mdtrip test-docs
	@echo "# ci-docs: .md gates only (run make ci if you touched any source)"

.PHONY: ci-docs

# --- The whole set of gates for the macOS runner (the macos job in .github/workflows/ci.yml) ---
# Left out: perf_guard (its baseline is the Linux CI's) and what `make ci` runs elsewhere, being
# platform-independent. In: test-freestanding-math and test-emit-runtime, which only here meet
# Apple's toolchain and Mach-O ignoring `retain`. Pairs `<target>:<log name>`, logs spelt as `ci`'s.
CI_MACOS_GATES := self-host:selfhost debug:debug lint:lint test-simd:simd run:run \
	test-lsp:lsp test-negative:negative test-freestanding-math:fm test-equiv:equiv \
	test-emit-runtime:emit_runtime

ci_macos_target = $(firstword $(subst :, ,$(1)))
ci_macos_log = $(word 2,$(subst :, ,$(1)))

## Gates|ci-macos|Every gate run on macOS
ci-macos:
	$(ci_reset_logs)
	@echo "# [ci-macos] $(words $(CI_MACOS_GATES)) gates + LLVM=1 {self-host, debug}"
	$(foreach t,$(CI_MACOS_GATES),$(call ci_gate,$(call ci_macos_target,$(t)),$(call ci_macos_log,$(t)))$(nl))
	$(call ci_gate,LLVM=1 self-host,selfhost_llvm)
	$(call ci_gate,LLVM=1 debug,debug_llvm)
	$(ci_digest)
	@echo "# CI (macos job) equivalent: ALL GREEN"
