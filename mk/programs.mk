# ==================================================================
# mk/programs.mk — the programs built from KSPL: the AI examples, kssrv, ksagent and Kanso OS
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# **Before `mk/ksmd.mk` and `mk/ksagent.mk`**: they build with `kspl_build` and want `KSSRV_EXE`.
# ==================================================================

# $(call kspl_build,<source>,<out name>,<KSPL flags>,<link flags>[,<exe>]): C at -O3; libraries by
# `#link`. The executable is `$(OUT_DIR)/<out name>.exe` unless <exe> names another.
define kspl_build
	@mkdir -p $(GEN_DIR) $(dir $(or $(5),$(OUT_DIR)/$(2).exe))
	./$(STAGE1_EXE) $(KSPL_FLAGS) $(3) --emit-libs=$(GEN_DIR)/$(2).libs $(1) $(GEN_DIR)/$(2).c
	$(CC) $(CFLAGS) -O3 $(GEN_DIR)/$(2).c @$(GEN_DIR)/$(2).libs $(4) $(LDLIBS) \
	  -o $(or $(5),$(OUT_DIR)/$(2).exe)
endef

# $(call kspl_dep_rules,<target>,<stem>): turns `<stem>.deps`, what ksplc read (`--emit-deps`),
# into make's rules in `<stem>.d`, for an `-include`. An empty rule for each source lets one be
# removed. **Two kinds of line are left out.** A whole path's drive colon would break the rule;
# only std's is whole, and the stage1 compiler stands for std (`KSPL_SRCS`). A `ksplc.cfg` looked
# for and not found (its hash is dashes) would rebuild the target on every run.
kspl_dep_rules = awk '$$1 !~ /^-/ && $$2 !~ /^(\/|[A-Za-z]:)/ \
  { print "$(1): " $$2; print $$2 ":" }' $(2).deps > $(2).d
# $(call kspl_unrecorded,<stem>): `FORCE` where `<stem>.d` is missing. **A target with no record
# of its sources is built**, so one left from before the record existed is not taken as current.
kspl_unrecorded = $(if $(wildcard $(1).d),,FORCE)
FORCE:

# --- The AI engine (lib/ksai/examples/llama_engine) ---
## Run|run|Build the AI engine (`lib/ksai/examples/llama_engine`) and run it
run: $(STAGE1_EXE)
	@echo "# RUNNING AI ENGINE (Release Build, BLAS=$(BLAS))"
	$(call kspl_build,lib/ksai/examples/llama_engine/main.kspl,llama_engine,$(AI_KSPL_FLAGS),$(AI_CFLAGS))
	./$(OUT_DIR)/llama_engine.exe

# --- The coding example: a KSPL-native model that completes KSPL, scored by the compiler ---
# The example, its pipeline and its model stand in `FIM_AI`. What it makes quickly (the corpus and
# the tokenizer) goes to `FIM_OUT`; the trained weights, slow to make again, go to `data/`.
FIM_AI := lib/ksai/examples/code_complete
FIM_OUT := $(OUT_DIR)/code_complete
FIM_WEIGHTS := data/code_complete.safetensors
# The compiler the pipeline asks: the one this build made, not one on PATH.
FIM_KSPLC := --ksplc=$(STAGE1_EXE)
## Run|fim-corpus|Make the material for teaching completion, from this repository's sources
fim-corpus: $(STAGE1_EXE)
	@echo "# BUILDING FIM TRAINING CORPUS ($(FIM_AI), KSPL native)"
	$(call kspl_build,$(FIM_AI)/build_corpus.kspl,build_corpus,)
	./$(OUT_DIR)/build_corpus.exe $(FIM_KSPLC)
	$(call kspl_build,$(FIM_AI)/make_fim.kspl,make_fim,)
	./$(OUT_DIR)/make_fim.exe

# **Four sequences a step**, on every CPU (`code_complete --threads`): on four CPUs it reaches a
# lower held-out loss than one sequence a step for three times the steps, in less time. The weights
# come out the same on any number of CPUs.
FIM_STEPS ?= 10000
FIM_BATCH ?= 4
# `sgd` or `adam`; empty, code_complete's own default (Adam) holds, so it is settled in one place.
FIM_OPTIMIZER ?=
# **One BLAS thread** (under `BLAS=1`): its matrices are a few hundred rows, where the threads cost
# more than they share out; the cores go to the batch's sequences instead. Without BLAS it is not
# read.
FIM_ENV := OPENBLAS_NUM_THREADS=1
## Run|fim-model|Train the coding example's model on the FIM corpus (`FIM_STEPS=`, `FIM_BATCH=`, `FIM_OPTIMIZER=`, `BLAS=1`)
fim-model: fim-corpus
	$(call kspl_build,$(FIM_AI)/train_bpe.kspl,train_bpe,)
	./$(OUT_DIR)/train_bpe.exe --vocab=2000
	$(call kspl_build,$(FIM_AI)/main.kspl,code_complete,$(AI_KSPL_FLAGS),$(AI_CFLAGS))
	@mkdir -p $(dir $(FIM_WEIGHTS))
	$(FIM_ENV) ./$(OUT_DIR)/code_complete.exe train --corpus=$(FIM_OUT)/corpus/fim_train.jsonl \
		--vocab=$(FIM_OUT)/tokenizer/vocab.txt --merges=$(FIM_OUT)/tokenizer/merges.txt \
		--out=$(FIM_WEIGHTS) --steps=$(FIM_STEPS) --batch=$(FIM_BATCH) \
		$(if $(FIM_OPTIMIZER),--optimizer=$(FIM_OPTIMIZER))

## Run|fim-eval|Score the coding example's model: its held-out loss, then the rate at which ksplc accepts its completions
fim-eval: $(STAGE1_EXE)
	$(call kspl_build,$(FIM_AI)/eval_fim.kspl,eval_fim,)
	$(FIM_ENV) ./$(OUT_DIR)/code_complete.exe loss --corpus=$(FIM_OUT)/corpus/fim_val.jsonl \
		--vocab=$(FIM_OUT)/tokenizer/vocab.txt --merges=$(FIM_OUT)/tokenizer/merges.txt \
		--weights=$(FIM_WEIGHTS)
	$(FIM_ENV) ./$(OUT_DIR)/eval_fim.exe --model=native --weights=$(FIM_WEIGHTS) $(FIM_KSPLC)

# --- The chat server for a Qwen model (lib/ksai/examples/chat_server) --- Build only.
# **A file with the sources and the switches it was built from.** So `make chat-server` builds it
# again after a source changed, and `make chat-server NATIVE=1` builds it again after a build
# without. `make chat` does not build it: its launcher names this target where it is missing.
CHAT_SERVER_EXE := $(OUT_DIR)/chat_server.exe
CHAT_SERVER_SWITCHES := $(GEN_DIR)/chat_server.switches
## Run|chat-server|Build the chat server a client with tools asks (`lib/ksai/examples/chat_server`; `NATIVE=1` for this machine's CPU)
chat-server: $(CHAT_SERVER_EXE)
$(CHAT_SERVER_EXE): $(STAGE1_EXE) $(CHAT_SERVER_SWITCHES) $(call kspl_unrecorded,$(GEN_DIR)/chat_server)
	@echo "# BUILDING THE CHAT SERVER (BLAS=$(BLAS) NATIVE=$(NATIVE))"
	$(call kspl_build,lib/ksai/examples/chat_server/main.kspl,chat_server,$(AI_KSPL_FLAGS) \
	  --emit-deps=$(GEN_DIR)/chat_server.deps,$(AI_CFLAGS))
	$(call kspl_dep_rules,$@,$(GEN_DIR)/chat_server)
	@echo "# built -> $(CHAT_SERVER_EXE)"
-include $(GEN_DIR)/chat_server.d
# The switches that change the build, written down. **The file is written only when they change**,
# so a run with the same switches leaves it older than the server and builds nothing.
$(CHAT_SERVER_SWITCHES): FORCE
	@mkdir -p $(GEN_DIR)
	@s='BLAS=$(BLAS) NATIVE=$(NATIVE)'; \
	if [ "$$(cat $@ 2>/dev/null)" != "$$s" ]; then printf '%s\n' "$$s" > $@; fi

# --- Servers the launchers left running (ksmd's and the chat page's) --- **On Windows a running
# program's file can be neither replaced nor removed**, so a build or a clean would stop with
# "Permission denied". Each launcher stops its own first; an open ksmd page keeps its edits as a
# draft, and a chat page's questions are already in their file.
ifeq ($(PLATFORM),win32)
stop_ksmd_servers = @for o in "$(KSMD_EXE)" "$(KSAGENT_CHAT_EXE)"; do \
    if [ -x "$$o" ]; then "./$$o" --stop-all || true; fi; done
else
stop_ksmd_servers =
endif

# --- The static file server (kssrv/) --- Build only (it stays resident, so make does not run it).
# **A file with the sources it was built from**, so the ksmd gates that each want it build it once.
KSSRV_EXE := $(OUT_DIR)/kssrv.exe
## Run|kssrv|Build the HTTP server that serves static files
kssrv: $(KSSRV_EXE)
$(KSSRV_EXE): $(STAGE1_EXE) $(call kspl_unrecorded,$(GEN_DIR)/kssrv)
	$(stop_ksmd_servers)
	@echo "# BUILDING KSSRV (static file HTTP server)"
	$(call kspl_build,kssrv/main.kspl,kssrv,--emit-deps=$(GEN_DIR)/kssrv.deps)
	$(call kspl_dep_rules,$@,$(GEN_DIR)/kssrv)
	@echo "# built -> $(KSSRV_EXE) (try: ./$(KSSRV_EXE) 8080 .)"
-include $(GEN_DIR)/kssrv.d

# Whether the libraries kssrv links are installed: OpenSSL's libssl and libcrypto, for HTTPS.
# `make install` asks it before it ties `.ksmd` to its launcher, which starts kssrv. **The libraries
# are asked of ksplc** (`--emit-libs`, from the sources' `#link`), and an empty program is linked
# against them, as `lib/kstls/Makefile`'s `test` does. So a fault in kssrv's own code is not reported
# as a missing library.
KSSRV_PROBE := $(GEN_DIR)/kssrv_probe
## Build-and-install|kssrv-libs|Say whether the libraries kssrv links (OpenSSL's) are installed here
kssrv-libs: $(STAGE1_EXE)
	@mkdir -p $(GEN_DIR)
	@./$(STAGE1_EXE) $(KSPL_FLAGS) --emit-libs=$(KSSRV_PROBE).libs kssrv/main.kspl $(KSSRV_PROBE).c
	@printf 'int main(void) { return 0; }\n' > $(KSSRV_PROBE)_main.c
	@$(CC) $(KSSRV_PROBE)_main.c @$(KSSRV_PROBE).libs -o $(KSSRV_PROBE).exe \
	  2> $(KSSRV_PROBE).log || { \
	  echo "kssrv links $$(cat $(KSSRV_PROBE).libs), which do not link here ($(KSSRV_PROBE).log says why)."; \
	  echo "Debian/Ubuntu: install libssl-dev"; \
	  exit 1; }

# --- The folder's question answerer (ksagent/) --- Build only (it needs a model server to answer).
KSAGENT_EXE := $(OUT_DIR)/ksagent.exe
## Run|ksagent|Build the program that answers questions about a folder's files through a local model
ksagent: $(KSAGENT_EXE)
$(KSAGENT_EXE): $(STAGE1_EXE) $(call kspl_unrecorded,$(GEN_DIR)/ksagent)
	@echo "# BUILDING KSAGENT (answers questions about a folder's files)"
	$(call kspl_build,ksagent/main.kspl,ksagent,--emit-deps=$(GEN_DIR)/ksagent.deps)
	$(call kspl_dep_rules,$@,$(GEN_DIR)/ksagent)
	@echo "# built -> $(KSAGENT_EXE) (try: ./$(KSAGENT_EXE) ask docs \"What is KSPL?\")"
-include $(GEN_DIR)/ksagent.d

# --- Kanso OS (RTOS): `lib/ksos/Makefile`'s own targets, called here by the same names ---
# That file stands alone (a copy of the folder is tested by it), so what the root adds is only
# where things go and which ksplc builds them.
# Caution: **Relative paths only**: the repository's place may hold what Windows's linker garbles.
ksos_make = $(call pkg_make,ksos) OUT=../../$(OUT_DIR) TEST_JOBS=$(TEST_JOBS)

## Run|ksos|Run Kanso OS on a POSIX host
## Run|ksos-cm|Build for Cortex-M
## Run|ksos-rp2040|Build for the real RP2040 chip (as far as the `.uf2`)
## Gates|test-ksos-link|Whether the bare-metal link gets through (needs the `arm-none-eabi` toolchain)
## Gates|test-ksos-ramtext|Whether a window function with a tight deadline sits in RAM
## Gates|test-ksos-qemu|Run them under QEMU (`qemu-system-arm` is needed)
## Gates|test-ksos-posix|Run the demos on the POSIX host's port
ksos ksos-cm ksos-rp2040 test-ksos-link test-ksos-ramtext test-ksos-qemu test-ksos-posix: $(STAGE1_EXE)
	@$(ksos_make) $@
.PHONY: ksos ksos-cm ksos-rp2040 test-ksos-link test-ksos-ramtext test-ksos-qemu test-ksos-posix

## Run|ksos-*|One POSIX host demo (the listing is in `lib/ksos/README.md`, the accounts in `lib/ksos/docs/DESIGN-rtos.md`)
## Run|ksos-cm-*|One Cortex-M demo (the listing is in `lib/ksos/README.md`, the accounts in `lib/ksos/docs/DESIGN-rtos.md`)
## Run|ksos-cm0-*|One Cortex-M demo on the Cortex-M0, under QEMU's micro:bit (listed in `lib/ksos/README.md`)
## Run|ksos-nrf51-*|One nRF51 demo, under QEMU's micro:bit (listed in `lib/ksos/README.md`)
## Run|ksos-rp2040-*|One RP2040 demo (the listing is in `lib/ksos/README.md`, the accounts in `lib/ksos/docs/DESIGN-rtos.md`)
## Per-item|ksos-linkcheck-*|One target's worth of `test-ksos-link`
## Per-item|ksos-qemugate-*|One target's worth of `test-ksos-qemu`
## Per-item|ksos-posixgate-*|One target's worth of `test-ksos-posix`
ksos-%: $(STAGE1_EXE)
	@$(ksos_make) $@

.PHONY: run fim-corpus fim-model fim-eval chat-server kssrv kssrv-libs ksagent
