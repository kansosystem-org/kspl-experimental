# ksdb -- building and testing this package on its own, from a `ksplc` and the `std` it carries
#   make test [KSPLC=/path/to/ksplc]      # ksdb's tests
#   make test-fuzz                        # damaged media opened, on a fixed seed
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# 1 fails a reader built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=

.PHONY: test test-fuzz
test:
	"$(KSPLC)" run tests/main.kspl

# The log opened on damaged media (`tests/fuzz_main.kspl`).
test-fuzz:
	rm -rf "$(OUT)/fuzz/work"
	@"$(KSPLC)" run tests/fuzz_main.kspl "$(OUT)/fuzz/read_prog.exe" "$(OUT)/fuzz/work" \
		--ksplc="$(KSPLC)" --build=tests/read_prog.kspl \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
