# ==================================================================
# mk/test.mk — running the tests (debug / test-suites / test-simd and others)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==================================================================
## Local-cycle|debug|Run the tests `tests/debug/main.kspl` calls, in one executable
# It builds through `debug-file`, as `debug-tools` below does, so the two builds cannot differ.
debug: $(STAGE1_EXE)
	@echo "# RUNNING DEBUG TESTS ($(BACKEND), BLAS=$(BLAS))"
	@$(MAKE) --no-print-directory debug-file SRC_KSPL=tests/debug/main.kspl OUT_STEM=test_debug \
		DEBUG_EXE_DIR=$(TEST_DIR) $(C_FMT_OFF)
	./$(TEST_DIR)/test_debug.exe

# --- Building a single file for debugging (VS Code's F5) ---
# Caution: **The output's name agrees with launch.json's `${fileBasenameNoExtension}.exe`**, or F5
# silently starts the previous executable. It is the shell's basename of $(SRC_KSPL), **quoted**.
# The executable goes in `DEBUG_EXE_DIR`, where F5 looks, and a gate's build names `$(TEST_DIR)`.
# What it is built from goes in `$(GEN_DIR)` ("What goes where in `out/`" in
# docs/DESIGN-repository.md).
DEBUG_EXE_DIR := $(OUT_DIR)
export DEBUG_FILE_USAGE_NOTE := (normally called from VS Code's F5 / the task "build-current-file")
## Local-cycle|debug-file|Build one `.kspl` with debug information (`SRC_KSPL=`; VS Code's F5 calls this)
debug-file: $(STAGE1_EXE)
	@set -e; \
	if [ -z "$(SRC_KSPL)" ]; then \
		echo "Usage: make debug-file SRC_KSPL=path/to/file.kspl"; \
		printf '  %s\n' "$$DEBUG_FILE_USAGE_NOTE"; \
		exit 1; \
	fi; \
	stem="$(OUT_STEM)"; \
	if [ -z "$$stem" ]; then stem="$$(basename "$(SRC_KSPL)")"; stem="$${stem%.*}"; fi; \
	mkdir -p "$(GEN_DIR)" "$(DEBUG_EXE_DIR)"; \
	gen="$(GEN_DIR)/$$stem.$(TARGET_EXT)"; exe="$(DEBUG_EXE_DIR)/$$stem.exe"; libf="$(GEN_DIR)/$$stem.libs"; \
	echo "# BUILDING $(SRC_KSPL) FOR DEBUGGING ($(BACKEND))"; \
	echo "./$(STAGE1_EXE) $(KSPL_FLAGS) $(TARGET_FLAG) \"$(SRC_KSPL)\" \"$$gen\""; \
	./$(STAGE1_EXE) $(KSPL_FLAGS) $(TARGET_FLAG) $(AI_KSPL_FLAGS) --emit-libs="$$libf" "$(SRC_KSPL)" "$$gen"; \
	if [ "$(BACKEND)" = "c" ]; then $(call c_fmt,"$$gen"); fi; \
	rt=""; if [ "$(BACKEND)" = "llvm" ]; then rt="$(GEN_DIR)/$$stem.runtime.c"; ./$(STAGE1_EXE) emit-runtime "$$rt"; fi; \
	echo "$(CC) $(CFLAGS) \"$$gen\" $$rt \"@$$libf\" $(LDLIBS) -o \"$$exe\""; \
	$(CC) $(CFLAGS) "$$gen" $$rt "@$$libf" $(LDLIBS) -o "$$exe"; \
	echo "# BUILT $$exe"

# --- One package's worth of tests (`make debug-<name>`) ---
# A package with its own `Makefile` runs its `make test` (below). `tools/` is the one folder of
# tests with none, so its rule is written here; the $(error) catches a second such folder, which
# would otherwise only say "no such target".
OWN_MAKE_PKGS := $(sort $(patsubst %/Makefile,%,$(wildcard */Makefile)))
NO_MAKE_TESTED := $(filter-out $(OWN_MAKE_PKGS), \
                    $(sort $(patsubst %/tests/all.kspl,%,$(wildcard */tests/all.kspl))))
ifneq ($(NO_MAKE_TESTED),tools)
$(error a folder holding tests/all has no Makefile: $(filter-out tools,$(NO_MAKE_TESTED)) (give it one, as ksdb/Makefile does))
endif

# Nobody reads this target's C, so it is not tidied: **`C_FMT=:`**, as an empty one would run the C.
C_FMT_OFF := C_FMT=:

# **The `make explain` tests run the make that `make explain` runs** (`ci_make`): found by its name,
# make can be another one, such as MSYS2's UCRT64 make, which the root make file refuses.
export KANSO_MAKE = $(ci_make)

# Caution: **Not `out/tools.exe`**: tools look names up in `out/` and would start the wrong program
# with nothing said. Hence `debug_`.
## Local-cycle|debug-*|Run only that package's tests (the names are `OWN_MAKE_PKGS` in `mk/test.mk`)
## Local-cycle|debug-tools|Run only the tests of `tools/`
debug-tools: $(STAGE1_EXE)
	@$(MAKE) --no-print-directory debug-file SRC_KSPL=tools/tests/main.kspl OUT_STEM=debug_tools \
		DEBUG_EXE_DIR=$(TEST_DIR) $(C_FMT_OFF)
	./$(TEST_DIR)/debug_tools.exe

# --- kssrv and ksbind through the LLVM backend ---
# **`make LLVM=1 debug` holds neither** (they run only as their own `make test`), so genllvm broken
# on code only they reach would go unseen. The server is built through LLVM and kssrv's tests drive
# it; ksbind's tests are built through LLVM and run. **Linux alone**: its image holds ksbind's
# libraries, where elsewhere ksbind's own tests skip.
# **The compiler built in C translates them** (`STAGE1_EXE` passed down): the nested `LLVM=1`
# would otherwise build a second compiler through LLVM first, which `selfhost_llvm` already checks.
## Gates|test-llvm-pkgs|Build kssrv and ksbind's tests through the LLVM backend, and run kssrv's and ksbind's tests on them
test-llvm-pkgs: $(STAGE1_EXE) $(SEED_EXE)
	@$(MAKE) --no-print-directory LLVM=1 STAGE1_EXE=$(STAGE1_EXE) debug-file \
		SRC_KSPL=kssrv/main.kspl OUT_STEM=kssrv_llvm DEBUG_EXE_DIR=$(TEST_DIR)
	rm -rf "$(TMP_DIR)/kssrv_llvm_test"
	cd kssrv && KSPLC_STD_DIR="$(abspath std)" KSPLC_PKG_SRC_DIR="$(abspath .)" \
		"$(abspath $(STAGE1_EXE))" run "$(abspath kssrv/tests/main.kspl)" \
		"$(abspath $(TEST_DIR))/kssrv_llvm.exe" \
		"$(abspath $(TMP_DIR))/kssrv_llvm_test"
	@$(MAKE) --no-print-directory LLVM=1 STAGE1_EXE=$(STAGE1_EXE) debug-file \
		SRC_KSPL=ksbind/tests/main.kspl OUT_STEM=ksbind_llvm DEBUG_EXE_DIR=$(TEST_DIR)
	./$(TEST_DIR)/ksbind_llvm.exe

.PHONY: test-llvm-pkgs

# **The one way to call a package's `Makefile`**: $(call pkg_make,<package>) <target> [<var>=<val>]
# Caution: **Keep the leading `+`**: make passes its job slots only to a line it sees as a sub-make,
# and a `$(MAKE)` reached through a variable is not seen, so the child warns and runs at `-j1`.
pkg_make = +KSPLC_STD_DIR="$(abspath std)" KSPLC_PKG_SRC_DIR="$(abspath .)" \
  $(MAKE) --no-print-directory -C $(1) KSPLC="$(abspath $(STAGE1_EXE))" \
  RUNNER="$(abspath $(SEED_EXE))" UNDER="$(abspath $(STAGE1_EXE))" \
  SCRATCH="$(abspath $(TMP_DIR))/$(1)-suites" FUZZ_SEEDS="$(abspath .)"

define own_make_rule
debug-$(1): $$(STAGE1_EXE) $$(SEED_EXE)
	@$$(call pkg_make,$(1)) test
endef
$(foreach p,$(OWN_MAKE_PKGS),$(eval $(call own_make_rule,$(p))))

.PHONY: debug-tools $(addprefix debug-,$(OWN_MAKE_PKGS))

# --- The test suites ---
# A suite's name is its file's stem with `-` for `_` (`suite/lsp_tree_test.kspl` is `lsp-tree`).
suite_file = suite/$(subst -,_,$(1))_test.kspl
suite_found := $(sort $(subst _,-,$(patsubst tests/suite/%_test.kspl,%, \
  $(wildcard tests/suite/*_test.kspl))))

# Caution: **Longest first, by CPU time** (not wall clock, a cold-cache round or Windows's 0.0x):
# `make -j` starts them in this order, and a heavy one at the back runs alone; `make test-suites`
# prints the numbers. `lsp-tree` leads, as its minute is spent waiting on the language server.
# `EXTRA_SUITES` comes from a clone's own make files (the root `Makefile`). **The compiler's copy
# (`extract-ksplc-core` / `extract-ksplc-rest`) runs apart from the other packages'**: each copy
# rebuilds itself and takes a share of the suites. **std's copy (`extract-std`) runs apart from the
# rest of the packages' (`extract-rest`)**: each runs its packages one after another, so together
# they would be the longest wait of a half.
SUITES := lsp-tree extract-ksplc-core extract-ksplc-rest extract-rest extract-std fmt-tree docref c-warnings docsnippet \
  conventions deps spec-claims vscode link-rules pytools recipe-bytes lint-gate own-machine \
  $(EXTRA_SUITES)

# Linux's image alone holds their tool (`race`: clang's ThreadSanitizer; `sanitize`: its address,
# leak and undefined-behaviour sanitizers): out of `test-suites`, run by `ci-shard-linux`.
LINUX_SUITES := race sanitize

ALL_SUITES := $(SUITES) $(LINUX_SUITES)

# A suite file in no list would never run, and nothing would say so. **These lists, and `SUITES`
# in `ksplc/Makefile`, stay written by hand, not made from the files**: a suite's place in `SUITES`
# sets when `make -j` starts it, so each new name needs that decision. This check asks for it as
# make starts.
suite_unlisted := $(filter-out $(ALL_SUITES),$(suite_found))
ifneq ($(suite_unlisted),)
$(error there are suite files listed in neither SUITES nor LINUX_SUITES: $(suite_unlisted))
endif
suite_missing := $(filter-out $(suite_found),$(ALL_SUITES))
ifneq ($(suite_missing),)
$(error there are names listed with no tests/suite/<name>_test.kspl: $(suite_missing))
endif

suite_cmd = ./$(SEED_EXE) run tests/$(1)

# Caution: **Not in $(CI_LOG_DIR)**, whose logs `tools/ci.kspl` counts as the gates that ran.
suite_times = $(SUITE_LOG_DIR)/$(1).times

# KANSO_SUITE labels each per-item line; **the table above is its sole origin**, not the suite side.
# `times` goes to a file (in a pipe it counts no children), and the status is returned after it.
## Local-cycle|test-*|One suite (the names are `SUITES` in `mk/test.mk` and in `ksplc/Makefile`; what it pins is in its header)
define suite_rule
test-$(1): $$(STAGE1_EXE) $$(SEED_EXE)
	@KANSO_ROOT="$$(CURDIR)" KANSO_MAKE="$$(MAKE)" KANSO_SUITE="$(1)" \
	  $$(call suite_cmd,$$(call suite_file,$(1))); r=$$$$?; \
	  times > $$(call suite_times,$(1)); exit $$$$r
endef
$(foreach s,$(ALL_SUITES),$(eval $(call suite_rule,$(s))))

test-%: $(STAGE1_EXE) $(SEED_EXE)
	@$(call pkg_make,ksplc) test-$*

FUZZ_PKGS := $(patsubst %/Makefile,%,$(shell grep -l '^test-fuzz:' $(wildcard */Makefile)))
$(addprefix test-,$(addsuffix -fuzz,$(FUZZ_PKGS))): test-%-fuzz: $(STAGE1_EXE) $(SEED_EXE)
	@$(call pkg_make,$*) test-fuzz
.PHONY: $(addprefix test-,$(addsuffix -fuzz,$(FUZZ_PKGS)))

# --- The BLAS backend built and run for real ---
# **ksai alone holds `#cfg(blas)`** (`make test-conventions` refuses one elsewhere), so its unit tests
# are all that `BLAS=1` changes; every other package would only repeat `make debug`.
## Gates|test-blas|Build and run ksai's unit tests on OpenBLAS (`BLAS=1`), the one package using it
test-blas: $(STAGE1_EXE) $(SEED_EXE)
	@$(call pkg_make,ksai) test-unit BLAS=1
.PHONY: test-blas

# --- A deep fuzzing run with a fresh seed ---
# CI replays each fuzzer's fixed seed at a shallow depth, which shows a regression; a fresh seed, run
# deep now and then, reaches inputs the fixed one never does. A finding prints the line that
# reproduces it (`--seed=` / `--trials=`), so the seed taken from the clock is not lost.
FUZZ_LONG_TRIALS ?= 2000
FUZZ_LONG_SEED ?= $(shell date +%s)
fuzz_long_args := FUZZ_ARGS="--trials=$(FUZZ_LONG_TRIALS) --seed=$(FUZZ_LONG_SEED)"
## Measure-and-inspect|fuzz-long|Fuzz every reader deep, and draw the property check long, with a fresh seed (`FUZZ_LONG_TRIALS=` / `FUZZ_LONG_SEED=`)
fuzz-long: $(STAGE1_EXE) $(SEED_EXE)
	@echo "# FUZZING DEEP: $(FUZZ_LONG_TRIALS) rounds a reader, seed $(FUZZ_LONG_SEED)"
	$(foreach p,$(FUZZ_PKGS),$(call pkg_make,$(p)) test-fuzz $(fuzz_long_args)$(nl))
	$(call pkg_make,ksplc) test-fuzz $(fuzz_long_args)
	$(call pkg_make,ksplc) test-property PROPERTY_ARGS="--n=600 --seed=$(FUZZ_LONG_SEED)"
.PHONY: fuzz-long

# --- The switches that make a missing tool fail rather than skip ---
# **Each is 1 on Linux**, where CI runs in the image of `.devcontainer/Dockerfile`, which holds
# every tool: a skip there would mean the image lost one, so the gate fails. Elsewhere each is 0,
# and the gate says SKIP. **On a Linux machine lacking a tool, set its switch to 0**: the gate then
# skips, and `tools/ci.kspl` lets that skip through and names the switch as the round ends, since
# such a round is not CI's verdict. Each reads 0 or 1 alone. What each requires, and what turning
# it off gives up, is "The switches that require a tool" in `docs/SPEC-gates.md`.
REQUIRE_SWITCHES := KANSO_REQUIRE_ASAN KANSO_REQUIRE_TSAN KANSO_REQUIRE_BOTH_CC \
  KANSO_REQUIRE_CHOWN KANSO_REQUIRE_MINGW KSBIND_REQUIRE_LIBS KSOS_REQUIRE_ARM KSMD_REQUIRE_BROWSER
require_default := $(if $(filter linux,$(PLATFORM)),1,0)
$(foreach v,$(REQUIRE_SWITCHES),$(eval $(v) ?= $(require_default)))
$(foreach v,$(REQUIRE_SWITCHES),$(if $(filter 0 1,$($(v))),,\
  $(error $(v)=$($(v)): only 0 or 1 is read (0 lets the gate skip where this machine lacks the tool))))
export $(REQUIRE_SWITCHES)
# The ones turned off where the platform requires them, for `tools/ci.kspl` (`--relaxed=`).
require_relaxed := $(if $(filter 1,$(require_default)),$(foreach v,$(REQUIRE_SWITCHES),\
  $(if $(filter 0,$($(v))),$(v))))

# `times` into seconds, ASCII with `#` as `\#` (above Makefile's `include`); MSYS2's 0.00s gets
# one line instead.
suite_cpu_prog := function sec(t) { split(t, a, /[ms]/); return a[1] * 60 + a[2] } \
  FNR == 2 { n = FILENAME; sub(/.*\//, "", n); sub(/\.times$$/, "", n); \
  k++; name[k] = n; cpu[k] = sec($$1) + sec($$2); tot += cpu[k] } \
  END { if (tot < 1) { \
      printf "\# suite cpu: not measurable on this host (the shell does not count native children)\n"; \
      exit } \
    printf "\# suite cpu seconds (user+sys), in SUITES order:\n"; \
    for (i = 1; i <= k; i++) { printf "\#   %-14s %6.2fs\n", name[i], cpu[i] } \
    printf "\# suite cpu total: %.1fs\n", tot }

# $(call suites_passed,<heading>,<suites>): the line saying they passed, and their CPU seconds
define suites_passed
	@echo "# $(1) PASSED ($(words $(2)) suites)"
	@awk '$(suite_cpu_prog)' $(foreach s,$(2),$(call suite_times,$(s)))
endef

## Gates|test-suites|Run every suite
test-suites: $(addprefix test-,$(SUITES))
	$(call suites_passed,ALL TEST SUITES,$(SUITES))

# --- The suites whose answer cannot differ by platform ---
# They read the tree's text, or translate it and compare text, so a second platform gives the same
# answer for its minutes (a Windows minute is billed double): CI runs them on Linux alone, as one
# set (`test-suites-text`). Caution: **Keep a suite out of here when it builds, links or runs what
# the platform decides** (`link-rules` reads `ksplc info link-libs`, which is the platform's).
SUITES_TEXT := fmt-tree conventions docref spec-claims docsnippet vscode recipe-bytes \
  lint-gate deps pytools

suites_text_unknown := $(filter-out $(SUITES),$(SUITES_TEXT))
ifneq ($(suites_text_unknown),)
$(error SUITES_TEXT holds a name absent from SUITES: $(suites_text_unknown))
endif

## Per-item|test-suites-text|The suites that read text alone (`SUITES_TEXT`), CI's Linux-only share
test-suites-text: $(addprefix test-,$(SUITES_TEXT))
	$(call suites_passed,TEST SUITES (text, Linux only),$(SUITES_TEXT))

# --- The two halves CI runs on separate jobs, of what is left ---
# **Each half holds one share of the compiler's copy and one of the other packages' two**, so no
# half waits on two long serial suites. Half A is what B leaves. Caution: **The two CI jobs that
# run the halves differ by platform**: Linux's rest job is the shorter, Windows's (with its LLVM
# gates) the longer. Before moving a suite, compare both platforms' job times in a run's job list.
# How the rest of the work is dealt between the jobs is "How the gates are arranged" in
# `docs/SPEC-gates.md`.
SUITES_B := extract-ksplc-rest extract-std lsp-tree c-warnings $(EXTRA_SUITES)
SUITES_A := $(filter-out $(SUITES_B) $(SUITES_TEXT),$(SUITES))

suites_b_unknown := $(filter-out $(SUITES),$(SUITES_B))
ifneq ($(suites_b_unknown),)
$(error SUITES_B holds a name absent from SUITES: $(suites_b_unknown))
endif

ifneq ($(words $(SUITES_A) $(SUITES_B) $(SUITES_TEXT)),$(words $(sort $(SUITES_A) $(SUITES_B) $(SUITES_TEXT))))
$(error a suite belongs to more than one CI share or is listed twice)
endif

## Per-item|test-suites-a|Half A of the remaining suites (what `SUITES_B` leaves), one CI job's share
test-suites-a: $(addprefix test-,$(SUITES_A))
	$(call suites_passed,TEST SUITES (half A),$(SUITES_A))

## Per-item|test-suites-b|Half B of the remaining suites (`SUITES_B`), one CI job's share
test-suites-b: $(addprefix test-,$(SUITES_B))
	$(call suites_passed,TEST SUITES (half B),$(SUITES_B))

## Local-cycle|test-extract|Every package with its own `Makefile` from a copy (both halves)
test-extract: test-extract-ksplc test-extract-rest test-extract-std

## Per-item|test-extract-ksplc|The compiler from isolated copies, both suite shares
test-extract-ksplc: test-extract-ksplc-core test-extract-ksplc-rest

.PHONY: test-suites test-suites-a test-suites-b test-suites-text test-extract test-extract-ksplc $(addprefix test-,$(ALL_SUITES))

# --- Checking the generated LLVM IR's signature agreement ---
# Caution: **LLVM's verifier does not match a call against its `define`**: only a stack argument
# (Win64's fifth on) breaks. **The checker is built by the seed**, or a mistake enters both sides.
## Gates|test-llvm-abi|See in the IR whether the direct caller's argument types agree with the `define` side
test-llvm-abi: $(STAGE1_EXE) $(SEED_EXE)
	@echo "# VERIFYING LLVM IR CALL SIGNATURES (caller vs callee)"
	./$(STAGE1_EXE) --to=llvm ksplc/main.kspl $(TMP_DIR)/abi_check_ksplc.ll
	./$(STAGE1_EXE) --to=llvm tests/debug/main.kspl $(TMP_DIR)/abi_check_debug.ll
	./$(STAGE1_EXE) --to=llvm ksplc/tests/runtime/main_result_without_sys.kspl \
	  $(TMP_DIR)/abi_check_main_result.ll
	./$(SEED_EXE) run tests/tools/llvm_ir_abi_check.kspl $(TMP_DIR)/abi_check_ksplc.ll \
	  $(TMP_DIR)/abi_check_debug.ll $(TMP_DIR)/abi_check_main_result.ll

# --- Comparing std/math's freestanding version numerically against the real libm ---
## Gates|test-freestanding-math|Whether the math functions of the OS-less configuration give the same answers as hosted
test-freestanding-math: $(STAGE1_EXE)
	@echo "# RUNNING freestanding std/math vs libm numerical test"
	./$(STAGE1_EXE) --freestanding tests/freestanding/probe.kspl $(TMP_DIR)/fm_probe.c
	$(CC) -std=c99 -O2 -ffreestanding -ffunction-sections -fdata-sections -c $(TMP_DIR)/fm_probe.c -o $(TMP_DIR)/fm_probe.o
	$(CC) -std=c99 -O2 tests/freestanding/harness.c $(TMP_DIR)/fm_probe.o -lm \
		$(GC_SECTIONS_FLAG) -o $(TMP_DIR)/fm_test.exe
	./$(TMP_DIR)/fm_test.exe

# --- Whether ksai's hot loops auto-vectorize at -O3, with no hand-written SIMD intrinsic ---
# **Each loop is checked at its own place**, found by the comment on the line before it naming
# `make test-simd`: a function holding a loop that vectorizes would otherwise pass for another.
# **The place is where the generated C's `for` sits as `#line` counts it**, which can fall past the
# `.kspl` line of the loop, so it is read from the C; the record (`-g`) says which places vectorized.
# **A short sum is vectorized whole, not as a loop**: the C compiler unrolls a loop of 32 and turns
# its sum into vector code (the SLP vectorizer). A comment saying "sees this sum vectorize" asks
# for that instead, at the sum's own line, the one after the `for`.
simd_prog := FILENAME == src && index($$0, "`make test-simd` sees this sum") { sum[FNR + 2] = 1; \
    n++; next } \
  FILENAME == src && index($$0, "`make test-simd`") { want[FNR + 1] = 1; n++ } \
  FILENAME == gen && /^\#line / { at = 0; \
    if ($$3 == "\"" src "\"" && ($$2 in want) && !($$2 in place)) { at = $$2; p = $$2 - 1 }; next } \
  FILENAME == gen && at { p++; if ($$0 ~ /^[ \t]*for \(/) { place[at] = p; at = 0 } } \
  FILENAME == rec && /^--- / { passed = ($$0 ~ /!Passed/) } \
  FILENAME == rec && /^Name:/ { vec = passed && $$2 == "Vectorized"; \
    red = passed && $$2 == "VectorizedHorizontalReduction" } \
  FILENAME == rec && /^DebugLoc:/ && (vec || red) && index($$0, "File: \047" src "\047") { \
    if (match($$0, /Line: [0-9]+/)) { line = substr($$0, RSTART + 6, RLENGTH - 6) + 0; \
      if (vec) done[line] = 1; else summed[line] = 1 } } \
  END { if (n == 0) { print "RESULT: SOME FAILED (1) -> no loop in " src " names make test-simd"; \
      exit 1 } \
    for (l in want) if (!(l in place) || !((place[l]) in done)) { bad = 1; \
      print "RESULT: SOME FAILED (1) -> the loop at " src ":" l " no longer auto-vectorizes at -O3" } \
    for (l in sum) if (!(l in summed)) { bad = 1; \
      print "RESULT: SOME FAILED (1) -> the sum at " src ":" l " no longer auto-vectorizes at -O3" } \
    if (bad) exit 1; \
    print "  -> " n " loops in " src " auto-vectorize at -O3" }
# $(call simd_check,<program>,<the .kspl its loops are in>,<stem>): builds it, then checks them
define simd_check
	./$(STAGE1_EXE) $(1) $(TMP_DIR)/$(3).c
	@$(CC) -std=c99 -O3 -g -c $(TMP_DIR)/$(3).c -o $(TMP_DIR)/$(3).o -fsave-optimization-record \
		-foptimization-record-file=$(LOG_DIR)/$(3).yaml \
		-foptimization-record-passes='loop-vectorize|slp-vectorizer'
	@awk -v src=$(2) -v gen=$(TMP_DIR)/$(3).c -v rec=$(LOG_DIR)/$(3).yaml '$(simd_prog)' \
		$(2) $(TMP_DIR)/$(3).c $(LOG_DIR)/$(3).yaml
endef

## Gates|test-simd|Whether the loops that should vectorize appear vectorized in the optimization record
test-simd: $(STAGE1_EXE)
	@echo "# VERIFYING ksai's hot loops auto-vectorize (-O3 loop vectorizer)"
	$(call simd_check,ksai/examples/llama_engine/main.kspl,ksai/tensor.kspl,simd_check)
	$(call simd_check,ksai/examples/qwen_infer/main.kspl,ksai/nn.kspl,simd_check_qwen)
	$(call simd_check,ksai/benches/bench_quant.kspl,ksai/quant.kspl,simd_check_quant)
	$(call simd_check,ksai/benches/bench_qwen.kspl,ksai/delta_net.kspl,simd_check_delta)
	@# Caution: **Do not remove this line.** It is the gate's verdict (`Gate.verdict`).
	@echo "RESULT: ALL PASS (every loop naming make test-simd auto-vectorizes at -O3)"

# --- The published API: its record (`SURFACE.txt`), and the reference to browse under `out/docs/` ---
# Caution: **Only the record is committed** (an API change shows as a diff); remake it by
# `make surface`. The reference is `ksplc doc`'s answer, written out only to be browsed.
# **A package publishes an API when it holds a `SURFACE.txt`**, so the file enrolls it: an empty
# one is enough for `make surface` to write the first record.
SURFACE_PKGS := $(patsubst %/SURFACE.txt,%,$(wildcard */SURFACE.txt))

## Measure-and-inspect|surface|Rewrite each package's API record (`SURFACE.txt`), and write its reference to browse under `out/docs/`
surface: $(STAGE1_EXE)
	@echo "# UPDATING THE PUBLISHED API'S RECORDS, AND WRITING THE REFERENCE UNDER out/docs/"
	$(foreach p,$(SURFACE_PKGS),./$(STAGE1_EXE) run tools/surface.kspl write $(p) --ksplc=$(STAGE1_EXE)$(nl))
	$(foreach p,$(SURFACE_PKGS),./$(STAGE1_EXE) run tools/surface.kspl pages $(p) --ksplc=$(STAGE1_EXE)$(nl))

# **This is the only `RESULT:` line**; it also refuses a published declaration that says nothing.
## Gates|test-surface|Whether the published API matches its record, and every entry says what it is
test-surface: $(STAGE1_EXE)
	@echo "# CHECKING THE PUBLISHED API'S RECORDS (run 'make surface' to update)"
	$(foreach p,$(SURFACE_PKGS),./$(STAGE1_EXE) run tools/surface.kspl check $(p) --ksplc=$(STAGE1_EXE)$(nl))
	@echo "RESULT: ALL PASS ($(words $(SURFACE_PKGS)) package record(s) match)"

.PHONY: surface test-surface

# --- The language tutorial ---
## Measure-and-inspect|tutorial|Rewrite the language tutorial (`docs/TUTORIAL-programming-language.md`) from its program
tutorial: $(STAGE1_EXE)
	@echo "# WRITING THE TUTORIAL OF THE LANGUAGE"
	./$(STAGE1_EXE) run tools/tutorial.kspl write --ksplc=$(STAGE1_EXE)

## Gates|test-docs|Whether the language tutorial matches its program, and its code blocks run as it
test-docs: $(STAGE1_EXE)
	@echo "# CHECKING THE TUTORIAL OF THE LANGUAGE (run 'make tutorial' to update)"
	./$(STAGE1_EXE) run tools/tutorial.kspl check --ksplc=$(STAGE1_EXE)
	@echo "RESULT: ALL PASS (the tutorial matches its program)"

.PHONY: tutorial test-docs
