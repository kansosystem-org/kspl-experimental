# Kanso OS — the design and how it is checked

A light real-time OS (RTOS) written in KSPL. **A portable kernel core is kept apart from a thin port layer per architecture and OS.** The kernel runs on the same source from a microcontroller (bare metal) to a Linux host. Only the port layer, which absorbs each CPU's and OS's differences, is swapped. So the scheduler is checked as an ordinary Linux process with no hardware, and the same checks extend to Cortex-M bare metal and a real chip. Where to start reading the code, and the demos by make target, are in [ksos](../README.md) ("Run the worked examples and get the feel").

## Contents

* [🏗 The architecture](#-the-architecture)
* [⚙️ What sets the scheduler apart](#-what-sets-the-scheduler-apart)
* [🔌 The ports](#-the-ports)
  * [The POSIX host port (`port/posix/`)](#the-posix-host-port-portposix)
  * [The Cortex-M port (`port/cortex_m/`)](#the-cortex-m-port-portcortex_m)
  * [The Cortex-M0/M0+ port (`port/cortex_m0/`)](#the-cortex-m0m0-port-portcortex_m0)
  * [The RP2040 port (`port/rp2040/`)](#the-rp2040-port-portrp2040)
* [🔧 The peripheral drivers](#-the-peripheral-drivers)
  * [Which folder a driver goes in](#which-folder-a-driver-goes-in)
  * [UART (`uart.kspls` / `uart_irq.kspls`)](#uart-uartkspls--uart_irqkspls)
  * [The RTC (`rtc.kspls`) — real chip only](#the-rtc-rtckspls--real-chip-only)
  * [GPIO (`gpio.kspls`) — real chip only](#gpio-gpiokspls--real-chip-only)
  * [PWM (`pwm.kspls`) — real chip only](#pwm-pwmkspls--real-chip-only)
  * [The clocks and the µs timer (`clocks.kspls` / `timer.kspls`) — real chip only](#the-clocks-and-the-µs-timer-clockskspls--timerkspls--real-chip-only)
  * [USB CDC (`usb_cdc.kspls`) — real chip only](#usb-cdc-usb_cdckspls--real-chip-only)
  * [The CDC-NCM framework (`cdc_ncm.kspls`) — **independent of the hardware**](#the-cdc-ncm-framework-cdc_ncmkspls--independent-of-the-hardware)
  * [The ADC (`adc.kspls`) — real chip only](#the-adc-adckspls--real-chip-only)
  * [Ultrasound (`hcsr04.kspls`) — real chip only](#ultrasound-hcsr04kspls--real-chip-only)
  * [IR receive (`ir_nec.kspls`) — real chip only](#ir-receive-ir_neckspls--real-chip-only)
  * [The I2C master (`i2c.kspls`) — real chip only](#the-i2c-master-i2ckspls--real-chip-only)
  * [The LED matrix (`ht16k33.kspls`) — real chip only](#the-led-matrix-ht16k33kspls--real-chip-only)
  * [Writing Flash (`flash.kspls`) — real chip only](#writing-flash-flashkspls--real-chip-only)
  * [The WS2812 full-color LED (`ws2812.kspls`) — real chip only](#the-ws2812-full-color-led-ws2812kspls--real-chip-only)
* [🌐 The network stack](#-the-network-stack)
  * [How the bytes are assembled](#how-the-bytes-are-assembled)
  * [The receiver does not trust what the sender claims](#the-receiver-does-not-trust-what-the-sender-claims)
  * [Whether a send succeeded — `Link.send_frame` returns a `Bool`](#whether-a-send-succeeded--linksend_frame-returns-a-bool)
  * [Where a link layer is swapped in (`link.kspls`)](#where-a-link-layer-is-swapped-in-linkkspls)
* [🚗 The board: a Freenove 4WD car with a Pico W](#-the-board-a-freenove-4wd-car-with-a-pico-w)
  * [What is in `boards/freenove_4wd_pico/`](#what-is-in-boardsfreenove_4wd_pico)
  * [What the self-driving probe does, and where its judgement lives](#what-the-self-driving-probe-does-and-where-its-judgement-lives)
  * [What the USB-Ethernet probe does, and what it needs on the PC](#what-the-usb-ethernet-probe-does-and-what-it-needs-on-the-pc)
* [🤖 The AI on bare metal](#-the-ai-on-bare-metal)
* [🧭 The guidance for adding an API or an implementation](#-the-guidance-for-adding-an-api-or-an-implementation)
* [🚫 What is out of scope, and why](#-what-is-out-of-scope-and-why)
  * [TLS](#tls)
  * [WiFi (CYW43439) — not implemented in this design](#wifi-cyw43439--not-implemented-in-this-design)

---

## 🏗 The architecture

**The kernel core (`ksos/kernel/`) depends on neither hardware nor libc.** The caller allocates the stacks, the `Task` and a queue's buffer statically, so it runs unchanged on a microcontroller with no `malloc`. Where each folder sits, and what the kernel offers, is the map in [ksos](../README.md).

**The port layer is swapped at link time.** The kernel declares this C ABI with `extern "C"`, and each port implements it:

| function | its role |
|------|------|
| `ksos_port_ctx_create(stack, size)` | makes the context that enters `ksos_trampoline` on its first start (the kernel `#export`s it; it runs the current task's entry) |
| `ksos_port_ctx_create_main()` | captures the scheduler's (initial) context |
| `ksos_port_switch(from, to)` | saves `from` and switches to `to` |
| `ksos_port_tick_start(reload)` | starts the periodic timer for preemption: `SIGALRM`+`setitimer` on POSIX, `SysTick` on Cortex-M |
| `ksos_port_irq_save() / _restore(s)` | a critical section: blocking and restoring `SIGALRM` through `sigprocmask` on POSIX, `PRIMASK` on Cortex-M |
| `ksos_port_in_isr()` | non-zero inside an interrupt handler: `IPSR` on Cortex-M; always 0 on POSIX, which has no handler mode (a signal handler runs on top of the interrupted task) |

**Preemption is opt-in.** `enable_preemption(reload)` starts the port's periodic timer. On every tick, `ksos_tick()` advances the logical time and reschedules, so a task that never yields still gives way at its time slice.

## ⚙️ What sets the scheduler apart

**The API takes FreeRTOS as its reference**: a portable kernel core apart from a port layer, both static and heap allocation, a priority-inheriting mutex, and lazy freeing on the idle task. It is redesigned as methods in KSPL's manner (`Task.suspend()`, `Sem.take()`), not the free-function C API carried over. The names correspond like this; the grounds for each difference are in the list below.

| kind | FreeRTOS | ksos |
|---|---|---|
| making and deleting a task | `xTaskCreate` / `vTaskDelete` | `Task.create` / `Task.delete` (dynamic: `Task.create_dyn` / `t.delete_dyn()`) |
| pausing and resuming | `vTaskSuspend` / `vTaskResume` | `Task.suspend` / `Task.resume` |
| delaying | `vTaskDelay` / `vTaskDelayUntil` | `Task.delay` / `Task.delay_until` |
| a counting semaphore | `xSemaphoreCreateCounting` + `Take`/`Give` | `Sem.init`/`take`/`give` |
| an exclusive lock (priority inheritance) | `xSemaphoreCreateMutex` + `Take`/`Give` | `Mutex.init`/`lock`/`unlock` |
| a message queue | `xQueueCreate` + `Send`/`Receive` | `Queue<\|T\|>.init`/`send`/`recv` |
| event flags | `xEventGroupCreate` + `SetBits`/`WaitBits` | `Event.init`/`set`/`wait` |
| task notifications | the `xTaskNotify` family | not offered: the existing primitives express it |
| dynamic heap allocation | `pvPortMalloc` / `vPortFree` | `heap_alloc` / `heap_free` |
| watching the stack | `configCHECK_FOR_STACK_OVERFLOW`, once configured | a canary written on creation and matched on every `schedule()`; nothing to configure |
| statistics and a task listing | `uxTaskGetSystemState` and the rest | `t.cpu_percent()` plus `Task.get_prio`/`get_name`/`get_state` |

* **Priority scheduling**: the runnable task with the highest priority runs, and equal priorities go round-robin. The larger the number, the higher the priority (`prio=0` is the idle task's alone; an application's tasks are 1 or more). The direction differs per RTOS (FreeRTOS agrees with ksos, Zephyr is the reverse). `Task.create` has neither a cap nor a check, so taking it the other way inverts the whole system's behavior without one diagnostic.
* **Blocking**: every primitive shares `block_current`/`wake`. By an argument, `wake` wakes the highest-priority waiter or every waiter. Checking the condition and blocking happen indivisibly inside a critical section, and a woken task checks again (wake-and-recheck).
  * Caution: **Do not pick by registration order when waking one.** A low-priority waiter that registered earlier would take the resource while the high-priority one keeps waiting. That is the inversion priority inheritance exists to prevent, returning in the code that does the waking. FreeRTOS and Zephyr both wake "the longest waiter among the highest priority" (`make ksos-kernel-check` checks it).
* **The critical section** (`irq_save`/`irq_restore`: `cpsid/cpsie i` on Cortex-M, `SIGALRM` blocked through `sigprocmask` on POSIX) protects the scheduler's state and the primitives from interrupts. Blocking releases it so the switch can happen, and waking takes it again. So `sem`/`queue`/`mutex`/`event` are safe under preemption (`make ksos-cm-mq`, `ksos-cm-event` and `ksos-preempt`).
* **The priority-inheriting mutex**: a task locking a held mutex lends the holder its priority, then blocks. This prevents priority inversion, where a mid-priority task keeps preempting the low-priority holder and the high-priority requester waits forever. Releasing returns the holder's priority (`make ksos-cm-pi`).
  * **Misuse is not silenced.** The holder locking again, and an `unlock` by a task that is not the holder (of a free mutex too), panic on the spot. Re-entry left to wait hangs, waiting for itself to let go. A non-holder's release, if ignored, leaves the caller believing it released. Both break with no diagnostic. FreeRTOS returns a failure (`pdFAIL`) and Zephyr an error (`-EPERM`), but a return value gets forgotten, so ksos stops. Re-entry by a count (FreeRTOS's recursive mutex, Zephyr's `lock_count`) is not taken: whoever miscounts the `unlock`s delays the release silently (`make ksos-mutex-relock` and `make ksos-mutex-foreign-unlock` check it).
  * **Hold something exclusively with `Mutex`, never with `Sem`.** Inheritance assumes one known holder, so it cannot apply to a counting semaphore, which can stand for several resources. A binary semaphore used as a lock, as FreeRTOS allows, is open to inversion. `Sem` and `Mutex` are two types to force that difference (whether there is an owner) through the type, not to narrow the API, so they are not merged.
* **Event flags**: each bit of a `U32` is an event, waited on as an AND (all) or OR (any). `set` wakes every waiter whose condition holds, and each checks again. Clearing the bits as the wait ends (clear-on-exit) makes taking and consuming indivisible (`make ksos-event` and `ksos-cm-event`).
* **Tickless idle**: where no task is runnable, the kernel moves the logical time forward to the nearest `delay` expiry instead of waiting in real time. The aim is determinism: `Task.delay` works with no timer, and a test ends in the same order every time without waiting. In a cooperative arrangement (no `enable_preemption`) this is the only path that advances `g_tick`, so without it a `delay` never wakes.
  * **So `Task.delay(n)` counts logical ticks, not real time.** It never wakes before the expiry (`g_tick` always advances `n` first). But where no other task runs, it returns in zero real time, even with a real timer running: moving the time forward ignores the timer and reads no elapsed time. It matches real time only while another task is runnable. So `cortex_m_control_ai_probe`'s `max_jitter` is in logical ticks under that condition, not real-time jitter against an independent clock.
  * Caution: **Where the real board needs a real-time period, use a hardware timer rather than `Task.delay`.** On the RP2040 that is `delay_us`/`delay_ms` in `ksos/drivers/rp2040/timer.kspls`, which the peripheral probes use. Power-saving tickless idle is in [`ksos/docs/PLAN.md`](PLAN.md).
* **Pausing, resuming and deleting a task** (`Task.suspend`/`Task.resume`/`Task.delete`; `make ksos-lifecycle`): the Task and the stack are allocated statically. So, as with a `done` task, a delete reclaims neither.
* **The stack-overflow canary**: `Task.create` writes a known byte run at the stack's lowest-address end, and every `schedule()` matches it. Damage panics at once (`make ksos-stack-overflow`). The demo damages the canary directly rather than overflowing by recursion. The bytes a call uses change with the optimization and the ABI, so a real overflow is not deterministic. It can also reach an unmapped region first and die as a SEGV instead of at the canary.
* **Waiting inside an ISR by mistake is stopped.** An interrupt handler has nothing to switch to, so `take` or `Task.delay` inside one would block the interrupted task, silently stopping an unrelated task. `require_current` and `Task.delay` check the port's `ksos_port_in_isr` and panic on the spot. Only what does not wait may be called from an ISR (`give` / `set` / `try_*`, `Queue<|T|>.try_send`/`.try_recv` among them). Those need no dedicated version, because `irq_save` nests (`make ksos-isr`). FreeRTOS keeps separate `FromISR` versions and catches the mistake with `configASSERT`, once configured. Zephyr stops a wait inside an ISR with an assert. ksos stops with nothing to configure. Only Cortex-M has a handler mode (`IPSR`). POSIX's signal handler runs on top of the interrupted task, so the breakage cannot happen there and nothing detects it (`make ksos-cm-isr-block`). The POSIX stand-in interrupt is a real signal (`SIGUSR1`). Its handler does only async-signal-safe work: `try_send` and a counter, no I/O, no allocation.
* **A timeout on a wait**: a blocking call is written three ways. The bare form (`take`/`recv`/`send`/`lock`/`wait`) waits until another task wakes it. `try_` answers without waiting. `_for(ticks)` gives up with `false`/`none` at a timeout in logical ticks. The timeout runs on `Task.delay`'s clock (`g_tick`), so tickless idle counts it as a point to move the time to, and `_for` wakes even in a cooperative arrangement. A blocked task carries one timeout. `ksos_tick` / tickless idle move whoever expired back to ready without saying why. The woken task's wake-and-recheck takes the condition if it can, and gives up if the timeout has passed (`make ksos-timeout` and `make ksos-cm-timeout`).
  * **When `lock_for` gives up, return the priority it lent.** The holder goes back to the higher of its original priority and the highest priority still waiting, whose lending is still live. FreeRTOS does the same (`vTaskPriorityDisinheritAfterTimeout`).
  * **A tick is logical time**, as FreeRTOS's is. The kernel does not know a tick's real length: `enable_preemption`'s reload is in the port's unit, and only the application that set it can turn it into Hz. So an application writing a timeout in real time names the rate with `declare_tick_hz(hz)` and converts with `ms_to_ticks(ms)`. That panics if the rate was never named. It rounds up: a timeout means "wait at least ms", and rounding down turns a short ms into 0 ticks, giving up without waiting. FreeRTOS's `pdMS_TO_TICKS` rounds down, so an ms under one tick becomes 0.
  * Caution: **Do not fold how long it waits into one argument.** FreeRTOS gives every API an `xTicksToWait`, reading 0 as "do not wait" and `portMAX_DELAY` as "forever". `portMAX_DELAY` means forever only while `INCLUDE_vTaskSuspend` is on; turn it off and it becomes a finite wait. ksos separates the cases by how the call is written, refuses `_for(0)` with a panic (0 is `try_`'s job), and holds no sentinel for forever (call the bare form).
* ISR-safe heap allocation (`ksos/kernel/heap.kspls`): `std/mem.kspls`'s freestanding heap (a free list, joining neighbors) holds a CAS lock for several cores, but is not ISR-safe on one. A task interrupted while holding the lock leaves that ISR spinning on the same lock, deadlocked. So `heap_alloc`/`heap_free` disable interrupts (`task.irq_save`/`irq_restore`) around the allocation and the free alone. **Calling `alloc`/`dealloc` directly skips this, so on ksos always use these for the heap from a task or an ISR.** `make ksos-cm-heap-probe` checks the allocator's independence, reuse and joining of neighbors. It also shows `Arc<T>` holding on a chip with no heap. So refusing ARC on the main thread with [W0602], and using it only on the other threads, can be relied on there.
* **Dynamic creation using the heap (`ksos/kernel/dynamic.kspls`)**: an extension impl on each static type (`Task`/`Sem`/`Mutex`/`Event`/`Queue<|T|>`). This is the source for the list of names (the README writes only the approach). Creating and destroying are symmetric.

  | | the names |
  | :-- | :-- |
  | **creating** — an associated function, the static side's verb with `_dyn` added | `Task.create_dyn` / `Sem.init_dyn` / `Mutex.init_dyn` / `Event.init_dyn` / `Queue<\|T\|>.init_dyn` |
  | **destroying** — a method on the instance | `t.delete_dyn()` / `s.destroy_dyn()` / `m.destroy_dyn()` / `e.destroy_dyn()` / `q.destroy_dyn()` |

  The Task, the stack and a queue's buffer come from `heap.kspls`. So unlike the static API, create and delete can repeat until the slots run out (`kernel/task.kspls` frees and reuses a deleted task's scheduler slot). **A task deleting itself cannot be freed at once**, since it still runs on that stack. `Task.current().delete_dyn()` leaves the reclaim to the next call another task makes into this file, or to the idle task below. Deleting another task reclaims at once.

  **The convention of passing `null` as the receiver to mean "myself" is not taken.** If the caller always spells out `Task.current()`, the reader needs no unwritten knowledge.
* **The idle task (`enable_idle_task` in `ksos/kernel/task.kspls`)** sleeps on `Task.delay(1)` between calls to its hook. So its sleep comes under tickless idle with no change to the scheduler. `install_idle_reap` in `ksos/kernel/dynamic.kspls` makes reclaiming deleted tasks its hook. It is opt-in like `enable_preemption`. Once on, it never ends by itself, so the process has to be ended explicitly (`sys.exit()` or the like).
* **The task manager (`cpu_percent` in `ksos/kernel/task.kspls`) samples.** On every periodic-timer interrupt, `ksos_tick()` adds 1 to whichever task is running, the same idea as top and ps.

## 🔌 The ports

Four ports implement that ABI, and `ksos/kernel/` changes for none of them. **The one real chip is the RP2040** (a Raspberry Pi Pico / Pico W), checked on Freenove's mecanum car ("🚗 The board: a Freenove 4WD car with a Pico W" below). What is confirmed on it is in "What has been checked on real hardware" in [ksos](../README.md), and nowhere here. Each port's demos are in that README's tables.

Note: **No external SWD probe is needed.** The buzzer (sounding the stage as a number of beeps) and USB CDC (a virtual serial port) are enough to bring the real board up ([`HOWTO-bring-up.md`](HOWTO-bring-up.md)).

### The POSIX host port (`port/posix/`)

It runs the kernel core in Linux user space, so the scheduler and the synchronizing primitives are checked with no microcontroller. `ksos_port_posix.c` does a real context switch with `ucontext` (`makecontext`/`swapcontext`).

**It stays in C.** `makecontext` is variadic, and how it passes control to the function given is hidden behind the header's macros. KSPL's `extern "C"` crosses only scalars and raw pointers, so it cannot declare that function (the types it cannot cross are listed in [`../../docs/SPEC-language.md`](../../docs/SPEC-language.md)).

#### Preemption

The timer is `SIGALRM` (`setitimer`, on a period of `reload` microseconds). **The switch happens inside the signal handler.** `ksos_tick()` → `schedule()` → `ksos_port_switch()` calls `swapcontext` directly, swapping the handler's own return point for another task's context.

**The next tick cannot interrupt a task mid-switch.** `swapcontext` saves and restores `uc_sigmask` (as POSIX specifies). So a task switched out inside the handler keeps `SIGALRM` blocked until control returns to it and the handler returns. The Cortex-M port gets the same protection from SysTick and PendSV sharing a priority. The critical section also blocks and restores `SIGALRM` with `sigprocmask`, and nests as PRIMASK's save/restore does.

### The Cortex-M port (`port/cortex_m/`)

It runs the kernel core bare-metal on an ARMv7-M (`thumbv7m`) microcontroller. It differs from the POSIX port only in the context switch and the boot. **Its `.c` and `.S` stay in C and assembly.** The PendSV handler saves named registers, which needs a variable bound to a register name (`register ... __asm__("r0")`). KSPL's inline assembler can emit an instruction but not that binding. Each file's head says what it holds.

#### The design of the context switch

**A thread runs on PSP, an exception handler on MSP, and every switch goes through PendSV.** So the saved frame is the same for the cooperative switch (`yield`/`delay`/`sem`/`msgq`) and for timer-driven preemption, and the two mix safely. `ksos_main` (the scheduler included) also moves onto PSP at reset, making every thread context uniform. That keeps the cooperative contract "with runnable tasks exhausted, `start_scheduler` returns to its caller".

#### Preemption

The timer is SysTick. PendSV is set to the lowest priority, so it does not interrupt SysTick and tail-chains behind it.

**QEMU (`qemu-system-arm`, `mps2-an385`) checks it running as the real chip would.** The demos write to the console through ARM semihosting, and end QEMU through it once every task is done.

### The Cortex-M0/M0+ port (`port/cortex_m0/`)

It runs the kernel core on Armv6-M (`thumbv6m`, Cortex-M0/M0+), with the Cortex-M port's role and saved-frame format. **A Cortex-M33 can reuse `cortex_m/` by switching `-mcpu`, but Armv6-M cannot.** Its Thumb-1 lacks two encodings `cortex_m/` uses, which fail to assemble under `clang --target=thumbv6m-none-eabi -mcpu=cortex-m0plus`. So two files are rewritten here. In `startup.S`, the `.data`/`.bss` copy cannot use the post-indexed `ldr r3, [r2], #4` / `str r3, [r0], #4`, and advances the pointer with an explicit `adds`. In `switch.S`, `stmia`/`ldmia` reach only r0-r7, so r8-r11 go by way of r4-r7 with `mov`, as RTOS ports on the Cortex-M0/M0+ do. The saved frame stays exactly `cortex_m/switch.S`'s.

[`port/cortex_m/ksos_port_cm.c`](../port/cortex_m/ksos_port_cm.c) and [`port/cortex_m/semihost.c`](../port/cortex_m/semihost.c) hold no instruction the M0+ lacks, so they are recompiled with `-mcpu=cortex-m0plus` and reused. `link.ld` needs the board's memory map, so it sits with the real-chip port ([`port/rp2040/link.ld`](../port/rp2040/link.ld)). QEMU models no general Cortex-M0+ board. So this port is checked at the build and objdump levels only, with no run like `cortex_m/`'s `make ksos-cm-run`.

#### Armv6-M has no atomic instructions — the port supplies them

Armv6-M **has no** exclusive-access instructions (`LDREX`/`STREX`), so the atomic helpers in `ksplc/gen/runtime/core.c` (`kspl_atomic_add` and the rest) are not defined for it. ksplc does not know the target CPU, so the C preprocessor tests whether pointer-wide atomics are always lock-free. The test is that `__GCC_ATOMIC_POINTER_LOCK_FREE` or clang's `__CLANG_ATOMIC_POINTER_LOCK_FREE` is 2 (clang targeting MSVC defines only the latter).

Caution: **Do not put a stand-in built on an interrupt mask into the runtime.** It is right on a single core, but breaks quietly on a chip with several cores, such as the RP2040. Stopping at a link error is better than running non-atomically without a word. Only the port layer knows the chip, so only it may supply a substitute, not the CPU layer (this directory).

| the port | atomics | what can be used |
|---|---|---|
| RP2040 ([`port/rp2040/ksos_atomic_sio.c`](../port/rp2040/ksos_atomic_sio.c)) | ✅ the SIO's hardware spinlock plus PRIMASK | `alloc` / `Arena` / `Arc` / `Atomic_sz` / `std/http` |
| any other Armv6-M | ❌ none | referring to those stops at `undefined symbol: kspl_atomic_cas`; not using them has no effect (`--gc-sections` drops the references) |

Caution: **When starting a port for a new Armv6-M chip, look into that chip's locking between cores.** The SIO's spinlock is the RP2040's own, and an interrupt mask alone must not replace it: PRIMASK stops only its own core. Why the RP2040's implementation uses both is at the top of `ksos_atomic_sio.c`.

### The RP2040 port (`port/rp2040/`)

The port layer for the **RP2040** (a Raspberry Pi Pico or Pico W; Cortex-M0+ / Armv6-M). Its CPU layer is `ksos/port/cortex_m0/`. This port adds the boot, the memory map, the atomics above and the tool that makes a UF2.

#### About UF2

`elf2uf2.kspls` turns an ELF into a **UF2** (pico-sdk's `elf2uf2`, narrowed to the features needed). Copying that to the USB drive that BOOTSEL brings up writes it, so the real board is checked with no SWD probe.

**It lays the blocks out by `p_paddr` (the load address), never `p_vaddr`.** `.data`'s run-time address (RAM) differs from its load address (Flash) (the `AT > FLASH` in `link.ld`). So by `p_vaddr` it would write to a RAM address.

Caution: If UF2's format is wrong (the fixed 512-byte blocks, the magic, the family ID `0xe48bff56`), the boot ROM **silently ignores it**. The copy to the drive succeeds and nothing happens. So `elf2uf2.kspls` reads its output back before reporting success. It checks the block length, the magic, the family ID, `blockNo`/`numBlocks` and that the addresses are contiguous.

**Reading back cannot catch a wrong destination.** targetAddr is 32 bits, so an ELF whose `p_paddr + p_filesz` passes 32 bits wraps the destination. The read-back passes, since the address is still a multiple of 256, and the first block has nothing to compare against. Written to the wrong address (0 is where boot2 lives), the chip stops starting. So such an ELF is refused at the start as `load_address_out_of_range`. A program-header stride (`e_phentsize`) other than ELF32's 32 bytes is refused too. The reader fixes field positions (`p_paddr` = the head + 12), so another stride reads another field. The regression is `make test-elf2uf2`.

#### How the RP2040 boots

**The RP2040's boot ROM cannot read the QSPI Flash directly.** After a reset it copies the "stage 2" bootloader in Flash's first 256 bytes (`boot2_generic_03h.S`) to the end of SRAM and runs it. That sets the SSI (the QSPI controller) into XIP mode, turning later reads of Flash's address space into 03h read commands. It then jumps through VTOR to ksos's real vector table (`g_vector_table`) at Flash+0x100.

`boot2_generic_03h.S` rewrites the SSI setup sequence and the exit of `raspberrypi/pico-sdk`'s `boot_stage2/boot2_generic_03h.S` and `boot_stage2/asminclude/boot2_helpers/exit_from_boot2.S` (Raspberry Pi (Trading) Ltd., BSD-3-Clause). It uses bare register offsets taken from `hardware_regs/include/hardware/regs/{addressmap,ssi}.h`, with none of pico-sdk's headers. **It takes the "anything that answers the 03h command works" setting** (the standard 1-bit SPI 03h read, no QSPI fast read). So it depends on no particular Flash chip: starting where the part number is unknown comes before speed.

`pad_checksum.kspls` shapes it into 256 bytes (the code, padding and a 4-byte checksum) by the algorithm of pico-sdk's `boot_stage2/pad_checksum` (as called with `-s 0xffffffff`). The boot ROM's CRC32 comes out in the reverse bit order of a standard CRC32. So the input bytes and the result are both bit-reversed around a standard one.

#### Building

```sh
make ksos-rp2040          # builds and links for the RP2040 and checks the layout and the checksum with objdump (it does not run)
```

`clang --target=thumbv6m-none-eabi -mcpu=cortex-m0plus` compiles the C and the assembly. The stage-2 bootloader is assembled (position-independent, so it needs no link), extracted as a raw binary and shaped by `pad_checksum.kspls`. `link.ld` links it as the `.boot2` section of `out/ksos_rp2040/ksos_rp2040.elf`. QEMU has no RP2040 board model, so CI reaches only the build, the link and static checking through `objdump`.

#### The code that runs in RAM, and the region left for the record

**While Flash is written or erased, XIP stops and no instruction in Flash can be read.** So the code calling the boot ROM's write function must sit in RAM ("Writing Flash" below). `link.ld` puts code marked `#section(".ram_text")` inside `.data`, so the start-up copies it to RAM with the initial values. There is no dedicated copy, and no second place that knows where it goes.

**Delete the `.ram_text` line and the link still passes.** The linker puts a section with no destination in Flash. It shows only on the real board, as a freeze the moment the write begins. So `make test-ksos-link` checks every time that the window function's address is in RAM.

**The last 64KB of Flash (from `0x1f0000`) is left for the record inside the device.** An ASSERT in `link.ld` confirms the image does not reach it; if it did, the two would overwrite each other. [`drivers/rp2040/flash.kspls`](../drivers/rp2040/flash.kspls) holds the same position, and `make test-conventions` checks that they agree. The record survives writing new firmware: writing a UF2 touches only the range the image takes.

## 🔧 The peripheral drivers

The drivers read and write a microcontroller's MMIO registers directly (`__kspl_read_volatile`/`__kspl_write_volatile`), independent of the kernel core. What each is confirmed to do on the real chip is in "What has been checked on real hardware" in [ksos](../README.md). **Every RP2040 register value comes from pico-sdk's register headers, and every procedure from its implementations or from pico-examples** (Raspberry Pi (Trading) Ltd., BSD-3-Clause). QEMU has no RP2040, so nothing else can confirm them. The addresses and bit fields are the constants in each driver under `ksos/drivers/rp2040/`. This section holds only why each driver is shaped as it is.

### Which folder a driver goes in

**What is bound to a chip goes in the folder named for that chip, and what is not goes directly under `drivers/`.** `rp2040/gpio.kspls` is the RP2040's register layout itself. `ht16k33.kspls` (an I2C LED driver) runs on any chip with I2C, and `cdc_ncm.kspls` is a USB class specification. Mixed, the listing would not say which drivers can be ported.

| the place | what is in it |
| :-- | :-- |
| `rp2040/` `mps2/` `cortex_m/` | what hits that chip's or IP's registers directly |
| directly under `drivers/` | what does not depend on a chip: an outside part (`ht16k33`), a class specification (`cdc_ncm`), and what every driver relies on (`mmio`) |

Caution: **Do not repeat the folder's name in a file name** (`rp2040/gpio.kspls`, not `rp2040/rp2040_gpio.kspls`). An import's alias is the last name, so the caller would read `rp2040_gpio.set_dir(...)`.

The port layer (`port/`) is something else: the boot and the C/asm glue (startup, the linker script, the context switch), not KSPL's MMIO drivers.

**`poll` in `ksos/drivers/mmio.kspls` is the one home of the busy wait every driver shares** (`mmio.poll(addr, mask, want_nonzero)`). It gives up with `false` after `poll_timeout_iters` iterations, so hardware that does not answer cannot stall a driver forever. Do not copy the loop or the constant into a driver.

### UART (`uart.kspls` / `uart_irq.kspls`)

`drivers/mps2/uart.kspls` drives the ARM CMSDK APB UART0 of QEMU's `mps2-an385` (at `0x40004000`, wired to a serial console chardev). A real board with the same IP runs it unchanged. Three demos check it:

* `make ksos-cm-uart-probe` checks **that it is genuine memory-mapped I/O, not ARM semihosting** (`ksos/demo/common/semihost_console.kspls`, the `BKPT` trap). With QEMU's `serial0` redirected to a file apart from the console, only UART0's output appears in that file.
* `make ksos-cm-uart-echo` checks the receive path, polled (`getc`/`try_getc`). `ksos/tests/uart_echo_test.py` sends bytes over a Unix domain socket and matches the echo (`RESULT: PASS`).
* `make ksos-cm-uart-irq-echo` checks the receive path **driven by an interrupt**. `uart_irq.kspls` turns on CTRL's RX_INTEN and NVIC IRQ0 (UART0's RX in QEMU's board definition). The ISR `uart0_irq0_handler`, joined to the shared vector table through a weak symbol, raises a flag the caller watches while resting on `WFI`. `WFI` has no other way out, so wrong NVIC or ISR wiring hangs it. An echo from `ksos/tests/uart_irq_echo_test.py` is direct evidence that a real interrupt woke the CPU. The kernel's blocking primitives are not used. With no other task runnable, they return the scheduler to the main context, so the task stays `.running` and the scheduler never sees it.

### The RTC (`rtc.kspls`) — real chip only

The RP2040's RTC holds the calendar date and time directly, ticking on clk_rtc, which `clocks.init()` supplies at 48MHz / 1024. `rtc.init` lifts the block's reset. The `[rtc]` stage of `make ksos-rp2040-board` reports whether it keeps ticking (`ticking=yes`). Its register layer is matched against pico-sdk's `regs/rtc.h` and `regs/addressmap.h`; only the real chip shows it ticking.

### GPIO (`gpio.kspls`) — real chip only

Making a line an output touches three blocks: PADS_BANK0 (the pin's electrical settings), IO_BANK0 (FUNCSEL, the function the pin is joined to) and SIO (the output value and the direction).

Caution: Miss even one and **it does nothing, with no error**, so `init_out()` does all three together.

The inputs, the pulls and `spin()` are described at each function in `ksos/drivers/rp2040/gpio.kspls`. The analog setting is under "The ADC" below.

### PWM (`pwm.kspls`) — real chip only

The RP2040's PWM has 8 slices of 2 channels (A/B). **The period (DIV/TOP) is per slice, the duty (CC) per channel.** So two lines needing different periods cannot share a slice. Which slice and channel a pin maps to is fixed: the slice is the GPIO number / 2, mod 8, and the channel is the GPIO number mod 2, 0 being A. Confirm it before choosing the pins, or the periods collide later. On the Freenove car, each motor's two pins are exactly the A/B of one slice (shared period, independent duty), which fits an H bridge unchanged.

**`set_percent` takes the duty as a proportion, and TOP as an argument.** DIV's integer part is only 8 bits. So a period that fits DIV on the reset-default ROSC overflows it once clk_sys runs at 125MHz, and TOP can then be raised without changing the callers. The driving control (each wheel's polarity, composing a mecanum's motion) is in [`boards/freenove_4wd_pico/motor.kspls`](../boards/freenove_4wd_pico/motor.kspls) (`make ksos-rp2040-motor`).

Caution: **Write it with the wheels off the ground** (stage 3 in [`HOWTO-bring-up.md`](HOWTO-bring-up.md)).

### The clocks and the µs timer (`clocks.kspls` / `timer.kspls`) — real chip only

Out of reset the RP2040 runs on the built-in ROSC (nominally about 6.5MHz, varying with the unit and the temperature). GPIO and PWM run on any clock. But **USB needs exactly 48MHz on clk_usb** (full speed's tolerance is ±0.25%), and on the ROSC it does not even reach enumeration. So `clocks.init()` starts the crystal (XOSC, 12MHz) and moves each clock to a fixed value through the two PLLs.

**Calling it changes the scale of time about 19-fold.** `gpio.spin`'s iteration counts, SysTick's reload and PWM's divisors all need revisiting. Time is then taken from `rp2040/timer`'s real microseconds (`now_us`/`delay_us`/`delay_ms`). That timer needs `clocks.init()` too. TIMER counts a 1µs pulse from the watchdog's tick generator, which `clocks.init()` sets up, rather than dividing for itself. Without it, `delay_us` never returns.

The clock tree it sets up (the procedures follow pico-sdk's `hardware_xosc/xosc.c`, `hardware_pll/pll.c` and `pico_runtime_init/runtime_init_clocks.c`):

```
  XOSC 12MHz ─┬─ PLL_SYS  VCO 1500MHz / 6 / 2 → clk_sys  125MHz → clk_peri
              ├─ PLL_USB  VCO 1200MHz / 5 / 5 → clk_usb   48MHz
              │                                → clk_adc   48MHz
              │                                → clk_rtc   46875Hz (= 48MHz / 1024)
              └────────────────────────── → clk_ref   12MHz → watchdog tick 1MHz
```

### USB CDC (`usb_cdc.kspls`) — real chip only

A composite device that offers **two functions** on one USB cable:

* **CDC-ACM (a virtual serial port)**: the output device with no SWD probe, printing characters on the PC's Serial Monitor. Before it is up, the only debugging output on the real board is the buzzer.
* **CDC-NCM (a USB LAN adapter)**: a network adapter to the PC. Raw 802.3 frames cross the bus, so it fills the `Link` in `ksos/net/link.kspls` unchanged (`send_frame` / `rx_available` / `recv_frame`). With internet connection sharing on the PC, it reaches the internet even far from the wireless router.

**The two live together so the network side can be narrowed down.** With NCM alone, the only clue left when something fails is the buzzer.

**It runs by polling, not by interrupt.** The SIE's state is read from `SIE_STATUS` / `BUFF_STATUS`, so a task calls `poll_once()` on a schedule. That keeps ksos's scheduler out of interrupt priorities and is easier to narrow down (once dropping becomes a problem, move to the NVIC). Keep calling `poll_once()` while waiting too: the host drops a device that does not answer.

**`write(data)` only queues.** `poll_once()` sends a packet (64 bytes) at a time, so the caller never handles the 64-byte cut or waits for the previous line. A line that does not fit is not queued at all, and `false` comes back: part of a line would tear it and make the log meaningless. `has_room(n)` asks first (the queue is 512 bytes). So the caller can turn `poll_once()` until there is room before printing a line it cannot make again.

**EP0's control transfer does not end in one round trip.** Enumeration needs the 67-byte configuration descriptor sent as two packets, 64+3 (exactly 64 is not a short packet, so the host waits for more). It needs a way to receive the zero-length OUT after the data stage. And a request it cannot answer gets a STALL, not an empty answer (a host expecting content stops at an empty one). The procedures follow pico-examples' `usb/device/dev_lowlevel`.

Caution: **Always run ksos's `make test` after touching a descriptor** (`make debug-ksos` from the repository's root). A descriptor is a byte run that claims its own length, and one byte out of place makes enumeration fail without a word. KSPL's fixed-length array pads what is short with 0. So a mismatch between the declared length and the element count compiles without complaint (`ksos/tests/usb_descriptors.kspls`).

### The CDC-NCM framework (`cdc_ncm.kspls`) — **independent of the hardware**

NCM packs raw 802.3 frames into a container called an NTB to carry them over the bus. `cdc_ncm.kspls` only assembles and parses NTBs, touching no register. **It is kept apart so it can be tested with no hardware.** Failing USB says only "it is not recognized", so a mistake at the level of bytes is found on a host by `make debug` (`ksos/tests/ncm_test.kspls`). Always run it before going to the real board.

### The ADC (`adc.kspls`) — real chip only

Channels 0 to 3 are GPIO 26 to 29, and channel 4 is the built-in temperature sensor (`pin_channel()` converts). A reading needs preparation in **three places**. Miss any one and it returns 0 or a stuck value, with no error.

1. `clocks.init()`: the ADC runs from `clk_adc` (48MHz). Unset, the conversion never starts and READY never goes up.
2. `gpio.init_analog(pin)`: turns the pin's digital input buffer and pull off. Left on, they pull at the analog voltage and the reading drifts. It leaves FUNCSEL alone, since the ADC joins by a path apart from a pin's digital function.
3. `adc.init()`: lifts the ADC block's reset, and sets EN.

**It returns 12 bits (0 to 4095).** Arduino's `analogRead` returns 10 bits (0 to 1023) by default. So a conversion formula or a threshold copied from an Arduino sketch is out by a factor of 4 (`battery_mv` in `boards/freenove_4wd_pico/board.kspls` is written for 12 bits). A single read wobbles by a few LSB, so compare an average (`read_pin_avg(pin, n)`) against a threshold.

### Ultrasound (`hcsr04.kspls`) — real chip only

The HC-SR04 is **an outside device**, not an RP2040 peripheral. It uses two GPIO (TRIG out, ECHO in) and the µs timer, and ECHO's High width is the round-trip time of flight. It has no registers, so its numbers come from Freenove's sample ("The ultrasonic sensor (HC-SR04)" in [`SPEC-board.md`](SPEC-board.md)). The timing is at the code in `ksos/drivers/rp2040/hcsr04.kspls`.

**"No reflection came back" and "the sensor does not answer" are returned apart** (`timed_out` / `ok`). Both look like "no distance" to the caller. But the first only means far away or absorbed, while the second is the moment to suspect the wiring.

**The pin numbers are the board definition's, not the driver's**, so the driver takes `trig`/`echo` as arguments; do not embed them. Where the board material's pins are wrong, it stays at `----` and does nothing.

### IR receive (`ir_nec.kspls`) — real chip only

It receives an infrared remote (the NEC scheme) on one GPIO, an outside device like the ultrasound. The frame's timings and the receiver's negative logic are at the code in `ksos/drivers/rp2040/ir_nec.kspls`.

**Only the command's inverse is checked.** NEC sends the address, its inverse, the command and its inverse. But extended NEC uses the address's inverse byte as the top half of a 16-bit address, so checking it stops some remotes being received.

**The tolerances are loose on purpose.** The caller's polling interval cuts off the start of the leader, and remotes' crystals vary between units.

**Mind the interval between calls.** One frame is only about 70ms, so watching on a coarser period drops it whole. The caller enters `try_receive()` only where `is_idle()` is false, so the idle cost is one GPIO read (`ksos-rp2040-board`'s sensor stage looks every 1ms). While receiving, it blocks for at most 70ms.

### The I2C master (`i2c.kspls`) — real chip only

The RP2040's I2C is a Synopsys DesignWare block (DW_apb_i2c). Its SCL divisors and initialization follow pico-sdk's `hardware_i2c/i2c.c` and the example `bus_scan.c`. **Each byte goes into DATA_CMD with its control bits.** STOP and RESTART are those bits, not separate registers: forget the STOP on the last byte and it holds the bus. Pass the address as 7 bits (0x70 and the like): the hardware attaches the direction bit, so the caller does not shift it. Four more details are each written at the code that meets them in `ksos/drivers/rp2040/i2c.kspls`: the configuration takes effect only while ENABLE is down, the built-in pull-ups, `IC_SLAVE_DISABLE`, and a bus scan that waits on the abort as well as the receive.

Caution: **Match not only the registers' values but "what to call in the initialization" against the implementation.** The pull-ups and `IC_SLAVE_DISABLE` can be right in value and still fail with the procedure unconfirmed, and only the real board shows it.

### The LED matrix (`ht16k33.kspls`) — real chip only

The VK16K33 / HT16K33 holds display RAM and scans it by itself, so once a picture is written the CPU need do nothing. **The demo scans the bus for its address** rather than fixing it. A solder jumper moves the address over 0x70 to 0x77, and a fixed address gets stuck at "the wiring is right and nothing lights". `draw()` sends the whole display RAM (16 bytes, a known cost), since a partial update leaves the previous picture behind. The start-up order is at `init` in `ksos/drivers/ht16k33.kspls`.

### Writing Flash (`flash.kspls`) — real chip only

It offers the last 64KB of the QSPI Flash as a place that can be erased and written, where the append-only record ([ksdb](../../ksdb/README.md)) goes; the caller does the assembling. **It alone hits no MMIO.** Writing and erasing are left to the boot ROM's functions (their addresses looked up from the ROM's fixed table), and this driver holds only the procedure and the range. What those functions ask for:

| The operation | The unit | The position |
| :-- | :-- | :-- |
| Erase | a sector, 4096B | a multiple of 4096 |
| Write | a page, 256B | a multiple of 256 |
| Read | free | read the XIP space directly |

A range spanning pages is written page by page, with 0xFF written to the bytes not being touched (0xFF changes no cell, so the page can take more later).

**XIP is stopped while writing and erasing.** So the procedure calling the ROM functions must be a function put in RAM (`#section(".ram_text")` plus `#noinline`; [`port/rp2040/link.ld`](../port/rp2040/link.ld) copies it to RAM with `.data`). For the same reason:

* Stop interrupts before entering. An ISR is in Flash, so one firing inside the window has no way back. PRIMASK stops only this core: once core1 is used, stop that core too for the window (the port uses core0 alone; "The RP2040 port" above).
* Inside the window, make **only ROM calls through a function pointer**. Calling one function in Flash crashes the chip. `init` looks the addresses up beforehand.
* The source data passed to `flash_range_program` must be **in RAM**. Data in Flash (a string literal and the like) is unreadable during the window.

**The ROM's `flash_enter_cmd_xip` is enough to put XIP back.** It sets up the 03h 1-bit SPI read, the same shape `boot2_generic_03h.S` builds, and does not touch BAUDR. If boot2 is changed to a fast QSPI setting, change this to call boot2 again from RAM too. Otherwise, after one write, Flash reads stay slow.

### The WS2812 full-color LED (`ws2812.kspls`) — real chip only

The WS2812 is one 800kHz line where **High's length is the bit's value**. One bit is 1.25µs: High for 0.4µs is a 0 and 0.8µs a 1, with 24 bits per element in G→R→B order, and Low held for 50µs or more at the end latches the colors.

**The PWM counts the time.** It makes the waveform, and the driver only rewrites the duty (CC) once per period (GPIO 16 is PWM slice 0, channel A). The CPU counting cycles is not taken. How it counts depends on the C compiler's output, so the day the optimization or the code's layout changes, the colors turn strange with nobody having touched the driver.

**The write has a grace period, once per period.** CC is not double-buffered, so the rewrite must land after that bit's pulse ends and before the counter wraps. At 125MHz that is 54 counts of 156. So:

* Interrupts are **stopped** while sending. One getting in delays a bit, and the colors go wrong.
* The sending loop is **put in RAM** (`#section(".ram_text")` plus `#noinline`). A Flash read is held up dozens of cycles depending on XIP's cache. `make test-ksos-ramtext` checks it, as it does the Flash-write window.
* **The values written into CC are all made in `init`.** Scaling and composing with the other channel inside the loop lets the C compiler move that arithmetic behind the wait, using up most of the grace. With the address and the value coming in as arguments, the write fits with room to spare.
  * **After adding arithmetic to the loop, read the generated instructions again.**

**PIO is not used.** It would remove the grace period, but it adds a block only the RP2040/RP2350 has. Two means would also serve one purpose, sending bits out of one pin at an exact interval (Principle 6). This judgement holds as long as the grace period is kept.

Caution: **Mind the current.** One element uses close to 60mA at most, so eight all white is 0.5A, and the low-voltage watch fires on its own light. The caller keeps the brightness down (`ws2812_level` in `ksos/boards/freenove_4wd_pico/board.kspls`).

**Only one line can be driven** (the driver holds the address and the run being assembled). Once a second is needed, move that state into a struct.

**The verdict is the color seen by eye.** Each round, the `[led]` stage of `make ksos-rp2040-board` lights every element red → green → blue, sweeps a single white element across, and turns all off. Right colors show that the period, High's length and the grace period are right.

## 🌐 The network stack

The smallest ARP/IPv4/UDP/TCP stack (no fragmentation, no IP options, no routing table) on an Ethernet link (on the real RP2040, USB CDC-NCM). The smallest MQTT 3.1.1 client runs on the TCP (`mini_mqtt.kspls`: CONNECT/CONNACK/PUBLISH at QoS 0/DISCONNECT only). `make ksos-rp2040-net` runs ARP/TCP/HTTP/MQTT on the car ("What the USB-Ethernet probe does, and what it needs on the PC" below).

### How the bytes are assembled

* The fields are written into and read out of the bytes directly in network byte order (big endian). `put_u16_be` and the rest in `std/bytes` spell out the position, the width and the endianness per call.
* The UDP checksum is 0 (IPv4 allows leaving it out). The IP and TCP header checksums are the 16-bit one's-complement sum that RFC 1071 defines. TCP must include the pseudo header in the sum, so `checksum16_step`/`checksum16_finish` let the sum span several regions. The receiver (`parse_tcp_segment`) does not check the checksum. That the sender assembles it correctly is checked by an outside test harness that recomputes it independently.
* What ARP resolved (the gateway's MAC) is held by the caller, not by `mini_ipv4.kspls`, which holds no hidden global state. The caller sends the ARP request, receives and parses the reply, and assembles the UDP/TCP explicitly. The TCP sequence and ACK numbers are the caller's too.

**The TCP is the smallest implementation**: a single connection with no options (always a fixed 20-byte header), no retransmit timer, no congestion control, no handling of reordering and no concurrent connections. It takes one connection straight through handshake, send and receive, then close (the comment at the top of `ksos/net/mini_ipv4.kspls`). It is extended only as far as real use needs, when it needs it.

### The receiver does not trust what the sender claims

What is sent is bytes we wrote ourselves, but **what is received is bytes the peer chose**. `parse_tcp_segment` returns no content until it has confirmed these six. Let any one through, and it reads outside the buffer or passes on what must not be read.

| what is confirmed | what happens if it is let through |
|---|---|
| the payload's length comes from IP's Total Length, not from the frame's length | Ethernet's zero padding flows in as data. A pure ACK (54 bytes) arrives padded to 60, 6 zero bytes mix in, and `peer_seq` advances by that much. Every later segment fails the seq check, and **that connection can never be read again** |
| the version is 4 and the IHL is 20 bytes or more | a header of another shape is read as IPv4 |
| the TCP header's position comes from the IHL, not a fixed 20 bytes | against a peer that sends a header with options, the middle of the options is read as the port number |
| the data offset is 20 bytes or more | the TCP header's own bytes are passed up as the payload |
| it is not a fragment (MF / the fragment offset) | nothing reassembles it, so what is not a header is read as one |
| as much has arrived as Total Length claims | a payload pointing outside the buffer is returned |

**We pad with zeros too when sending** (`pad_to_min`), so a peer doing the same subtraction breaks the same way. That the padding lies outside Total Length is the one thing to rely on.

#### Replies are checked just as strictly

`build_arp_reply` and `build_icmp_echo_reply` **put the peer's bytes back on the wire under our own IP**, so they confirm as much as `parse_tcp_segment` does. Answering a shape that other stacks throw away would send out bytes the peer chose, under our name.

| what is confirmed | what happens if it is let through |
|---|---|
| ICMP: the version is 4 | other stacks throw a different version away even with EtherType 0x0800; we alone would answer |
| ICMP: it is not a fragment | a later fragment holds no ICMP header, so the byte read as the kind is payload the peer chose. Where it happens to be 8, **its content goes out as an "echo reply" under our own IP** |
| ARP: hwtype/ptype/hwlen/protolen are Ethernet+IPv4's 6/4 | the sender's MAC (22), IP (28) and the IP asked about (38) sit there only at 6/4; answering another claim sends unrelated bytes out as "that peer's address" |

Caution: **When passing a received frame as `(buf, len)`, keep `len <= buf.len`.** The caller promises this; `mini_ipv4` does not check it. The checks look at `len` while the reads index `buf`, so a larger `len` reads bytes that never arrived as if they had. A link layer's `recv_frame` returns how many bytes it copied, which meets this. `cdc_ncm.datagram_at`, with only one entry point, checks it itself.

**The assembling functions write nothing and return 0** for a frame that does not fit the buffer (`fits`). `copy_from` and `sub_mut` both silently cut off what does not fit. So writing unchecked would give "part written, the full length returned", and the caller would send that length onto the wire. The 0 is also the answering functions' "0 where it is not addressed to us", and the caller takes it as "nothing to send" (`net_client.send_now` rejects 0 in one place).

The regressions are tested on a host by `ksos/tests/net_test.kspls`.

### Whether a send succeeded — `Link.send_frame` returns a `Bool`

`Link.send_frame` returns **`true` where it could send and `false` where it cannot right now**. `false` means not "it broke" but "queue up": the caller waits and retries with the same content.

Caution: **Do not throw the outcome away.** A polling link (`rp2040/usb_cdc`) holds one send buffer, and throws a frame away when called before the host has read the previous one. Where the amount sent advances a state, as with TCP, `our_seq` would claim bytes the peer can never ACK. With no retransmit, that connection breaks without a word (classically, a data segment sent straight after the handshake's last ACK).

**`tcp_stream_send` does not advance `our_seq` and returns 0** where it could not send. In `mbedtls_ssl_send_t`'s contract, too, 0 means "not written this time; call again with the same content". The signature is exactly mbedTLS's, so no trampoline is needed. The regression is `test_tcp_conn_send_failure_does_not_advance_seq` in `ksos/tests/net_test.kspls`, over a fake link, since the real board cannot choose the moment of failure.

Waiting for `usb.ncm_tx_busy()` to go down before sending is **for efficiency** (fewer wasted `false`s), not correctness. `drain_tx()` plus `send_now()` in `ksos/demo/rp2040/common/net_client.kspls` take that shape.

### Where a link layer is swapped in (`link.kspls`)

**`ksos/net`'s upper layers do not know what hardware they go through.** They need three things (send one frame, has one arrived, receive one), gathered into a struct `Link` of three function pointers. The caller (a demo) passes in the implementation it chose.

```kspls
link: = netlink.Link::{
  .send_frame = eth.send_frame, .rx_available = eth.rx_available, .recv_frame = eth.recv_frame,
}
conn: = tcpconn.make(link, ...)
```

**`net/mini_ipv4.kspls` holds not one import** (it only assembles and parses bytes). Only the three calls through `Link` in `net/tcp_conn.kspls` touch the hardware, so all of `ksos/net` is independent of the NIC.

**`Link` takes the shape of ksdb's `Store`**: a struct of function pointers rather than an interface, with no context pointer ("The place is swapped through a struct of function pointers" in [`ksdb/docs/DESIGN.md`](../../ksdb/docs/DESIGN.md)). It is also how ksos passes mbedTLS its bio callbacks. Every link layer is a per-file singleton, so add a context pointer only when something like two NICs of the same kind comes up (Principle 5).

## 🚗 The board: a Freenove 4WD car with a Pico W

**What ksos puts on the one real board.** The hardware's own facts (the pin assignment, the motors' polarity, the conversion formulae) are in [`SPEC-board.md`](SPEC-board.md), since they are not ksos's to decide. Bringing it up stage by stage, with what each probe prints, is in [`HOWTO-bring-up.md`](HOWTO-bring-up.md). This section holds ksos's part: where the board's code goes, and what each probe is for. Why wireless is not taken is in "🚫 What is out of scope, and why" below.

### What is in `boards/freenove_4wd_pico/`

**Only the things attached to this board, and how they are handled**, on top of the CPU layer ("The RP2040 port" above). It is the layer below the demos, using `ksos/drivers/` and used by `ksos/demo/`.

Caution: Do not make the reverse reference (pointing at a demo from here). Once the board knows a particular demo, it cannot be reused for another.

| File | What it holds |
| :-- | :-- |
| `board.kspls` | The pin assignment. Which GPIO has what attached |
| `motor.kspls` | The four wheels' driving control (composing a mecanum's motion) |
| `track.kspls` | The three reflective sensors for line tracking |
| `range.kspls` | The sense of the distance ahead (an HC-SR04) |
| `face.kspls` | The face (an 8×16 LED matrix) |
| `status.kspls` | The states' names and how they are shown (the report's line, and WS2812) |
| `cap.kspls` | Bringing the instruction sent to the wheels within the speed cap |

**Putting them together** (keeping the observations, bringing a distributed policy home) belongs to the demos (`ksos/demo/rp2040/common/`). It combines the console and the link, not what is attached to the board.

### What the self-driving probe does, and where its judgement lives

At start-up it takes one whole policy with `GET /api/pilot`, keeps it inside the device and disconnects. From then on, round after round, it reads the sensors, decides the next manoeuvre in the car, turns the four wheels and keeps the observation.

The policy and the observations live in **the record inside the device** (the last 64KB of Flash; "ksdb" in the root README). That lets it start with no upstream. Where the link cannot be raised, or kssrv is not running, it decides with the policy it took last time.

**It differs from the closed-loop version (`rp2040_car_loop_probe.kspls`) only in where the judgement lives.** That one asks the upstream on every observation, so it can decide nothing once the link goes. This one holds the policy and runs on without a link. The deciding is the same (the same weights, the same forward pass), so there are not two judgements.

**The safety timeouts are in the car, outside the policy.** They have to hold whatever the policy answers, and with no policy at all, and once the link drops nothing upstream can stop the car. Bringing the policy home does not change that. Which ones each firmware carries is in "The safety timeouts of each firmware" in [`HOWTO-bring-up.md`](HOWTO-bring-up.md).

**How it reads and steers:**

* **The distance is read once per control lap (100ms), and the line every 10ms.** An HC-SR04 measurement blocks up to 36ms and needs 36ms before the next, while the line is three GPIO reads. When the line moves mid-lap, only the steering is redone. It is not redone during the close-range reverse or while stopped, which are the safety timeouts' instructions.
* **The speed cap scales the triple as a whole.** Capped per component, a manoeuvre mixing forward and turning would turn harder than instructed.
* **The policy gets the median of the last three distance readings** (`range.steady_mm`), so one stray value does not make it dodge. Only the close-range timeout uses the raw reading (`emergency_mm`): a false alarm is safe, a miss is not.
* **The wheels need no tighter timing than 10ms.** `motor.drive` writes the PWM compare registers directly, and 500Hz PWM gives five periods per instruction. What is coarse is the outputs (the manoeuvre table's ten), not the timing.

**A long press on the remote prints the kept record to the console**, with no link and no PC. A record that can be kept but not read gives nothing to judge by.

**Only the first run needs the PC**, to take the policy from kssrv (stages 6e and 9 in [`HOWTO-bring-up.md`](HOWTO-bring-up.md)). Later runs start from the record.

### What the USB-Ethernet probe does, and what it needs on the PC

It runs three stages, in this order:

* (a) Enumeration and raising the link. It waits until it is enumerated as a composite device (CDC-ACM + CDC-NCM), the host chooses alt 1 for NCM's data interface, and the car's notification makes the link "connected". Until then, `ncm t= stage= alt= link=down` is printed every second.
* (c) The upper layers. It asks 192.168.137.1 for its MAC over ARP, raises TCP, and sends an HTTP GET and an MQTT CONNECT/PUBLISH. **`ksos/net/tcp_conn`'s `tcp_stream_send`/`recv` have their one real run here**; each QEMU probe tracks seq/ack itself.
* (b) Answering. It keeps answering the ARP requests and ICMP echoes addressed to the car. **A `ping` from the PC getting through is success.**

(c) comes before (b) because (c) ends once and (b) does not. (c)'s result is repeated on (b)'s line every second, so a Serial Monitor opened late still shows it.

**What the PC must provide** (the shared connection, an HTTP server and an MQTT stub) is in stages 6b and 6c in [`HOWTO-bring-up.md`](HOWTO-bring-up.md). With neither server up, (c) merely reports TIMEOUT, and (b)'s ping is unaffected.

There is no DHCP, so **the addresses are fixed** (`net_client.init_addrs`).

## 🤖 The AI on bare metal

**The policy is carried into the car and decided there.** Why, and the safety timeouts kept outside it, are in "What the self-driving probe does, and where its judgement lives" above. `ksos-cm-pilot-probe` and the car's firmware read one safetensors written into Flash with `embed` (the weights, the manoeuvre table and the preprocessing constants). They check the format's version and every tensor's shape, and decide the next manoeuvre inside the car alone:

* Caution: **Confirm the version before reading it.** The order of the features, the activation and what the manoeuvre table means cannot be told from a tensor's shape. The probe also tests that a truncated file is refused.
* **A tie goes to the smaller number (= stopping).** An observation where nothing can be measured and there is no line makes every feature 0, and so every logit. That really happens, so the probe's first case tests it.

**The car learns from its own record, and a falling loss is no evidence.** The policy decides what to do; the forward model (`ksos/demo/common/car_model.kspls`) guesses what happens if it does: the next round's three line bits, from the three now, the three a round before and the manoeuvre about to be made. The reflective sensors' reading one round later marks the guess.

**It guesses the line, not the distance ahead.** On a lap course the distance does not respond to the car's own motion. With nothing ahead it stays near 3000mm, and what moves it (the car's position and heading) is not among the net's inputs, so an object passing at the side does not help either. The line's three bits spread over 0 to 7 and move with the steering. What is decided about that learning:

* **Training the policy further on its own record learns nothing.** The record's manoeuvres are the ones that net chose, so training with them as the teacher converges on the net unchanged. The loss falls (the logits sharpen toward its own argmax), but the driving does not change. It looks alive and has no effect, so it is not built. What the PC cannot hold is how this car actually moves on this floor, and that is what is trained here.
* **The record as it stands is no training set for the policy either.** Lines a safety timeout drove (`safety=1`) are not the policy's choices, and after the cap the triple alone cannot tell them apart. That is why each line keeps that origin bit. The record keeps only laps where the triple changed, plus a heartbeat. So training on it unweighted imitates only the instants the car hesitated.
* **No teacher is needed.** The reflective sensors return the answer one round later (self-supervised), so neither a rule nor a way to ask the PC is needed. Copy a rule into the car, and the policy's net becomes an ornament.
* **The verdict is "the prediction started being right", not "the loss fell"**, which always happens with its own output as the teacher. The probe gives the answer from outside: a function standing in for the floor, whose content the net cannot see. It asks that the missed bits decrease, and below answering "the same as the previous round" (`base_permille`). A decrease alone may only mean an easier stretch of floor.
* **On a real floor the answer is not in its input.** The car's position on the course and its heading decide the next bits, while the net sees only the bits and the manoeuvre. Where the line barely moves between rounds, the net can learn at best "no change". A draw with the baseline means exactly that.
* **A round spent stopped asks no question.** What is guessed is the result of its own movement, and when stopped there is none. Included, it breaks two ways. Where stopping is the majority, it learns "stop and nothing changes" and the error drops to 0: it looks trained and has learned nothing. And a bit that changes while stopped is an outside touch, noise the net's input cannot explain.
  * Caution: **So "the error is 0" is no evidence that it holds** (look at the steps trained first).
  * **A round whose steering was redone mid-round is dropped too** (`forget` in `car_model`), since the instruction asked about is not the one that moved the car. A round a safety timeout drove is learned from: the net predicts the floor's response, whoever decided.
* The trained weights are left in ksdb as raw bytes, and the next start-up carries on from them. **Put the scale (the speed cap), the net's shape and the layout's version into the run, and refuse anything that disagrees.** The shape would match, so a wrong run used silently goes wrong without a sign. The run is understood by this chip alone (the F32s are copied unchanged, so it cannot be moved to a PC).
* **Leave how far it has got (the steps, the net's miss and the baseline's) beside the weights.** A device may run with neither a link nor a console. There, that value, read at the next start-up with a connection, is the only thing that says how far it got. With the weights alone, nothing outside can confirm whether the training progresses.

**What puts `ksai` on the kernel core's malloc-free footing:**

* **The `cfg(freestanding)` branches of `panic`/`alloc`/`dealloc`/`mem.copy`**, turned on by `--freestanding`. `panic` (`std/lang.kspls`) touches no libc and stops deterministically, with diagnostics only through `panic_hook` (null by default). `alloc`/`dealloc` assume no global heap and panic at once if called by mistake. `mem.copy` is a plain byte loop, not `memcpy`.
* **The `cfg(freestanding)` versions of `std/math`** (sqrt/exp/log/sin/cos/tan/pow). With no libm either, they are software implementations with no dependency (the methods are at the top of `std/math.kspls`). `make test-freestanding-math` checks them against a real libm to a relative error under 1e-9 (`tests/freestanding/probe.kspls` plus `tests/freestanding/harness.c`).
* **`--gc-sections` (with `-ffunction-sections -fdata-sections`)** removes at link time the libc references that `std/sys`, `std/io`, `std/str` and the rest bring in through the import graph but never call.
* **`arm-none-eabi`'s `libgcc`** joins the final link (the `nofp` build matching the core, from `apt install gcc-arm-none-eabi`). F32/F64 arithmetic compiles to software floating point on Cortex-M (`__aeabi_fadd` and the rest).
* **`memcmp`/`__aeabi_memclr*`/`__aeabi_memcpy*` in `std/mem`**, as pure algorithms. libgcc has no body for the `libc.memcmp` that `std/json` calls to parse safetensors' header, or for the AAPCS calls clang generates for zero-initialization and struct copies.
* **`std/ds`'s bounds check is not split by `cfg`.** It builds the message with `Panic_msg` (`std/lang.kspls`), so with neither allocation nor libc the same `index out of bounds in List.get (idx: 5, len: 1)` as hosted is printed. `io.err()` would make the cycle `ds → io → str → ds`, and code merely using a `List` would pay for all of `io` and `str`.

## 🧭 The guidance for adding an API or an implementation

**ksos does not let its primitives, build-time flags and implementations multiply.** No mechanical check can force this, so these are the checklist to put to yourself whenever an extension is considered.

* **Do not add a synchronizing primitive lightly.** FreeRTOS's Task Notification overlaps its semaphore, queue and event group, so more than one of them fits the same job and nothing decides which to use. For a new primitive, first consider whether a combination of `Sem`/`Queue<|T|>`/`Mutex`/`Event` expresses it. Even where it cannot, tidy up or merge the overlapping primitives first, then add.
* **Do not mix the roles of `Queue<|T|>` and `Ring<|cap|>` in `std/ring.kspls`.** In both, one end puts in and the other takes out, but they suit different situations, so they are not merged.

  | | `Queue<\|T\|>` (ksos) | `Ring<\|cap\|>` (std) |
  | :-- | :-- | :-- |
  | waiting | blocks on empty/full (it needs the scheduler) | never; it returns how much went in and how much came out |
  | the unit | one element | **a run of bytes together** |
  | taking out | a copy of the value | **a slice pointing inside** (`peek()`; no copy) |
  | locking | its own | **the caller's responsibility** |
  | where it can go | between ksos's tasks | between an ISR and a task, before the scheduler starts, on a host |

  **Do not add a `peek` or a bulk API to `Queue`.** Its role would overlap `Ring`'s, and the reader could not decide which to use (the opposite prohibition is in `std/docs/DESIGN.md`). Bytes streamed from an interrupt handler go through `Ring`; a typed value waited for between tasks goes through `Queue`.
* **Do not add a build-time configuration flag.** FreeRTOS's `FreeRTOSConfig.h` grew to a hundred `config...` macros, and a missed setting (`configASSERT` left unconfigured) leaves a fault with no diagnostic. ksos is limited to the single axis `#cfg(freestanding)`. For a new build-time branch, first consider whether that axis expresses it. Where one is added even so, leave its reason in a comment near the code.
* **`pub` stands as a promise to whoever builds on ksos; counting references does not decide it.** The `pub` items in the kernel, the drivers and the board (`Task`, `Event`, `gpio.read`, `rtc.Date_time` and their kind) are what that work calls.
  * **Do not remove one because nothing outside this unit refers to it.** The only users are the demos and the board, both inside `ksos/`, so counting references says it is not needed. The same rule is in "Whether `pub` is needed is not settled by walking the references" in `std/docs/DESIGN.md`.
  * **`ksos/demo/` is the reverse: it has no `pub` at all.** It holds the entry points and their shared parts, and no package imports it, so a `pub` widens nothing. `make test-conventions` watches it; why a diagnostic cannot is in "13.1 A test inspecting the inside of a unit goes inside that unit" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md).
* **Do not hold several allocator implementations.** FreeRTOS has the user choose from `heap_1` to `heap_5`, and a choice that does not fit the use fragments the heap. ksos uses only `std/mem.kspls`'s single implementation (a free list, joining neighbors). A new allocation policy extends it rather than adding another to choose from.

## 🚫 What is out of scope, and why

**It assumes a single core (core0).** The atomics already hold between cores, so starting core1 needs no fix to the runtime. What it does need is in [`ksos/docs/PLAN.md`](PLAN.md).

**Hardware checks cover only the RP2040**, which QEMU does not model. The bare metal seen under QEMU is `mps2-an385` (Cortex-M3) alone. There is no port or driver for a real Cortex-M33 chip (a Renesas RA6M4, or a Raspberry Pi Pico 2 W / RP2350); one is in [`ksos/docs/PLAN.md`](PLAN.md).

### TLS

**TLS is out of scope: a decision, not a queue position.** The PC's TLS goes through FFI to OpenSSL to avoid the risk of our own implementation. Nothing makes the case for writing our own on thinly checked freestanding code. With no wireless, the only link is a USB cable to one PC, so there is nobody to guard against.

**The place to connect one is ready**: `tcp_stream_send`/`tcp_stream_recv` in `net/tcp_conn.kspls` are `#export`ed with the signatures of mbedTLS's `mbedtls_ssl_send_t`/`mbedtls_ssl_recv_t`.

### WiFi (CYW43439) — not implemented in this design

**This arrangement implements no wireless link: a decision, not a place in a queue.** There are three reasons:

1. **The license conflicts with what this repository states** (the table below), and effort cannot buy that back.
2. **Almost no reason for wireless is left.** The car holds the policy inside the device, so it runs on the battery alone, with no PC (stage 9 in [`HOWTO-bring-up.md`](HOWTO-bring-up.md)). Wireless would add only watching from a distance while it runs, and reading the record afterwards (stage 8) gives the same content.
3. **It shows no more technique.** The USB device stack that exists (a composite CDC plus NCM device, `ping` getting through on the real board) is the harder thing to make. Wireless is one more implementation of `Link`.

**It is not "because wireless is hard".** The place to swap it in (`Link` in `ksos/net/link.kspls`) is ready: three functions that put frames in and out make the upper layers work unchanged. Filling it is a judgement of license, and of cost against effect:

* The CYW43439 is a chip apart from the RP2040, on a dedicated serial link (its own protocol, using PIO). It needs firmware transferred to it (some hundreds of KB), plus control and event handling on top.
* **Delegating to `cyw43-driver` over FFI moves the heavy parts outside**: the firmware transfer, the WiFi protocol, the CLM. That leaves ksos the PIO driver, the HAL glue and the link layer. But it needs a bus layer driving half-duplex SPI with PIO, and ksos has no PIO driver. Linking `pico_cyw43_arch` whole brings async_context and the rest, a second execution environment beside ksos's scheduler, so only the lower `cyw43-driver` would be taken. With `CYW43_LWIP=0`, raw 802.3 frames come up through `cyw43_cb_process_ethernet` and work with `mini_ipv4` unchanged.
* The license differs in kind from the existing external dependencies. `cyw43-driver` is dual-licensed. Its `LICENSE` says "for personal benefit only, not commercial", and its `LICENSE.RP` says "only in combination with Raspberry Pi-made silicon such as the RP2040". The firmware blob carries no license of its own and comes under the same terms. **Neither can be shipped inside an MIT tree.**

  | The dependency | The license | The obligation on the user |
  |---|---|---|
  | OpenSSL / mbedTLS | Apache-2.0 | Attribution only |
  | SQLite | Public domain | Effectively none |
  | **cyw43-driver** | **Non-commercial only, or RP2040 only** | **A restriction on the use and the hardware** |

  Delegating over FFI instead of vendoring keeps the repository MIT, but **what a user builds is a combined work under those restrictions**. No existing dependency carries such an obligation. It would also break the root README.md's statement that the repository is "free to modify, redistribute and use commercially alike". Taking it on would have to be said plainly.

#### The candidates for a link layer — how to connect wireless (what the research found)

**This is the comparison for whoever adds a wireless link.** Only something that puts raw 802.3 frames in and out works with `Link`. A scheme with TCP/IP on the other chip (ESP-AT's AT commands, WiFiNINA / ESP32SPI's socket API) communicates once connected, but leaves `ksos/net` without a role, so it is not a candidate.

| the candidate | the license | the bus | GPIO needed | measured throughput | PIO |
|---|---|---|---|---|---|
| USB Ethernet (the CDC-NCM part of `rp2040/usb_cdc`) | — (our own) | USB | none added | 6–8 Mbps effective | not needed |
| the CYW43439 (built into a Pico W) plus `cyw43-driver` | **non-commercial only / RP2040 only** | half-duplex SPI | built in | — | **needed** |
| ESP-Hosted-MCU plus an ESP32 (standard SPI) | Apache-2.0 | full-duplex SPI | **6 plus Reset** | udp 24 / tcp 22 Mbps | not needed |
| ESP-Hosted-MCU plus an ESP32 (UART) | Apache-2.0 | UART | **2 plus Reset** | udp 0.68 / tcp 0.67 Mbps | not needed |

The GPIO counts and throughputs are Espressif's own, from the transport comparison table in the [esp-hosted-mcu README](https://github.com/espressif/esp-hosted-mcu).

Note: USB Ethernet fills `Link` with **zero extra parts and zero extra GPIO**. So it is the base for running the upper layers all the way through on real hardware before any wireless (stage 6 in [`HOWTO-bring-up.md`](HOWTO-bring-up.md)). Being a cable, it is not a running car's final form.

**ESP-Hosted is a candidate for two reasons.** Its license is Apache-2.0, the same "attribution only" as mbedTLS's and OpenSSL's, restricting neither use nor hardware. And its data path stays 802.3 (TCP/IP stays on the host and only frames cross the bus), so it fits `Link`'s three function pointers unchanged.

**Three things stand in the way.** The only host-side port is for an ESP chip plus FreeRTOS (the seam is `host/esp_hosted_os_abstraction.h`, with no worked example on another MCU). The coprocessor's firmware must be built from ESP-IDF (no binary is distributed). And the control path (scan, connect and the rest) is protobuf-c RPC. That leaves FFI to protobuf-c, encoding the few messages by hand, or writing the credentials into the slave and only bridging frames.

**What ksos would need, whichever path**: an `rp2040_spi` or `rp2040_uart` driver (about the size of `rp2040/i2c`), ESP-Hosted's transport layer (the fixed 1600-byte transactions, the payload header, waiting on Handshake / Data Ready), and a thin connection to `Link`.

#### The ESP32 coprocessor idea does not fit onto this car over SPI

ESP-Hosted (an ESP32 as a communications coprocessor, Apache-2.0) avoids the CYW43439's license and fits `Link` ("The candidates for a link layer" above). But **this car's free GPIO are only 17 and 22**, which the RP2040's pin multiplexing allows to be only `SPI0_SS_N` and `SPI0_SCLK`. Standard SPI asks for seven lines (MISO/MOSI/SCLK/CS plus Handshake, Data Ready and Reset), so one of the motors, the servos, the WS2812 or the IR would have to come off. The UART version fits in TX/RX (GPIO 0/1) plus Reset, but tops out at 0.68 Mbps. Where speed is needed, a bare Pico plus an ESP32 development board is simpler than the car.

**Over UART, the data lines are on P7, not P6.** The `[17]` and `[22]` on the board's terminals are GPIO numbers, not the pinout diagram's physical pins 17/22 (GP13/GP17) ([`SPEC-board.md`](SPEC-board.md)). GP22 has no UART function (only SPI0 SCK / I2C1 SDA / PWM), and GP17 can only become UART0 RX. So P6 alone cannot give TX.

| What is used | GPIO | The terminal |
|---|---|---|
| UART0 TX / RX | 0 / 1 | **P7** (`NC / GND / [1] / [0]`. The official table's "serial port") |
| The module's RESET | 17 or 22 | **P6** |
| Power | VCC / GND | **P6** |

**Measure P6's VCC (its voltage and its current capacity) before using it.** An ESP32 uses some hundreds of mA while transmitting.

Caution: **Do not write the SSID and the password into the source.** The Arduino sample writes them in directly (`char ssid_Router[] = "..."`). Copying that puts credentials into the repository, where they cannot be removed from the history. Use a separate file that is `.gitignore`d, or pass them with `--define` at build time.
