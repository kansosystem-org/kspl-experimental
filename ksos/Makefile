# ==========================================
# ksos -- Kanso OS (RTOS), the portable core plus the whole port layer, built and tested on its own
# `make test` wants nothing of a repository around it: a `ksplc` and the `std` it carries, and the
# `ksai` and `ksdb` it uses. The demos and the gates on them want more, named above each.
#   make test [KSPLC=/path/to/ksplc]                             # ksos's tests, from this folder
#   make ksos / ksos-<demo> / ksos-cm-<demo> / ksos-rp2040-<demo>  # one demo (README.md lists them)
#   make test-ksos-posix / test-ksos-qemu / test-ksos-link        # the gates, each over every demo
# `std` comes from the ksplc or `KSPLC_STD_DIR`; the packages it uses, from `KSPLC_PKG_SRC_DIR`.
# Caution: **Keep this file standing alone**: a copy of the folder, nothing more, is tested by it.
# **Keep a recipe to ASCII**: MSYS2's shell rereads it outside UTF-8; wording goes in an `export`.

# --- How the demos are listed (the same for the three families POSIX / QEMU / UF2) ---
# **One demo = one word in the run, plus its paired variables**: the goal, the gate's coverage and
# the `.PHONY` grow from the run, and a pair left out stops make at start-up (the `$(error)`s).
# **Do not copy the way of building outside the `define`** (`posix_link` / `cm_link` / `cm0_link`).

# --- What this file is handed, and what it settles for itself ---
# The gates' `set -o pipefail` wants bash (dash lacks it), and make takes no shell from its caller.
SHELL := bash

KSPLC ?= ksplc
# Where everything built goes: a demo lands at `$(OUT)/ksos_<port>/`, the path the documents name.
OUT ?= out
# The C compiler for the POSIX demos and for ksplc's link words: `CC` where set, clang otherwise.
ifeq ($(origin CC),default)
CC := clang
endif
export CC
KSOS_CFLAGS := -std=c99 -Wall -g -O0
# What tidies a demo's generated C: nothing (`:`) unless a caller hands a formatter in.
C_FMT ?= :
# The compiler as a path: the tests have it run a tool of this package, never looking at PATH.
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# How many demos a gate turns at once.
TEST_JOBS ?= $(shell (nproc || sysctl -n hw.ncpu || echo 4) 2>/dev/null)
KSOS_LOG_DIR := $(OUT)/log/ksos

# One blank line: the separator when `$(foreach)` lists a recipe of several lines.
define nl


endef

LLVM_VER := $(shell clang --version | sed -n 's/.*version \([0-9]*\).*/\1/p' | head -1)
LLD      := $(shell command -v ld.lld      || command -v ld.lld-$(LLVM_VER)      || echo ld.lld)
OBJDUMP  := $(shell command -v llvm-objdump || command -v llvm-objdump-$(LLVM_VER) || echo llvm-objdump)
OBJCOPY  := $(shell command -v llvm-objcopy || command -v llvm-objcopy-$(LLVM_VER) || echo llvm-objcopy)
NM       := $(shell command -v llvm-nm      || command -v llvm-nm-$(LLVM_VER)      || echo llvm-nm)

# Caution: **Always state the ELF emulation** (`-m armelf`): without it MSYS2's lld is the COFF
# driver and refuses `-T` with `unknown argument`; `-flavor gnu` does not fix it.
LLD_LINK := $(LLD) -m armelf

# --- The tests (`make test`) ---
# ksos's tests; the workshop carries ksos's name, so a shared `OUT` holds it beside the others.
test:
	rm -rf "$(OUT)/ksos_test"
	"$(KSPLC)" run tests/main.kspls "$(KSPLC_EXE)" "$(OUT)/ksos_test"

.PHONY: test

# --- The toolchain for Cortex-M (cross compiling for an ARM Cortex-M3) ---
# One section per symbol, so --gc-sections drops the uncalled libc references that `ksai` carries.
CM_CC := clang --target=thumbv7m-none-eabi -mcpu=cortex-m3 -ffreestanding -Wall -Os \
    -ffunction-sections -fdata-sections
# Soft float and 64-bit integer division (`__aeabi_uldivmod`, ...): arm-none-eabi's libgcc (nofp).
# Caution: **It must not fall to empty**: the link then fails on `__aeabi_uldivmod` and names no
# missing toolchain. It stops when ksos-cm* runs, not on evaluation (which `make test` does too).
LIBGCC_CM := $(shell arm-none-eabi-gcc -mcpu=cortex-m3 -mthumb -print-libgcc-file-name 2>/dev/null)
export ARM_TOOLCHAIN_HINT := arm-none-eabi-gcc was not found. Linking bare metal (ksos-cm*/ksos-rp*)\
 needs arm-none-eabi's libgcc (the bodies of soft-float and 64-bit integer division).\
 Ubuntu/devcontainer: apt-get install -y gcc-arm-none-eabi
# $(call require_arm_toolchain,<the libgcc handed to the link>): **hand it the very variable the
# link gets**, or where only that multilib build is missing the link fails with no guidance.
define require_arm_toolchain
	@if [ -z "$(1)" ]; then printf '%s\n' "$$ARM_TOOLCHAIN_HINT" >&2; exit 1; fi
endef

# --- Kanso OS (RTOS): the portable core plus the port layer ------------------------
POSIX_PORT_SRC := port/posix/ksos_port_posix.c

POSIX_OUT := $(OUT)/ksos_posix

# $(call posix_link,<src.kspls>,<the output stem>): the demo's executable; the caller runs it.
define posix_link
	@mkdir -p $(POSIX_OUT)
	"$(KSPLC)" $(1) $(POSIX_OUT)/$(2).c
	@$(C_FMT) $(POSIX_OUT)/$(2).c
	"$(CC)" $(KSOS_CFLAGS) $(POSIX_OUT)/$(2).c $(POSIX_PORT_SRC) $$("$(KSPLC)" info link-libs) \
		-o $(POSIX_OUT)/$(2).exe
endef

# Caution: A POSIX demo not in KSOS_POSIX_DEMOS (at the end) is under no gate; it breaks unseen.
ksos:
	@echo "# BUILDING KANSO OS (POSIX host demo)"
	$(call posix_link,demo/posix/producer_consumer.kspls,ksos_demo)
	./$(POSIX_OUT)/ksos_demo.exe

# --- The demos run on a POSIX host -------------------------------------------------
# The suffix settles the output (`ksos-<x>` → `$(POSIX_OUT)/ksos_<x>.exe`; `-` becomes `_`).
# Caution: **Always write the input** (`ksos_posix_src_<suffix>`), paired with the heading
# (`ksos_posix_msg_<suffix>`): it cannot be derived (`mq`'s is `msgq_demo`). **Put the cap in
# seconds (`ksos_posix_to_<suffix>`) on a demo that looks at real time**: cooperative, it hangs.
KSOS_POSIX_TEMPLATED := mq mutex event preempt delay-until \
    lifecycle isr task-manager kernel-check timeout

ksos_posix_src_mq := msgq_demo
ksos_posix_msg_mq := POSIX message-queue demo

ksos_posix_src_mutex := mutex_demo
ksos_posix_msg_mutex := POSIX mutex demo

ksos_posix_src_event := event_demo
ksos_posix_msg_event := POSIX event-flags demo

ksos_posix_src_preempt := posix_preempt_demo
ksos_posix_msg_preempt := POSIX preemptive demo
ksos_posix_to_preempt := 20

ksos_posix_src_delay-until := delay_until_demo
ksos_posix_msg_delay-until := POSIX task_delay_until demo

ksos_posix_src_lifecycle := lifecycle_demo
ksos_posix_msg_lifecycle := POSIX task suspend/resume/delete demo

ksos_posix_src_kernel-check := kernel_check
ksos_posix_msg_kernel-check := POSIX kernel edge-case checks

ksos_posix_src_timeout := timeout_demo
ksos_posix_msg_timeout := POSIX blocking-with-deadline demo

# **The demos whose mark of success is a panic**: `ksos_posix_panic_src_<suffix>`, `_msg_` and
# `_needle_` together. **The needle is the kernel-side panic's spelling itself**; change both in one
# commit. `ksos_families` in `tests/support/conventions_iface.kspls` reads the run.
KSOS_POSIX_PANIC := stack-overflow mutex-relock mutex-foreign-unlock timeout-zero

ksos_posix_panic_src_stack-overflow := stack_overflow_demo
ksos_posix_panic_msg_stack-overflow := POSIX stack-overflow guard demo
ksos_posix_panic_needle_stack-overflow := ksos: stack overflow detected

ksos_posix_panic_src_mutex-relock := mutex_relock_demo
ksos_posix_panic_msg_mutex-relock := POSIX mutex re-lock demo
ksos_posix_panic_needle_mutex-relock := Mutex.lock by the holder itself

ksos_posix_panic_src_mutex-foreign-unlock := mutex_foreign_unlock_demo
ksos_posix_panic_msg_mutex-foreign-unlock := POSIX mutex foreign-unlock demo
ksos_posix_panic_needle_mutex-foreign-unlock := Mutex.unlock by a task that is not the holder

ksos_posix_panic_src_timeout-zero := timeout_zero_demo
ksos_posix_panic_msg_timeout-zero := POSIX zero-deadline demo
ksos_posix_panic_needle_timeout-zero := ticks must be greater than 0

ksos_posix_panic_missing := $(strip $(foreach d,$(KSOS_POSIX_PANIC),\
    $(if $(and $(ksos_posix_panic_src_$(d)),$(ksos_posix_panic_msg_$(d)),$(ksos_posix_panic_needle_$(d))),,$(d))))
ifneq ($(ksos_posix_panic_missing),)
$(error a demo is missing one of ksos_posix_panic_src_ / _msg_ / _needle_: $(ksos_posix_panic_missing))
endif

define ksos_posix_panic_rule
ksos-$(1):
	@echo "# BUILDING KANSO OS ($(ksos_posix_panic_msg_$(1)))"
	$$(call posix_link,demo/posix/$(ksos_posix_panic_src_$(1)).kspls,ksos_$(subst -,_,$(1)))
	@out=$$$$(./$$(POSIX_OUT)/ksos_$(subst -,_,$(1)).exe 2>&1 || true); \
	echo "$$$$out" >&2; \
	if echo "$$$$out" | grep -q "$(ksos_posix_panic_needle_$(1))"; then \
		echo "RESULT: ALL PASS ($(ksos_posix_panic_msg_$(1)): the kernel stopped with the expected message)"; \
	else \
		echo "RESULT: SOME FAILED (1) -> $(ksos_posix_panic_msg_$(1)): expected message not found"; exit 1; \
	fi
endef
$(foreach d,$(KSOS_POSIX_PANIC),$(eval $(call ksos_posix_panic_rule,$(d))))

ksos_posix_src_isr := isr_signal_demo
ksos_posix_msg_isr := POSIX ISR-safe msgq demo

ksos_posix_src_task-manager := task_manager_demo
ksos_posix_msg_task-manager := POSIX dynamic task/queue creation + task-manager demo
ksos_posix_to_task-manager := 20

ksos_posix_missing := $(strip $(foreach d,$(KSOS_POSIX_TEMPLATED),\
    $(if $(and $(ksos_posix_src_$(d)),$(ksos_posix_msg_$(d))),,$(d))))
ifneq ($(ksos_posix_missing),)
$(error a demo is missing ksos_posix_src_ or ksos_posix_msg_: $(ksos_posix_missing))
endif

define ksos_posix_demo_rule
ksos-$(1):
	@echo "# BUILDING KANSO OS ($(ksos_posix_msg_$(1)))"
	$$(call posix_link,demo/posix/$(ksos_posix_src_$(1)).kspls,ksos_$(subst -,_,$(1)))
	$(if $(ksos_posix_to_$(1)),timeout $(ksos_posix_to_$(1)) )./$$(POSIX_OUT)/ksos_$(subst -,_,$(1)).exe
endef
$(foreach d,$(KSOS_POSIX_TEMPLATED),$(eval $(call ksos_posix_demo_rule,$(d))))

CM_DIR  := port/cortex_m
CM_OUT  := $(OUT)/ksos_cm
CM_OBJS := $(CM_OUT)/startup.o $(CM_OUT)/switch.o $(CM_OUT)/port.o $(CM_OUT)/semihost.o

$(CM_OUT):
	@mkdir -p $@
$(CM_OUT)/port.o: $(CM_DIR)/ksos_port_cm.c | $(CM_OUT)
	$(CM_CC) -c $< -o $@
$(CM_OUT)/semihost.o: $(CM_DIR)/semihost.c | $(CM_OUT)
	$(CM_CC) -c $< -o $@
$(CM_OUT)/switch.o: $(CM_DIR)/switch.S | $(CM_OUT)
	$(CM_CC) -c $< -o $@
$(CM_OUT)/startup.o: $(CM_DIR)/startup.S | $(CM_OUT)
	$(CM_CC) -c $< -o $@

# $(call bare_link,<cc>,<out dir>,<link.ld>,<objects>,<libgcc>,<src.kspls>,<elf>,<stem>): the one
# bare-metal build, which `cm_link` and `cm0_link` name their port's parts to. The libgcc goes last
# (an archive, pulled per symbol).
# Caution: The .c/.o stem is **the ELF's base name** unless <stem> names one, never a fixed name:
# demos run in parallel would overwrite one `demo.c` and link another demo's source.
define bare_link
	$(call require_arm_toolchain,$(5))
	"$(KSPLC)" --freestanding $(6) $(2)/$(or $(8),$(basename $(notdir $(7)))).c
	@$(C_FMT) $(2)/$(or $(8),$(basename $(notdir $(7)))).c
	$(1) -c $(2)/$(or $(8),$(basename $(notdir $(7)))).c -o $(2)/$(or $(8),$(basename $(notdir $(7)))).o
	$(LLD_LINK) --gc-sections -T $(3) -o $(7) $(4) $(2)/$(or $(8),$(basename $(notdir $(7)))).o $(5)
endef

# $(call cm_link,<src.kspls>,<elf>[,<stem>]): a Cortex-M3 build (`bare_link`).
cm_link = $(call bare_link,$(CM_CC),$(CM_OUT),$(CM_DIR)/link.ld,$(CM_OBJS),$(LIBGCC_CM),$(1),$(2),$(3))

# $(call cm_qemu,<elf>,<the timeout in seconds>,<extra qemu arguments>) on MPS2-AN385 (Cortex-M3).
# Caution: **Always put a timeout**: the only stop for a hung demo (semihosting's exit returns 0).
define cm_qemu
	timeout $(2) qemu-system-arm -M mps2-an385 -cpu cortex-m3 -nographic -semihosting \
		$(3) -kernel $(1)
endef

# The cooperative demo: the build, plus checking the vector table and PendSV with objdump.
ksos-cm: $(CM_OBJS)
	@echo "# BUILDING KANSO OS (Cortex-M / thumbv7m)"
	$(call cm_link,demo/cortex_m/cortex_m_min.kspls,$(CM_OUT)/ksos_cm.elf)
	@echo "# --- sections (.isr_vector@0x0 FLASH, .data/.bss@0x20000000 RAM) ---"
	$(OBJDUMP) -h $(CM_OUT)/ksos_cm.elf
	@echo "# --- context switch (PendSV_Handler) ---"
	$(OBJDUMP) -d --disassemble-symbols=PendSV_Handler $(CM_OUT)/ksos_cm.elf
	@echo "# Kanso OS (Cortex-M) build/link OK -> $(CM_OUT)/ksos_cm.elf"

# Runs that ELF under QEMU (mps2-an385); output and exit go through ARM semihosting.
ksos-cm-run: ksos-cm
	@echo "# RUNNING KANSO OS (Cortex-M) on QEMU mps2-an385"
	$(call cm_qemu,$(CM_OUT)/ksos_cm.elf,20)

# --- The demos run under QEMU ------------------------------------------------------
# The suffix settles the input and the ELF (`ksos-cm-<x>` → `ksos/demo/cortex_m/cortex_m_<x>.kspls`
# and `$(CM_OUT)/ksos_cm_<x>.elf`); **its pair is `ksos_cm_sec_<suffix>` (QEMU's seconds) and
# `ksos_cm_msg_<suffix>` (the heading)**. A demo with a peer process or objdump is written by hand.
KSOS_CM_DEMOS := uart-probe heap-probe panic-probe ai-probe \
    ai-train-probe car-model-probe ai-weights-probe pilot-probe \
    preempt control-ai-probe mq pi \
    event timeout isr-block

ksos_cm_sec_uart-probe := 15
ksos_cm_msg_uart-probe := BUILDING+RUNNING UART0(MMIO) probe on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_heap-probe := 15
ksos_cm_msg_heap-probe := BUILDING+RUNNING freestanding heap probe on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_panic-probe := 15
ksos_cm_msg_panic-probe := BUILDING+RUNNING panic-record probe on Cortex-M (thumbv7m) bare metal

# UART0's RX path: QEMU's chardev on a Unix socket, and `tests/uart_echo_test.py` checks the echo.
ksos-cm-uart-echo: $(CM_OBJS)
	@echo "# BUILDING+RUNNING UART0(RX) echo probe on Cortex-M (thumbv7m) bare metal"
	$(call cm_link,demo/cortex_m/cortex_m_uart_echo.kspls,$(CM_OUT)/ksos_cm_uart_echo.elf)
	@rm -f $(CM_OUT)/uart_echo_test.sock
	python3 tests/uart_echo_test.py $(CM_OUT)/ksos_cm_uart_echo.elf

# UART0's RX driven by NVIC IRQ0, the CPU resting on WFI; `tests/uart_irq_echo_test.py` checks it.
ksos-cm-uart-irq-echo: $(CM_OBJS)
	@echo "# BUILDING+RUNNING UART0(RX, interrupt-driven NVIC IRQ0 + WFI) echo probe on Cortex-M (thumbv7m) bare metal"
	$(call cm_link,demo/cortex_m/cortex_m_uart_irq_echo.kspls,$(CM_OUT)/ksos_cm_uart_irq_echo.elf)
	@rm -f $(CM_OUT)/uart_irq_echo_test.sock
	timeout 15 python3 tests/uart_irq_echo_test.py $(CM_OUT)/ksos_cm_uart_irq_echo.elf

ksos_cm_sec_ai-probe := 15
ksos_cm_msg_ai-probe := BUILDING+RUNNING ksai on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_ai-train-probe := 15
ksos_cm_msg_ai-train-probe := BUILDING+RUNNING ksai on-device LoRA training on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_car-model-probe := 15
ksos_cm_msg_car-model-probe := BUILDING+RUNNING the car forward-model learning on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_ai-weights-probe := 15
ksos_cm_msg_ai-weights-probe := BUILDING+RUNNING ksai inference with embedded real weights on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_pilot-probe := 15
ksos_cm_msg_pilot-probe := BUILDING+RUNNING car pilot policy (embedded safetensors) on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_preempt := 20
ksos_cm_msg_preempt := BUILDING+RUNNING KANSO OS (Cortex-M preemptive demo)

ksos_cm_sec_control-ai-probe := 20
ksos_cm_msg_control-ai-probe := BUILDING+RUNNING the control loop coexisting with AI inference on Cortex-M (thumbv7m) bare metal

ksos_cm_sec_mq := 20
ksos_cm_msg_mq := BUILDING+RUNNING KANSO OS (Cortex-M preemptive msgq demo)

ksos_cm_sec_pi := 20
ksos_cm_msg_pi := BUILDING+RUNNING KANSO OS (Cortex-M priority-inheritance demo)

ksos_cm_sec_event := 20
ksos_cm_msg_event := BUILDING+RUNNING KANSO OS (Cortex-M event-flags demo)

ksos_cm_sec_timeout := 20
ksos_cm_msg_timeout := BUILDING+RUNNING KANSO OS (Cortex-M timeout-under-preemption demo)

ksos_cm_sec_isr-block := 15
ksos_cm_msg_isr-block := BUILDING+RUNNING KANSO OS (Cortex-M blocking-inside-an-ISR demo)

ksos_cm_missing := $(strip $(foreach d,$(KSOS_CM_DEMOS),\
    $(if $(and $(ksos_cm_sec_$(d)),$(ksos_cm_msg_$(d))),,$(d))))
ifneq ($(ksos_cm_missing),)
$(error a demo is missing ksos_cm_sec_ or ksos_cm_msg_: $(ksos_cm_missing))
endif

define ksos_cm_demo_rule
ksos-cm-$(1): $$(CM_OBJS)
	@echo "# $(ksos_cm_msg_$(1))"
	$$(call cm_link,demo/cortex_m/cortex_m_$(subst -,_,$(1)).kspls,$$(CM_OUT)/ksos_cm_$(subst -,_,$(1)).elf)
	$$(call cm_qemu,$$(CM_OUT)/ksos_cm_$(subst -,_,$(1)).elf,$(ksos_cm_sec_$(1)))
endef
$(foreach d,$(KSOS_CM_DEMOS),$(eval $(call ksos_cm_demo_rule,$(d))))

# --- Raspberry Pi Pico / Pico W (RP2040, Cortex-M0+) real-chip port ----------------
# RP2040 is Armv6-M (Thumb-1): startup/switch come from cortex_m0, the rest of the port is reused.
# QEMU has no RP2040, so here is build/link/objdump only (`ksos/docs/DESIGN.md`).
export UF2_HINT_COPY := (hold BOOTSEL down, connect USB, and copy it to the drive that appears)
export UF2_HINT_MOTOR := (lift the wheels off before writing it)
export RP2040_LINK_NOTE := (for making the UF2 see ksos-rp2040-buzzer. An SWD probe is not needed)

RP2040_DIR := port/rp2040
RP2040_CM0_DIR := port/cortex_m0
RP2040_OUT := $(OUT)/ksos_rp2040

CM0_CC   := clang --target=thumbv6m-none-eabi -mcpu=cortex-m0plus -ffreestanding -Wall -Os \
    -ffunction-sections -fdata-sections
LIBGCC_CM0 := $(shell arm-none-eabi-gcc -mcpu=cortex-m0plus -mthumb -print-libgcc-file-name 2>/dev/null)
# atomic.o is RP2040's alone: Armv6-M has no LDREX/STREX, so without it mem.alloc / mem.Arc /
# thread.Atomic_sz stay undefined. Unused, --gc-sections drops it.
CM0_OBJS := $(RP2040_OUT)/startup.o $(RP2040_OUT)/switch.o $(RP2040_OUT)/port.o \
    $(RP2040_OUT)/semihost.o $(RP2040_OUT)/atomic.o
# What an RP2040 ELF links before its demo: the port, and boot2 (`cm0_link`).
RP2040_LINK_OBJS := $(CM0_OBJS) $(RP2040_OUT)/boot2_incbin.o

$(RP2040_OUT):
	@mkdir -p $@
$(RP2040_OUT)/startup.o: $(RP2040_CM0_DIR)/startup.S | $(RP2040_OUT)
	$(CM0_CC) -c $< -o $@
$(RP2040_OUT)/switch.o: $(RP2040_CM0_DIR)/switch.S | $(RP2040_OUT)
	$(CM0_CC) -c $< -o $@
$(RP2040_OUT)/port.o: $(CM_DIR)/ksos_port_cm.c | $(RP2040_OUT)
	$(CM0_CC) -c $< -o $@
$(RP2040_OUT)/semihost.o: $(CM_DIR)/semihost.c | $(RP2040_OUT)
	$(CM0_CC) -c $< -o $@
$(RP2040_OUT)/atomic.o: $(RP2040_DIR)/ksos_atomic_sio.c | $(RP2040_OUT)
	$(CM0_CC) -c $< -o $@

# The stage 2 bootloader: position-independent (no link), padded to 256 bytes with the checksum.
$(RP2040_OUT)/boot2.o: $(RP2040_DIR)/boot2_generic_03h.S | $(RP2040_OUT)
	$(CM0_CC) -c $< -o $@
$(RP2040_OUT)/boot2.bin: $(RP2040_OUT)/boot2.o
	$(OBJCOPY) -O binary --only-section=.entry $< $@
$(RP2040_OUT)/boot2_padded.bin: $(RP2040_OUT)/boot2.bin $(RP2040_DIR)/pad_checksum.kspls
	"$(KSPLC)" run $(RP2040_DIR)/pad_checksum.kspls $(RP2040_OUT)/boot2.bin $@
# Caution: Write only the file name in `.incbin` and leave the place to `-I`: on MSYS2 `$(abspath)`
# gives the `/c/...` form, which the native clang cannot resolve.
$(RP2040_OUT)/boot2_incbin.o: $(RP2040_OUT)/boot2_padded.bin
	@printf '.section .boot2, "a", %%progbits\n.incbin "%s"\n' "$(notdir $<)" > $(RP2040_OUT)/boot2_incbin.S
	$(CM0_CC) -I$(RP2040_OUT) -c $(RP2040_OUT)/boot2_incbin.S -o $@

# $(call cm0_link,<src.kspls>,<elf>[,<stem>]): an RP2040 build (`bare_link`), with boot2, or the
# boot ROM refuses to start.
# **Every RP2040 build goes through here**; by hand it skips `require_arm_toolchain` and its hint.
cm0_link = $(call bare_link,$(CM0_CC),$(RP2040_OUT),$(RP2040_DIR)/link.ld,$(RP2040_LINK_OBJS),$(LIBGCC_CM0),$(1),$(2),$(3))

ksos-rp2040: $(RP2040_LINK_OBJS) | $(RP2040_OUT)
	@echo "# BUILDING KANSO OS (Raspberry Pi Pico / Pico W / RP2040, Cortex-M0+) -> flashable ELF"
	$(call cm0_link,demo/cortex_m/cortex_m_preempt.kspls,$(RP2040_OUT)/ksos_rp2040.elf,demo)
	@echo "# --- sections (boot2@0x10000000 FLASH, isr_vector@0x10000100, RAM@0x20000000) ---"
	$(OBJDUMP) -h $(RP2040_OUT)/ksos_rp2040.elf
	@echo "# --- stage2 bootloader (256 bytes, checksum in last 4 bytes) ---"
	$(OBJDUMP) -s -j .boot2 $(RP2040_OUT)/ksos_rp2040.elf
	@echo "# --- context switch (PendSV_Handler) present ---"
	$(OBJDUMP) -d --disassemble-symbols=PendSV_Handler $(RP2040_OUT)/ksos_rp2040.elf
	@printf '# Kanso OS (RP2040 / Pico / Pico W) build/link OK -> %s %s\n' "$(RP2040_OUT)/ksos_rp2040.elf" "$$RP2040_LINK_NOTE"

# --- The demos that go as far as a UF2 (written to the real chip) ------------------
# The suffix settles the input, the ELF, the UF2 and the C's name (`ksos-rp2040-<x>` ->
# `ksos/demo/rp2040/rp2040_<x>_probe.kspls`, `$(RP2040_OUT)/ksos_rp2040_<x>.elf` / `.uf2`).
# Caution: **`ksos_rp2040_msg_<suffix>` (the heading) has to be there**; `_hint_` is the guidance
# after writing (`UF2_HINT_COPY` when left out), and **something that moves needs its own**.
KSOS_RP2040_DEMOS := buzzer board motor net car-loop car-pilot car-ir

ksos_rp2040_msg_buzzer := Freenove 4WD car buzzer probe

ksos_rp2040_msg_board := Freenove 4WD car board probe: console, RTC, heap, flash records, sensors, I2C matrix, WS2812

ksos_rp2040_msg_motor := Freenove 4WD car motor probe
ksos_rp2040_hint_motor := UF2_HINT_MOTOR

# **Enable internet connection sharing on the PC first** (stage 6 of ksos/docs/HOWTO-bring-up.md).
ksos_rp2040_msg_net := Freenove 4WD car USB Ethernet probe: CDC-NCM, ARP/TCP/HTTP/MQTT, then answer ping

# Caution: **Lift the wheels off**; kssrv on 8080 first (stage 6e in ksos/docs/HOWTO-bring-up.md).
ksos_rp2040_msg_car-loop := Freenove 4WD car <-> kssrv closed loop

# **Lift the wheels off**; kssrv only while receiving (stage 7 in ksos/docs/HOWTO-bring-up.md).
ksos_rp2040_msg_car-pilot := Freenove 4WD car: fetch the pilot policy, then decide on board

# Line tracking uses the policy in the records, so run ksos-rp2040-car-pilot once first.
ksos_rp2040_msg_car-ir := Freenove 4WD car: drive it from the IR remote

ksos_rp2040_missing := $(strip $(foreach d,$(KSOS_RP2040_DEMOS),$(if $(ksos_rp2040_msg_$(d)),,$(d))))
ifneq ($(ksos_rp2040_missing),)
$(error a demo is missing ksos_rp2040_msg_: $(ksos_rp2040_missing))
endif

define ksos_rp2040_demo_rule
ksos-rp2040-$(1): $$(RP2040_LINK_OBJS) | $$(RP2040_OUT)
	@echo "# BUILDING KANSO OS ($(ksos_rp2040_msg_$(1))) -> flashable UF2"
	$$(call cm0_link,demo/rp2040/rp2040_$(subst -,_,$(1))_probe.kspls,$$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).elf,$(subst -,_,$(1)))
	@echo "# --- sections (boot2@0x10000000 FLASH, isr_vector@0x10000100, RAM@0x20000000) ---"
	$$(OBJDUMP) -h $$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).elf
	"$$(KSPLC)" run $$(RP2040_DIR)/elf2uf2.kspls $$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).elf \
		$$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).uf2
	@printf 'OUTPUT: %s %s\n' "$$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).uf2" "$$$$$(or $(ksos_rp2040_hint_$(1)),UF2_HINT_COPY)"
endef
$(foreach d,$(KSOS_RP2040_DEMOS),$(eval $(call ksos_rp2040_demo_rule,$(d))))

# ==========================================
# The **link** regression gate for bare metal (Cortex-M).
# Caution: **`make ci` builds no part of ksos**: without this gate bare metal breaks unseen,
# typically on an `undefined symbol` from a libc function with no body under freestanding.
# **Build the listing from the directory** (a file-name prefix drops a new port's in silence), and
# **put nothing unlinkable alone directly under `ksos/demo/<port>/`** (shared parts: `common/`).
# Adding a port: make ksos/demo/<port>/ and add one line below.
demo_stems = $(patsubst demo/$(1)/%.kspls,%,$(wildcard demo/$(1)/*.kspls))

KSOS_LINK_CM_DEMOS     := $(call demo_stems,cortex_m)
# **RP2040 has to be included**: Armv6-M is narrower, and what links for CM can fail there.
KSOS_LINK_RP2040_DEMOS := $(call demo_stems,rp2040)

KSOS_LINK_TARGETS    := $(addprefix ksos-linkcheck-,$(KSOS_LINK_CM_DEMOS) $(KSOS_LINK_RP2040_DEMOS))

# One demo = one target, so `make -j` runs them in parallel and a failure names its demo.
# Caution: **.PHONY, not a stamp**: the link depends on every source under ksos/ and std/.
# $(call ksos_linkcheck_rule,<demo name>,<the port's objects>,<its OUT>,<link macro>,<the demo's
# directory>,<the port's name>)
define ksos_linkcheck_rule
ksos-linkcheck-$(1): $(2) | $(3)
	@echo "#   link check: demo/$(5)/$(1).kspls ($(6))"
	$$(call $(4),demo/$(5)/$(1).kspls,$(3)/link_$(1).elf,link_$(1))
endef
$(foreach d,$(KSOS_LINK_CM_DEMOS),$(eval $(call ksos_linkcheck_rule,$(d),$$(CM_OBJS),$$(CM_OUT),cm_link,cortex_m,CM)))
$(foreach d,$(KSOS_LINK_RP2040_DEMOS),$(eval $(call ksos_linkcheck_rule,$(d),$$(RP2040_LINK_OBJS),$$(RP2040_OUT),cm0_link,rp2040,RP2040 / Cortex-M0+)))

# Confirms from the link's result that each window with a tight deadline **sits in RAM** and holds
# no direct `bl` (only `blx rN` to a ROM function): both link fine and freeze only on the real chip.
# Caution: **Do not judge by whether a `bl`'s destination is a flash address**: a far-call thunk
# (`__Thumbv6MABSLongThunk_*`) sits near the caller, in RAM; names opening with `_` are dropped.
# **Add a function here once you give it `.ram_text`**, or its window stays unchecked while green;
# each entry is `<the ELF's path>:<the symbol name's end>`.
RAMTEXT_WINDOWS := \
	$(RP2040_OUT)/link_rp2040_board_probe.elf:rp2040_flash_in_window \
	$(RP2040_OUT)/link_rp2040_board_probe.elf:rp2040_ws2812_send_window
RAM_ORIGIN := 0x20000000

test-ksos-ramtext: export RAMTEXT_MISSING_MSG := ERROR: a window function with a tight deadline is not in the ELF (fix this check too when you rename one):
test-ksos-ramtext: export RAMTEXT_FLASH_MSG := ERROR: a window function is outside RAM. Check .ram_text in link.ld:
test-ksos-ramtext: export RAMTEXT_CALL_MSG := ERROR: a function on the flash is called directly from inside a window (bl). What can be called inside a window is only a ROM function through a function pointer:
test-ksos-ramtext: export RAMTEXT_OK_MSG := RESULT: ALL PASS (every window with a tight deadline sits in RAM and calls nothing on the flash directly)
test-ksos-ramtext: ksos-linkcheck-rp2040_board_probe
	@set -o pipefail; \
	for w in $(RAMTEXT_WINDOWS); do \
		elf=$${w%%:*}; sym=$${w##*:}; \
		info=`$(NM) --print-size $$elf \
			| sed -n "s/^\([0-9a-f]*\) \([0-9a-f]*\) [tT] [a-z][a-zA-Z0-9_]*$$sym\$$/\1 \2/p"`; \
		if [ -z "$$info" ]; then \
			printf '%s %s\n' "$$RAMTEXT_MISSING_MSG" "$$sym" >&2; exit 1; \
		fi; \
		set -- $$info; addr=$$1; size=$$2; \
		if [ $$((0x$$addr)) -lt $$(($(RAM_ORIGIN))) ]; then \
			printf '%s %s 0x%s\n' "$$RAMTEXT_FLASH_MSG" "$$sym" "$$addr" >&2; exit 1; \
		fi; \
		direct=`$(OBJDUMP) -d --section=.data --start-address=0x$$addr \
			--stop-address=$$((0x$$addr + 0x$$size)) $$elf \
			| grep -cE '\bbl[[:space:]]' || true`; \
		if [ "$$direct" != "0" ]; then \
			printf '%s %s %s\n' "$$RAMTEXT_CALL_MSG" "$$sym" "$$direct" >&2; exit 1; \
		fi; \
		printf '#   %s: 0x%s +0x%s\n' "$$sym" "$$addr" "$$size"; \
	done; \
	printf '%s (%s)\n' "$$RAMTEXT_OK_MSG" "$(words $(RAMTEXT_WINDOWS))"

# Caution: With no ARM toolchain it skips **explicitly**. A non-empty `KSOS_REQUIRE_ARM` makes the
# absence an error: **set it where the toolchain is promised**, or the check runs nowhere, green.
KSOS_REQUIRE_ARM ?=
ifeq ($(strip $(LIBGCC_CM)),)
ifneq ($(strip $(KSOS_REQUIRE_ARM)),)
test-ksos-link: export LINK_REQUIRED_MSG := ERROR: test-ksos-link is required here (KSOS_REQUIRE_ARM); it does not skip.
test-ksos-link:
	@printf '%s\n' "$$ARM_TOOLCHAIN_HINT" >&2
	@printf '%s\n' "$$LINK_REQUIRED_MSG" >&2
	@exit 1
else
test-ksos-link:
	@printf '#   SKIP: test-ksos-link %s\n' "$$ARM_TOOLCHAIN_HINT"
	@echo "RESULT: SKIPPED (no ARM toolchain)"
endif
else
test-ksos-link: $(KSOS_LINK_TARGETS) test-ksos-ramtext
	@echo "RESULT: ALL PASS (bare-metal demos link - Cortex-M: $(words $(KSOS_LINK_CM_DEMOS)), RP2040/Cortex-M0+: $(words $(KSOS_LINK_RP2040_DEMOS)))"
endif

.PHONY: test-ksos-link test-ksos-ramtext $(KSOS_LINK_TARGETS)

# ==========================================
# The regression gate that runs under QEMU.
# Linking is not running: this is the only goal that runs the demos (`qemu-system-arm`), and
# `timeout` turns a hang into a failure (the verdict is read in `ksos_run_gate`).
# Caution: **Separate what may run in parallel from what may not**: the tests/*.py demos' fixed
# socket/port/pcap, and timing that parallel QEMUs spoil (control-ai claims **exactly zero** drift:
# do not loosen that `== 0` to keep it parallel).
KSOS_QEMU_CM_DEMOS := $(addprefix ksos-cm-,$(KSOS_CM_DEMOS)) \
    ksos-cm-run ksos-cm-uart-echo ksos-cm-uart-irq-echo
KSOS_QEMU_DEMOS := $(KSOS_QEMU_CM_DEMOS)

# **The serial side is the one listed**: forgotten here, a demo runs in parallel and fails visibly.
KSOS_QEMU_SERIAL_DEMOS := ksos-cm-uart-echo ksos-cm-uart-irq-echo ksos-cm-control-ai-probe
KSOS_QEMU_PARALLEL_DEMOS := $(filter-out $(KSOS_QEMU_SERIAL_DEMOS),$(KSOS_QEMU_DEMOS))

# $(call ksos_gate_rule,<gate>,<target>): `ksos-<gate>gate-<target>`, one parallel demo of a gate
define ksos_gate_rule
ksos-$(1)gate-$(2):
	$$(call ksos_run_gate,$(2),$(1))
endef
$(foreach t,$(KSOS_QEMU_PARALLEL_DEMOS),$(eval $(call ksos_gate_rule,qemu,$(t))))
KSOS_QEMU_GATE_TARGETS := $(addprefix ksos-qemugate-,$(KSOS_QEMU_PARALLEL_DEMOS))

# $(call ksos_run_gate,<target>,<log prefix>), shared by test-ksos-qemu and test-ksos-posix.
# Caution: A body lined up by $(foreach) has to begin with a tab (only that marks a recipe line).
# **The exit code alone is not enough** (semihosting exits 0): the log is grepped for a failure, and
# `set -o pipefail` keeps tee's success from hiding one. The child runs `-j1`: a shared job server
# **can build the same port .o at once**, so the caller makes the shared things first.
define ksos_run_gate
	@echo "# --- $(2): $(1) ---"
	@mkdir -p $(KSOS_LOG_DIR)
	set -o pipefail; $(MAKE) -j1 $(1) 2>&1 | tee $(KSOS_LOG_DIR)/$(2)_$(1).log
	@if grep -qE '\[FAIL\]|[1-9][0-9]* FAIL|RESULT:.*FAIL' $(KSOS_LOG_DIR)/$(2)_$(1).log; then \
		echo "ERROR: $(1) reported a failure (see $(KSOS_LOG_DIR)/$(2)_$(1).log)" >&2; exit 1; fi
endef

ifeq ($(strip $(LIBGCC_CM)),)
test-ksos-qemu:
	@printf '%s\n' "$$ARM_TOOLCHAIN_HINT" >&2
	@exit 1
else
test-ksos-qemu: $(CM_OBJS)
	@echo "# [test-ksos-qemu] $(words $(KSOS_QEMU_DEMOS)) demos on qemu-system-arm (parallel $(words $(KSOS_QEMU_PARALLEL_DEMOS)) / serial $(words $(KSOS_QEMU_SERIAL_DEMOS)))"
	$(MAKE) -j$(TEST_JOBS) $(KSOS_QEMU_GATE_TARGETS)
	$(foreach t,$(KSOS_QEMU_SERIAL_DEMOS),$(call ksos_run_gate,$(t),qemu)$(nl))
	@echo "RESULT: ALL PASS (QEMU demos - Cortex-M: $(words $(KSOS_QEMU_CM_DEMOS)))"
endif

.PHONY: test-ksos-qemu $(KSOS_QEMU_GATE_TARGETS)

# ==========================================
# The regression gate for the POSIX host port.
# The port layer (ucontext), task liveness, the ISR-safe API and the stack canary run only here.
# Caution: **Linux only**: `<ucontext.h>` is absent on Windows (MSYS2) and deprecated on macOS; in
# the common `ci` the windows-ucrt64 job falls.
KSOS_POSIX_DEMOS := $(addprefix ksos-,$(KSOS_POSIX_TEMPLATED)) $(addprefix ksos-,$(KSOS_POSIX_PANIC)) ksos

# **A demo that verifies time itself has to be serial** (drift, forced yielding, CPU use).
KSOS_POSIX_SERIAL_DEMOS := ksos-preempt ksos-delay-until ksos-task-manager
KSOS_POSIX_PARALLEL_DEMOS := $(filter-out $(KSOS_POSIX_SERIAL_DEMOS),$(KSOS_POSIX_DEMOS))

$(foreach t,$(KSOS_POSIX_PARALLEL_DEMOS),$(eval $(call ksos_gate_rule,posix,$(t))))
KSOS_POSIX_GATE_TARGETS := $(addprefix ksos-posixgate-,$(KSOS_POSIX_PARALLEL_DEMOS))

test-ksos-posix:
	@echo "# [test-ksos-posix] $(words $(KSOS_POSIX_DEMOS)) demos on the POSIX host port (parallel $(words $(KSOS_POSIX_PARALLEL_DEMOS)) / serial $(words $(KSOS_POSIX_SERIAL_DEMOS)))"
	$(MAKE) -j$(TEST_JOBS) $(KSOS_POSIX_GATE_TARGETS)
	$(foreach t,$(KSOS_POSIX_SERIAL_DEMOS),$(call ksos_run_gate,$(t),posix)$(nl))
	@echo "RESULT: ALL PASS ($(words $(KSOS_POSIX_DEMOS)) POSIX demos)"

.PHONY: test-ksos-posix $(KSOS_POSIX_DEMOS) $(KSOS_POSIX_GATE_TARGETS)

# ==========================================
# The .PHONY declaration for every target.
# Caution: **This is the one place they are declared**: split across two files, one side gets
# forgotten. Without .PHONY a file of the same name makes a target "up to date".
KSOS_BOARD_TARGETS := $(addprefix ksos-rp2040-,$(KSOS_RP2040_DEMOS)) \
    ksos-cm ksos-rp2040

.PHONY: $(KSOS_QEMU_DEMOS) $(KSOS_POSIX_DEMOS) $(KSOS_BOARD_TARGETS)
