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
# -O1, as the sanitizer slows it; `-g` and the frame pointer keep a stop's call row readable.
ASAN_CFLAGS := -O1 -g -fno-omit-frame-pointer -fsanitize=address

.PHONY: test test-fuzz
test:
	KSPLC_STD_DIR=. "$(KSPLC)" run tests/main.kspls "$(KSPLC_EXE)"

# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
fuzz_build = KSPLC_STD_DIR=. "$(KSPLC)" build --cflags="$(1)" tests/read_prog.kspls \
  "$(OUT)/fuzz/read_prog.exe"
# Caution: **Make the folder first**: the sanitizer's log is redirected into it before the build.
test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	rm -rf "$(OUT)/fuzz/work"
	@if $(call fuzz_build,$(ASAN_CFLAGS)) > "$(OUT)/fuzz/asan.log" 2>&1; then asan=--asan; \
		echo "# the reader: with the address sanitizer"; \
	else asan=; echo "# the reader: without the address sanitizer ($(OUT)/fuzz/asan.log says why)"; \
		$(call fuzz_build,-O0) || exit 1; fi; \
	KSPLC_STD_DIR=. "$(KSPLC)" run tests/fuzz_main.kspls "$(OUT)/fuzz/read_prog.exe" \
		"$(OUT)/fuzz/work" "$(FUZZ_SEEDS)" $$asan \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
