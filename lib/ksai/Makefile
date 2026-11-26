# ksai -- building and testing this package on its own, from a `ksplc` and a C compiler (for the
# examples and `test-fuzz`); `BLAS=1` hands matmul to OpenBLAS, which needs libopenblas-dev
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
BLAS ?= 0
# The library comes with the flag: the block `--define=blas` keeps names it (`##link` in tensor.kspl).
BLAS_FLAGS := $(if $(filter 1,$(BLAS)),--define=blas)
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# 1 fails a reader built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=

# An example is a folder under `examples/` that holds a `main.kspl`. So `make test` builds a new
# example without a list to edit; what it checks in a run is in `tests/examples_main.kspl`.
EXAMPLES := $(sort $(patsubst examples/%/main.kspl,%,$(wildcard examples/*/main.kspl)))
.PHONY: examples $(EXAMPLES) test test-unit test-fuzz
examples: $(EXAMPLES)

# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
# ksplc compiles and links each, optimised by default as the examples ship: both do a
# model's arithmetic element by element.
$(EXAMPLES):
	"$(KSPLC)" $(BLAS_FLAGS) examples/$@/main.kspl "$(OUT)/$@.exe"

# The unit tests alone. **They reach all that `BLAS=1` changes** (the `#cfg(blas)` blocks of
# `tensor.kspl`), so the root's `make test-blas` runs this, not the examples' builds.
test-unit:
	"$(KSPLC)" run $(BLAS_FLAGS) tests/main.kspl

# The examples are built and run with the tests, so one that stops building fails here (as
# Cargo builds `examples/` on `cargo test`).
test: examples test-unit
	"$(KSPLC)" run tests/stops_main.kspl "$(KSPLC_EXE)"
	rm -rf "$(OUT)/examples_test"
	"$(KSPLC)" run tests/examples_main.kspl "$(OUT)/llama_engine.exe" \
		"$(OUT)/code_complete.exe" "$(OUT)/car_pilot.exe" "$(OUT)/chat_server.exe" "$(KSPLC_EXE)" \
		"$(OUT)/examples_test"

test-fuzz:
	rm -rf "$(OUT)/fuzz/work"
	@"$(KSPLC)" run tests/fuzz_main.kspl "$(OUT)/fuzz/read_prog.exe" "$(OUT)/fuzz/work" \
		--ksplc="$(KSPLC)" --build=tests/read_prog.kspl \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
