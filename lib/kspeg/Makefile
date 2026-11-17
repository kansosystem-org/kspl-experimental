# kspeg -- building and testing this package on its own, from a `ksplc` and the `std` it carries
#   make test [KSPLC=/path/to/ksplc]      # kspeg's tests
#   make test-fuzz                        # broken grammars and broken input, on a fixed seed
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# 1 fails a reader built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=
# -O1, as the sanitizer slows it; `-g` and the frame pointer keep a stop's call row readable.
ASAN_BUILD := --sanitize=address --cflags="-O1 -g -fno-omit-frame-pointer"

.PHONY: test test-fuzz
test:
	"$(KSPLC)" run tests/main.kspl

# The grammar reader and the engine fed broken text (`tests/fuzz_main.kspl`).
# Caution: **Make the folder first**: the sanitizer's log is redirected into it before the build.
fuzz_build = "$(KSPLC)" build $(1) tests/read_prog.kspl "$(OUT)/fuzz/read_prog.exe"
test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	rm -rf "$(OUT)/fuzz/work"
	@if $(call fuzz_build,$(ASAN_BUILD)) > "$(OUT)/fuzz/asan.log" 2>&1; then asan=--asan; \
		echo "# the reader: with the address sanitizer"; \
	else asan=; echo "# the reader: without the address sanitizer ($(OUT)/fuzz/asan.log says why)"; \
		$(call fuzz_build,--cflags=-O0) || exit 1; fi; \
	"$(KSPLC)" run tests/fuzz_main.kspl "$(OUT)/fuzz/read_prog.exe" "$(OUT)/fuzz/work" $$asan \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
