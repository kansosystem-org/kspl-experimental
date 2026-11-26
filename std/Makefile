# std -- testing the standard library on its own, from a `ksplc` (and a C compiler for `test-fuzz`)
# **The std tested is the one this file stands in, never the one it is handed** (`KSPLC_STD_DIR=.`,
# which a child compiler inherits).
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# The compiler the tests start as a child, by its path.
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# The fuzz's seed folder (this one unless named), and its `--trials=N` / `--seed=N` as they stand.
FUZZ_SEEDS ?= .
FUZZ_ARGS ?=
# 1 fails a reader built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=

.PHONY: test test-fuzz
test:
	KSPLC_STD_DIR=. "$(KSPLC)" run tests/main.kspl "$(KSPLC_EXE)"

# The driver builds the reader, with the address sanitizer where it can (`fuzz.build`).
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
test-fuzz:
	rm -rf "$(OUT)/fuzz/work"
	@KSPLC_STD_DIR=. "$(KSPLC)" run tests/fuzz_main.kspl "$(OUT)/fuzz/read_prog.exe" \
		"$(OUT)/fuzz/work" "$(FUZZ_SEEDS)" --ksplc="$(KSPLC)" --build=tests/read_prog.kspl \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
