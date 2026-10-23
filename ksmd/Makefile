# ksmd -- building and testing this package on its own
# `make test` wants only a `ksplc` and the `std` it carries (or `KSPLC_STD_DIR`); the page and its
# browser checks want more, named above each.
#   make test [KSPLC=/path/to/ksplc]  # the model, reader, writer, editing and calculation tests
#   make web                          # the editing page, out/web/ksmd.html, and its wasm
#   make test-browser                 # the page in a headless Chromium, driven by real input
#   make measure                      # the time to open, edit and save a typical and a large document
# Caution: **Keep this file standing alone**: a copy of the folder, nothing more, is tested by it.
# **Keep a recipe to ASCII, and quote every path**: MSYS2's shell rereads a line outside UTF-8, and
# a folder whose name holds a space splits an unquoted path.

SHELL := bash

KSPLC ?= ksplc
OUT ?= out
# Where the page is written: `ksmd.html` with its scripts, its style and its wasm beside it.
WEB ?= $(OUT)/web

.PHONY: test web web-tools test-browser measure

test:
	"$(KSPLC)" run tests/main.kspl

# ==========================================
# The page, for the browser (wasm32)
# ==========================================
# It wants a clang that targets wasm32, `wasm-ld`, and clang's builtins for wasm32. **wasm holds
# neither libc nor malloc**: the C is made with `--freestanding`, and `-mbulk-memory` lets clang
# copy and fill memory with wasm's own instructions, so no C library routine is linked.
WEB_SRC := port/web
WASM_MACHINE := wasm32-unknown-unknown
WASM_CC := clang --target=$(WASM_MACHINE) -std=c99 -O2 -ffreestanding -nostdlib -Wall \
    -mbulk-memory -ffunction-sections -fdata-sections
# Caution: **Do not use `--allow-undefined`**: only what `port/web/imports.txt` names comes from the
# script, so anything else fails the link rather than the page.
# **Put the stack first**: after the data, a deep call runs past its end into the heap without a trap.
WASM_LD := wasm-ld --no-entry --gc-sections --stack-first -z stack-size=1048576 \
    --allow-undefined-file=$(WEB_SRC)/imports.txt
# clang lowers what wasm32 has no instruction for, such as a 128-bit product, to calls that only
# this library defines. clang files it under the `wasi` machine's folder.
WASM_BUILTINS := $(shell clang --target=wasm32-wasi -rtlib=compiler-rt -print-libgcc-file-name 2>/dev/null)

# Whether the tools the page needs are installed. `make install` at the root asks this before it
# ties `.ksmd` to its launcher, which needs the page.
web-tools:
	@test -f "$(WASM_BUILTINS)" || { \
	  echo "clang's wasm32 builtins are not installed. The link needs them."; \
	  printf 'clang reported: %s\n' "$(WASM_BUILTINS)"; \
	  echo "Debian/Ubuntu: install libclang-rt-<version>-dev-wasm32 for your clang version"; \
	  exit 1; }
	@command -v wasm-ld >/dev/null 2>&1 || { \
	  echo "wasm-ld is not installed. The link needs it."; \
	  echo "Debian/Ubuntu: install lld"; \
	  exit 1; }

# The page is one file: `page.html` names the style and scripts that go inside it.
web: web-tools
	@echo "# BUILDING the ksmd page for the browser (wasm32, freestanding)"
	@mkdir -p "$(OUT)/gen" "$(WEB)"
	"$(KSPLC)" --freestanding --machine=$(WASM_MACHINE) $(WEB_SRC)/bridge.kspl \
		"$(OUT)/gen/ksmd_bridge.c"
	$(WASM_CC) -c "$(OUT)/gen/ksmd_bridge.c" -o "$(OUT)/gen/ksmd_bridge.o"
	$(WASM_LD) "$(OUT)/gen/ksmd_bridge.o" "$(WASM_BUILTINS)" -o "$(WEB)/ksmd.wasm"
	"$(KSPLC)" run $(WEB_SRC)/bundle.kspl $(WEB_SRC)/page.html "$(WEB)/ksmd.wasm" "$(WEB)/ksmd.html"
	@printf 'OUTPUT: %s (one file: open it in a browser, or serve it with kssrv --page)\n' \
		"$(WEB)/ksmd.html"

# ==========================================
# The page in a real browser
# ==========================================
# Typing, composition, selection, undo and tables, driven through the browser's own input events
# (`tests/browser/main.mjs`). It wants `node` and a Chromium; the image's pinned build is taken first.
# Caution: **Not `BROWSER`**: VS Code and desktops set it to a script that opens a URL elsewhere.
KSMD_BROWSER := $(firstword \
    $(shell command -v chromium 2>/dev/null || command -v google-chrome-stable 2>/dev/null || \
        command -v google-chrome 2>/dev/null) \
    $(wildcard /opt/pw-browsers/chromium-*/chrome-linux/chrome))
# Where it is 1, finding no browser is a failure rather than a SKIP: an image that holds a browser
# sets it, so a round that lost the tool does not stay green.
KSMD_REQUIRE_BROWSER ?=
# The local server that serves the page to the checks that open and save files. It is another
# package, so it is passed in; from the root, `make test-ksmd-browser` builds it and passes it.
KSSRV ?=

test-browser: web
	@echo "# CHECKING the ksmd page in a browser"
	@if [ -z "$(KSMD_BROWSER)" ]; then \
	  if [ "$(KSMD_REQUIRE_BROWSER)" = 1 ]; then \
	    echo "RESULT: SOME FAILED (1) -> no browser found (KSMD_REQUIRE_BROWSER)"; exit 1; fi; \
	  echo "RESULT: SKIPPED (no browser - see docs/SPEC-gates.md)"; exit 0; fi
	node tests/browser/main.mjs "$(KSMD_BROWSER)" "$(WEB)/ksmd.html" "$(OUT)/browser" $(if $(KSSRV),"$(KSSRV)")

# ==========================================
# What a document costs
# ==========================================
# The model's own times, then the page's in a headless Chromium: opened from a file, and served by
# `KSSRV` where it is given. It prints times and checks nothing, so no gate runs it.
measure: web
	@test -n "$(KSMD_BROWSER)" || { echo "no browser found: the page is not measured"; exit 1; }
	"$(KSPLC)" run tests/measure.kspl "$(OUT)/measure"
	node tests/browser/measure.mjs "$(KSMD_BROWSER)" "$(WEB)/ksmd.html" "$(OUT)/measure-browser" \
		"$(OUT)/measure" $(if $(KSSRV),"$(KSSRV)")
