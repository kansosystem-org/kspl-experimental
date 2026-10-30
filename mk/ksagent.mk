# ==========================================
# mk/ksagent.mk — asking about a folder: the model server, the chat page, and its browser check
# Taken in by the root Makefile after mk/ksmd.mk, whose browser lookup the check shares.
# ==========================================

# **The page is copied beside the server**, where the opener looks (`KSAGENT` in
# `tools/opener_aim.kspl`): one file, which `kssrv --page` serves as it is.
KSAGENT_PAGE := $(OUT_DIR)/ksagent/chat.html
KSAGENT_CHAT_EXE := $(OUT_DIR)/ksagent_chat.exe

$(KSAGENT_PAGE): ksagent/page/chat.html
	@mkdir -p "$(dir $@)"
	cp ksagent/page/chat.html "$@"

$(KSAGENT_CHAT_EXE): $(STAGE1_EXE) tools/ksagent_chat.kspl tools/model_server.kspl $(OPENER_SRC)
	@echo "# BUILDING the launcher that asks about a folder (out/ksagent_chat.exe)"
	$(call kspl_build,tools/ksagent_chat.kspl,ksagent_chat,,)

# **These run targets build their programs, then run the launcher with every option written out**
# ("A run target writes every option out" in `docs/DESIGN-repository.md`). An empty value is a
# setting not given. The launcher makes every choice, such as the model server to start, and
# `./out/ksagent_chat.exe --help` names each default.
## Run|chat|Ask about the files in `DIR=<folder>`: start the model server where none answers, open the chat page, and answer it until Ctrl+C (`MODEL=<file>`, `PORT=<n>`)
chat: $(KSAGENT_EXE) $(KSSRV_EXE) $(KSAGENT_PAGE) $(KSAGENT_CHAT_EXE)
	./$(KSAGENT_CHAT_EXE) --dir=$(call shq,$(DIR)) --model-file=$(call shq,$(MODEL)) --port=$(call shq,$(PORT))

## Run|model-server|Start the model server alone, where `ksagent ask` and `eval` ask, until Ctrl+C; `make chat` needs none (`MODEL=<file>`, `PORT=<n>`)
model-server: $(KSSRV_EXE) $(KSAGENT_CHAT_EXE)
	./$(KSAGENT_CHAT_EXE) --model-only --model-file=$(call shq,$(MODEL)) --port=$(call shq,$(PORT))

# **The launcher's model server first, with no browser** (`tools/tests/chat_launch.mjs`): a stand-in
# takes llama-server's and chat_server's place. **Then the whole path a question takes**: the page
# in a headless Chromium, the launcher with `--show`, kssrv, `ksagent watch` and a stand-in model
# server (`tools/tests/chat_page.mjs`). The browser is the one ksmd's checks take; with none,
# `KSMD_REQUIRE_BROWSER` decides between a failure and a SKIP of the second half.
KSAGENT_CHAT_WORK := $(TMP_DIR)/ksagent_chat_test

## Gates|test-ksagent-chat|Start, reuse and stop the launcher's model server; then ask on ksagent's chat page in a headless Chromium: an answer growing, checked, stopped, Markdown shown safely, and Japanese
test-ksagent-chat: $(KSAGENT_EXE) $(KSSRV_EXE) $(KSAGENT_PAGE) $(KSAGENT_CHAT_EXE)
	@rm -rf "$(KSAGENT_CHAT_WORK)"; \
	node tools/tests/chat_launch.mjs "$(KSAGENT_CHAT_EXE)" "$(KSAGENT_CHAT_WORK)/launch" || exit 1; \
	b="$$($(MAKE) -s --no-print-directory -C ksmd browser-path)"; \
	if [ -z "$$b" ]; then \
	  if [ "$(KSMD_REQUIRE_BROWSER)" = 1 ]; then \
	    echo "RESULT: SOME FAILED (1) -> no browser found, and KSMD_REQUIRE_BROWSER=1 requires one." \
	      "On a machine without one, KSMD_REQUIRE_BROWSER=0 makes this a SKIP;" \
	      "such a round is not CI's verdict"; \
	    exit 1; fi; \
	  echo "RESULT: SKIPPED (no browser - see docs/SPEC-gates.md)"; exit 0; fi; \
	node tools/tests/chat_page.mjs "$$b" "$(KSAGENT_CHAT_EXE)" "$(KSAGENT_CHAT_WORK)/page"

.PHONY: chat model-server test-ksagent-chat
