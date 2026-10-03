# ==================================================================
# mk/test.mk — running the tests (debug / test-suites / test-simd and others)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==================================================================
## Local-cycle|debug|Run the tests `tests/debug/main.kspls` calls, in one executable
DEBUG_RT := $(if $(filter 1,$(LLVM)),$(GEN_DIR)/test_debug_runtime.c,)
debug: $(STAGE1_EXE)
	@echo "# RUNNING DEBUG TESTS ($(BACKEND), BLAS=$(BLAS), TLS=$(TLS), DB=$(DB))"
	./$(STAGE1_EXE) $(KSPL_FLAGS) $(TARGET_FLAG) $(AI_KSPL_FLAGS) $(TLS_KSPL_FLAGS) $(DB_KSPL_FLAGS) --emit-libs=$(DEBUG_LIBS) tests/debug/main.kspls $(DEBUG_OUT)
	$(if $(DEBUG_RT),./$(STAGE1_EXE) emit-runtime $(DEBUG_RT))
	$(CC) $(CFLAGS) $(TLS_CFLAGS) $(DEBUG_OUT) $(DEBUG_RT) @$(DEBUG_LIBS) $(TLS_LIB) $(LDLIBS) -o $(DEBUG_EXE)
	./$(DEBUG_EXE)

# --- Building a single file for debugging (VS Code's F5) ---
# Caution: **The output's name agrees with launch.json's `${fileBasenameNoExtension}.exe`**, or F5
# silently starts the previous executable. It is the shell's basename of $(SRC_KSPL), **quoted**.
export DEBUG_FILE_USAGE_NOTE := (normally called from VS Code's F5 / the task "build-current-file")
## Local-cycle|debug-file|Build one `.kspls` with debug information (`SRC_KSPL=`; VS Code's F5 calls this)
debug-file: $(STAGE1_EXE)
	@set -e; \
	if [ -z "$(SRC_KSPL)" ]; then \
		echo "Usage: make debug-file SRC_KSPL=path/to/file.kspls"; \
		printf '  %s\n' "$$DEBUG_FILE_USAGE_NOTE"; \
		exit 1; \
	fi; \
	stem="$(OUT_STEM)"; \
	if [ -z "$$stem" ]; then stem="$$(basename "$(SRC_KSPL)")"; stem="$${stem%.*}"; fi; \
	gen="$(OUT_DIR)/$$stem.$(TARGET_EXT)"; exe="$(OUT_DIR)/$$stem.exe"; libf="$(OUT_DIR)/$$stem.libs"; \
	echo "# BUILDING $(SRC_KSPL) FOR DEBUGGING ($(BACKEND))"; \
	echo "./$(STAGE1_EXE) $(KSPL_FLAGS) $(TARGET_FLAG) \"$(SRC_KSPL)\" \"$$gen\""; \
	./$(STAGE1_EXE) $(KSPL_FLAGS) $(TARGET_FLAG) $(AI_KSPL_FLAGS) $(TLS_KSPL_FLAGS) $(DB_KSPL_FLAGS) --emit-libs="$$libf" "$(SRC_KSPL)" "$$gen"; \
	if [ "$(BACKEND)" = "c" ]; then $(C_FMT) "$$gen"; fi; \
	rt=""; if [ "$(BACKEND)" = "llvm" ]; then rt="$(OUT_DIR)/$$stem.runtime.c"; ./$(STAGE1_EXE) emit-runtime "$$rt"; fi; \
	echo "$(CC) $(CFLAGS) \"$$gen\" $$rt \"@$$libf\" $(LDLIBS) -o \"$$exe\""; \
	$(CC) $(CFLAGS) $(TLS_CFLAGS) "$$gen" $$rt "@$$libf" $(TLS_LIB) $(LDLIBS) -o "$$exe"; \
	echo "# BUILT $$exe"

# --- One package's worth of tests (`make debug-<name>`) ---
DEBUG_PKGS := $(sort $(patsubst tests/debug/pkg/%.kspls,%,$(wildcard tests/debug/pkg/*.kspls)))

# The $(error) keeps `tests/debug/pkg/` level with the packages holding `tests/all`: a forgotten
# entry point would only say "no such target". A package with its own `Makefile` holds none.
# Both notations are looked at: without the `.kspl` arm a braces package drops out unseen.
OWN_MAKE_PKGS := $(sort $(patsubst %/Makefile,%,$(wildcard */Makefile)))
DEBUG_TESTED := $(filter-out $(OWN_MAKE_PKGS), \
                  $(sort $(patsubst %/tests/all.kspls,%,$(wildcard */tests/all.kspls)) \
                         $(patsubst %/tests/all.kspl,%,$(wildcard */tests/all.kspl))))
ifneq ($(DEBUG_PKGS),$(DEBUG_TESTED))
$(error the entry points in tests/debug/pkg/ and the packages holding test/all disagree: entry point only=$(filter-out $(DEBUG_TESTED),$(DEBUG_PKGS)) / no entry point=$(filter-out $(DEBUG_PKGS),$(DEBUG_TESTED)))
endif

# Nobody reads this target's C, so it is not tidied: **`C_FMT=:`**, as an empty one would run the C.
C_FMT_OFF := C_FMT=:

# Caution: **Not `out/<package name>.exe`**: tools look names up in `out/` (kssrv would start the
# tests as `out/ksplc.exe`, its language server) and fail with nothing said. Hence `debug_`.
## Local-cycle|debug-*|Run only that package's tests (the name is the notation of `tests/debug/pkg/`)
define debug_pkg_rule
debug-$(1): $$(STAGE1_EXE)
	@$$(MAKE) --no-print-directory debug-file SRC_KSPL=tests/debug/pkg/$(1).kspls \
		OUT_STEM=debug_$(1) $$(C_FMT_OFF)
	./$$(OUT_DIR)/debug_$(1).exe
endef
$(foreach p,$(DEBUG_PKGS),$(eval $(call debug_pkg_rule,$(p))))

# **The one way to call a package's `Makefile`**: $(call pkg_make,<package>) <target> [<var>=<val>]
pkg_make = KSPLC_STD_DIR="$(abspath std)" KSPLC_PKG_SRC_DIR="$(abspath .)" \
  $(MAKE) --no-print-directory -C $(1) KSPLC="$(abspath $(STAGE1_EXE))" \
  RUNNER="$(abspath $(SEED_EXE))" UNDER="$(abspath $(STAGE1_EXE))" \
  SCRATCH="$(abspath $(TMP_DIR))/$(1)-suites" FUZZ_SEEDS="$(abspath .)"

define own_make_rule
debug-$(1): $$(STAGE1_EXE) $$(SEED_EXE)
	@$$(call pkg_make,$(1)) test
endef
$(foreach p,$(OWN_MAKE_PKGS),$(eval $(call own_make_rule,$(p))))

.PHONY: $(addprefix debug-,$(DEBUG_PKGS) $(OWN_MAKE_PKGS))

# --- The test suites ---
# **The compiler's copy runs apart from the others**: it rebuilds itself and runs its suites, the
# longest copy by far, so CI can start it beside them (`test-extract` below is both).
suite_extract-ksplc := suite/extract_ksplc_test.kspls
suite_extract-rest := suite/extract_rest_test.kspls
suite_vscode       := suite/vscode_test.kspls
suite_docref       := suite/docref_test.kspls
suite_conventions  := suite/conventions_test.kspls
suite_docsnippet   := suite/docsnippet_test.kspls
suite_mdtrip       := suite/mdtrip_test.kspls
suite_textrip      := suite/textrip_test.kspls
suite_lsp-tree     := suite/lsp_tree_test.kspls
suite_link-flags   := suite/link_flags_test.py
suite_pytools      := suite/pytools_test.kspls
suite_keywords     := suite/keywords_test.kspls
suite_c-warnings   := suite/c_warnings_test.kspls
suite_pilot-copy   := suite/pilot_copy_test.kspls
suite_recipe-bytes := suite/recipe_bytes_test.kspls
suite_deps         := suite/deps_test.kspls
suite_js-syntax    := suite/js_syntax_test.kspls
suite_race         := suite/race_test.kspls
suite_spec-claims  := suite/spec_claims_test.kspls
suite_kspls-trip   := suite/kspls_trip_test.kspls
suite_lint-gate    := suite/lint_gate_test.kspls
suite_carve        := suite/carve_test.kspls

# Caution: **Longest first, by CPU time** (not wall clock, a cold-cache round or Windows's 0.0x):
# `make -j` starts them in this order, and a heavy one at the back runs alone; `make test-suites`
# prints the numbers. `lsp-tree` leads, as its minute is spent waiting on the language server.
# `PRIVATE_SUITES` stands only where `private/` does (the root `Makefile`).
SUITES := lsp-tree extract-ksplc extract-rest kspls-trip c-warnings conventions docref pilot-copy \
  carve deps spec-claims mdtrip textrip docsnippet vscode recipe-bytes lint-gate keywords pytools \
  link-flags $(PRIVATE_SUITES)

# Linux's image alone holds their tool (`js-syntax`: node; `race`: clang's ThreadSanitizer): out of
# `test-suites`, run by `ci-linux`.
LINUX_SUITES := js-syntax race

ALL_SUITES := $(SUITES) $(LINUX_SUITES)

suite_declared := $(sort $(patsubst suite_%,%,$(filter suite_%,$(.VARIABLES))))
suite_unlisted := $(filter-out $(ALL_SUITES),$(suite_declared))
ifneq ($(suite_unlisted),)
$(error there are suites listed in neither SUITES nor LINUX_SUITES: $(suite_unlisted))
endif
suite_undeclared := $(filter-out $(suite_declared),$(ALL_SUITES))
ifneq ($(suite_undeclared),)
$(error there are names listed with no suite_<name>: $(suite_undeclared))
endif

suite_cmd = $(if $(filter %.kspls,$(firstword $(1))),./$(SEED_EXE) run tests/$(1),python3 tests/$(1))

# Caution: **Not in $(CI_LOG_DIR)**, which mk/ci.mk's $(ci_digest) counts as the gates that ran.
suite_times = $(SUITE_LOG_DIR)/$(1).times

# KANSO_SUITE labels each per-item line; **the table above is its sole origin**, not the suite side.
# `times` goes to a file (in a pipe it counts no children), and the status is returned after it.
## Local-cycle|test-*|One suite (the names are `SUITES` in `mk/test.mk` and in `ksplc/Makefile`; what it pins is in its header)
define suite_rule
test-$(1): $$(STAGE1_EXE) $$(SEED_EXE)
	@KANSO_ROOT="$$(CURDIR)" KANSO_MAKE="$$(MAKE)" KANSO_SUITE="$(1)" \
	  $$(call suite_cmd,$$(suite_$(1))); r=$$$$?; \
	  times > $$(call suite_times,$(1)); exit $$$$r
endef
$(foreach s,$(ALL_SUITES),$(eval $(call suite_rule,$(s))))

test-%: $(STAGE1_EXE) $(SEED_EXE)
	@$(call pkg_make,ksplc) test-$*

FUZZ_PKGS := $(patsubst %/Makefile,%,$(shell grep -l '^test-fuzz:' $(wildcard */Makefile)))
$(addprefix test-,$(addsuffix -fuzz,$(FUZZ_PKGS))): test-%-fuzz: $(STAGE1_EXE) $(SEED_EXE)
	@$(call pkg_make,$*) test-fuzz
.PHONY: $(addprefix test-,$(addsuffix -fuzz,$(FUZZ_PKGS)))

# Caution: **ksai's address sanitizer is mandatory on Linux**, whose image holds it: no silent pass.
export KSAI_REQUIRE_ASAN := $(if $(filter linux,$(PLATFORM)),1,)
# The same for `test-race`'s ThreadSanitizer (`tests/suite/race_test.kspls`).
export KANSO_REQUIRE_TSAN := $(if $(filter linux,$(PLATFORM)),1,)

# `times` into seconds, ASCII with `#` as `\#` (above Makefile's `include`); MSYS2's 0.00s gets
# one line instead.
suite_cpu_prog := function sec(t) { split(t, a, /[ms]/); return a[1] * 60 + a[2] } \
  FNR == 2 { n = FILENAME; sub(/.*suite_/, "", n); sub(/\.times$$/, "", n); \
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

# --- The two halves CI runs on separate jobs ---
# **Cut for the two jobs to end together on Windows**, the slowest (by the job log's timestamps;
# MSYS2 counts no child's CPU); half A is what B leaves. A's two slots are the two extract halves,
# the small suites filling the shorter one; `sync-share`, slow on Windows, rides B's wait.
SUITES_B := lsp-tree kspls-trip c-warnings conventions docref $(PRIVATE_SUITES)
SUITES_A := $(filter-out $(SUITES_B),$(SUITES))

suites_b_unknown := $(filter-out $(SUITES),$(SUITES_B))
ifneq ($(suites_b_unknown),)
$(error SUITES_B holds a name absent from SUITES: $(suites_b_unknown))
endif

test-suites-a: $(addprefix test-,$(SUITES_A))
	$(call suites_passed,TEST SUITES (half A),$(SUITES_A))

test-suites-b: $(addprefix test-,$(SUITES_B))
	$(call suites_passed,TEST SUITES (half B),$(SUITES_B))

## Local-cycle|test-extract|Every package with its own `Makefile` from a copy (both halves)
test-extract: test-extract-ksplc test-extract-rest

.PHONY: test-suites test-suites-a test-suites-b test-extract $(addprefix test-,$(ALL_SUITES))

# --- Checking the generated LLVM IR's signature agreement ---
# Caution: **LLVM's verifier does not match a call against its `define`**: only a stack argument
# (Win64's fifth on) breaks. **The checker is built by the seed**, or a mistake enters both sides.
## Gates|test-llvm-abi|See in the IR whether the direct caller's argument types agree with the `define` side
test-llvm-abi: $(STAGE1_EXE) $(SEED_EXE)
	@echo "# VERIFYING LLVM IR CALL SIGNATURES (caller vs callee)"
	./$(STAGE1_EXE) --target=llvm ksplc/main.kspls $(TMP_DIR)/abi_check_ksplc.ll
	./$(STAGE1_EXE) --target=llvm tests/debug/main.kspls $(TMP_DIR)/abi_check_debug.ll
	./$(STAGE1_EXE) --target=llvm ksplc/tests/runtime/main_result_without_sys.kspls \
	  $(TMP_DIR)/abi_check_main_result.ll
	./$(SEED_EXE) run tests/tools/llvm_ir_abi_check.kspls $(TMP_DIR)/abi_check_ksplc.ll \
	  $(TMP_DIR)/abi_check_debug.ll $(TMP_DIR)/abi_check_main_result.ll

# --- Comparing std/math's freestanding version numerically against the real libm ---
## Gates|test-freestanding-math|Whether the math functions of the OS-less configuration give the same answers as hosted
test-freestanding-math: $(STAGE1_EXE)
	@echo "# RUNNING freestanding std/math vs libm numerical test"
	./$(STAGE1_EXE) --freestanding tests/freestanding/probe.kspls $(TMP_DIR)/fm_probe.c
	$(CC) -std=c99 -O2 -ffreestanding -ffunction-sections -fdata-sections -c $(TMP_DIR)/fm_probe.c -o $(TMP_DIR)/fm_probe.o
	$(CC) -std=c99 -O2 tests/freestanding/harness.c $(TMP_DIR)/fm_probe.o $(MATH_LIB) \
		$(GC_SECTIONS_FLAG) -o $(TMP_DIR)/fm_test.exe
	./$(TMP_DIR)/fm_test.exe

# --- Whether ksai's hot paths auto-vectorize at -O3, with no hand-written SIMD intrinsic ---
define simd_check
	@line=$$($(3)); \
	if grep -q "$(2):$$line:.*vectorized loop (vectorization" $(4); then \
		echo "  -> $(1) ($(2):$$line) auto-vectorizes at -O3"; \
	else \
		echo "RESULT: SOME FAILED (1) -> $(1) ($(2):$$line) no longer auto-vectorizes at -O3"; \
		grep "$(notdir $(2)):$$line" $(4) || true; \
		exit 1; \
	fi
endef


SIMD_TENSOR_FNS  := matmul_kernel add_bias rmsnorm softmax
SIMD_TENSOR_LINE  = grep -n 'fn $(1)' ksai/tensor.kspls | head -1 | cut -d: -f1
SIMD_LORA_LINE   := awk '/^impl<\|T\|> Gqa_attention<\|T\|>/{f=1} f && /fn forward_lora/{print NR; exit}' ksai/nn.kspls

## Gates|test-simd|Whether what should vectorize appears in the optimization report
test-simd: $(STAGE1_EXE)
	@echo "# VERIFYING ksai/tensor.kspls auto-vectorization (-O3 loop vectorizer)"
	./$(STAGE1_EXE) ksai/examples/llama_engine/main.kspls $(TMP_DIR)/simd_check.c
	@$(CC) -std=c99 -O3 -c $(TMP_DIR)/simd_check.c -o $(TMP_DIR)/simd_check.o \
		-Rpass=loop-vectorize 2> $(LOG_DIR)/simd_check.log || true
	$(foreach f,$(SIMD_TENSOR_FNS),$(call simd_check,$(f),ksai/tensor.kspls,$(call SIMD_TENSOR_LINE,$(f)),$(LOG_DIR)/simd_check.log)$(nl))
	@echo "# VERIFYING ksai/nn.kspls Gqa_attention.forward_lora auto-vectorization (-O3 loop vectorizer)"
	./$(STAGE1_EXE) ksai/examples/qwen_infer/main.kspls $(TMP_DIR)/simd_check_qwen.c
	@$(CC) -std=c99 -O3 -c $(TMP_DIR)/simd_check_qwen.c -o $(TMP_DIR)/simd_check_qwen.o \
		-Rpass=loop-vectorize 2> $(LOG_DIR)/simd_check_qwen.log || true
	$(call simd_check,Gqa_attention.forward_lora,ksai/nn.kspls,$(SIMD_LORA_LINE),$(LOG_DIR)/simd_check_qwen.log)
	@# Caution: **Do not remove this line.** It is the only `RESULT:` line ci_check looks at.
	@echo "RESULT: ALL PASS ($(words $(SIMD_TENSOR_FNS)) + 1 functions auto-vectorize at -O3)"

MUTANTS_MAX ?=
## Measure-and-inspect|test-mutants|Sow seeds and count the proportion the tests catch (it emits no verdict)
test-mutants: $(STAGE1_EXE)
	@echo "# MEASURING which decisions the tests actually pin"
	@if [ -z "$(FILE)" ]; then \
		echo "RESULT: SOME FAILED (1) -> pass FILE=<path> (the range is named on purpose)"; exit 1; fi
	./$(STAGE1_EXE) run tests/tools/mutants.kspls $(FILE) $(MAX)

.PHONY: test-mutants

## Build-and-install|carve|Carve a package out into a read-only copy of its own (PKG=<package>; DEST= and URL= optional)
carve: $(SEED_EXE)
	@if [ -z "$(PKG)" ]; then echo "carve: name the package (PKG=<package>)"; exit 1; fi
	./$(SEED_EXE) run tests/tools/carve.kspls "$(PKG)" "$(if $(DEST),$(DEST),out/carve/$(PKG))" \
		$(if $(URL),"$(URL)")

.PHONY: carve

# --- The published API: its record (`SURFACE.txt`), and the reference to browse under `out/docs/` ---
# Caution: **Only the record is committed** (an API change shows as a diff); remake it by
# `make surface`. The reference is `ksplc doc`'s answer, written out only to be browsed.
SURFACE_PKGS := std ksai kspeg ksdb

## Measure-and-inspect|surface|Rewrite each package's API record (`SURFACE.txt`), and write its reference to browse under `out/docs/`
surface: $(STAGE1_EXE)
	@echo "# UPDATING THE PUBLISHED API'S RECORDS, AND WRITING THE REFERENCE UNDER out/docs/"
	$(foreach p,$(SURFACE_PKGS),./$(STAGE1_EXE) run tools/surface.kspls write $(p)$(nl))
	$(foreach p,$(SURFACE_PKGS),./$(STAGE1_EXE) run tools/surface.kspls pages $(p)$(nl))

# **This is the only `RESULT:` line**; it also refuses a published declaration that says nothing.
## Gates|test-surface|Whether the published API matches its record, and every entry says what it is
test-surface: $(STAGE1_EXE)
	@echo "# CHECKING THE PUBLISHED API'S RECORDS (run 'make surface' to update)"
	$(foreach p,$(SURFACE_PKGS),./$(STAGE1_EXE) run tools/surface.kspls check $(p)$(nl))
	@echo "RESULT: ALL PASS ($(words $(SURFACE_PKGS)) package record(s) match)"

.PHONY: surface test-surface

# --- The tour of the language ---
## Measure-and-inspect|tour|Rewrite the tour of the language (`docs/TOUR.md`) from its program
tour: $(STAGE1_EXE)
	@echo "# WRITING THE TOUR OF THE LANGUAGE"
	./$(STAGE1_EXE) run tools/tour.kspls write

## Gates|test-docs|Whether the tour of the language matches its program and what it prints
test-docs: $(STAGE1_EXE)
	@echo "# CHECKING THE TOUR OF THE LANGUAGE (run 'make tour' to update)"
	./$(STAGE1_EXE) run tools/tour.kspls check
	@echo "RESULT: ALL PASS (the tour matches its program)"

.PHONY: tour test-docs

# --- The table of diagnostic codes in ksplc/docs/SPEC-tools.md ---
# `make test-conventions` refuses a table that differs from the sections it lists.
## Measure-and-inspect|code-table|Rewrite the table of diagnostic codes in `ksplc/docs/SPEC-tools.md` from the sections below it
code-table: $(STAGE1_EXE)
	./$(STAGE1_EXE) run tools/code_table.kspls

.PHONY: code-table
