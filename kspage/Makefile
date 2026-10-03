# kspage -- building and testing this package on its own
# `make test` wants only a `ksplc`, the `std` it carries (or `KSPLC_STD_DIR`) and the `ksdb` it uses
# (`KSPLC_PKG_SRC_DIR`); the page and the checks on it want more, named above each.
#   make test / test-fuzz [KSPLC=/path/to/ksplc]  # the tests; broken documents fuzzed at opening
#   make web / test-wasm                          # the page (out/web/kspage.html); its wasm in node
#   make test-browser / test-served KSSRV=<kssrv> # the input plumbing in a real browser; as served
# Caution: **Keep this file standing alone**: a copy of the folder, nothing more, is tested by it.
# **Keep a recipe to ASCII, and quote every path**: MSYS2's shell rereads a line outside UTF-8
# (wording goes over in an `export`), and a folder whose name holds a space splits an unquoted path.

# `set -o pipefail` (the browser checks) wants bash, not dash; make takes no shell from its caller.
SHELL := bash

KSPLC ?= ksplc
OUT ?= out
# The C compiler ksplc itself picks (`CC`, else clang), exported so ksplc's link words fit it.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
# Where the fuzz draws Markdown from besides the document it writes (the repository names its root).
FUZZ_SEEDS ?= .
# Handed to the fuzz as they stand: `--trials=N`, `--seed=N`.
FUZZ_ARGS ?=
# Where the page is written: one `kspage.html` that opens alone, beside the `kspage.wasm` bound in.
WEB ?= $(OUT)/web
# The compiler as a path: the tests have it read a text they wrote, never looking at PATH.
KSPLC_EXE = $(shell command -v "$(KSPLC)")

.PHONY: test test-fuzz web test-wasm test-browser test-served

test:
	rm -rf "$(OUT)/test"
	"$(KSPLC)" run tests/main.kspls "$(KSPLC_EXE)" "$(OUT)/test"

test-fuzz:
	@mkdir -p "$(OUT)/fuzz"
	"$(KSPLC)" --emit-libs="$(OUT)/fuzz/open_prog.libs" tests/open_prog.kspls \
		"$(OUT)/fuzz/open_prog.c"
	"$(CC)" -std=c99 -O0 "$(OUT)/fuzz/open_prog.c" "@$(OUT)/fuzz/open_prog.libs" \
		$$("$(KSPLC)" info exe-flags) $$("$(KSPLC)" info link-libs) -o "$(OUT)/fuzz/open_prog.exe"
	rm -rf "$(OUT)/fuzz/work"
	"$(KSPLC)" run tests/fuzz_main.kspls "$(OUT)/fuzz/open_prog.exe" "$(OUT)/fuzz/work" \
		"$(FUZZ_SEEDS)" $(FUZZ_ARGS)

# ==========================================
# The page, for the browser (wasm32)
# ==========================================
# It wants a clang that targets wasm32, and `wasm-ld`. **wasm holds neither libc nor malloc**: it is
# generated with `--freestanding`, and `port/web/rt.c` fills in memset / memcpy / memmove.
WEB_SRC  := port/web
WASM_CC  := clang --target=wasm32 -std=c99 -O2 -ffreestanding -nostdlib -Wall \
    -ffunction-sections -fdata-sections
# Caution: **Do not use `--allow-undefined`**: only the two in `port/web/imports.txt` are borrowed,
# so anything else **fails the link** (allowed, only the browser says "no such function").
# **Do not line the entry points that go out up here** either: held by hand, one is left out in
# silence. The source side's `#export` settles them; `make test-conventions` holds the two sides.
WASM_LD  := wasm-ld --no-entry --gc-sections \
    --allow-undefined-file=$(WEB_SRC)/imports.txt

export KSPAGE_OPEN_NOTE := (opening it in a browser is enough; no web server is wanted)
# **Write `#` as `\#`** (make cuts an assignment at a `#`) and **put no ` in either**: the recipe's
# printf expands them inside double quotes, where one opens a command substitution.
export KSPAGE_EXPORTS_NOTE := what settles the entry points JS calls is the source side's \#export (they are not lined up by hand)
export KSPAGE_IMPORTS_NOTE := what is borrowed from outside is the two in port/web/imports.txt (the link guarantees it)

web:
	@echo "# BUILDING kspage for the browser (wasm32, freestanding)"
	@mkdir -p "$(OUT)/gen" "$(WEB)"
	"$(KSPLC)" --freestanding $(WEB_SRC)/bridge.kspls "$(OUT)/gen/kspage_bridge.c"
	$(WASM_CC) -c "$(OUT)/gen/kspage_bridge.c" -o "$(OUT)/gen/kspage_bridge.o"
	$(WASM_CC) -c $(WEB_SRC)/rt.c -o "$(OUT)/gen/kspage_rt.o"
	$(WASM_LD) "$(OUT)/gen/kspage_bridge.o" "$(OUT)/gen/kspage_rt.o" -o "$(WEB)/kspage.wasm"
	# Caution: **Do not line the sources' names up here**: the template names what is bound
	#    (`__KSPAGE_FILE:...__` in `port/web/page.html`); a list here lets one drop silently.
	"$(KSPLC)" run $(WEB_SRC)/bundle.kspls $(WEB_SRC)/page.html "$(WEB)/kspage.wasm" \
		"$(WEB)/kspage.html"
	@printf 'OUTPUT: %s %s\n' "$(WEB)/kspage.html" "$$KSPAGE_OPEN_NOTE"

# Looks that the core builds up as wasm32, that it really runs, and that **no entry point goes out
# too far**; it wants `node`. **What comes out on the canvas is not looked at** (open it by hand).
test-wasm: web
	@echo "# CHECKING the kspage wasm module's shape"
	@printf 'pass wire: %s\n' "$$KSPAGE_EXPORTS_NOTE"
	@printf 'pass wire: %s\n' "$$KSPAGE_IMPORTS_NOTE"
	node tests/wasm/main.mjs "$(WEB)/kspage.wasm"

# ==========================================
# The plumbing that takes input, over a real browser
# ==========================================
# **It looks only at what can be looked at nowhere else**: the focus, whether an element counts as
# visible, how many times one keystroke goes in. A real composing is not looked at (headless holds
# no input method; open it by hand). Where no browser is found it says SKIPPED (docs/SPEC-gates.md).
# Caution: **Lay the binary with a head first.** A headless-only one lacks judgements such as the
# permission to open a window, so a move a real browser would stop passes at hand; only CI fails.
KSPAGE_BROWSER := $(firstword \
    $(shell command -v google-chrome-stable 2>/dev/null || \
        command -v google-chrome 2>/dev/null || command -v chromium 2>/dev/null) \
    $(wildcard /opt/pw-browsers/chromium-*/chrome-linux/chrome) \
    $(shell command -v chrome-headless-shell 2>/dev/null) \
    $(wildcard /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell))

# Where it is not empty, holding no browser is a failure.
# Caution: **From an environment that carries a browser, set it when calling**: let through, a round
# whose image lost the tool stays green unverified (macOS and Windows at hand may hold no browser).
KSPAGE_REQUIRE_BROWSER ?=
# $(kspage_no_browser), at a recipe's head: with no browser the round ends there, SKIPPED, or
# failed where one is required. **Both checks stop through it**, so they say it the same way.
kspage_no_browser = if [ -z "$(KSPAGE_BROWSER)" ]; then \
  if [ -n "$(KSPAGE_REQUIRE_BROWSER)" ]; then \
    echo "RESULT: SOME FAILED (1) -> no browser found (KSPAGE_REQUIRE_BROWSER)"; exit 1; fi; \
  echo "RESULT: SKIPPED (no browser - see docs/SPEC-gates.md)"; exit 0; \
  fi
# Checks press at named places, so the window's size is set (headed Chrome's own is too narrow).
KSPAGE_WINDOW := 1280,1024
# The cap that stops the browser (ordinary Chrome does not quit after dumping; the served side waits
# for the marker). **Do not make it too short**: a busy machine's round is cut with no marker out.
KSPAGE_BROWSER_LIMIT := 300

# Caution: **Leave no option out**: the contents shrink while green, or not one marker comes out.
# `--headless`: ordinary Chrome looks for a screen otherwise (headless_shell hides it).
# `--disable-dev-shm-usage`: **a must in a container**, whose `/dev/shm` jams it (never at hand).
# `--disable-popup-blocking`: a scripted press is no gesture, so a real browser stops `window.open`.
# `--disable-background-networking` to `--host-resolver-rules`: a request never coming back stalls
# the dumping side (`127.0.0.1` left for `test-served`). **Both checks share this one list.**
KSPAGE_BROWSER_FLAGS := --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --disable-popup-blocking \
  --disable-background-networking --disable-component-update \
  --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1" \
  --enable-logging=stderr \
  --window-size=$(KSPAGE_WINDOW)

# ==========================================
# The browser's held-back place, for the side that served alone (`--user-data-dir`)
# ==========================================
# Caution: **The side that served is to hand the held-back place over by name.** Unhanded, Chrome's
# throwaway one keeps IndexedDB in memory, and reading a grip (`FileSystemFileHandle`) back there
# **makes the browser spill a core** (`port/web/handle.js`): only a SQLite-backed IndexedDB fails,
# so **CI alone can fail**. **Do not hand it to the side that dumps** (its own requests cut it),
# and **delete it every round**, or the next round reads its state.
KSPAGE_UDD := $(OUT)/kspage_udd

# The options for the side that dumps and quits alone (not for `test-served`).
# `--dump-dom`: read the markers inside `<pre id="kspage-probe">` alone (the script's strings are
# in the DOM too). `--virtual-time-budget`: the checks are asynchronous, so the dump waits for them.
# Caution: **This is a virtual time**: a section that waits on real time cannot wait, and the dump
# cuts before the marker is written; so the side that served runs on the real clock.
KSPAGE_DUMP_FLAGS := --dump-dom --virtual-time-budget=300000

# What the page itself said, cut back out of the browser's stderr (`--enable-logging=stderr` puts
# it there): $(call kspage_said,<file>). **Both readers cut it here, the same way**: worded twice,
# the day the name moves one reads nothing (`make test-conventions` holds it to the page's opening).
KSPAGE_SAID := kspage-probe
kspage_said = sed -n 's/^.*"$(KSPAGE_SAID): //p' "$(1)" | sed 's/", source: .*$$//'

# $(call kspage_said_agrees,<marks file>,<err file>): what the page said against the ordinary marks.
# Caution: **A road taken only in an emergency has to be walked on the ordinary round**: the day
# Chrome's line shape moves, a green round falls rather than a cut one going quiet.
kspage_said_agrees = $(call kspage_said,$(2)) | grep -v '^\.\.\.\. waiting: ' > "$(2).said"; \
  diff -u "$(1)" "$(2).said" > "$(2).said.diff" 2>&1

# $(call kspage_err_summary,<file>) sums up the browser's stderr when it fails.
# Caution: **Do not put out the tail alone**: the lines naming the cause come early, so they are
# counted per kind (the page's own left out, or its marks push the complaints off), tail added.
kspage_err_summary = mine=$$(grep -c '$(KSPAGE_SAID): ' "$(1)" || true); \
  printf '  browser: stderr %s lines, %s of them the page speaking:\n' \
    "$$(grep -c '' "$(1)")" "$$mine"; \
  grep -v '$(KSPAGE_SAID): ' "$(1)" \
    | sed -E 's/\[[0-9:./]+\]//g; s/[0-9]+/N/g' | sort | uniq -c | sort -rn \
    | head -12 | sed 's/^/  browser: /'; \
  printf '  browser: (tail)\n'; \
  grep -v '$(KSPAGE_SAID): ' "$(1)" | tail -5 | sed 's/^/  browser: /'

# Caution: **Hold the checks' sources by name.** Bound as a folder, one added falls into an order
# settled by its name, unnoticed until it fails. `probe.js` turns the sections.
KSPAGE_PROBE := probe input store menu cell show insert pin filter find paint paper link note keys \
	ribbon diff source fresh drag outside local keep outline
KSPAGE_PROBE_JS := $(patsubst %,tests/browser/%.js,$(KSPAGE_PROBE))

# Caution: **Both checks are to use this page with the checks pasted in**: built apart, the
# `file://` side alone goes through on an old shape of the source.
KSPAGE_PROBE_PAGE := $(OUT)/kspage_probe.html

$(KSPAGE_PROBE_PAGE): web $(KSPAGE_PROBE_JS)
	@{ cat "$(WEB)/kspage.html"; echo '<script>'; cat $(KSPAGE_PROBE_JS); \
		echo '</script>'; } > "$@"

# **Settle pass and fail by the markers alone**; the exit code says only that it hit the cap (124).
# The dump goes **into a file** (piped, `|| true` swallows the status), and **stderr is kept**: it
# holds why it could not start. **One shell runs the recipe** (an `exit 0` ends only its own line).
# Caution: **Cut the marks at the tags, not at the line** (the `<pre>` shares its line with markup),
# and **bring the three escapes back, `&amp;` last** (undone first, `&amp;lt;` is read twice over).
# The page is opened by its absolute path: a `file://` URL holds no relative one.
test-browser: $(KSPAGE_PROBE_PAGE)
	@echo "# CHECKING kspage's input plumbing in a real browser"
	@set -o pipefail; \
	$(kspage_no_browser); \
	probe="$$(cd "$(OUT)" && pwd)/kspage_probe.html"; \
	rc=0; \
	timeout $(KSPAGE_BROWSER_LIMIT) $(KSPAGE_BROWSER) $(KSPAGE_BROWSER_FLAGS) \
		$(KSPAGE_DUMP_FLAGS) "file://$$probe" > "$(OUT)/kspage_probe.dom" \
		2> "$(OUT)/kspage_probe.err" || rc=$$?; \
	sed -n '/<pre id="kspage-probe">/,/<\/pre>/p' "$(OUT)/kspage_probe.dom" \
		| sed 's,^.*<pre id="kspage-probe">,,; s,</pre>.*$$,,' \
		| sed 's,&lt;,<,g; s,&gt;,>,g; s,&amp;,\&,g' > "$(OUT)/kspage_probe.txt"; \
	if [ ! -s "$(OUT)/kspage_probe.txt" ]; then \
		$(call kspage_said,$(OUT)/kspage_probe.err) > "$(OUT)/kspage_probe.txt"; fi; \
	cat "$(OUT)/kspage_probe.txt"; \
	grep -q "BROWSER-RESULT: ALL PASS" "$(OUT)/kspage_probe.txt" \
		|| { if [ "$$rc" = 124 ]; then \
		       echo "NOTE: the browser did not finish in $(KSPAGE_BROWSER_LIMIT)s;" \
		            "timeout killed it, so no DOM was drawn"; \
		       echo "  the list above is what the page said on the standard error instead," \
		            "and its last line is as far as the round got"; \
		       echo "  the virtual time budget does not expire while loads are pending"; \
		     fi; \
		     echo "RESULT: SOME FAILED (1) -> the browser checks did not reach the marker"; \
		     $(call kspage_err_summary,$(OUT)/kspage_probe.err); exit 1; }; \
	$(call kspage_said_agrees,$(OUT)/kspage_probe.txt,$(OUT)/kspage_probe.err) \
		|| { echo "RESULT: SOME FAILED (1) -> what the page said does not match the marks;" \
		          "the road the check falls back on when no DOM comes is broken"; \
		     head -20 "$(OUT)/kspage_probe.err.said.diff"; exit 1; }; \
	echo "RESULT: ALL PASS"

# ==========================================
# The page `kssrv --local` served
# ==========================================
# **The server is handed in** (`KSSRV=<path>`, another package's), the `sort` plugin laid beside it.
# Caution: **Take the token in as a fragment (`#t=`)**: on the query (`?`) it rides the request's
# line (docs/SPEC-local-server.md). The URL is taken whole from the line `kssrv: I: open `, and
# `kssrv/main.kspls` names this waiter where it puts that line out.
# **Do not let the number fall on another check's** (they run alongside each other).
KSPAGE_SERVED_PORT := 18393
# **Lay a file inside a folder too**: path folding shows nowhere else, and writing makes no folder.
KSPAGE_SERVED_ROOT := $(OUT)/kspage_served

# **Run on the real clock** (the reason is at `KSPAGE_DUMP_FLAGS`) and **settle the end by the
# markers written back** (`handBack` in `tests/browser/probe.js`), never by the DOM: none comes out.
# **The outer `timeout` outlasts this side's wait** (equal, a round that hit the cap goes unnamed);
# it is the net for a make killed hard, when `trap` does not run.
test-served: $(KSPAGE_PROBE_PAGE)
	@echo "# CHECKING kspage against a real kssrv --local"
	@set -o pipefail; \
	if [ -z "$(KSSRV)" ]; then \
		echo "name the server: make test-served KSSRV=<path to kssrv>"; exit 2; fi; \
	$(kspage_no_browser); \
	root="$(KSPAGE_SERVED_ROOT)"; rm -rf "$$root"; mkdir -p "$$root/lib"; \
	cp "$(KSPAGE_PROBE_PAGE)" "$$root/index.html"; \
	log="$(OUT)/kspage_served.log"; : > "$$log"; \
	"$(KSSRV)" $(KSPAGE_SERVED_PORT) "$$root" --local > "$$log" 2>&1 & \
	pid=$$!; \
	trap 'kill $$pid 2>/dev/null || true' EXIT; \
	waited=0; \
	while ! grep -q 'kssrv: I: open ' "$$log"; do \
		waited=$$((waited + 1)); \
		if [ $$waited -gt 300 ]; then \
			echo "RESULT: SOME FAILED (1) -> kssrv did not become ready in 30s"; \
			sed 's/^/  kssrv: /' "$$log"; exit 1; fi; \
		sleep 0.1; \
	done; \
	url=$$(sed -n 's/^kssrv: I: open //p' "$$log" | head -1); \
	said="$$root/kspage-probe.txt"; \
	udd="$(KSPAGE_UDD)"; rm -rf "$$udd"; \
	till=$$(($$(date +%s) + $(KSPAGE_BROWSER_LIMIT))); \
	timeout $$(($(KSPAGE_BROWSER_LIMIT) + 30)) $(KSPAGE_BROWSER) $(KSPAGE_BROWSER_FLAGS) \
		--user-data-dir="$$udd" "$$url" > /dev/null 2> "$(OUT)/kspage_served.err" & \
	seen=$$!; \
	trap 'kill $$pid $$seen 2>/dev/null || true' EXIT; \
	late=0; gone=0; \
	while ! grep -q 'BROWSER-RESULT' "$$said" 2>/dev/null; do \
		if ! kill -0 $$seen 2>/dev/null; then gone=1; break; fi; \
		if [ $$(date +%s) -ge $$till ]; then late=1; break; fi; \
		sleep 0.5; \
	done; \
	rc=0; \
	if [ "$$gone" = 1 ]; then wait $$seen || rc=$$?; else kill $$seen 2>/dev/null || true; fi; \
	cp "$$said" "$(OUT)/kspage_served.txt" 2>/dev/null || : > "$(OUT)/kspage_served.txt"; \
	if [ ! -s "$(OUT)/kspage_served.txt" ]; then \
		$(call kspage_said,$(OUT)/kspage_served.err) > "$(OUT)/kspage_served.txt"; fi; \
	cat "$(OUT)/kspage_served.txt"; \
	grep -q "BROWSER-RESULT: ALL PASS" "$(OUT)/kspage_served.txt" \
		|| { if [ "$$late" = 1 ]; then \
		       echo "NOTE: the page did not reach the marker in $(KSPAGE_BROWSER_LIMIT)s;" \
		            "the list above stops at the check it was waiting on"; \
		     fi; \
		     if [ "$$gone" = 1 ]; then \
		       echo "NOTE: the browser quit on its own before the marker (status $$rc);" \
		            "134 or 139 means it crashed, and the stderr summary below carries the trace"; \
		     fi; \
		     echo "RESULT: SOME FAILED (1) -> the served checks did not reach the marker"; \
		     $(call kspage_err_summary,$(OUT)/kspage_served.err); \
		     sed 's/^/  kssrv: /' "$$log" | tail -20; exit 1; }; \
	echo "RESULT: ALL PASS"
