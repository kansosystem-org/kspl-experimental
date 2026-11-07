# kssrv -- building and testing this package on its own, from a `ksplc` and a C compiler
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# Handed to the generated paths as they stand: `--trials=N`, `--seed=N`. Ten times `make test`'s.
FUZZ_ARGS ?= --trials=5000
# 1 fails a server built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=
# -O1, as the sanitizer slows it; `-g` and the frame pointer keep a stop's call row readable.
ASAN_BUILD := --sanitize=address --cflags="-O1 -g -fno-omit-frame-pointer"

.PHONY: all server test test-fuzz

all: server

# `ksplc build` compiles and links, optimised by default, with the C compiler `CC` names (or clang).
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
server:
	"$(KSPLC)" build main.kspl "$(OUT)/kssrv.exe"

# Caution: **Empty the workshop first**: the tests link out of it, and `rm -rf` follows no link.
test: server
	rm -rf "$(OUT)/test"
	"$(KSPLC)" run tests/main.kspl "$(OUT)/kssrv.exe" "$(OUT)/test"

# The run `paths` alone, with more generated paths than `make test` sends (`tests/paths.kspl`).
fuzz_build = "$(KSPLC)" build $(1) main.kspl "$(OUT)/fuzz/kssrv.exe"
# Caution: **Make the folder first**: the sanitizer's log is redirected into it before the build.
test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	rm -rf "$(OUT)/fuzz/work"
	@if $(call fuzz_build,$(ASAN_BUILD)) > "$(OUT)/fuzz/asan.log" 2>&1; then asan=--asan; \
		echo "# the server: with the address sanitizer"; \
	else asan=; echo "# the server: without the address sanitizer ($(OUT)/fuzz/asan.log says why)"; \
		$(call fuzz_build,--cflags=-O0) || exit 1; fi; \
	"$(KSPLC)" run tests/main.kspl "$(OUT)/fuzz/kssrv.exe" "$(OUT)/fuzz/work" paths $$asan \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
