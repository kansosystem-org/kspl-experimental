# ksai -- building and testing this package on its own, from a `ksplc` and a C compiler (for the
# examples and `test-fuzz`); `BLAS=1` hands matmul to OpenBLAS, which needs libopenblas-dev
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
BLAS ?= 0
# The library comes with the flag: the block `--define=blas` keeps names it (`#link` in tensor.kspls).
BLAS_FLAGS := $(if $(filter 1,$(BLAS)),--define=blas)
# The C compiler ksplc picks (`CC`, or clang), exported so ksplc's link words fit it.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
# 1 fails a reader built without the address sanitiser (Linux CI holds its runtime); else a SKIP.
KSAI_REQUIRE_ASAN ?=
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# Optimized, as they ship: both examples do a model's arithmetic element by element.
EXAMPLES_CFLAGS := -std=c99 -g -O2
# -O1, as the sanitiser slows it; `-g` and the frame pointer keep a stop's call row readable.
ASAN_CFLAGS := -std=c99 -O1 -g -fno-omit-frame-pointer -fsanitize=address

.PHONY: examples llama_engine qwen_infer fim_coder test test-fuzz
examples: llama_engine qwen_infer fim_coder

# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
# One example, compiled and linked. The link words are asked of ksplc, never copied here.
define kspl_exe
	@mkdir -p "$(OUT)"
	"$(KSPLC)" $(BLAS_FLAGS) --emit-libs="$(OUT)/$(2).libs" $(1) "$(OUT)/$(2).c"
	"$(CC)" $(EXAMPLES_CFLAGS) "$(OUT)/$(2).c" "@$(OUT)/$(2).libs" $$("$(KSPLC)" info exe-flags) \
		$$("$(KSPLC)" info link-libs) -o "$(OUT)/$(2).exe"
endef

llama_engine:
	$(call kspl_exe,examples/llama_engine/main.kspls,llama_engine)

qwen_infer:
	$(call kspl_exe,examples/qwen_infer/main.kspls,qwen_infer)

fim_coder:
	$(call kspl_exe,examples/fim_coder/main.kspls,fim_coder)

# The examples are built and run with the tests, so one that stops building fails here (as
# Cargo builds `examples/` on `cargo test`).
test: examples
	"$(KSPLC)" run $(BLAS_FLAGS) tests/main.kspls
	"$(KSPLC)" run tests/stops_main.kspls "$(KSPLC_EXE)"
	rm -rf "$(OUT)/examples_test"
	"$(KSPLC)" run tests/examples_main.kspls "$(OUT)/llama_engine.exe" "$(OUT)/qwen_infer.exe" \
		"$(OUT)/fim_coder.exe" "$(OUT)/examples_test"

fuzz_link = $$("$(KSPLC)" info exe-flags) $$("$(KSPLC)" info link-libs) -o "$(OUT)/fuzz/read_prog.exe"
test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	"$(KSPLC)" --emit-libs="$(OUT)/fuzz/read_prog.libs" tests/read_prog.kspls \
		"$(OUT)/fuzz/read_prog.c"
	rm -rf "$(OUT)/fuzz/work"
	@if "$(CC)" $(ASAN_CFLAGS) "$(OUT)/fuzz/read_prog.c" "@$(OUT)/fuzz/read_prog.libs" $(fuzz_link) \
		2> "$(OUT)/fuzz/asan.log"; then asan=--asan; echo "# the reader: with the address sanitiser"; \
	else asan=; echo "# the reader: without the address sanitiser ($(OUT)/fuzz/asan.log says why)"; \
		"$(CC)" -std=c99 -O0 "$(OUT)/fuzz/read_prog.c" "@$(OUT)/fuzz/read_prog.libs" $(fuzz_link) \
		|| exit 1; fi; \
	"$(KSPLC)" run tests/fuzz_main.kspls "$(OUT)/fuzz/read_prog.exe" "$(OUT)/fuzz/work" $$asan \
		$(if $(filter 1,$(KSAI_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
