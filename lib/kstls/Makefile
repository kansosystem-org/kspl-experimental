# kstls -- testing this package on its own, from a `ksplc`, a C compiler and the libraries it
# binds (OpenSSL's libssl and libcrypto)
#   make test [KSPLC=/path/to/ksplc]      # kstls's tests
#   make test-fuzz                        # broken handshakes at both halves, on a fixed seed
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# The C compiler ksplc picks (`CC`, or clang), exported so ksplc's link words fit it.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
# 1 fails where the libraries do not link (Linux CI's image holds them); else the tests SKIP.
KSTLS_REQUIRE_LIBS ?= 0
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# 1 fails a reader built without the address sanitizer (Linux CI holds its runtime); else a SKIP.
KANSO_REQUIRE_ASAN ?=
# -O1, as the sanitizer slows it; `-g` and the frame pointer keep a stop's call row readable.
ASAN_BUILD := --sanitize=address --cflags="-O1 -g -fno-omit-frame-pointer"

# **The libraries are asked of ksplc** (`--emit-libs`, from the sources' `#link`), never copied
# here. An empty program linked against them tells "not installed" from a binding that is wrong:
# only the first skips. `test` and `test-fuzz` both run `$(1)` behind this probe; `$(2)` names it.
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
define with_libs
	@mkdir -p "$(OUT)"
	"$(KSPLC)" --emit-libs="$(OUT)/tests.libs" tests/main.kspl "$(OUT)/tests.c"
	@printf 'int main(void) { return 0; }\n' > "$(OUT)/probe.c"
	@if "$(CC)" "$(OUT)/probe.c" "@$(OUT)/tests.libs" -o "$(OUT)/probe.exe" \
		2> "$(OUT)/probe.log"; then \
		$(1); \
	elif [ "$(KSTLS_REQUIRE_LIBS)" = 1 ]; then \
		echo "RESULT: SOME FAILED (1) -> $$(cat "$(OUT)/tests.libs") do not link here" \
			"($(OUT)/probe.log says why), and KSTLS_REQUIRE_LIBS=1 requires them." \
			"On a machine without them, KSTLS_REQUIRE_LIBS=0 makes this a SKIP;" \
			"such a round is not CI's verdict"; exit 1; \
	else \
		echo "SKIP kstls's $(2): $$(cat "$(OUT)/tests.libs") do not link here" \
			"($(OUT)/probe.log says why)"; \
		echo "RESULT: SKIPPED (the libraries kstls binds are not installed)"; \
	fi
endef

.PHONY: test test-fuzz
test:
	$(call with_libs,"$(KSPLC)" run tests/main.kspl,tests)

# Both halves fed broken handshakes over the loopback (`tests/fuzz_main.kspl`).
# Caution: **Make the folder first**: the sanitizer's log is redirected into it before the build.
fuzz_build = "$(KSPLC)" build $(1) tests/read_prog.kspl "$(OUT)/fuzz/read_prog.exe"
define fuzz_run
mkdir -p "$(OUT)/fuzz/work" && rm -f "$(OUT)/fuzz/work/"*; \
	if $(call fuzz_build,$(ASAN_BUILD)) > "$(OUT)/fuzz/asan.log" 2>&1; then asan=--asan; \
		echo "# the reader: with the address sanitizer"; \
	else asan=; echo "# the reader: without the address sanitizer ($(OUT)/fuzz/asan.log says why)"; \
		$(call fuzz_build,--cflags=-O0) || exit 1; fi; \
	"$(KSPLC)" run tests/fuzz_main.kspl "$(OUT)/fuzz/read_prog.exe" "$(OUT)/fuzz/work" $$asan \
		$(if $(filter 1,$(KANSO_REQUIRE_ASAN)),--require-asan) $(FUZZ_ARGS)
endef
test-fuzz:
	$(call with_libs,$(fuzz_run),fuzz)
