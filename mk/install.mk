# ==================================================================
# mk/install.mk — installing (install / install-lsp)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# ==================================================================
## Build-and-install|install-lsp|Put the language server where the VS Code extension keeps it
install-lsp: $(EXT_BIN_DIR)/$(PLATFORM)/$(LSP_EXE)

$(EXT_BIN_DIR)/$(PLATFORM)/$(LSP_EXE): $(SHIP_EXE)
	@echo "# INSTALLING LSP SERVER FOR $(PLATFORM)..."
	@mkdir -p $(EXT_BIN_DIR)/$(PLATFORM)
	@cmp -s $< $@ || (cp $< $@ && echo "LSP Server installed to $@")

# --- Putting ksplc on PATH (make install) ---
# Caution: **Place `$(SHIP_EXE)`**: not the seed (bootstrap only) nor `-O0` `$(STAGE2_EXE)`.
PREFIX ?= $(HOME)/.local

# Where `make install-desktop` puts the document types for the desktop (Linux). **Without a named
# PREFIX it is the user's data folder**, where the desktop looks; a named one gets `$(PREFIX)/share`.
# A relative `XDG_DATA_HOME` is ignored, as the XDG rules say. Decided before the separator is
# brought over below, which would hide where PREFIX came from.
ifeq ($(origin PREFIX),file)
    DESKTOP_DATA := $(if $(filter /%,$(XDG_DATA_HOME)),$(XDG_DATA_HOME),$(HOME)/.local/share)
    DESKTOP_FOR_USER := 1
else
    DESKTOP_DATA := $(PREFIX)/share
    DESKTOP_FOR_USER :=
endif

# **Bring the separator over to `/` first**: MSYS2's bash eats `\m` in `C:\msys64\home\<user>`,
# making a folder **in the repository** while `mkdir`/`cp` succeed; `override` beats `PREFIX=`.
ifneq (,$(findstring \,$(PREFIX)))
    override PREFIX := $(or $(shell cygpath -u '$(PREFIX)' 2>/dev/null),$(subst \,/,$(PREFIX)))
endif

ifeq ($(PLATFORM),win32)
    INSTALL_NAME := ksplc.exe
else
    INSTALL_NAME := ksplc
endif

define install_abs_help
PREFIX is not an absolute path.
  Placed as it stands it goes inside the repository. Hand it over as an absolute path
  (for example: make install PREFIX=$$HOME/.local)
endef

define install_path_help
#
#   ksplc cannot be found through env. Starting it directly with a shebang
#      (#!/usr/bin/env -S ksplc run) is not available. Add this one line to your shell's
#      configuration (~/.bashrc for bash, ~/.zshrc for zsh; ~/.bash_profile is read only by
#      a login shell, so it has no effect in VS Code's integrated terminal):
#
#      export PATH="$(PREFIX)/bin:$$PATH"
#
#      Caution: Do not use '~' inside double quotes. '~' is not expanded and goes onto PATH as a
#         character. bash expands it itself, so it does work from the prompt and only env
#         fails, which makes the cause hard to see. Write an absolute path as above, or
#         $$HOME ($$HOME is expanded inside double quotes as well).
endef

define install_other_help
#      A shebang (#!/usr/bin/env -S ksplc run) starts that one, not the one installed here, and
#      so does typing `ksplc`. Put this folder first on PATH, in your shell's configuration
#      (~/.bashrc for bash, ~/.zshrc for zsh), or remove the other one:
#
#      export PATH="$(PREFIX)/bin:$$PATH"
#
#      A shell already open may remember the other one's place: `hash -r` makes it look again.
endef

define install_std_dir_help
#
#   KSPLC_STD_DIR is set, so ksplc reads the std/ it names, not the one installed here.
#      Keep it to work on that std/ (the repository's, say); remove the line setting it from your
#      shell's configuration to use the installed copy. `ksplc info std-dir` names the one taken.
endef

define install_ok_help
#   ✅ the ksplc first on PATH is the one installed here, so a shebang starts it
endef

# Stage both copies before moving either installed path. Keep the old pair until both moves
# succeed. These are separate paths, not an atomic pair; do not compile during installation.
# A failed rollback keeps its backup folders and prints them rather than deleting the old files.
define install_compiler_and_std
set -eu; \
mkdir -p "$(PREFIX)/bin" "$(PREFIX)/lib/kspl"; \
lock="$(PREFIX)/lib/kspl/.install-lock"; \
mkdir "$$lock" || { echo "Another install or an interrupted install holds $$lock" >&2; exit 1; }; \
bin_stage=; std_stage=; committed=0; \
finish() { \
    result=$$?; trap - 0 HUP INT TERM; failed=0; \
    if [ "$$committed" = 0 ]; then \
        for pair in bin std; do \
            if [ "$$pair" = bin ]; then stage="$$bin_stage"; suffix="$(suffix $(INSTALL_NAME))"; dest="$(PREFIX)/bin/$(INSTALL_NAME)"; \
            else stage="$$std_stage"; suffix=; dest="$(PREFIX)/lib/kspl/std"; fi; \
            [ -n "$$stage" ] || continue; \
            if [ -e "$$stage/old$$suffix" ] || [ -L "$$stage/old$$suffix" ]; then \
                rm -rf "$$dest" && mv "$$stage/old$$suffix" "$$dest" || failed=1; \
            elif [ -f "$$stage/absent" ] && [ ! -e "$$stage/new$$suffix" ]; then \
                rm -rf "$$dest" || failed=1; \
            fi; \
        done; \
    fi; \
    if [ "$$failed" = 0 ]; then \
        [ -z "$$bin_stage" ] || rm -rf "$$bin_stage"; \
        [ -z "$$std_stage" ] || rm -rf "$$std_stage"; \
        rmdir "$$lock"; \
    else \
        echo "Install rollback failed. Keep and recover backups: $$bin_stage $$std_stage" >&2; \
        result=1; \
    fi; \
    exit "$$result"; \
}; \
trap finish 0; trap 'exit 1' HUP INT TERM; \
bin_stage=$$(mktemp -d "$(PREFIX)/bin/.kspl-install.XXXXXX"); \
std_stage=$$(mktemp -d "$(PREFIX)/lib/kspl/.kspl-install.XXXXXX"); \
cp "$(SHIP_EXE)" "$$bin_stage/new$(suffix $(INSTALL_NAME))"; chmod +x "$$bin_stage/new$(suffix $(INSTALL_NAME))"; \
cp -R std "$$std_stage/new"; \
for pair in bin std; do \
    if [ "$$pair" = bin ]; then stage="$$bin_stage"; suffix="$(suffix $(INSTALL_NAME))"; dest="$(PREFIX)/bin/$(INSTALL_NAME)"; \
    else stage="$$std_stage"; suffix=; dest="$(PREFIX)/lib/kspl/std"; fi; \
    if [ -e "$$dest" ] || [ -L "$$dest" ]; then mv "$$dest" "$$stage/old$$suffix"; \
    else touch "$$stage/absent"; fi; \
    mv "$$stage/new$$suffix" "$$dest"; \
done; \
committed=1
endef

install: export ABS_HELP := $(install_abs_help)
# **What it installs is checked first**: stage2 reproduces itself (`self-host`) and the optimized
# build emits stage2's notation to the byte (`self-host-ship`). It neither formats the tree nor
# re-bakes the seed: each rewrites files, and the seed is re-baked when the seed's rules call for
# it, by `make commit-seed` ("The bootstrap, and keeping the seed in step" in
# `ksplc/docs/DESIGN-compiler.md`).
## Build-and-install|install|Check that ksplc reproduces itself, then put it in as `ksplc` (the place is `PREFIX=`)
install: self-host self-host-ship install-lsp
	@echo "# INSTALLING ksplc FOR $(PLATFORM)..."
	@# Caution: **Do not proceed unless it is an absolute path.**
	@# A relative one succeeds, inside the repository,
	@# and shows only as PATH not working
	@case '$(PREFIX)' in /*|[A-Za-z]:/*) ;; *) printf '%s\n' "$$ABS_HELP"; exit 1;; esac
	@# **Always quote the place**: a Windows home can hold whitespace (`C:/Users/First Last`).
	@$(install_compiler_and_std)
	@echo "# installed -> $(PREFIX)/bin/$(INSTALL_NAME)"
	@echo "# installed -> $(PREFIX)/lib/kspl/std"
	$(install_desktop_step)
	@$(MAKE) --no-print-directory install-check

# **On Linux, `make install` then ties `.ksmd` to its launcher** (`install-desktop` in
# `mk/ksmd.mk`); elsewhere a person ties it by hand, as the HOWTO says. The page needs clang's
# wasm32 tools, and the launcher's kssrv needs OpenSSL; building ksplc needs neither. **Where one is
# missing it is a note**, so `ksplc` still installs with a C compiler and Make alone.
# `ksmd/Makefile`'s `web-tools` and the root's `kssrv-libs` each say what is missing.
ifeq ($(PLATFORM),linux)
define install_desktop_step
	@ok=1; \
	tools=$$($(MAKE) --no-print-directory -C ksmd web-tools 2>&1) || ok=0; \
	libs=$$($(MAKE) --no-print-directory kssrv-libs 2>&1) || ok=0; \
	if [ "$$ok" = 1 ]; then \
		$(MAKE) --no-print-directory install-desktop; \
	else \
		echo "# note: .ksmd is not tied to its launcher: what the launcher needs cannot be built here."; \
		printf '%s\n' "$$tools" "$$libs" | sed -e '/^make/d' -e '/^$$/d' -e 's/^/#   /'; \
		echo "#   Install what is named, then run: make install-desktop"; \
	fi
endef
endif

install-check: export OK_HELP := $(install_ok_help)
install-check: export OTHER_HELP := $(install_other_help)
install-check: export PATH_HELP := $(install_path_help)
install-check: export STD_DIR_HELP := $(install_std_dir_help)
# Caution: **Search PATH as env does, not as bash does.** A shebang starts ksplc through env's
# execvp, which takes each entry as written (`~` stays a character, an empty one is the current
# folder); bash expands `~`, so a check asking bash passes where the shebang falls. **Then compare
# files, not names** (`-ef`): an older ksplc earlier on PATH also answers to `ksplc`. Both names are
# tried, so MSYS2's `ksplc` reaching win32's `ksplc.exe` is checked too.
## Build-and-install|install-check|Say whether the `ksplc` a shebang starts is the one `make install` put in (`PREFIX=`)
install-check:
	@installed="$(PREFIX)/bin/$(INSTALL_NAME)"; found=""; set -f; IFS=:; \
	for d in $$PATH; do \
		for n in $(sort ksplc $(INSTALL_NAME)); do \
			p="$${d:-.}/$$n"; \
			if [ -z "$$found" ] && [ -f "$$p" ] && [ -x "$$p" ]; then found="$$p"; fi; \
		done; \
		if [ -n "$$found" ]; then break; fi; \
	done; \
	if [ -z "$$found" ]; then \
		printf '%s\n' "$$PATH_HELP"; \
	elif [ "$$found" -ef "$$installed" ]; then \
		printf '%s\n' "$$OK_HELP"; \
	else \
		printf '#\n#   ksplc first on PATH is another one: %s\n' "$$found"; \
		printf '%s\n' "$$OTHER_HELP"; \
	fi
	@if [ -n "$$KSPLC_STD_DIR" ]; then \
		printf '%s\n' "$$STD_DIR_HELP" "#      KSPLC_STD_DIR=$$KSPLC_STD_DIR"; \
	fi

# --- A file association for a double-click (`make ksmd`) ---
# What every opener is built from besides its own file, so a change to it builds the opener again.
OPENER_SRC := tools/opener.kspl tools/opener_aim.kspl

# $(call desktop_entry,<entry>,<name>,<opener>,<icon>,<MIME types>,<require>): writes the `.desktop`
# entry that opens one file with <opener>, and checks it with `desktop-file-validate`. Where that is
# missing it says SKIP, or fails when <require> is 1 (the gates pass 1: the image holds it).
# **Keep `Path=`**: a double-click stands in the home or `/`. **`%f`, not `%F`**: one file per run.
# **The absolute path comes from `$$PWD`**, as `$(CURDIR)` is unquoted and splits at a space.
define desktop_entry
	@mkdir -p "$(dir $(1))"; here="$$PWD"; printf '%s\n' \
		'[Desktop Entry]' 'Type=Application' 'Version=1.0' \
		'Name=$(2)' 'Comment=Open this file with $(2) in a browser' \
		"Exec=$$here/$(3) %f" \
		"Path=$$here" "Icon=$$here/$(4)" 'Terminal=false' 'NoDisplay=true' \
		'MimeType=$(5)' \
		> $(1)
	@if command -v desktop-file-validate >/dev/null 2>&1; then \
		desktop-file-validate $(1) || exit 1; \
	elif [ "$(6)" = 1 ]; then \
		echo "RESULT: SOME FAILED (1) -> desktop-file-validate is not installed, where it is required"; \
		exit 1; \
	else echo "SKIP entry: desktop-file-validate is not installed, so $(1) is not validated"; fi
endef

# $(call mime_entry,<file>,<MIME type>,<comment>,<parent type>,<glob>): writes the declaration that
# `xdg-mime install` reads. Linux ties a program to a MIME type, not to an extension, so an
# undeclared extension reads as `application/octet-stream`, which no program can be tied to alone.
define mime_entry
	@mkdir -p "$(dir $(1))"; printf '%s\n' \
		'<?xml version="1.0" encoding="UTF-8"?>' \
		'<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">' \
		'  <mime-type type="$(2)">' \
		'    <comment>$(3)</comment>' \
		'    <sub-class-of type="$(4)"/>' \
		'    <generic-icon name="x-office-document"/>' \
		'    <glob pattern="$(5)"/>' \
		'  </mime-type>' \
		'</mime-info>' \
		> $(1)
endef

# $(call desktop_install,<data folder>,<entry>,<MIME declaration>,<icon>,<MIME type>): puts one
# document type in under <data folder>, where the desktop reads them: the entry, the declaration,
# and the icon under the type's name with `-` for `/`, the name the icon theme looks for.
# **Only cp and mkdir**: no text is written here, so nothing in a quoted text can run.
define desktop_install
	@mkdir -p "$(1)/applications" "$(1)/mime/packages" "$(1)/icons/hicolor/scalable/mimetypes"
	@cp "$(2)" "$(1)/applications/$(notdir $(2))"
	@cp "$(3)" "$(1)/mime/packages/$(notdir $(3))"
	@cp "$(4)" "$(1)/icons/hicolor/scalable/mimetypes/$(subst /,-,$(5)).svg"
	@echo "# installed -> $(1)/applications/$(notdir $(2))"
	@echo "# installed -> $(1)/mime/packages/$(notdir $(3))"
	@echo "# installed -> $(1)/icons/hicolor/scalable/mimetypes/$(subst /,-,$(5)).svg"
endef

# $(call desktop_refresh,<data folder>): rebuilds the caches the desktop reads from <data folder>.
# **A missing tool is a note, not a failure**: the files are in place, and the next run of the
# tool, by the person or the system, reads them.
define desktop_refresh
	@if command -v update-mime-database >/dev/null 2>&1; then \
		update-mime-database "$(1)/mime"; \
	else echo "# note: update-mime-database (shared-mime-info) is not installed, so the types are not known yet"; fi
	@if command -v update-desktop-database >/dev/null 2>&1; then \
		update-desktop-database "$(1)/applications"; \
	else echo "# note: update-desktop-database (desktop-file-utils) is not installed, so the launchers are not offered yet"; fi
endef

# $(call desktop_check,<entry>,<MIME declaration>,<icon>,<MIME type>,<name>,<require>): the desktop
# gates' second half. It installs one type into a scratch data folder, as `make install-desktop`
# does, and checks each file and cache there. A missing cache tool says SKIP, or fails when
# <require> is 1. It ends with the gate's one verdict line.
DESKTOP_CHECK_DIR = $(TMP_DIR)/desktop_install
define desktop_check
	@rm -rf "$(DESKTOP_CHECK_DIR)/$(5)"
	$(call desktop_install,$(DESKTOP_CHECK_DIR)/$(5),$(1),$(2),$(3),$(4))
	$(call desktop_refresh,$(DESKTOP_CHECK_DIR)/$(5))
	@d="$(DESKTOP_CHECK_DIR)/$(5)"; \
	for pair in "$(1)|applications/$(notdir $(1))" "$(2)|mime/packages/$(notdir $(2))" \
		"$(3)|icons/hicolor/scalable/mimetypes/$(subst /,-,$(4)).svg"; do \
		cmp -s "$${pair%%|*}" "$$d/$${pair#*|}" || \
			{ echo "RESULT: SOME FAILED (1) -> $$d/$${pair#*|} is not $${pair%%|*}"; exit 1; }; \
	done; \
	if command -v update-mime-database >/dev/null 2>&1; then \
		test -f "$$d/mime/$(4).xml" || \
			{ echo "RESULT: SOME FAILED (1) -> the MIME database in $$d lacks $(4)"; exit 1; }; \
	elif [ "$(6)" = 1 ]; then \
		echo "RESULT: SOME FAILED (1) -> update-mime-database is not installed, where it is required"; exit 1; \
	else echo "SKIP install: update-mime-database is not installed, so the MIME database is not checked"; fi; \
	if command -v update-desktop-database >/dev/null 2>&1; then \
		grep -q "^$(4)=.*$(notdir $(1))" "$$d/applications/mimeinfo.cache" || \
			{ echo "RESULT: SOME FAILED (1) -> $$d/applications/mimeinfo.cache does not tie $(4) to $(notdir $(1))"; exit 1; }; \
	elif [ "$(6)" = 1 ]; then \
		echo "RESULT: SOME FAILED (1) -> update-desktop-database is not installed, where it is required"; exit 1; \
	else echo "SKIP install: update-desktop-database is not installed, so its cache is not checked"; fi; \
	echo "RESULT: ALL PASS ($(notdir $(1)), its MIME declaration and its icon install into a scratch data folder)"
endef
