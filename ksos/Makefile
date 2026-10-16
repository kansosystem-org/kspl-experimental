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
# The compiler as a path: the tests have it run a tool of this package, never looking at PATH.
KSPLC_EXE = $(shell command -v "$(KSPLC)")
# How many demos a gate turns at once.
TEST_JOBS ?= $(shell (nproc || sysctl -n hw.ncpu || echo 4) 2>/dev/null)
KSOS_LOG_DIR := $(OUT)/log/ksos

# One blank line: the separator when `$(foreach)` lists a recipe of several lines.
define nl


endef

# **A demo is one row, one word**: `<suffix>:<field>[:<field>]`, the fields named above each
# table. `row_field` takes one field; `row_keys` the suffixes, the names the targets are built on.
row_field = $(word $(2),$(subst :, ,$(1)))
row_keys = $(foreach r,$(1),$(call row_field,$(r),1))
# $(call rows_missing,<rows>,<field>): the rows that leave that field out, for an `$(error)`.
rows_missing = $(strip $(foreach r,$(1),$(if $(call row_field,$(r),$(2)),,$(r))))

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
	"$(KSPLC)" run tests/main.kspl "$(KSPLC_EXE)" "$(OUT)/ksos_test"

.PHONY: test

# --- The toolchain for Cortex-M (cross compiling for an ARM Cortex-M3) ---
# One section per symbol, so --gc-sections drops the uncalled libc references that `ksai` carries.
# The machine is named once, to clang and to ksplc alike: ksplc lays the sizes it folds out for it,
# and the C it writes makes clang check each against its own.
CM_MACHINE := thumbv7m-none-eabi
CM_CC := clang --target=$(CM_MACHINE) -mcpu=cortex-m3 -ffreestanding -Wall -Os \
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

# --- The time cap on every demo run, POSIX and QEMU alike ---
# **Every run of a demo goes through `ksos_capped`**: a kernel bug that leaves a task spinning
# stalls the run, and with no cap the gate (and `make ci-linux` with it) waits for ever without a
# word. A run that hits its cap prints the `[FAIL] ... it hung` line the gates read
# (`ksos_run_gate`), rather than ending on `timeout`'s silent 124.
# **One default for every run.** Measured under load (every demo 10 times, 8 at once beside 16 busy
# loops on 4 cores; and 3 times, 4 at once beside 2 busy loops pinned to one core), the slowest run
# took 6.3 s (`ksos-cm-car-model-probe`; the slowest POSIX one, `ksos-task-manager`, 4.2 s), so
# 30 s is about five times the slowest. A slower machine raises it on the command line
# (`make test-ksos-posix KSOS_RUN_CAP=120`).
# A run that needs another cap sets `ksos_run_cap_<its target>` next to this, saying why.
KSOS_RUN_CAP := 30
ksos_cap = $(or $(ksos_run_cap_$@),$(KSOS_RUN_CAP))

# $(call ksos_capped,<command>): the shell words that run it under the cap. On hitting the cap they
# print the line the gates read and exit 1; otherwise they leave its exit status in `rc`.
define ksos_capped
echo "timeout -k 2 $(ksos_cap) $(1)"; rc=0; timeout -k 2 $(ksos_cap) $(1) || rc=$$?; \
    if [ "$$rc" = 124 ]; then \
		echo "[FAIL] $@ did not finish in $(ksos_cap)s: it hung (timeout killed it)"; exit 1; \
    elif [ "$$rc" = 137 ]; then \
		echo "[FAIL] $@ was killed with SIGKILL (forced timeout cleanup or an external kill)"; exit 1; fi
endef
# $(call ksos_capped_run,<command>): a recipe line that runs it under the cap and ends with its
# exit status.
ksos_capped_run = @$(call ksos_capped,$(1)); exit $$rc

# The cap's own check (`test-ksos-posix` runs it first): a run that spins for ever must end at its
# cap, print the hung line, and fail its gate. Its cap is 1 s, so the check costs a second rather
# than the default's 30; the outer `timeout` only keeps the check from hanging where the cap is lost.
ksos_run_cap_cap-check-spin := 1
cap-check-spin:
	$(call ksos_capped_run,sh -c 'while :; do :; done')

ksos_run_cap_cap-check-stubborn := 1
cap-check-stubborn:
	$(call ksos_capped_run,sh -c 'trap "" TERM; while :; do :; done')

test-ksos-cap: export CAP_LOST_MSG := [FAIL] the cap did not stop a run that spins for ever (the check's own 20 s bound ended it)
test-ksos-cap: export CAP_PASSED_MSG := [FAIL] the gate passed a run that spins for ever
test-ksos-cap: export CAP_SILENT_MSG := [FAIL] a run stopped at its cap did not say that it hung:
test-ksos-cap: export CAP_OK_MSG := RESULT: ALL PASS (a run that spins for ever ended at its $(ksos_run_cap_cap-check-spin) s cap, said that it hung, and failed its gate
test-ksos-cap:
	@rm -f $(KSOS_LOG_DIR)/cap_cap-check-spin.log
	@start=$$(date +%s); rc=0; \
	timeout 20 $(MAKE) --no-print-directory ksos-capgate-cap-check-spin >/dev/null 2>&1 || rc=$$?; \
	took=$$(( $$(date +%s) - start )); \
	if [ "$$rc" = 124 ]; then printf '%s\n' "$$CAP_LOST_MSG"; exit 1; fi; \
	if [ "$$rc" = 0 ]; then printf '%s\n' "$$CAP_PASSED_MSG"; exit 1; fi; \
	if ! grep -q '^\[FAIL\] cap-check-spin did not finish in $(ksos_run_cap_cap-check-spin)s: it hung' \
		$(KSOS_LOG_DIR)/cap_cap-check-spin.log; then \
		printf '%s %s\n' "$$CAP_SILENT_MSG" "$(KSOS_LOG_DIR)/cap_cap-check-spin.log"; exit 1; fi; \
	printf '%s, in %s s)\n' "$$CAP_OK_MSG" "$$took"
	@rc=0; timeout 10 $(MAKE) --no-print-directory ksos-capgate-cap-check-stubborn \
		>$(KSOS_LOG_DIR)/stubborn-check.log 2>&1 || rc=$$?; \
	if [ "$$rc" = 0 ] || [ "$$rc" = 124 ] || \
		! grep -q '^\[FAIL\] cap-check-stubborn was killed with SIGKILL' \
		$(KSOS_LOG_DIR)/stubborn-check.log; then \
		cat $(KSOS_LOG_DIR)/stubborn-check.log; exit 1; fi; \
	echo "RESULT: ALL PASS (a run ignoring TERM was forcibly killed and failed its gate)"

.PHONY: cap-check-spin cap-check-stubborn test-ksos-cap

# --- Kanso OS (RTOS): the portable core plus the port layer ------------------------
POSIX_PORT_SRC := port/posix/ksos_port_posix.c

POSIX_OUT := $(OUT)/ksos_posix

# $(call posix_link,<src.kspl>,<the output stem>): the demo's executable; the caller runs it.
define posix_link
	@mkdir -p $(POSIX_OUT)
	"$(KSPLC)" $(1) $(POSIX_OUT)/$(2).c
	"$(CC)" $(KSOS_CFLAGS) $(POSIX_OUT)/$(2).c $(POSIX_PORT_SRC) $$("$(KSPLC)" info link-libs) \
		-o $(POSIX_OUT)/$(2).exe
endef

# Caution: A POSIX demo not in KSOS_POSIX_DEMOS (at the end) is under no gate; it breaks unseen.
ksos:
	@echo "# BUILDING KANSO OS (POSIX host demo)"
	$(call posix_link,demo/posix/producer_consumer.kspl,ksos_demo)
	$(call ksos_capped_run,./$(POSIX_OUT)/ksos_demo.exe)

# --- The demos run on a POSIX host -------------------------------------------------
# A row is `<suffix>:<input>`: `ksos-<suffix>` builds `demo/posix/<input>.kspl` into
# `$(POSIX_OUT)/ksos_<suffix>.exe` (`-` becomes `_`). The input is always written: it cannot be
# derived (`mq`'s is `msgq_demo`).
KSOS_POSIX_TEMPLATED := mq:msgq_demo mutex:mutex_demo mutex-nested:mutex_nested_demo \
    wake-preempt:wake_preempt_demo event:event_demo preempt:posix_preempt_demo \
    delay-until:delay_until_demo lifecycle:lifecycle_demo isr:isr_signal_demo \
    task-manager:task_manager_demo kernel-check:kernel_check timeout:timeout_demo \
    tick-mid-switch:tick_mid_switch_demo dyn-race:dyn_race_demo

ifneq ($(call rows_missing,$(KSOS_POSIX_TEMPLATED),2),)
$(error a POSIX demo's row has no input: $(call rows_missing,$(KSOS_POSIX_TEMPLATED),2))
endif

# $(call ksos_posix_demo_rule,<suffix>,<input>)
define ksos_posix_demo_rule
ksos-$(1):
	@echo "# BUILDING KANSO OS (POSIX demo/posix/$(2).kspl)"
	$$(call posix_link,demo/posix/$(2).kspl,ksos_$(subst -,_,$(1)))
	$$(call ksos_capped_run,./$$(POSIX_OUT)/ksos_$(subst -,_,$(1)).exe)
endef
$(foreach r,$(KSOS_POSIX_TEMPLATED),$(eval $(call ksos_posix_demo_rule,$(call row_field,$(r),1),$(call row_field,$(r),2))))

# **The demos whose mark of success is a panic**: one program, `demo/posix/panic_demo.kspl`,
# given the stop's name as its argument (a panic ends the process, so one run is one stop).
# `ksos_posix_panic_needle_<suffix>` is the line the run must print. **The needle is the
# kernel-side panic's spelling itself**; change both in one commit. `ksos_families` in
# `tests/support/conventions_iface.kspl` reads the run.
KSOS_POSIX_PANIC := stack-overflow mutex-relock mutex-foreign-unlock delete-holder timeout-zero

ksos_posix_panic_needle_stack-overflow := ksos: stack overflow detected
ksos_posix_panic_needle_mutex-relock := Mutex.lock by the holder itself
ksos_posix_panic_needle_mutex-foreign-unlock := Mutex.unlock by a task that is not the holder
ksos_posix_panic_needle_delete-holder := ksos: a task ended holding a mutex
ksos_posix_panic_needle_timeout-zero := ticks must be greater than 0

ksos_posix_panic_missing := $(strip \
    $(foreach d,$(KSOS_POSIX_PANIC),$(if $(ksos_posix_panic_needle_$(d)),,$(d))))
ifneq ($(ksos_posix_panic_missing),)
$(error a panic demo has no ksos_posix_panic_needle_: $(ksos_posix_panic_missing))
endif

# $(call ksos_posix_panic_rule,<suffix>)
define ksos_posix_panic_rule
ksos-$(1):
	@echo "# BUILDING KANSO OS (POSIX demo/posix/panic_demo.kspl $(1), which must panic)"
	$$(call posix_link,demo/posix/panic_demo.kspl,ksos_$(subst -,_,$(1)))
	@$$(call ksos_capped,./$$(POSIX_OUT)/ksos_$(subst -,_,$(1)).exe $(1) >$$(POSIX_OUT)/ksos_$(subst -,_,$(1)).out 2>&1); \
	cat $$(POSIX_OUT)/ksos_$(subst -,_,$(1)).out >&2; \
	if grep -q "$(ksos_posix_panic_needle_$(1))" $$(POSIX_OUT)/ksos_$(subst -,_,$(1)).out; then \
		echo "RESULT: ALL PASS (ksos-$(1): the kernel stopped with the expected message)"; \
	else \
		echo "RESULT: SOME FAILED (1) -> ksos-$(1): expected message not found"; exit 1; \
	fi
endef
$(foreach r,$(KSOS_POSIX_PANIC),$(eval $(call ksos_posix_panic_rule,$(r))))

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

# $(call bare_link,<cc>,<out dir>,<link.ld>,<objects>,<libgcc>,<src.kspl>,<elf>,<stem>,<machine>):
# the one bare-metal build, which `cm_link` and `cm0_link` name their port's parts to. The libgcc
# goes last (an archive, pulled per symbol).
# Caution: The .c/.o stem is **the ELF's base name** unless <stem> names one, never a fixed name:
# demos run in parallel would overwrite one `demo.c` and link another demo's source.
define bare_link
	$(call require_arm_toolchain,$(5))
	"$(KSPLC)" --freestanding --machine=$(9) $(6) $(2)/$(or $(8),$(basename $(notdir $(7)))).c
	$(1) -c $(2)/$(or $(8),$(basename $(notdir $(7)))).c -o $(2)/$(or $(8),$(basename $(notdir $(7)))).o
	$(LLD_LINK) --gc-sections -T $(3) -o $(7) $(4) $(2)/$(or $(8),$(basename $(notdir $(7)))).o $(5)
endef

# $(call cm_link,<src.kspl>,<elf>[,<stem>]): a Cortex-M3 build (`bare_link`).
cm_link = $(call bare_link,$(CM_CC),$(CM_OUT),$(CM_DIR)/link.ld,$(CM_OBJS),$(LIBGCC_CM),$(1),$(2),$(3),$(CM_MACHINE))

# $(call cm_qemu,<elf>): runs it on MPS2-AN385 (Cortex-M3), under the cap (`ksos_capped_run`), the
# only stop for a hung demo. QEMU's exit status is the demo's verdict (`con.exit`).
# Caution: **Keep `-icount shift=auto`**: it makes the board's clock count executed instructions.
# Without it the SysTick follows the host's clock, and a host that stalls QEMU gets two ticks
# delivered back to back to catch up, which no real board does: the control loop's period check
# then sees a one-tick slip in about one run in ten (`cortex_m_control_ai_probe.kspl`).
cm_qemu = $(call ksos_capped_run,qemu-system-arm -M mps2-an385 -cpu cortex-m3 \
    -display none -monitor none -serial null -semihosting -icount shift=auto -kernel $(1) </dev/null)

# The cooperative demo: the build, plus checking the vector table and PendSV with objdump.
ksos-cm: $(CM_OBJS)
	@echo "# BUILDING KANSO OS (Cortex-M / thumbv7m)"
	$(call cm_link,demo/cortex_m/cortex_m_min.kspl,$(CM_OUT)/ksos_cm.elf)
	@echo "# --- sections (.isr_vector@0x0 FLASH, .data/.bss@0x20000000 RAM) ---"
	$(OBJDUMP) -h $(CM_OUT)/ksos_cm.elf
	@echo "# --- context switch (PendSV_Handler) ---"
	$(OBJDUMP) -d --disassemble-symbols=PendSV_Handler $(CM_OUT)/ksos_cm.elf
	@echo "# Kanso OS (Cortex-M) build/link OK -> $(CM_OUT)/ksos_cm.elf"

# Runs that ELF under QEMU (mps2-an385); output and exit go through ARM semihosting.
ksos-cm-run: ksos-cm
	@echo "# RUNNING KANSO OS (Cortex-M) on QEMU mps2-an385"
	$(call cm_qemu,$(CM_OUT)/ksos_cm.elf)

# --- The demos run under QEMU ------------------------------------------------------
# A row is `<suffix>`: `ksos-cm-<suffix>` builds `ksos/demo/cortex_m/cortex_m_<suffix>.kspl` into
# `$(CM_OUT)/ksos_cm_<suffix>.elf` (`-` becomes `_`) and runs it. A demo with a peer process or
# objdump is written by hand.
KSOS_CM_DEMOS := heap-probe panic-probe ai-probe ai-train-probe car-model-probe \
    ai-weights-probe pilot-probe preempt control-ai-probe mq pi event timeout isr-block isr-unlock \
    isr-give

# UART0's RX path: QEMU's chardev on a Unix socket, and `tests/uart_probe.py polled` checks the echo.
ksos-cm-uart-echo: $(CM_OBJS)
	@echo "# BUILDING+RUNNING UART0(RX) echo probe on Cortex-M (thumbv7m) bare metal"
	$(call cm_link,demo/cortex_m/cortex_m_uart_echo.kspl,$(CM_OUT)/ksos_cm_uart_echo.elf)
	@rm -f $(CM_OUT)/uart_echo_test.sock
	$(call ksos_capped_run,python3 tests/uart_probe.py polled $(CM_OUT)/ksos_cm_uart_echo.elf)

# UART0's RX driven by NVIC IRQ0, the CPU resting on WFI; `tests/uart_probe.py irq` checks it.
ksos-cm-uart-irq-echo: $(CM_OBJS)
	@echo "# BUILDING+RUNNING UART0(RX, interrupt-driven NVIC IRQ0 + WFI) echo probe on Cortex-M (thumbv7m) bare metal"
	$(call cm_link,demo/cortex_m/cortex_m_uart_irq_echo.kspl,$(CM_OUT)/ksos_cm_uart_irq_echo.elf)
	@rm -f $(CM_OUT)/uart_irq_echo_test.sock
	$(call ksos_capped_run,python3 tests/uart_probe.py irq $(CM_OUT)/ksos_cm_uart_irq_echo.elf)

# $(call ksos_cm_demo_rule,<suffix>)
define ksos_cm_demo_rule
ksos-cm-$(1): $$(CM_OBJS)
	@echo "# BUILDING+RUNNING demo/cortex_m/cortex_m_$(subst -,_,$(1)).kspl on Cortex-M (thumbv7m) bare metal"
	$$(call cm_link,demo/cortex_m/cortex_m_$(subst -,_,$(1)).kspl,$$(CM_OUT)/ksos_cm_$(subst -,_,$(1)).elf)
	$$(call cm_qemu,$$(CM_OUT)/ksos_cm_$(subst -,_,$(1)).elf)
endef
$(foreach r,$(KSOS_CM_DEMOS),$(eval $(call ksos_cm_demo_rule,$(r))))

# --- Raspberry Pi Pico / Pico W (RP2040, Cortex-M0+) real-chip port ----------------
# RP2040 is Armv6-M (Thumb-1): startup/switch come from cortex_m0, the rest of the port is reused.
# QEMU has no RP2040, so here is build/link/objdump only (`ksos/docs/DESIGN-rtos.md`).
export UF2_HINT_COPY := (hold BOOTSEL down, connect USB, and copy it to the drive that appears)
export UF2_HINT_MOTOR := (lift the wheels off before writing it)
export RP2040_LINK_NOTE := (for making the UF2 see ksos-rp2040-buzzer. An SWD probe is not needed)

RP2040_DIR := port/rp2040
RP2040_CM0_DIR := port/cortex_m0
RP2040_OUT := $(OUT)/ksos_rp2040

CM0_MACHINE := thumbv6m-none-eabi
CM0_CC   := clang --target=$(CM0_MACHINE) -mcpu=cortex-m0plus -ffreestanding -Wall -Os \
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
$(RP2040_OUT)/boot2_padded.bin: $(RP2040_OUT)/boot2.bin $(RP2040_DIR)/pad_checksum.kspl
	"$(KSPLC)" run $(RP2040_DIR)/pad_checksum.kspl $(RP2040_OUT)/boot2.bin $@
# Caution: Write only the file name in `.incbin` and leave the place to `-I`: on MSYS2 `$(abspath)`
# gives the `/c/...` form, which the native clang cannot resolve.
$(RP2040_OUT)/boot2_incbin.o: $(RP2040_OUT)/boot2_padded.bin
	@printf '.section .boot2, "a", %%progbits\n.incbin "%s"\n' "$(notdir $<)" > $(RP2040_OUT)/boot2_incbin.S
	$(CM0_CC) -I$(RP2040_OUT) -c $(RP2040_OUT)/boot2_incbin.S -o $@

# $(call cm0_link,<src.kspl>,<elf>[,<stem>]): an RP2040 build (`bare_link`), with boot2, or the
# boot ROM refuses to start.
# **Every RP2040 build goes through here**; by hand it skips `require_arm_toolchain` and its hint.
cm0_link = $(call bare_link,$(CM0_CC),$(RP2040_OUT),$(RP2040_DIR)/link.ld,$(RP2040_LINK_OBJS),$(LIBGCC_CM0),$(1),$(2),$(3),$(CM0_MACHINE))

ksos-rp2040: $(RP2040_LINK_OBJS) | $(RP2040_OUT)
	@echo "# BUILDING KANSO OS (Raspberry Pi Pico / Pico W / RP2040, Cortex-M0+) -> flashable ELF"
	$(call cm0_link,demo/cortex_m/cortex_m_preempt.kspl,$(RP2040_OUT)/ksos_rp2040.elf,demo)
	@echo "# --- sections (boot2@0x10000000 FLASH, isr_vector@0x10000100, RAM@0x20000000) ---"
	$(OBJDUMP) -h $(RP2040_OUT)/ksos_rp2040.elf
	@echo "# --- stage2 bootloader (256 bytes, checksum in last 4 bytes) ---"
	$(OBJDUMP) -s -j .boot2 $(RP2040_OUT)/ksos_rp2040.elf
	@echo "# --- context switch (PendSV_Handler) present ---"
	$(OBJDUMP) -d --disassemble-symbols=PendSV_Handler $(RP2040_OUT)/ksos_rp2040.elf
	@printf '# Kanso OS (RP2040 / Pico / Pico W) build/link OK -> %s %s\n' "$(RP2040_OUT)/ksos_rp2040.elf" "$$RP2040_LINK_NOTE"

# --- The demos that go as far as a UF2 (written to the real chip) ------------------
# A row is `<suffix>[:<hint>]`: `ksos-rp2040-<suffix>` builds
# `ksos/demo/rp2040/rp2040_<suffix>_probe.kspl` into `$(RP2040_OUT)/ksos_rp2040_<suffix>.elf` and
# `.uf2` (`-` becomes `_`). The hint names the guidance printed after writing (`UF2_HINT_COPY`
# when left out); **something that moves needs its own**. Before writing:
# * net: enable internet connection sharing on the PC (stage 6 of ksos/docs/HOWTO-bring-up.md).
# * car-loop: lift the wheels off, and start kssrv on 8080 (stage 6e there).
# * car-pilot: lift the wheels off; kssrv is needed only while receiving (stage 7 there).
# * car-ir: line tracking uses the policy in the records, so run car-pilot once first.
KSOS_RP2040_DEMOS := buzzer board motor:UF2_HINT_MOTOR net car-loop car-pilot car-ir

# $(call ksos_rp2040_demo_rule,<suffix>,<hint or empty>)
define ksos_rp2040_demo_rule
ksos-rp2040-$(1): $$(RP2040_LINK_OBJS) | $$(RP2040_OUT)
	@echo "# BUILDING KANSO OS (demo/rp2040/rp2040_$(subst -,_,$(1))_probe.kspl) -> flashable UF2"
	$$(call cm0_link,demo/rp2040/rp2040_$(subst -,_,$(1))_probe.kspl,$$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).elf,$(subst -,_,$(1)))
	@echo "# --- sections (boot2@0x10000000 FLASH, isr_vector@0x10000100, RAM@0x20000000) ---"
	$$(OBJDUMP) -h $$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).elf
	"$$(KSPLC)" run $$(RP2040_DIR)/elf2uf2.kspl $$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).elf \
		$$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).uf2
	@printf 'OUTPUT: %s %s\n' "$$(RP2040_OUT)/ksos_rp2040_$(subst -,_,$(1)).uf2" "$$$$$(or $(2),UF2_HINT_COPY)"
endef
$(foreach r,$(KSOS_RP2040_DEMOS),$(eval $(call ksos_rp2040_demo_rule,$(call row_field,$(r),1),$(call row_field,$(r),2))))

# ==========================================
# The **link** regression gate for bare metal (Cortex-M).
# Caution: **`make ci` builds no part of ksos**: without this gate bare metal breaks unseen,
# typically on an `undefined symbol` from a libc function with no body under freestanding.
# **Build the listing from the directory** (a file-name prefix drops a new port's in silence), and
# **put nothing unlinkable alone directly under `ksos/demo/<port>/`** (shared parts: `common/`).
# Adding a port: make ksos/demo/<port>/ and add one line below.
demo_stems = $(patsubst demo/$(1)/%.kspl,%,$(wildcard demo/$(1)/*.kspl))

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
	@echo "#   link check: demo/$(5)/$(1).kspl ($(6))"
	$$(call $(4),demo/$(5)/$(1).kspl,$(3)/link_$(1).elf,link_$(1))
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

# Caution: With no ARM toolchain it skips **explicitly**. `KSOS_REQUIRE_ARM=1` makes the absence
# an error: **set it where the toolchain is promised**, or the check runs nowhere, green.
KSOS_REQUIRE_ARM ?= 0
ifeq ($(strip $(LIBGCC_CM)),)
ifeq ($(strip $(KSOS_REQUIRE_ARM)),1)
test-ksos-link: export LINK_REQUIRED_MSG := ERROR: test-ksos-link is required here, as KSOS_REQUIRE_ARM=1 says. On a machine without the ARM toolchain, KSOS_REQUIRE_ARM=0 makes it skip; that round is then not CI's verdict.
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
# Linking is not running: this is the only goal that runs the demos (`qemu-system-arm`), and the
# cap (`ksos_capped`) turns a hang into a failure (the verdict is read in `ksos_run_gate`).
# Caution: **Separate what may run in parallel from what may not**: the tests/*.py demos' fixed
# socket/port/pcap, and timing that parallel QEMUs spoil (control-ai claims **exactly zero** drift:
# do not loosen that `== 0` to keep it parallel).
KSOS_QEMU_CM_DEMOS := $(addprefix ksos-cm-,$(call row_keys,$(KSOS_CM_DEMOS))) \
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
# The cap's own check (`test-ksos-cap`) runs its spin through the same gate recipe.
$(eval $(call ksos_gate_rule,cap,cap-check-spin))
$(eval $(call ksos_gate_rule,cap,cap-check-stubborn))
.PHONY: ksos-capgate-cap-check-spin ksos-capgate-cap-check-stubborn
KSOS_QEMU_GATE_TARGETS := $(addprefix ksos-qemugate-,$(KSOS_QEMU_PARALLEL_DEMOS))

# $(call ksos_run_gate,<target>,<log prefix>), shared by test-ksos-qemu and test-ksos-posix.
# **A demo passes on three things at once**: its exit status is 0 (`set -o pipefail` keeps tee's
# success from hiding a failure), its log holds no failure mark (`[FAIL]`, `RESULT: SOME FAILED`),
# and **it holds a `RESULT: ALL PASS` line**. A demo prints that line only once its checks have
# run, so a run whose checks were never reached (a task left waiting for ever, which ends the
# scheduler in silence) fails here rather than passing on having said nothing wrong.
# Caution: A body lined up by $(foreach) has to begin with a tab (only that marks a recipe line).
# The child runs `-j1`: a shared job server **can build the same port .o at once**, so the caller
# makes the shared things first.
define ksos_run_gate
	@echo "# --- $(2): $(1) ---"
	@mkdir -p $(KSOS_LOG_DIR)
	set -o pipefail; $(MAKE) -j1 $(1) 2>&1 | tee $(KSOS_LOG_DIR)/$(2)_$(1).log
	@if grep -qE '\[FAIL\]|RESULT:.*FAIL' $(KSOS_LOG_DIR)/$(2)_$(1).log; then \
		echo "ERROR: $(1) reported a failure (see $(KSOS_LOG_DIR)/$(2)_$(1).log)" >&2; exit 1; fi
	@if ! grep -q '^RESULT: ALL PASS' $(KSOS_LOG_DIR)/$(2)_$(1).log; then \
		printf '%s %s (see %s)\n' "$(1)" "$$KSOS_NO_PASS_MSG" "$(KSOS_LOG_DIR)/$(2)_$(1).log" >&2; \
		exit 1; fi
endef
export KSOS_NO_PASS_MSG := printed no RESULT: ALL PASS line, so nothing says its checks ran

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
KSOS_POSIX_DEMOS := $(addprefix ksos-,$(call row_keys,$(KSOS_POSIX_TEMPLATED) $(KSOS_POSIX_PANIC))) \
    ksos

# **A demo that verifies time itself has to be serial** (drift, forced yielding, CPU use).
KSOS_POSIX_SERIAL_DEMOS := ksos-preempt ksos-delay-until ksos-task-manager
KSOS_POSIX_PARALLEL_DEMOS := $(filter-out $(KSOS_POSIX_SERIAL_DEMOS),$(KSOS_POSIX_DEMOS))

$(foreach t,$(KSOS_POSIX_PARALLEL_DEMOS),$(eval $(call ksos_gate_rule,posix,$(t))))
KSOS_POSIX_GATE_TARGETS := $(addprefix ksos-posixgate-,$(KSOS_POSIX_PARALLEL_DEMOS))

test-ksos-posix: test-ksos-cap
	@echo "# [test-ksos-posix] $(words $(KSOS_POSIX_DEMOS)) demos on the POSIX host port (parallel $(words $(KSOS_POSIX_PARALLEL_DEMOS)) / serial $(words $(KSOS_POSIX_SERIAL_DEMOS)))"
	$(MAKE) -j$(TEST_JOBS) $(KSOS_POSIX_GATE_TARGETS)
	$(foreach t,$(KSOS_POSIX_SERIAL_DEMOS),$(call ksos_run_gate,$(t),posix)$(nl))
	@echo "RESULT: ALL PASS ($(words $(KSOS_POSIX_DEMOS)) POSIX demos)"

.PHONY: test-ksos-posix $(KSOS_POSIX_DEMOS) $(KSOS_POSIX_GATE_TARGETS)

# ==========================================
# The .PHONY declaration for the demos and the board targets.
# Each gate declares its own targets beside its rules (`test-ksos-link` and the rest above); the
# demos come from tables shared by several gates, so they are declared once, here. Without .PHONY
# a file of the same name makes a target "up to date".
KSOS_BOARD_TARGETS := $(addprefix ksos-rp2040-,$(call row_keys,$(KSOS_RP2040_DEMOS))) \
    ksos-cm ksos-rp2040

.PHONY: $(KSOS_QEMU_DEMOS) $(KSOS_POSIX_DEMOS) $(KSOS_BOARD_TARGETS)
