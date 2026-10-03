# ==========================================
# mk/kspage.mk — kspage as this repository builds it, checks it and hands it out
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==========================================

# The opener looks for `kspage_web/kspage.html` beside itself (`page_rel` in
# `tools/kspage_open.kspls`).
KSPAGE_WEB := $(OUT_DIR)/kspage_web

# Caution: **Relative paths only**: the repository's place may hold what Windows's linker garbles.
kspage_make = $(call pkg_make,kspage) OUT=../$(OUT_DIR)/kspage WEB=../$(KSPAGE_WEB)

## Run|kspage-web|Build the wasm for the browser
kspage-web: $(STAGE1_EXE)
	@$(kspage_make) web

## Gates|test-kspage-wasm|Run the browser's wasm under node
test-kspage-wasm: $(STAGE1_EXE)
	@$(kspage_make) test-wasm

## Gates|test-kspage-browser|Look at the input plumbing in a real browser
test-kspage-browser: $(STAGE1_EXE)
	@$(kspage_make) test-browser

## Gates|test-kspage-served|Look at the page `kssrv --local` served
test-kspage-served: $(STAGE1_EXE) kssrv kspage-plugins
	@$(kspage_make) test-served KSSRV=../$(OUT_DIR)/kssrv.exe

# ==========================================
# Making sure by touching it (`make kspage-serve`)
# ==========================================
# Caution: **The URL is `tools/kspage_open.kspls`'s alone** (a root and a document that do not
# line up give an empty page, nothing said); **keep `--show`**, or a run with no screen waits.
KSPAGE_DOC ?= README.md
KSPAGE_SERVE_PORT ?= 8080

## Run|kspage-serve|Serve one document and put out the URL (`KSPAGE_DOC=` / `KSPAGE_SERVE_PORT=`)
kspage-serve: kspage-web kssrv
	@echo "# SERVING kspage"
	./$(STAGE1_EXE) run tools/kspage_open.kspls "$(KSPAGE_DOC)" --root=. \
		--port=$(KSPAGE_SERVE_PORT) --show

# Caution: **Plugins beside the server, not in the folder served**: a fetched tree could plant one.
## Run|kspage-plugins|Build the sample plugins into the folder the server reads
kspage-plugins: $(STAGE1_EXE)
	@echo "# BUILDING the kspage plugins (out/plugins/)"
	$(call kspl_build,tools/kspage_plugin_sort.kspls,kspage_plugin_sort,,,$(OUT_DIR)/plugins/sort)
	@echo "# built -> $(OUT_DIR)/plugins/sort"

KSPAGE_OPEN_EXE := $(OUT_DIR)/kspage_open.exe

# **The association points at this executable**, not `ksplc run`: a double-click stands elsewhere.
$(KSPAGE_OPEN_EXE): $(STAGE1_EXE)
	@echo "# BUILDING the opener (out/kspage_open.exe)"
	$(call kspl_build,tools/kspage_open.kspls,kspage_open,,$(GUI_LDFLAGS))
	@echo "# built -> $(KSPAGE_OPEN_EXE)"

## Run|kspage-open|Open one document (`FILE=` is wanted)
kspage-open: kspage-web kssrv $(KSPAGE_OPEN_EXE)
	@test -n "$(FILE)" || { echo "usage: make kspage-open FILE=<path to a document>"; exit 1; }
	./$(KSPAGE_OPEN_EXE) "$(FILE)"

KSPAGE_SAMPLE := $(OUT_DIR)/sample.kspage

$(KSPAGE_SAMPLE): $(STAGE1_EXE)
	@echo "# WRITING a document to double-click"
	./$(STAGE1_EXE) run tools/kspage_doc.kspls $(KSPAGE_SAMPLE)

# ==========================================
# Making it open on a double-click (`make kspage`)
# ==========================================
# **Keep `Path=`**: a double-click stands in the home or `/`. **The absolute path comes from
# `$$PWD`**, as `$(CURDIR)` is unquoted and splits at a space. make only prints how to put it in.
KSPAGE_DESKTOP := $(OUT_DIR)/kspage.desktop
KSPAGE_MIME := $(OUT_DIR)/kspage-mime.xml

ifeq ($(PLATFORM),win32)
KSPAGE_ASSOC_LEAD := associate it for your user (no admin rights needed):
KSPAGE_ASSOC_STEPS := \
	'right-click $(KSPAGE_SAMPLE) -> Open with -> Choose another app' \
	'-> Look for another app on this PC -> pick $(KSPAGE_OPEN_EXE)' \
	'-> tick "Always use this app to open .kspage files"'
else ifeq ($(PLATFORM),darwin)
KSPAGE_ASSOC_LEAD := associate it for your user:
KSPAGE_ASSOC_STEPS := \
	'Automator -> New Document -> Application -> Run Shell Script' \
	'its body: $(KSPAGE_OPEN_EXE) "$$1"  (Pass input: as arguments); save the app' \
	'Finder -> Get Info on $(KSPAGE_SAMPLE) -> Open with -> that app -> Change All'
else
KSPAGE_ASSOC_LEAD := install it for your user with these four lines:
KSPAGE_ASSOC_STEPS := \
	'xdg-mime install --novendor $(KSPAGE_MIME)' \
	'cp $(KSPAGE_DESKTOP) ~/.local/share/applications/' \
	'update-desktop-database ~/.local/share/applications' \
	'xdg-mime default kspage.desktop application/x-kspage'
endif

## Run|kspage|Build the lot and make a `.kspage` open on a double-click
kspage: kspage-web kssrv $(KSPAGE_OPEN_EXE) $(KSPAGE_SAMPLE)
	@printf '%s\n' \
		'<?xml version="1.0" encoding="UTF-8"?>' \
		'<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">' \
		'  <mime-type type="application/x-kspage">' \
		'    <comment>kspage document</comment>' \
		'    <sub-class-of type="application/json"/>' \
		'    <glob pattern="*.kspage"/>' \
		'  </mime-type>' \
		'</mime-info>' \
		> $(KSPAGE_MIME)
	@here="$$PWD"; printf '%s\n' \
		'[Desktop Entry]' 'Type=Application' 'Version=1.0' \
		'Name=kspage' 'Comment=Open this file with kspage in a browser' \
		"Exec=$$here/$(KSPAGE_OPEN_EXE) %f" \
		"Path=$$here" 'Terminal=false' 'NoDisplay=true' \
		'MimeType=application/x-kspage;text/plain;text/markdown;text/csv;application/json;' \
		> $(KSPAGE_DESKTOP)
	@if command -v desktop-file-validate >/dev/null 2>&1; then \
		desktop-file-validate $(KSPAGE_DESKTOP) && echo "# desktop-file-validate: OK"; \
	else echo "# NOTE: desktop-file-validate is not installed; SKIPPED that check"; fi
	@echo "# built -> $(KSPAGE_DESKTOP)"
	@echo "# built -> $(KSPAGE_MIME)"
	@echo "# $(KSPAGE_ASSOC_LEAD)"
	@printf '#   %s\n' $(KSPAGE_ASSOC_STEPS)
	@echo "# then double-click $(KSPAGE_SAMPLE) to check it"
	@echo "# (the other platforms, and what to do if nothing opens: the last section of docs/HOWTO-set-up-a-project.md)"

.PHONY: kspage kspage-serve kspage-open kspage-plugins kspage-web \
	test-kspage-wasm test-kspage-browser test-kspage-served
