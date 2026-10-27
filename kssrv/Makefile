# kssrv -- building and testing this package on its own, from a `ksplc` and a C compiler
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out

.PHONY: all server test

all: server

# `ksplc build` compiles and links, optimised by default, with the C compiler `CC` names (or clang).
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
server:
	"$(KSPLC)" build main.kspl "$(OUT)/kssrv.exe"

# Caution: **Empty the workshop first**: the tests link out of it, and `rm -rf` follows no link.
test: server
	rm -rf "$(OUT)/test"
	"$(KSPLC)" run tests/main.kspl "$(OUT)/kssrv.exe" "$(OUT)/test"
