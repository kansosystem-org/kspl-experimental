# ksagent -- building and testing this package on its own, from a `ksplc` and a C compiler
# Caution: **Keep this file standing alone.** A copy of this folder alone is tested by it.

KSPLC ?= ksplc
OUT ?= out

.PHONY: all agent test

all: agent

# `ksplc build` compiles and links, optimised by default, with the C compiler `CC` names (or clang).
# Caution: **Quote every path** — a folder whose name holds a space splits an unquoted one.
agent:
	"$(KSPLC)" build main.kspl "$(OUT)/ksagent.exe"

# The tests start a stand-in model server in a thread, so no model is needed.
# Caution: **Empty the workshop first**: the tests make their folders in it, and links among them.
test:
	rm -rf "$(OUT)/test"
	"$(KSPLC)" run tests/main.kspl "$(OUT)/test"
