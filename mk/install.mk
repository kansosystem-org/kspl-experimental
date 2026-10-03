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

define install_std_dir_help
#
#   KSPLC_STD_DIR is set, so ksplc reads the std/ it names, not the one installed here.
#      Keep it to work on that std/ (the repository's, say); remove the line setting it from your
#      shell's configuration to use the installed copy. `ksplc info std-dir` names the one taken.
endef

define install_ok_help
#   ✅ ksplc can be found through env (starting directly with a shebang is available)
endef

install: export ABS_HELP := $(install_abs_help)
install: export OK_HELP := $(install_ok_help)
install: export PATH_HELP := $(install_path_help)
install: export STD_DIR_HELP := $(install_std_dir_help)
## Build-and-install|install|Format and re-bake the seed, then put stage2 in as `ksplc` (the place is `PREFIX=`)
install: fmt commit-seed $(SHIP_EXE) install-lsp
	@echo "# INSTALLING ksplc FOR $(PLATFORM)..."
	@# Caution: **Do not proceed unless it is an absolute path.**
	@# A relative one succeeds, inside the repository,
	@# and shows only as PATH not working
	@case '$(PREFIX)' in /*|[A-Za-z]:/*) ;; *) printf '%s\n' "$$ABS_HELP"; exit 1;; esac
	@# **Always quote the place**: a Windows home can hold whitespace (`C:/Users/First Last`).
	@mkdir -p "$(PREFIX)/bin"
	@cp $(SHIP_EXE) "$(PREFIX)/bin/$(INSTALL_NAME)"
	@chmod +x "$(PREFIX)/bin/$(INSTALL_NAME)"
	@echo "# installed -> $(PREFIX)/bin/$(INSTALL_NAME)"
	@# std goes where ksplc looks from its own place
	@# ("Locating the standard library" in ksplc/docs/SPEC-tools.md).
	@# **Replace it whole**: copied over, a file deleted from std/ stays and is still imported.
	@mkdir -p "$(PREFIX)/lib/kspl"
	@rm -rf "$(PREFIX)/lib/kspl/std"
	@cp -R std "$(PREFIX)/lib/kspl/std"
	@echo "# installed -> $(PREFIX)/lib/kspl/std"
	@# Caution: **Matching PATH as a string is not enough.**
	@# A shebang uses env's execvp, which does **not** expand `~` in PATH;
	@# bash does, so `export PATH="~/.local/bin:$$PATH"`
	@# runs ksplc from the prompt while the shebang falls.
	@# So the check asks env itself,
	@# the very route a shebang treads.
	@# It asks for `ksplc`, not $(INSTALL_NAME),
	@# so MSYS2's execvp resolving win32's `ksplc.exe`
	@# is checked too.
	@if env ksplc info std-dir >/dev/null 2>&1; then \
		printf '%s\n' "$$OK_HELP"; \
	else \
		printf '%s\n' "$$PATH_HELP"; \
	fi
	@if [ -n "$$KSPLC_STD_DIR" ]; then \
		printf '%s\n' "$$STD_DIR_HELP" "#      KSPLC_STD_DIR=$$KSPLC_STD_DIR"; \
	fi
