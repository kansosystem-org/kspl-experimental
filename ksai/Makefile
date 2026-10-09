# ksai -- building and testing this package on its own, from a `ksplc` and a C compiler (for the
# examples and `test-fuzz`); `BLAS=1` hands matmul to OpenBLAS, which needs libopenblas-dev
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
BLAS ?= 0
# The library comes with the flag: the block `--define=blas` keeps names it (`#link` in tensor.kspls).
BLAS_FLAGS := $(if $(filter 1,$(BLAS)),--define=blas)
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# 1 fails a reader built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=
# -O1, as the sanitizer slows it; `-g` and the frame pointer keep a stop's call row readable.
ASAN_CFLAGS := -O1 -g -fno-omit-frame-pointer -fsanitize=address

EXAMPLES := llama_engine qwen_infer fim_coder
.PHONY: examples $(EXAMPLES) test test-fuzz
examples: $(EXAMPLES)

# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
# `ksplc build` compiles and links each, optimised by default as the examples ship: both do a
# model's arithmetic element by element.
$(EXAMPLES):
	"$(KSPLC)" build $(BLAS_FLAGS) examples/$@/main.kspls "$(OUT)/$@.exe"

# The examples are built and run with the tests, so one that stops building fails here (as
# Cargo builds `examples/` on `cargo test`).
test: examples
	"$(KSPLC)" run $(BLAS_FLAGS) tests/main.kspls
	"$(KSPLC)" run tests/stops_main.kspls "$(KSPLC_EXE)"
	rm -rf "$(OUT)/examples_test"
	"$(KSPLC)" run tests/examples_main.kspls "$(OUT)/llama_engine.exe" "$(OUT)/qwen_infer.exe" \
		"$(OUT)/fim_coder.exe" "$(OUT)/examples_test"

fuzz_build = "$(KSPLC)" build --cflags="$(1)" tests/read_prog.kspls "$(OUT)/fuzz/read_prog.exe"
# Caution: **Make the folder first**: the sanitizer's log is redirected into it before the build.
test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	rm -rf "$(OUT)/fuzz/work"
	@if $(call fuzz_build,$(ASAN_CFLAGS)) > "$(OUT)/fuzz/asan.log" 2>&1; then asan=--asan; \
		echo "# the reader: with the address sanitizer"; \
	else asan=; echo "# the reader: without the address sanitizer ($(OUT)/fuzz/asan.log says why)"; \
		$(call fuzz_build,-O0) || exit 1; fi; \
	"$(KSPLC)" run tests/fuzz_main.kspls "$(OUT)/fuzz/read_prog.exe" "$(OUT)/fuzz/work" $$asan \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
