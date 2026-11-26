# kssrv -- building and testing this package on its own, from a `ksplc` and a C compiler
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# Handed to the generated paths as they stand: `--trials=N`, `--seed=N`. Ten times `make test`'s.
FUZZ_ARGS ?= --trials=5000
# 1 fails a server built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=

.PHONY: all server test test-fuzz

all: server

# ksplc compiles and links it, optimised by default, with the C compiler `CC` names (or clang).
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
server:
	"$(KSPLC)" main.kspl "$(OUT)/kssrv.exe"

# Caution: **Empty the workshop first**: the tests link out of it, and `rm -rf` follows no link.
test: server
	rm -rf "$(OUT)/test"
	"$(KSPLC)" run tests/main.kspl "$(OUT)/kssrv.exe" "$(OUT)/test"

# The run `paths` alone, with more generated paths than `make test` sends (`tests/paths.kspl`).
test-fuzz:
	rm -rf "$(OUT)/fuzz/work"
	@"$(KSPLC)" run tests/main.kspl "$(OUT)/fuzz/kssrv.exe" "$(OUT)/fuzz/work" paths \
		--ksplc="$(KSPLC)" --build=main.kspl \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
