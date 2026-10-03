# std -- testing the standard library on its own, from a `ksplc` (and a C compiler for `test-fuzz`)
# **The std tested is the one this file stands in, never the one it is handed** (`KSPLC_STD_DIR=.`,
# which a child compiler inherits); the TLS and SQLite halves answer `unsupported` here.
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# The C compiler ksplc picks (`CC`, or clang), exported so ksplc's link words fit it.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
# The compiler the tests start as a child, by its path.
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# The fuzz's seed folder (this one unless named), and its `--trials=N` / `--seed=N` as they stand.
FUZZ_SEEDS ?= .
FUZZ_ARGS ?=

.PHONY: test test-fuzz
test:
	KSPLC_STD_DIR=. "$(KSPLC)" run tests/main.kspls "$(KSPLC_EXE)"

# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	KSPLC_STD_DIR=. "$(KSPLC)" --emit-libs="$(OUT)/fuzz/read_prog.libs" tests/read_prog.kspls \
		"$(OUT)/fuzz/read_prog.c"
	"$(CC)" -std=c99 -O0 "$(OUT)/fuzz/read_prog.c" "@$(OUT)/fuzz/read_prog.libs" \
		$$("$(KSPLC)" info exe-flags) $$("$(KSPLC)" info link-libs) -o "$(OUT)/fuzz/read_prog.exe"
	rm -rf "$(OUT)/fuzz/work"
	KSPLC_STD_DIR=. "$(KSPLC)" run tests/fuzz_main.kspls "$(OUT)/fuzz/read_prog.exe" \
		"$(OUT)/fuzz/work" "$(FUZZ_SEEDS)" $(FUZZ_ARGS)
