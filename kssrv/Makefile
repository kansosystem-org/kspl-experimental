# kssrv -- building and testing this package on its own, from a `ksplc`, a C compiler and the
# `ksai` it uses; `make check-pilot-copy COPY=<file>`: a copy of its policy still drives as it does
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out
# The C compiler ksplc picks (`CC`, or clang), exported so ksplc's link words fit it.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
# Optimized: the server learns its model as it starts, which takes seconds unoptimized.
KSSRV_CFLAGS := -std=c99 -g -O2
KSPLC_EXE = $(shell command -v "$(KSPLC)")

.PHONY: all server spew test check-pilot-copy

all: server

# One program, compiled and linked. The link words are asked of ksplc, never copied here.
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
define kspl_exe
	@mkdir -p "$(OUT)"
	"$(KSPLC)" --emit-libs="$(OUT)/$(2).libs" $(1) "$(OUT)/$(2).c"
	"$(CC)" $(KSSRV_CFLAGS) "$(OUT)/$(2).c" "@$(OUT)/$(2).libs" $$("$(KSPLC)" info exe-flags) \
		$$("$(KSPLC)" info link-libs) -o "$(OUT)/$(2).exe"
endef

server:
	$(call kspl_exe,main.kspls,kssrv)

spew:
	$(call kspl_exe,tests/spew.kspls,spew)

# Caution: **Empty the workshop first**: the tests link out of it, and `rm -rf` follows no link.
test: server spew
	rm -rf "$(OUT)/test"
	"$(KSPLC)" run tests/main.kspls "$(OUT)/kssrv.exe" "$(OUT)/spew.exe" "$(KSPLC_EXE)" \
		"$(OUT)/test"

check-pilot-copy: server
	@test -n "$(COPY)" || { echo "name the copy: make check-pilot-copy COPY=<file>"; exit 2; }
	rm -rf "$(OUT)/copy"
	"$(KSPLC)" run tests/copy.kspls "$(OUT)/kssrv.exe" "$(COPY)" "$(OUT)/copy"
