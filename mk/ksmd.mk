# ==========================================
# mk/ksmd.mk — ksmd as this repository builds it, checks it and opens it from the desktop
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==========================================

# Caution: **Relative paths only**: the repository's place may hold what Windows's linker garbles.
ksmd_make = $(call pkg_make,ksmd) OUT=../$(OUT_DIR)/ksmd

## Run|ksmd-web|Build the ksmd editing page (out/ksmd/web/ksmd.html) and its wasm
ksmd-web: $(STAGE1_EXE)
	@$(ksmd_make) web

## Gates|test-ksmd-browser|Edit ksmd documents in a headless Chromium through real input events, and open and save files through kssrv --local
test-ksmd-browser: $(STAGE1_EXE) $(KSSRV_EXE)
	@$(ksmd_make) test-browser KSSRV=../$(KSSRV_EXE)

## Run|measure-ksmd|Time opening, editing and saving ksmd documents from a typical one to a large one, in KSPL and in a headless Chromium
measure-ksmd: $(STAGE1_EXE) $(KSSRV_EXE)
	@$(ksmd_make) measure KSSRV=../$(KSSRV_EXE)

# ==========================================
# Opening a `.ksmd` from the desktop (`make ksmd`)
# ==========================================
# **The association points at this executable**, not `ksplc run`: a double-click stands elsewhere.
# It looks for the server and the page beside itself (`KSMD` in `tools/opener_aim.kspl`).
KSMD_EXE := $(OUT_DIR)/ksmd.exe
KSMD_ICON_DIR := ksmd/port/desktop

# **On Windows the icon is built into the launcher**: a file associated with a program shows that
# program's icon, so no registry entry is needed.
KSMD_RES :=
ifeq ($(PLATFORM),win32)
WINDRES ?= windres
KSMD_RES := $(GEN_DIR)/ksmd_icon.o
$(KSMD_RES): $(KSMD_ICON_DIR)/ksmd.rc $(KSMD_ICON_DIR)/ksmd.ico | $(OUT_DIR)
	@mkdir -p $(dir $@)
	$(WINDRES) --include-dir=$(KSMD_ICON_DIR) -O coff $(KSMD_ICON_DIR)/ksmd.rc -o $@
endif

$(KSMD_EXE): $(STAGE1_EXE) $(KSMD_RES) tools/ksmd.kspl $(OPENER_SRC)
	$(stop_ksmd_servers)
	@echo "# BUILDING the launcher (out/ksmd.exe)"
	$(call kspl_build,tools/ksmd.kspl,ksmd,,$(GUI_LDFLAGS) $(KSMD_RES))
	@echo "# built -> $(KSMD_EXE)"

## Run|ksmd-open|Open one `.ksmd` document in a browser (`FILE=` is wanted)
ksmd-open: ksmd-web $(KSSRV_EXE) $(KSMD_EXE)
	@test -n $(call shq,$(FILE)) || { echo "usage: make ksmd-open FILE=<path to a .ksmd document>"; exit 1; }
	./$(KSMD_EXE) $(call shq,$(FILE))

# **The launcher as a double-click runs it**, on scratch workspaces with a stand-in page, and with
# `--show`, so no browser starts (`tools/tests/ksmd_launch.kspl`). Its work folder is emptied first.
KSMD_LAUNCH_WORK := $(TMP_DIR)/ksmd_launch_test

## Gates|test-ksmd-open|Start the ksmd launcher on scratch workspaces: the workspace, its port, reuse, a taken port, two opens at once and the refusals
test-ksmd-open: $(KSSRV_EXE) $(KSMD_EXE)
	rm -rf "$(KSMD_LAUNCH_WORK)"
	./$(STAGE1_EXE) run tools/tests/ksmd_launch.kspl $(KSMD_EXE) $(KSSRV_EXE) \
		"$(KSMD_LAUNCH_WORK)"

KSMD_DESKTOP := $(GEN_DIR)/ksmd.desktop
KSMD_MIME := $(GEN_DIR)/ksmd-mime.xml
KSMD_ICON := $(KSMD_ICON_DIR)/ksmd.svg
# The document `make ksmd` asks to double-click: an example with a table and an include.
KSMD_SAMPLE := ksmd/examples/overview.ksmd

ifeq ($(PLATFORM),win32)
KSMD_ASSOC_LEAD := associate it for your user (no admin rights needed):
KSMD_ASSOC_STEPS := \
	'right-click $(KSMD_SAMPLE) -> Open with -> Choose another app' \
	'-> Look for another app on this PC -> pick $(KSMD_EXE)' \
	'-> tick "Always use this app to open .ksmd files"'
else ifeq ($(PLATFORM),darwin)
KSMD_ASSOC_LEAD := associate it for your user:
KSMD_ASSOC_STEPS := \
	'Automator -> New Document -> Application -> Run Shell Script' \
	'its body: "$(abspath $(KSMD_EXE))" "$$1"  (Pass input: as arguments); save the app' \
	'Finder -> Get Info on $(KSMD_SAMPLE) -> Open with -> that app -> Change All'
else
KSMD_ASSOC_LEAD := tie it for your user:
KSMD_ASSOC_STEPS := \
	'make install-desktop  (make install does it too)'
endif

KSMD_MIME_TYPE := application/x-ksmd

# **It writes the entry and the declaration alone**, so the gate costs no build. It installs them
# into a scratch data folder, as `make install-desktop` does. `KSMD_REQUIRE_DESKTOP=1` fails where
# `desktop-file-validate`, `gio` or a cache tool is missing (the gate passes it); else a SKIP.
KSMD_REQUIRE_DESKTOP ?=
# **A clone's path can hold a space**, and `desktop-file-validate` accepts an Exec that splits there.
# So the gate writes a second entry, for a probe program in a folder whose name holds a space and
# each character Exec escapes, and `gio launch` runs it with a file. The probe writes what it was
# given. **Only on Linux**: Windows and macOS start no `.desktop` entry, and MSYS2's `gio` refuses
# to launch one. Caution: **No `%` in the name**: GLib looks for the program before it reads `%%`
# as `%`, so no entry it launches can name a program with `%` in its path.
KSMD_PROBE_ENTRY := $(TMP_DIR)/desktop_probe.desktop
KSMD_PROBE_DIR := desktop probe $$x `y` "q" \z
## Gates|test-ksmd-desktop|Whether the entry `make ksmd` writes is a valid `.desktop` file that starts its program from a folder with a space, and installs as `make install-desktop` puts it in
test-ksmd-desktop: | $(OUT_DIR)
	$(call desktop_entry,$(KSMD_DESKTOP),ksmd,$(KSMD_EXE),$(KSMD_ICON),$(KSMD_MIME_TYPE);,$(KSMD_REQUIRE_DESKTOP))
	@d="$$PWD/$(TMP_DIR)/"'$(KSMD_PROBE_DIR)'; rm -rf "$$d"; mkdir -p "$$d" && \
	printf '%s\n' '#!/bin/sh' 'printf "%s\n" "$$0" "$$@" > "$$(dirname "$$0")/given"' > "$$d/probe" && \
	chmod +x "$$d/probe"
	$(call desktop_entry,$(KSMD_PROBE_ENTRY),probe,probe,probe.svg,$(KSMD_MIME_TYPE);,$(KSMD_REQUIRE_DESKTOP),"$$PWD/$(TMP_DIR)/"'$(KSMD_PROBE_DIR)')
	@d="$$PWD/$(TMP_DIR)/"'$(KSMD_PROBE_DIR)'; \
	if [ "$(PLATFORM)" = win32 ] || [ "$(PLATFORM)" = darwin ]; then \
		echo "SKIP launch: a .desktop entry is started on Linux alone, so none is started here"; \
	elif command -v gio >/dev/null 2>&1; then \
		gio launch "$$PWD/$(KSMD_PROBE_ENTRY)" "$$d/a b.ksmd" || exit 1; \
		n=0; while [ ! -s "$$d/given" ] && [ $$n -lt 100 ]; do sleep 0.1; n=$$((n + 1)); done; \
		printf '%s\n' "$$d/probe" "$$d/a b.ksmd" | cmp -s - "$$d/given" || \
			{ echo "RESULT: SOME FAILED (1) -> the entry's Exec did not start $$d/probe with the file: $$(cat "$$d/given" 2>/dev/null)"; exit 1; }; \
	elif [ "$(KSMD_REQUIRE_DESKTOP)" = 1 ]; then \
		echo "RESULT: SOME FAILED (1) -> gio is not installed, where it is required (Debian/Ubuntu: install libglib2.0-bin)"; exit 1; \
	else echo "SKIP launch: gio is not installed, so no entry is started"; fi
	$(call mime_entry,$(KSMD_MIME),$(KSMD_MIME_TYPE),ksmd document,text/plain,*.ksmd)
	$(call desktop_check,$(KSMD_DESKTOP),$(KSMD_MIME),$(KSMD_ICON),$(KSMD_MIME_TYPE),ksmd,$(KSMD_REQUIRE_DESKTOP))

## Run|ksmd|Build the page, the server and the launcher, and make a `.ksmd` open on a double-click
ksmd: ksmd-web $(KSSRV_EXE) $(KSMD_EXE) test-ksmd-desktop
	@echo "# built -> $(KSMD_DESKTOP)"
	@echo "# built -> $(KSMD_MIME)"
	@echo "# $(KSMD_ASSOC_LEAD)"
	@printf '#   %s\n' $(KSMD_ASSOC_STEPS)
	@echo "# then double-click $(KSMD_SAMPLE) to check it"
	@echo "# (the other platforms, and what to do if nothing opens: the ksmd section of docs/HOWTO-set-up-a-project.md)"

# ==========================================
# Tying the document types for the user (`make install-desktop`, Linux)
# ==========================================
# **It stands here, not in `mk/install.mk`**, as it needs ksmd's files. The places are
# `DESKTOP_DATA` (`mk/install.mk`): the user's data folder, or
# `$(PREFIX)/share` for a named PREFIX. **Nothing else is written**, but for `xdg-mime default`,
# which records the user's choice in their `mimeapps.list`. A named PREFIX sets no default.
ifeq ($(PLATFORM),linux)
## Build-and-install|install-desktop|Make `.ksmd` files open on a double-click, with their icon (Linux; `make install` does it too)
install-desktop: export ABS_HELP := $(install_abs_help)
install-desktop: ksmd-web $(KSSRV_EXE) $(KSMD_EXE) test-ksmd-desktop
	@echo "# TYING .ksmd TO ITS LAUNCHER under $(DESKTOP_DATA)"
	@case '$(DESKTOP_DATA)' in /*) ;; *) printf '%s\n' "$$ABS_HELP"; exit 1;; esac
	$(call desktop_install,$(DESKTOP_DATA),$(KSMD_DESKTOP),$(KSMD_MIME),$(KSMD_ICON),$(KSMD_MIME_TYPE))
	$(call desktop_refresh,$(DESKTOP_DATA))
	@if [ -z "$(DESKTOP_FOR_USER)" ]; then \
		echo "# note: PREFIX is named, so no default program is set; each user sets their own:"; \
		echo "#   xdg-mime default $(notdir $(KSMD_DESKTOP)) $(KSMD_MIME_TYPE)"; \
	elif command -v xdg-mime >/dev/null 2>&1; then \
		xdg-mime default $(notdir $(KSMD_DESKTOP)) $(KSMD_MIME_TYPE) && \
		echo "# set -> $(notdir $(KSMD_DESKTOP)) opens $(KSMD_MIME_TYPE)"; \
	else echo "# note: xdg-mime (xdg-utils) is not installed, so no default program is set; the file manager's \"Open with\" offers them"; fi
	@echo "# then double-click $(KSMD_SAMPLE) to check it; a file manager can show the icon only after you log in again"
else
install-desktop:
	@echo "make ties file types only on Linux. Here, tie .ksmd by hand: the ksmd section of docs/HOWTO-set-up-a-project.md says how."
	@exit 1
endif

.PHONY: ksmd ksmd-web ksmd-open test-ksmd-browser measure-ksmd test-ksmd-open test-ksmd-desktop \
	install-desktop
