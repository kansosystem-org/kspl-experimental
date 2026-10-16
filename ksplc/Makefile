# ksplc -- testing this package, and rebuilding the compiler it holds, on its own
# From a `ksplc`, the `std` it carries and kspeg: where the `std` is comes from the ksplc itself,
# or from `KSPLC_STD_DIR`; where kspeg is, from `KSPLC_PKG_SRC_DIR`.
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# What the compiler is translated into: `c`, or `llvm`.
TARGET ?= c
ifeq ($(origin CC),default)
CC := clang
endif
# The compiler asks `CC` which target it builds for, when it names the link flags below.
export CC
CFLAGS ?= -std=c99 -Wall -g -O0

.PHONY: test test-answers test-suites self-host translate build compare verdict
test: test-answers test-suites

test-answers:
	"$(KSPLC)" run tests/main.kspl

# --- The checks that drive the compiler from outside (`make test-suites`) ---
# A suite is a program `RUNNER` (the ksplc handed over) runs, inspecting `UNDER` (this folder's
# compiler, made where missing), never the same one, or a broken compiler and a failed check look
# alike. `SCRATCH` holds each suite's scratch, a place of its own, emptied before it runs where it
# can be (each run then works in a fresh folder inside it, so a leftover is never read).
# Caution: **Do not let a folder that cannot be emptied stop the suite**: on Windows a file a virus
# scanner or a sync client holds cannot be deleted, and every run from then on would fail.
# Caution: **Keep `SCRATCH` outside this folder**, where a case's material would belong to package
# `ksplc`; the suites refuse such a place.
RUNNER ?= $(KSPLC)
UNDER ?= $(OUT)/ksplc_stage1.exe
SCRATCH ?= $(or $(TMPDIR),/tmp)/ksplc-suites
# A suite's name is its file's stem under `tests/suite/` with `-` for `_` (`std_dir_test.kspl` is
# `std-dir`).
suite_file = tests/suite/$(subst -,_,$(1))_test.kspl
suite_found := $(sort $(subst _,-,$(patsubst tests/suite/%_test.kspl,%, \
  $(wildcard tests/suite/*_test.kspl))))
# `--n=N` / `--seed=N` replace the draw's count and its start (`make fuzz-long` hands a fresh seed).
PROPERTY_ARGS ?=
suite_args_property = --n=60 $(PROPERTY_ARGS)
# **List them by how long they take, the longest first**: `make -j` starts them in this order.
# Caution: **Keep `make test SUITES=` the whole rest of `make test`.** A check that runs each suite
# apart, under a time limit of its own, runs that first and then `make test-<name>` per name here.
SUITES := lsp run run-source generic-matrix thin-use negative runtime std-dir emit-runtime ship \
  property limits lint cli kspls split equiv ast-cache broken-pipe config ext-import \
  debug-line decl-macros spawn file-path place visibility fmt doc \
  layout-targets
# The scattering is a suite too, run apart (`make test-fuzz`) and handed, after the two places, the
# folder its seeds come from besides `std` (this one unless named) and `--trials=N` / `--seed=N`.
FUZZ_SEEDS ?= .
FUZZ_ARGS ?=
suite_args_fuzz = "$(FUZZ_SEEDS)" $(FUZZ_ARGS)
# A suite file left out of SUITES, or a name with no file, would never run in `make test`, and
# nothing would say so. **Only the list written here is held to it**: `make test SUITES=` names a
# part on purpose.
ifneq ($(origin SUITES),command line)
suite_unlisted := $(filter-out $(SUITES) fuzz,$(suite_found))
ifneq ($(suite_unlisted),)
$(error there are suite files missing from SUITES: $(suite_unlisted))
endif
suite_missing := $(filter-out $(suite_found),$(SUITES))
ifneq ($(suite_missing),)
$(error there are names in SUITES with no tests/suite/<name>_test.kspl: $(suite_missing))
endif
endif

test-suites: $(addprefix test-,$(SUITES))

test-%: $(UNDER)
	$(if $(filter $*,$(suite_found)),,$(error no suite is named $*; the names are SUITES in this file))
	@rm -rf "$(SCRATCH)/$*" || true
	KANSO_SUITE=$* "$(RUNNER)" run $(call suite_file,$*) "$(UNDER)" "$(SCRATCH)/$*" \
		$(suite_args_$*)

# --- Rebuilding the compiler (`make self-host`) ---
# The ksplc handed over makes stage1, stage1 makes stage2, and the two must not differ by one byte;
# a build from the seed runs the same steps below with its own places.
# Caution: **Name no platform here.** A build takes its link flags from the compiler that made the
# code (`info exe-flags`, `info link-libs`), the stack size Windows wants among them.
# Each step runs in `RUN_FROM` (this folder unless named), every path it is handed relative to it.
RUN_FROM ?= .
ENTRY_FILE ?= main.kspl
# What the compiler is handed besides the entry file.
FLAGS ?= $(if $(filter llvm,$(TARGET)),--to=llvm)

# $(call translate_cmd,<compiler>,<to>,<runtime or empty>)
translate_cmd = cd "$(RUN_FROM)" && "$(1)" $(FLAGS) "$(ENTRY_FILE)" "$(2)" \
  $(if $(3),&& "$(1)" emit-runtime "$(3)")
# $(call build_cmd,<compiler that made the code>,<from>,<runtime or empty>,<exe>)
build_cmd = cd "$(RUN_FROM)" && "$(CC)" $(CFLAGS) $$("$(1)" info exe-flags) "$(2)" $(3) \
  $$("$(1)" info link-libs) -o "$(4)"
# $(call compare_cmd,<one>,<the other>,<diff>): byte for byte, so `diff` takes no option that
# ignores some (`-w` passes a space added inside a string literal); a file that cannot be read fails.
compare_cmd = cd "$(RUN_FROM)" && { diff "$(1)" "$(2)" > "$(3)"; [ $$? -le 1 ]; }
# $(call verdict_cmd,<diff>,<what was compared>)
verdict_cmd = cd "$(RUN_FROM)" && if [ -s "$(1)" ]; then \
  echo "RESULT: SOME FAILED (1) -> $(2): the two outputs differ. See $(1) for full details."; \
  head -n 20 "$(1)"; exit 1; fi; echo "RESULT: ALL PASS ($(2))"

translate:
	$(call translate_cmd,$(WITH),$(TO),$(RT))

build:
	$(call build_cmd,$(WITH),$(FROM),$(RT),$(EXE))

compare:
	@$(call compare_cmd,$(FROM),$(TO),$(DIFF))

verdict:
	@$(call verdict_cmd,$(DIFF),$(LABEL))

host_ext := $(if $(filter llvm,$(TARGET)),ll,c)
host_rt := $(if $(filter llvm,$(TARGET)),$(OUT)/gen/ksplc_stage1_runtime.c)

# The handed-over compiler makes this folder's, stage1.
define stage1_cmds
	@cd "$(RUN_FROM)" && mkdir -p "$(OUT)/gen"
	$(call translate_cmd,$(KSPLC),$(OUT)/gen/ksplc_stage1.$(host_ext),$(host_rt))
	$(call build_cmd,$(KSPLC),$(OUT)/gen/ksplc_stage1.$(host_ext),$(host_rt),$(OUT)/ksplc_stage1.exe)
endef

# This folder's compiler, made where missing for the suites (`self-host` remakes it every time).
$(OUT)/ksplc_stage1.exe:
	$(stage1_cmds)

self-host:
	$(stage1_cmds)
	$(call translate_cmd,$(OUT)/ksplc_stage1.exe,$(OUT)/gen/ksplc_stage2.$(host_ext),)
	@$(call compare_cmd,$(OUT)/gen/ksplc_stage1.$(host_ext),$(OUT)/gen/ksplc_stage2.$(host_ext),$(OUT)/stage_diff.txt)
	@$(call verdict_cmd,$(OUT)/stage_diff.txt,self-hosting from this folder)
