# ksbind -- testing this package on its own, from a `ksplc`, a C compiler and the libraries it
# binds (OpenSSL's libssl and libcrypto, SQLite's libsqlite3)
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# The C compiler ksplc picks (`CC`, or clang), exported so ksplc's link words fit it.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
# 1 fails where the libraries do not link (Linux CI's image holds them); else the tests SKIP.
KSBIND_REQUIRE_LIBS ?= 0

# **The libraries are asked of ksplc** (`--emit-libs`, from the sources' `#link`), never copied
# here. An empty program linked against them tells "not installed" from a binding that is wrong:
# only the first skips.
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
.PHONY: test
test:
	@mkdir -p "$(OUT)"
	"$(KSPLC)" --emit-libs="$(OUT)/tests.libs" tests/main.kspls "$(OUT)/tests.c"
	@printf 'int main(void) { return 0; }\n' > "$(OUT)/probe.c"
	@if "$(CC)" "$(OUT)/probe.c" "@$(OUT)/tests.libs" -o "$(OUT)/probe.exe" \
		2> "$(OUT)/probe.log"; then \
		"$(KSPLC)" run tests/main.kspls; \
	elif [ "$(KSBIND_REQUIRE_LIBS)" = 1 ]; then \
		echo "RESULT: SOME FAILED (1) -> $$(cat "$(OUT)/tests.libs") do not link here" \
			"($(OUT)/probe.log says why), and KSBIND_REQUIRE_LIBS=1 requires them." \
			"On a machine without them, KSBIND_REQUIRE_LIBS=0 makes this a SKIP;" \
			"such a round is not CI's verdict"; exit 1; \
	else \
		echo "SKIP ksbind's tests: $$(cat "$(OUT)/tests.libs") do not link here" \
			"($(OUT)/probe.log says why)"; \
		echo "RESULT: SKIPPED (the libraries ksbind binds are not installed)"; \
	fi
