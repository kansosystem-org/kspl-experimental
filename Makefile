# ==========================================
# Kanso Makefile -- **`make help` lists what can be typed; do not copy it here.** Options are in
# docs/CONTRIBUTING.md. **Three layers**: the log wrapper just below (all requested build goals share
# one child make and one log), then configuration and targets (the `LOGGING=1` side).
# Caution: **Put real work on the `LOGGING=1` side**, so it belongs to the shared build graph and log.
# ==========================================

# ==================================================================
# 0. Verifying the environment (Windows / MSYS2)
# ==================================================================
# Windows builds in MSYS2's UCRT64 alone (its UCRT is production MSVC's); others fail obscurely.
ifeq ($(OS),Windows_NT)
ifneq ($(MSYSTEM),UCRT64)
$(error Run this project's Windows build from MSYS2's "UCRT64" shell (mintty) [MSYSTEM=$(MSYSTEM) at present : empty means you are running from outside an MSYS2 shell, such as PowerShell or cmd]. Start "MSYS2 UCRT64" (C:\msys64\ucrt64.exe) from the start menu, confirm that `echo $$MSYSTEM` says UCRT64, and then make. Using only tools such as mingw64 through PATH from PowerShell or cmd is unsupported. For the details see "The environment for each platform" in docs/HOWTO-build.md)
endif

ifneq (,$(findstring mingw,$(MAKE_HOST)))
$(error Run this project's Windows build from MSYS2's make (/usr/bin/make) [the make at present is the native Windows one, for $(MAKE_HOST)]. The UCRT64 shell puts /ucrt64/bin ahead of /usr/bin, so with mingw-w64-ucrt-x86_64-make installed `make` hits that one. Call `/usr/bin/make` directly, or confirm `pacman -S make` and add `alias make=/usr/bin/make` to ~/.bashrc. Carried on with the native one, the guidance's non-ASCII text is garbled (environment variables reach children through CP932) and a failure's exit code becomes a raw wait status (Error 512) as well)
endif

# Caution: **Keep this warning ASCII**: the locale it warns of shows nothing else.
ifneq ($(MSYSTEM),)
    LOCALE_CHARMAP := $(shell locale charmap 2>/dev/null)
ifneq ($(LOCALE_CHARMAP),UTF-8)
$(warning [locale] charmap is '$(LOCALE_CHARMAP)', not UTF-8. The marks in this build's guidance \
will look garbled on screen (the log files themselves are fine). Add this to ~/.bashrc and restart \
the shell: export LANG=C.UTF-8 (any UTF-8 locale does, so your own language's is fine too))
endif
endif
endif

# **bash with pipefail**, or `cmd | tee` exits with tee's status and a failed build passes.
# Caution: **Open a piped recipe line with `set -o pipefail`**: make 3.81 (macOS) drops .SHELLFLAGS.
SHELL := bash
.SHELLFLAGS := -o pipefail -c
.DEFAULT_GOAL := all
# **A recipe that fails leaves no target**, or the next make takes a cut file as current. It covers
# mk/*.mk too; each package's own Makefile says it again, as it stands alone.
.DELETE_ON_ERROR:

# --- Paths --- shared by the log wrapper and the build it starts
OUT_DIR     := out
GEN_DIR     := $(OUT_DIR)/gen
LOG_DIR     := $(OUT_DIR)/log
TMP_DIR     := $(OUT_DIR)/tmp
TEST_DIR    := $(OUT_DIR)/test
CI_LOG_DIR    := $(LOG_DIR)/ci
LINT_LOG_DIR  := $(LOG_DIR)/lint
SUITE_LOG_DIR := $(LOG_DIR)/suite
make_dirs = mkdir -p "$(GEN_DIR)" "$(CI_LOG_DIR)" "$(LINT_LOG_DIR)" "$(SUITE_LOG_DIR)" "$(TMP_DIR)"
.PHONY: clean

ifndef LOGGING
logging_goals := $(filter-out clean,$(if $(MAKECMDGOALS),$(MAKECMDGOALS),$(.DEFAULT_GOAL)))
clean:
	@$(MAKE) --no-print-directory clean LOGGING=1
# Phony goals run even when a folder has their name; the first forwards all build goals once.
.PHONY: $(logging_goals)
ifneq ($(logging_goals),)
$(filter-out $(firstword $(logging_goals)),$(logging_goals)): $(firstword $(logging_goals))
$(firstword $(logging_goals)):
	@$(make_dirs); \
	  echo "=> Executing 'make $(logging_goals)' (Output saved to $(LOG_DIR)/make.log)..."; \
	  set -o pipefail; $(MAKE) --no-print-directory $(logging_goals) LOGGING=1 2>&1 | tee "$(LOG_DIR)/make.log"
endif
else

# ==================================================================
# 1. Configuration
# ==================================================================
SEED_C      := ksplc/seed.c
EXT_BIN_DIR := .vscode/extensions/kspl/bin
LSP_EXE     := ksplc_server.exe
# Caution: **Omit no file ksplc reads or `embed`s, nor a `ksplc.cfg`**: its fix would rebuild
# nothing, and the old compiler passes the tests (`make test-deps` holds this list to ksplc's).
# The `tests` folders are left out: ksplc reads none of them, and listed, a new test case rebuilt
# the compiler twice over. So are the `out` folders, where a package's runs leave scratch sources.
KSPL_SRCS    := $(shell find ksplc std lib/kspeg -type d \( -name tests -o -name out \) -prune -o \
               \( -name "*.kspl" -o -name ksplc.cfg \) -print) \
               ksplc/kspl.kspeg ksplc/docs/SPEC-diagnostics.md \
               $(wildcard ksplc/gen/runtime/*.c) $(wildcard ksplc/gen/runtime/*.h)

# --- The toolchain for the host ---
CC        := clang
CFLAGS    := -std=c99 -Wall -g -O0
# Caution: **Keep the shipped options apart**: the generated C is rebuilt twice per fix, so
# `CFLAGS` stays `-O0`; this side builds the same C once. **Keep `-g`**: only it locates a crash.
SHIP_CFLAGS := -std=c99 -w -g -O2 -fno-strict-aliasing
# **`-fno-strict-aliasing` goes with every optimized build of ksplc's C.** KSPL lets two pointer
# types reach one address (`U32$@::p`), and C's strict aliasing would let `-O2` read a value from
# before a store through the other type. ksplc passes it itself (`ksplc info exe-flags`).
# System libraries go in LDLIBS, placed after the sources: GNU ld resolves from the left, so an -l
# in CFLAGS (before the sources in every link recipe) is passed by and fails the link.
# It copies ksplc's own link rules (`ksplc info link-libs`); `make test-link-rules` compares them.
LDLIBS    := -lm
C_FMT     := clang-format -style="{ColumnLimit: 0}" -i
# `$(call c_fmt,<file>)` tidies C a person reads. **Clang-Format is optional**: without it the file
# stays as generated, which builds and debugs the same, and one line says so. `commit-seed` alone
# requires it (`seed_fmt_help`).
c_fmt = if command -v $(firstword $(C_FMT)) >/dev/null 2>&1; then $(C_FMT) $(1); else \
  printf '\# clang-format is not installed: %s is left as generated (it builds the same)\n' $(1); fi
# `$(call shq,<value>)` hands a value a person typed (`DIR=`, `T=`) to a program as one word, as
# typed. **Single quotes**, a `'` in it written `'\''`: in double quotes a `"`, `$` or backtick
# would end the word or have the shell run text ("A run target writes every option out" in
# docs/DESIGN-repository.md).
shq = '$(subst ','\'',$(1))'
KSPL_FMT   := --in-place
# Names the std, so a machine's KSPLC_STD_DIR brings in no other and seed.c's byte-match holds.
# Caution: **Keep it relative**: $(CURDIR) word-splits unquoted, and ksplc.exe cannot open `/c/...`.
KSPL_FLAGS := --std-dir=std
# The host's core count, what the gates' parallelism (`TEST_JOBS`) and fmt's (`FMT_JOBS`) default to.
HOST_CORES = $(shell (nproc || sysctl -n hw.ncpu || echo 4) 2>/dev/null)

# The gates' Python writes UTF-8 even into a pipe, where it would fall back to the ANSI code page.
export PYTHONUTF8 := 1
# MSYS2's `ln -s` copies its target where Windows makes no link, and still exits 0, so a test that
# asks for a link finds a stray copy (a folder the listing then names). `nativestrict` makes it fail
# instead, so the test skips; where Windows allows links (Developer Mode), it makes a real one.
ifeq ($(OS),Windows_NT)
export MSYS := $(strip $(MSYS) winsymlinks:nativestrict)
endif

# --- The switches a person sets: `LLVM=1`, `STATS=1`, `BLAS=1`, `NATIVE=1` --- **Each reads 0 or 1
# alone**: any other value would build the default without a word (Principle 5). What they decide
# below (`BACKEND`, `TARGET_EXT`, `TARGET_FLAG`, `GUI_LDFLAGS`) is not set by hand, or one choice
# would have two spellings that can disagree.
LLVM ?= 0
STATS ?= 0
BLAS ?= 0
NATIVE ?= 0
$(foreach v,LLVM STATS BLAS NATIVE,\
  $(if $(filter 0 1,$($(v))),,$(error $(v)=$($(v)): only 0 or 1 is read)))
$(foreach v,BACKEND TARGET_EXT TARGET_FLAG GUI_LDFLAGS,$(if $(filter command line,$(origin $(v))),\
  $(error $(v) follows from LLVM=1 and the platform, and is not set by hand)))

# --- Build statistics output (make STATS=1) --- Not performance's baseline: `make perf-log` is.
ifeq ($(STATS),1)
    KSPL_FLAGS += --stats
endif

# --- Switching the backend (make LLVM=1) ---
BACKEND     := c
TARGET_EXT  := c
TARGET_FLAG :=
ifeq ($(LLVM),1)
    BACKEND     := llvm
    TARGET_EXT  := ll
    TARGET_FLAG := --to=llvm
    CFLAGS      += -Wno-override-module -mllvm -fast-isel=false
endif

# --- Optional BLAS backend (make BLAS=1) --- Applies to the AI examples and tests only.
AI_KSPL_FLAGS :=
ifeq ($(BLAS),1)
    AI_KSPL_FLAGS := --define=blas
endif
# --- The AI examples built for this machine's own CPU (make NATIVE=1) --- **For a program run on
# the machine that builds it**, such as `make chat-server` on the user's own PC: the C compiler may
# then use every instruction the CPU has (AVX2 on most x86-64 CPUs since 2013), and a model runs
# about a fifth faster. The default build runs on any CPU of the architecture, so CI and a program
# copied to another machine stay right. The integer products give the same numbers either way.
AI_CFLAGS :=
ifeq ($(NATIVE),1)
    AI_CFLAGS := -march=native
endif

# --- What the bootstrap produces ---
SEED_EXE   := $(OUT_DIR)/ksplc_seed.exe
STAGE1_OUT := $(GEN_DIR)/ksplc_stage1.$(TARGET_EXT)
STAGE1_EXE := $(OUT_DIR)/ksplc_stage1.exe
ifeq ($(LLVM),1)
    STAGE1_EXE := $(OUT_DIR)/ksplc_stage1_llvm.exe
endif
# LLVM=1's IR only declares `kspl_*`, so the C runtime is linked alongside, **from the ksplc that
# produced the `.ll`**: the seed's and stage1's runtimes can differ. Empty on the C backend.
STAGE1_RT :=
STAGE2_RT :=
ifeq ($(LLVM),1)
    STAGE1_RT := $(GEN_DIR)/ksplc_stage1_runtime.c
    STAGE2_RT := $(GEN_DIR)/ksplc_stage2_runtime.c
endif
STAGE2_OUT := $(GEN_DIR)/ksplc_stage2.$(TARGET_EXT)
STAGE2_EXE := $(OUT_DIR)/ksplc_stage2.exe
# **The stages' C is split into one translation unit per core**, compiled in parallel (C only, 16 at
# most). The seed and the shipped build take stage2's C whole: the seed is one file, and `-O2`
# inlines across what one unit holds. A stage's target is its header, the last file it writes.
# Split, each stage writes into a folder of its own under one name: a unit names its header, so two
# names would differ in every unit.
SPLIT      := $(if $(filter c,$(BACKEND)),$(or $(filter $(HOST_CORES),\
              2 3 4 5 6 7 8 9 10 11 12 13 14 15 16),$(if $(filter 1,$(HOST_CORES)),1,16)),1)
ifneq ($(SPLIT),1)
    STAGE1_OUT := $(GEN_DIR)/stage1/ksplc.c
    STAGE2_OUT := $(GEN_DIR)/stage2/ksplc.c
endif
stage_gen   = $(if $(filter-out 1,$(SPLIT)),$(basename $(1)).h,$(1))
STAGE1_GEN := $(call stage_gen,$(STAGE1_OUT))
STAGE2_GEN := $(call stage_gen,$(STAGE2_OUT))
STAGE2_WHOLE := $(GEN_DIR)/ksplc_stage2_whole.$(TARGET_EXT)
# One per backend: shared, the other backend's newer file looked up to date and its verdict
# was read for this one.
DIFF_TXT   := $(LOG_DIR)/stage_diff_$(BACKEND).txt

# --- Deciding the platform --- **Ask `uname` nowhere else**, or the branches hold two answers.
ifeq ($(OS),Windows_NT)
    PLATFORM := win32
else
    UNAME_S := $(shell uname -s)
    ifeq ($(UNAME_S),Linux)
        PLATFORM := linux
    endif
    ifeq ($(UNAME_S),Darwin)
        PLATFORM := darwin
    endif
endif

# --- Linking pthread (for std/thread.kspl) --- In libpthread below glibc 2.34; macOS has none.
ifeq ($(PLATFORM),linux)
    LDLIBS += -lpthread
endif

# --- The flag for removing unreferenced sections ---
ifeq ($(PLATFORM),darwin)
    GC_SECTIONS_FLAG := -Wl,-dead_strip
else
    GC_SECTIONS_FLAG := -Wl,--gc-sections
endif

# Cuts unreferenced functions and data at the link, **not on win32** (PE's linker drops none, so it
# would only grow the exe). `BOOT_CFLAGS` comes first: the chain's build asks its compiler for them.
BOOT_CFLAGS := $(CFLAGS)
# ksplc's C read as KSPL reads a pointer cast (the reason is at SHIP_CFLAGS); `kspl_build` is -O3.
CFLAGS += -fno-strict-aliasing
ifneq ($(PLATFORM),win32)
    CFLAGS += -ffunction-sections -fdata-sections $(GC_SECTIONS_FLAG)
endif

# --- Linking Winsock (for std/net.kspl) --- Windows's TCP/UDP go through winsock2.
# --- Linking shell32 (for taking the generated main's argv again) --- CommandLineToArgvW is in it;
# mingw resolves it unasked, and it stays because ksplc names it (`make test-link-rules`).
# --- The main thread's stack size (for max_parse_depth in lib/kspeg/rule.kspl) ---
# The KSPEG parser recurses on the C stack, its depth assuming Linux's 8MB; Windows reserves 1MB.
# The windowing subsystem for the artifact a person opens by a double-click: none but on win32.
# **Only UCRT64's own compiler builds here** (its triple holds `-w64-`): the MSYS layer's makes a
# ksplc.exe that needs msys-2.0.dll, and LLVM's own Windows clang targets MSVC, which nothing tests.
GUI_LDFLAGS :=
ifeq ($(PLATFORM),win32)
    WIN_TARGET_TRIPLE := $(shell $(CC) -dumpmachine 2>/dev/null)
    ifeq (,$(findstring -w64-,$(WIN_TARGET_TRIPLE)))
$(error Build this project's artifacts with MSYS2 UCRT64's own compiler [$(CC)'s target is '$(WIN_TARGET_TRIPLE)'; UCRT64's is x86_64-w64-windows-gnu or x86_64-w64-mingw32]. A target of the MSYS layer (the POSIX emulation layer) makes a ksplc.exe that depends on msys-2.0.dll, where both path handling and fork become a different thing; LLVM's own Windows clang targets MSVC, which no job builds. Install `pacman -S --needed mingw-w64-ucrt-x86_64-clang` and confirm that /ucrt64/bin comes before /usr/bin on PATH (MSYS2 UCRT64's default). Fixing the problem of make hitting the native version by reordering PATH lands you in the MSYS layer's case)
    endif
    LDLIBS += -lws2_32 -lshell32 -Wl,--stack,8388608
    GUI_LDFLAGS := -mwindows
endif

# **Each make file declares its own targets `.PHONY`**, beside them. `clean` is shared with the
# logging wrapper above.
.PHONY: all stage1 self-host self-host-ship commit-seed test-seed-sum perf-log

# Caution: **Make them all at once**: a recipe that only writes a log makes no folder first.
$(OUT_DIR):
	@$(make_dirs)

# ==================================================================
# 2. The compiler's bootstrap (seed -> stage1 -> stage2 -> self-hosting)
# ==================================================================
## Build-and-install|all|Build in two stages from the seed, up to confirming self-hosting's fixed point. Typing just `make` does this
all: self-host

# Caution: **Write a rule for every name in `.PHONY`**: a bare name answers "Nothing to be done",
# not a failure (part 5 of `tests/suite/recipe_bytes_test.kspl`).
## Build-and-install|stage1|Build ksplc with the ksplc the seed built (the seed first, where it is not there)
stage1: $(STAGE1_EXE)

# **The verdict is emitted here, not in $(DIFF_TXT)'s recipe** (run only when remaking), or an
# incremental build passes `Gate.verdict` in `tools/ci_gates.kspl` unverified. **No `-B`**: it
# redoes the seed.
# **A change to how ksplc generates code differs here until the seed is re-baked**: the seed's
# stage1 still generates the old way. Its steps are named on a fall.
define self_host_help
#   If you changed how ksplc generates code, the seed still generates the old way:
#   run `make commit-seed`, then this again ("The bootstrap, and keeping the seed in step"
#   in ksplc/docs/DESIGN-compiler.md). `git checkout ksplc/seed.c` undoes the re-bake.
endef
self-host: export SELF_HOST_HELP := $(self_host_help)
## Gates|self-host|See that the notation stage1 and stage2 emit does not differ by one byte
self-host: $(DIFF_TXT)
	@$(ksplc_step) compare-fires FIRES=$(TMP_DIR)/compare_fires SPLIT=1
	@$(ksplc_step) verdict DIFF=$(DIFF_TXT) LABEL='self-hosting, $(BACKEND) backend' \
		|| { printf '%s\n' "$$SELF_HOST_HELP"; exit 1; }

# --- Measuring performance (the two logs it hands to perf_guard) ---
# Caution: **Measure two runs of the same executable**, in a cache of its own: a rebuilt ksplc
# misses on its first, and one run alone hides the other's regression. `--stats` reports on
# standard error, with the diagnostics: each log keeps that stream, shown whether or not it failed.
# $(call perf_run,<cold|warm>): one measured translation, its log `$(LOG_DIR)/perf_<name>.log`.
perf_run = KSPLC_CACHE_DIR=$(TMP_DIR)/perf_cache ./$(STAGE1_EXE) $(KSPL_FLAGS) --stats \
	ksplc/main.kspl $(TMP_DIR)/perf_$(1).c 2> $(LOG_DIR)/perf_$(1).log; \
	rc=$$?; cat $(LOG_DIR)/perf_$(1).log; exit $$rc
## Measure-and-inspect|perf-log|Measure and record translation's elapsed time and peak memory
perf-log: $(STAGE1_EXE) $(SEED_EXE) | $(OUT_DIR)
	@rm -rf $(TMP_DIR)/perf_cache
	@echo "# MEASURING cold (empty cache)"
	@$(call perf_run,cold)
	@echo "# MEASURING warm (same cache, 2nd run)"
	@$(call perf_run,warm)
	./$(SEED_EXE) run tests/checkers/perf_guard.kspl --cold=$(LOG_DIR)/perf_cold.log \
	  --warm=$(LOG_DIR)/perf_warm.log

$(SEED_EXE): $(SEED_C) | $(OUT_DIR)
	@echo "# COMPILING SEED COMPILER FROM C"
	$(CC) $(CFLAGS) $^ $(LDLIBS) -o $@

# **Each step of the chain is ksplc's own** (`ksplc/Makefile`), run from here (`RUN_FROM=..`): a
# debugger joins `#line`'s `std` to the folder the C compiler ran in, or `std` frames lose source.
ksplc_step = $(call pkg_make,ksplc) RUN_FROM=.. CC='$(CC)' CFLAGS='$(BOOT_CFLAGS)' \
  ENTRY_FILE=ksplc/main.kspl FLAGS='$(KSPL_FLAGS) $(TARGET_FLAG)' SPLIT=$(SPLIT)

# Caution: **Do not tidy this C**: `$(C_FMT)` is slow on it and nobody reads it; the seed is tidied.
$(STAGE1_GEN): $(SEED_EXE) $(KSPL_SRCS)
	@echo "# GENERATING STAGE 1 ($(BACKEND))..."
	@mkdir -p $(dir $(STAGE1_OUT))
	@$(ksplc_step) translate WITH=$(SEED_EXE) TO=$(STAGE1_OUT) RT=$(STAGE1_RT)

$(STAGE1_EXE): $(STAGE1_GEN)
	@echo "# BUILDING STAGE 1 EXECUTABLE..."
	@$(ksplc_step) build WITH=$(SEED_EXE) FROM=$(STAGE1_OUT) RT=$(STAGE1_RT) EXE=$(STAGE1_EXE)

$(STAGE2_GEN): $(STAGE1_EXE) $(KSPL_SRCS)
	@echo "# GENERATING STAGE 2 ($(BACKEND))..."
	@mkdir -p $(dir $(STAGE2_OUT))
	@$(ksplc_step) translate WITH=$(STAGE1_EXE) TO=$(STAGE2_OUT) RT=$(STAGE2_RT)

$(STAGE2_WHOLE): $(STAGE1_EXE) $(KSPL_SRCS)
	@echo "# GENERATING THE WHOLE C OF STAGE 2 ($(BACKEND)), for the seed and the shipped build..."
	@$(ksplc_step) translate WITH=$(STAGE1_EXE) TO=$(STAGE2_WHOLE) RT=$(STAGE2_RT) SPLIT=1

$(STAGE2_EXE): $(STAGE2_GEN)
	@echo "# BUILDING STAGE 2 EXECUTABLE..."
	@$(ksplc_step) build WITH=$(STAGE1_EXE) FROM=$(STAGE2_OUT) RT=$(STAGE2_RT) EXE=$(STAGE2_EXE)

SHIP_EXE := $(OUT_DIR)/ksplc_ship.exe

$(SHIP_EXE): $(STAGE2_WHOLE)
	@echo "# BUILDING THE SHIPPED EXECUTABLE (optimized)..."
	$(CC) $(SHIP_CFLAGS) $^ $(STAGE2_RT) $(LDLIBS) -o $@

# **What ships is checked as it ships**: `-O2` can change what the compiler does where its C leans
# on behaviour the stages' `-O0` never shows, so the shipped build must emit stage2's C to the byte.
SHIP_OUT  := $(GEN_DIR)/ksplc_ship.$(TARGET_EXT)
SHIP_RT   := $(if $(STAGE2_RT),$(GEN_DIR)/ksplc_ship_runtime.c)
SHIP_DIFF := $(LOG_DIR)/ship_diff.txt
## Gates|self-host-ship|See that the optimized ksplc `make install` ships emits stage2's notation to the byte
self-host-ship: $(SHIP_EXE)
	@echo "# VERIFYING THE SHIPPED EXECUTABLE"
	@mkdir -p $(LOG_DIR)
	@$(ksplc_step) translate WITH=$(SHIP_EXE) TO=$(SHIP_OUT) RT=$(SHIP_RT) SPLIT=1
	@$(ksplc_step) compare FROM=$(STAGE2_WHOLE) TO=$(SHIP_OUT) DIFF=$(SHIP_DIFF) SPLIT=1
	@$(ksplc_step) compare-fires FIRES=$(TMP_DIR)/compare_fires SPLIT=1
	@$(ksplc_step) verdict DIFF=$(SHIP_DIFF) LABEL='the shipped executable, $(BACKEND) backend'

# The old $(STAGE2_EXE) goes at the end: stale once stage2's C is remade, yet newer than stage1.exe.
$(DIFF_TXT): $(STAGE1_GEN) $(STAGE2_GEN)
	@echo "# VERIFYING SELF-HOSTING"
	@mkdir -p $(LOG_DIR)
	@$(ksplc_step) compare FROM=$(STAGE1_OUT) TO=$(STAGE2_OUT) DIFF=$(DIFF_TXT)
	@rm -f $(STAGE2_EXE)

# Strips `#line` from stage2's whole C into the seed (C backend only): one added source line would shift
# every later one in git's history. **`cmp` compares the stripped side**; then run `make self-host`.
# Caution: **Read `$(STAGE2_WHOLE)` by name, not as `$<`** (part 4 of `tests/suite/recipe_bytes_test.kspl`).
define seed_fmt_help
ERROR: make commit-seed needs clang-format, and this machine has none.
  ksplc/seed.c in git is tidied by it, so a seed written untidied would change every line of it.
  Install clang-format (.devcontainer/Dockerfile names the package), or re-bake in the devcontainer.
endef

commit-seed: export SEED_FMT_HELP := $(seed_fmt_help)
## Build-and-install|commit-seed|Re-bake stage2's generated C into `ksplc/seed.c` (needed once a runtime `.c` is touched)
commit-seed: $(STAGE2_WHOLE) $(STAGE1_EXE) | $(OUT_DIR)
	@echo "# UPDATING SEED COMPILER SOURCE..."
# **A file git does not hold is refused before the seed changes**: the record would count it, and
# CI's checkout, which lacks it, would fail `test-seed-sum`.
	@./$(STAGE1_EXE) run tools/seed_sum.kspl untracked $(SEED_SUM_SRCS)
ifeq ($(BACKEND),c)
# **Tidy first, then strip**: stripped first, `clang-format` joins `else` and `if` into `else if`.
# Caution: **Exactly one pass, on a copy**: `clang-format` is not idempotent on this C.
	@command -v $(firstword $(C_FMT)) >/dev/null 2>&1 || { printf '%s\n' "$$SEED_FMT_HELP"; exit 1; }
	@cp $(STAGE2_WHOLE) $(TMP_DIR)/seed_fmt.c
	@$(C_FMT) $(TMP_DIR)/seed_fmt.c
	@awk '!/^#line /' $(TMP_DIR)/seed_fmt.c > $(TMP_DIR)/seed_stripped.c
	@cmp -s $(TMP_DIR)/seed_stripped.c $(SEED_C) \
		|| (cp $(TMP_DIR)/seed_stripped.c $(SEED_C) \
			&& ./$(STAGE1_EXE) run tools/repo_stat.kspl \
			&& echo "Seed updated successfully.")
	@./$(STAGE1_EXE) run tools/seed_sum.kspl write $(SEED_SUM) $(SEED_SUM_FILES)
else
	@echo "Cannot update seed.c from LLVM output. Run without LLVM=1."
endif

# **The seed's record names the compiler source it was taken from** (`tools/seed_sum.kspl`): what
# ksplc reads under `ksplc/`, its runtime included, but neither the tests nor `SPEC-diagnostics.md`,
# which needs no re-bake ("The bootstrap, and keeping the seed in step" in
# ksplc/docs/DESIGN-compiler.md).
# **The seed itself is counted too, first**: a `seed.c` edited by hand, or taken from the other
# side of a merge, would otherwise pass. First, it is the file the check's one-byte change alters.
SEED_SUM       := ksplc/seed.sum
SEED_SUM_SRCS  := $(sort $(filter ksplc/%,$(filter-out ksplc/docs/SPEC-diagnostics.md,$(KSPL_SRCS))))
SEED_SUM_FILES := $(SEED_C) $(SEED_SUM_SRCS)

## Gates|test-seed-sum|See that `ksplc/seed.c` was re-baked after the last change to the compiler
test-seed-sum: $(STAGE1_EXE)
	@./$(STAGE1_EXE) run tools/seed_sum.kspl check $(SEED_SUM) $(SEED_SUM_FILES)

# ==================================================================
# 3. Everything else, one file a purpose (each file's header says what it holds)
# ==================================================================
# **Includes, not a recursive make**: they share this run's variables. **The checks come from
# these lines** (`make_files` in `tests/suite/recipe_bytes_test.kspl`): a note on one hides it.
# **A recipe line (and what expands into one) is ASCII only**: the shell rereads it in its locale
# (CP932 under MSYS2), garbling text or eating a `"`; **hand text over as an environment variable**.
# **Only a leading tab marks a recipe line**, for make and the checks: a `$(foreach)` body starts
# with one (in a `define`), and a variable's continuation line never does.
# **A clone's own make files come first** (`KANSO_LOCAL_MK`: each top folder's `local.mk` unless
# set), since `mk/test.mk` reads `EXTRA_SUITES` as it is defined. A clone of the published copy
# has none. **Exported, so the checks read this list** (`make_files` in
# `tests/suite/recipe_bytes_test.kspl`); a file named that is missing fails.
export KANSO_LOCAL_MK ?= $(wildcard */local.mk)
include $(KANSO_LOCAL_MK)
include mk/ci.mk
include mk/lint.mk
include mk/test.mk
include mk/install.mk
include mk/programs.mk
include mk/ksmd.mk
include mk/ksagent.mk

# **Last**: `make help` lists the `##` lines read before it (the reason is in mk/help.mk's header).
include mk/help.mk

# ==================================================================
# 4. Cleaning up
# ==================================================================
# **$(OUT_DIR) and each package's own `out/` are removed** (a package's Makefile run alone builds
# into its own). What `install-lsp` and the `fim-*` goals write is kept: it is used, not rebuilt.
## Build-and-install|clean|Remove `out/` and each package's `out/`
clean:
	$(stop_ksmd_servers)
	@rm -rf "$(OUT_DIR)" $(wildcard */out lib/*/out)
	@echo "Cleaned $(OUT_DIR) $(wildcard */out lib/*/out)"

endif
