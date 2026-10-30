# ksos

ksos is Kanso OS, a small real-time operating system (RTOS) written entirely in KSPL. It schedules tasks by priority and supports cooperative yield, preemption, semaphores, message queues, mutexes, and event flags. The same kernel runs on Linux and directly on microcontrollers with no other operating system under it (*bare metal*). ksos also controls a small robot car.

This guide assumes no RTOS knowledge; [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) explains the design and the checks behind each make target.

## Run it

The POSIX demo needs only `clang`: no ARM cross compiler and no QEMU (an emulator of a microcontroller).

```sh
make ksos   # on a POSIX host, runs the demo where two tasks (producer/consumer) cooperate on a semaphore
```

The producer creates five items, with `Task.delay` between them. The higher-priority consumer takes each item immediately. Both tasks finish, then `start_scheduler()` returns.

```
=== Kanso OS (POSIX port) — producer/consumer demo ===
[producer] produce 10 (tick=0)
[consumer] consume 10 (tick=0)
[producer] produce 20 (tick=2)
[consumer] consume 20 (tick=2)
...
[consumer] done
[producer] done
=== scheduler finished (all tasks done) ===
```

The local [`Makefile`](Makefile) builds and tests a copy of this folder alone (`make test` and the targets below); its header lists what it needs. The root's targets of the same names use the repository compiler.

## The idea

An RTOS does two things:

1. **Scheduling** selects the next task by priority. A task behaves like a thread. Switching tasks restores the selected task's CPU registers, called its context.
2. **Synchronization** lets tasks wait for conditions and share resources exclusively through semaphores, queues, mutexes, and event flags.

The table maps each RTOS word to everyday words and to the name in the code. Task states are in [the scheduler design](docs/DESIGN-rtos.md#-what-sets-the-scheduler-apart).

| RTOS term | In everyday words | In KSPL |
|---|---|---|
| TCB (task control block) | one task's state (priority, stack, run state) | `Task`, allocated statically by the caller |
| the scheduler | picks which task runs next | `pick_next` / `schedule` |
| a context switch | swaps the CPU registers to change task | `ksos_port_switch`, which the port implements |
| a cooperative yield | A task voluntarily releases the CPU | `Task.yield()` |
| preemption | A timer interrupt forces a task switch | `enable_preemption()` + `ksos_tick()` |
| blocking | a task sleeps until a condition holds | `block_current` / `block_and_rearm` |
| a tick | A periodic timer event that counts delays and timeouts | `ksos_tick()` |
| a semaphore | a counter of available things: `take` waits while it is 0, `give` adds one | `Sem` (`ksos/kernel/sync.kspl`) |
| a message queue | A fixed-size queue for sending values between tasks | `Queue<\|T\|>` (`ksos/kernel/sync.kspl`) |
| a mutex | a lock only one task holds at a time | `Mutex` (`ksos/kernel/sync.kspl`) |
| priority inheritance | A waiting task raises the lock holder's priority | `Mutex` (`ksos/kernel/sync.kspl`) |
| an event flag | waits on an AND/OR of several bits | `Event` (`ksos/kernel/sync.kspl`) |
| tickless idle | with nothing to do, moves **logical** time to the next delay's expiry | the fallback inside `pick_next` |
| a port | the part per architecture: context switching, the timer, interrupt control | `ksos_port_*` |
| an interrupt handler (ISR, interrupt service routine) | Code that interrupts a task to handle a hardware event | `ksos_port_in_isr()` tells it apart |
| a critical section | Code that runs with interrupts disabled | `irq_save()` / `irq_restore(state)` |

The kernel allocates no memory and needs no `malloc`: the caller supplies tasks, stacks, and queue buffers statically (`tcb_p` and `stack_p` in `ksos/demo/posix/producer_consumer.kspl`).

## What is here

| Folder | What it holds |
| :-- | :-- |
| `ksos/kernel/` | The scheduler and the synchronizing primitives, with neither hardware nor libc |
| `ksos/port/` | One folder per architecture and OS: the context switch, the timer and the boot |
| `ksos/drivers/` | Drivers reading and writing a microcontroller's registers directly |
| `ksos/net/` | A minimal network stack (ARP, IPv4, UDP, TCP) |
| `ksos/boards/` | Connections between components on a board |
| `ksos/demo/` | The demos, one firmware each; the POSIX and Cortex-M ones are tests too |
| `ksos/tests/` | The unit tests, the USB descriptors read as text, and elf2uf2 (which makes firmware files for real chips) |
| [`ksos/docs/`](docs/) | Design, board specifications, and setup instructions; see “Further reading” below |

Imports follow this order: `kernel` < `drivers` < `boards` < `demo`. A folder can import only lower layers, since a driver importing a board would serve that board alone. `net` is beside `drivers`, needs neither the kernel nor hardware, and only `demo` uses it. `make test-conventions` enforces this order.

## Reading order

Read from the bottom of the dependencies up, so each file's prerequisites come first. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) gives the reasons behind each part.

### Tasks and scheduling: `ksos/kernel/task.kspl`

- `Task.create(stack, entry, arg, prio, name): Bool` fills the receiving task (`tcb.create(...)`) on a stack slice such as `U8$[]::stack_a`. Larger `prio` values mean higher priority; 0 is the idle task's. At `max_tasks` it returns `false`.
- `start_scheduler()` runs the tasks until all end or one calls `stop_scheduler()`. `run_single_task(tcb, stack, entry, name, on_idle)` runs one task for `ksos_main`, then loops on `on_idle`.
- `Task.yield()`, `Task.delay(ticks)` and `Task.delay_until(wake_tick)` give way; ticks are logical time. `Task.suspend()`, `Task.resume()` and `Task.delete()` act on another task.
- `irq_save()` and `irq_restore(state)` disable and restore interrupts around a critical section.
- A *canary* at the lowest stack address, checked by every `schedule()`, turns an overflow into the panic `ksos: stack overflow detected`.
- The nine `ksos_port_*` functions declared `extern "C"` are the kernel's entire interface to the port.

### Synchronization: `ksos/kernel/sync.kspl`

- `Sem` (`take`/`give`), `Queue<|T|>` (`send`/`recv`), `Mutex` (priority-inheriting `lock`/`unlock`) and `Event` (`wait`/`set` on `.all` or `.any` of bits).
- The plain form waits until woken, `try_` returns at once, and `_for(ticks)` times out.
- Interrupt handlers can call only operations that do not wait: `give`, `set`, and `try_*`.

### Heap allocation and task management

- `ksos/kernel/heap.kspl` provides `heap_alloc` and `heap_free`, the freestanding heap of `std/mem.kspl` made safe from tasks and interrupt handlers.
- `ksos/kernel/dynamic.kspl` adds heap-allocated creation and deletion (`Task.create_dyn`, `t.delete_dyn()`; the full list is in [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md#-what-sets-the-scheduler-apart)).
- `enable_idle_task(stack, hook)` in `ksos/kernel/task.kspl` adds a priority-0 task that calls `hook` when nothing else can run.
- Task managers use `t.cpu_percent()`, `Task.get_prio`, `get_name`, `get_state`, `Task.count`, and `Task.at` (`make ksos-task-manager`). Heap usage comes from `heap_used_bytes` and `heap_peak_used_bytes` in `std/mem.kspl`.

### Ports: `port/posix/`, `port/cortex_m/`, `port/cortex_m0/`, `port/rp2040/`, `port/nrf51/`

Each port implements the nine `extern "C"` functions declared in `ksos/kernel/task.kspl`. Start with `ksos/port/posix/` (`make ksos`), which needs no special tools. What each port runs on, and how it is checked, is "🔌 The ports" in [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md). Only the RP2040 car has real-chip confirmation.

### Worked examples: `demo/`

Each file directly inside `demo/<port>/` must be a standalone demo with `ksos_main`. `demo_stems` in `ksos/Makefile` derives the demo list from that directory, so a file without this entry point fails to link.

| Place | What is in it |
| :-- | :-- |
| `demo/<port>/` | that port's demos; one firmware image per file |
| `demo/<port>/common/` | parts only that port's demos share (the RP2040's USB CDC console, …) |
| `ksos/demo/common/` | Shared components: a semihosting console that prints through QEMU's debugger, and a reader for received policies |

One demo per feature. The POSIX ones need no special tools:

| The demo | The make target | What it demonstrates |
|---|---|---|
| `ksos/demo/posix/producer_consumer.kspl` | `make ksos` | cooperating on a semaphore (run in "Run it" above) |
| `ksos/demo/posix/msgq_demo.kspl` | `make ksos-mq` | a message queue blocking when full |
| `ksos/demo/posix/mutex_demo.kspl` | `make ksos-mutex` | exclusive holding with a mutex |
| `ksos/demo/posix/mutex_nested_demo.kspl` | `make ksos-mutex-nested` | Two mutexes released in either order, with inheritance kept through the one still held |
| `ksos/demo/posix/wake_preempt_demo.kspl` | `make ksos-wake-preempt` | A higher-priority task woken by `give`, `unlock`, `send`, `set`, or `resume` runs before the waker continues, with no timer |
| `ksos/demo/posix/wake_pass_on_demo.kspl` | `make ksos-wake-pass-on` | A woken waiter deleted or suspended before it runs passes the wake on |
| `ksos/demo/posix/event_demo.kspl` | `make ksos-event` | Waiting for all or any bits. One `set` releases three waiters, each clearing the bit on exit |
| `ksos/demo/posix/posix_preempt_demo.kspl` | `make ksos-preempt` | timer-driven preemption |
| `ksos/demo/posix/delay_until_demo.kspl` | `make ksos-delay-until` | a period with no drift, via `Task.delay_until` |
| `ksos/demo/posix/lifecycle_demo.kspl` | `make ksos-lifecycle` | `Task.suspend`/`Task.resume`/`Task.delete` |
| `ksos/demo/posix/panic_demo.kspl stack-overflow` | `make ksos-stack-overflow` | the canary catching a stack overflow |
| `ksos/demo/posix/isr_signal_demo.kspl` | `make ksos-isr` | `Queue<\|T\|>.try_send` from an ISR (SIGUSR1 stands in for the interrupt) |
| `ksos/demo/posix/sleep_demo.kspl` | `make ksos-sleep` | With every task waiting on an interrupt, CPU time shows the scheduler sleeps |
| `ksos/demo/posix/task_manager_demo.kspl` | `make ksos-task-manager` | Heap-allocated tasks and queues, and `Task.cpu_percent` following each task's load |
| `ksos/demo/posix/kernel_check.kspl` | `make ksos-kernel-check` | Wake order, suspension and deletion while waiting, lent priority taken back, the task limit |
| `ksos/demo/posix/panic_demo.kspl mutex-relock` | `make ksos-mutex-relock` | Relocking a held mutex panics instead of waiting forever |
| `ksos/demo/posix/panic_demo.kspl mutex-foreign-unlock` | `make ksos-mutex-foreign-unlock` | Unlocking another task's mutex panics |
| `ksos/demo/posix/panic_demo.kspl delete-holder` | `make ksos-delete-holder` | Deleting a mutex holder panics instead of leaving the lock held forever |
| `ksos/demo/posix/timeout_demo.kspl` | `make ksos-timeout` | Every `_for` timeout, oversized timeouts, immediate `try_take` and `try_lock`, and `ms_to_ticks` rounding up |
| `ksos/demo/posix/panic_demo.kspl timeout-zero` | `make ksos-timeout-zero` | A zero timeout panics instead of acting like `try_` |
| `ksos/demo/posix/panic_demo.kspl event-no-bits` | `make ksos-event-no-bits` | Waiting for no event bits panics instead of waiting forever |
| `ksos/demo/posix/panic_demo.kspl stop-outside` | `make ksos-stop-outside` | `stop_scheduler` with no running scheduler panics |
| `ksos/demo/posix/tick_mid_switch_demo.kspl` | `make ksos-tick-mid-switch` | A tick delayed across a switch into a new task, and thousands of starts under a tick every 30 μs |
| `ksos/demo/posix/dyn_race_demo.kspl` | `make ksos-dyn-race` | Three tasks create and delete heap-allocated tasks under a tick every 100 μs; each returns to the heap exactly once |

For a `panic_demo` target, the expected panic is the pass.

The Cortex-M demos need a cross compiler and QEMU, both in the development container. `make test-ksos-qemu` runs them all. `make ksos-cm` builds `cortex_m_min.kspl` and checks its vector table and PendSV with objdump; the other targets build and run together.

Each runs on QEMU's `mps2-an385` (a Cortex-M3). Those that fit 16 KB of RAM and need no atomics also run on the Cortex-M0 layer, under QEMU's micro:bit. There each task has a 1 KB stack.

| The demo | Cortex-M3 target | Cortex-M0 target | What it demonstrates |
|---|---|---|---|
| `ksos/demo/cortex_m/cortex_m_min.kspl` | `make ksos-cm-run` | `make ksos-cm0-min` | Cooperative scheduling on bare metal: priority order regardless of registration, `Task.delay` and `Task.yield` |
| `ksos/demo/cortex_m/cortex_m_preempt.kspl` | `make ksos-cm-preempt` | `make ksos-cm0-preempt` | SysTick preempts two tasks that never yield; each keeps its r4–r11 (on the M0, moved by way of r4-r7) |
| `ksos/demo/cortex_m/cortex_m_pi.kspl` | `make ksos-cm-pi` | `make ksos-cm0-pi` | Priority inheritance gets a high-priority requester the lock despite a medium task that never yields |
| `ksos/demo/cortex_m/cortex_m_event.kspl` | `make ksos-cm-event` | `make ksos-cm0-event` | a barrier of event flags: three workers' bits raised under preemption, and clear-on-exit |
| `ksos/demo/cortex_m/cortex_m_mq.kspl` | `make ksos-cm-mq` | `make ksos-cm0-mq` | a queue under preemption (the critical section) |
| `ksos/demo/cortex_m/cortex_m_timeout.kspl` | `make ksos-cm-timeout` | `make ksos-cm0-timeout` | SysTick alone carrying `take_for`'s timeout while a spinner that never yields holds the CPU |
| `ksos/demo/cortex_m/cortex_m_isr_block.kspl` | `make ksos-cm-isr-block` | `make ksos-cm0-isr-block` | `Sem.take` in an interrupt handler panics, even with a positive count (panic = pass) |
| `ksos/demo/cortex_m/cortex_m_isr_unlock.kspl` | `make ksos-cm-isr-unlock` | `make ksos-cm0-isr-unlock` | `Mutex.unlock` in an interrupt handler panics (panic = pass) |
| `ksos/demo/cortex_m/cortex_m_isr_give.kspl` | `make ksos-cm-isr-give` | `make ksos-cm0-isr-give` | Two gives in one handler: the woken tasks run as it returns, highest first, and PendSV saves the task really running |
| `ksos/demo/cortex_m/cortex_m_stack_guard.kspl` | `make ksos-cm-stack-guard` | `make ksos-cm0-stack-guard` | A damaged canary panics at the next preempting switch (panic = pass) |
| `ksos/demo/cortex_m/cortex_m_panic_probe.kspl` | `make ksos-cm-panic-probe` | `make ksos-cm0-panic-probe` | a panic's crash record read back across a real soft reset (AIRCR, which Armv6-M has too) |
| `ksos/demo/cortex_m/cortex_m_heap_probe.kspl` | `make ksos-cm-heap-probe` | — | The freestanding heap and `Arc<T>` with no OS; 120 tasks reuse the port's 33 contexts |
| `ksos/demo/cortex_m/cortex_m_ai_probe.kspl` | `make ksos-cm-ai-probe` | — | `ksai` inference (a whole `Transformer_block`) on bare metal, matching the host's numbers |
| `ksos/demo/cortex_m/cortex_m_ai_train_probe.kspl` | `make ksos-cm-ai-train-probe` | — | On-device LoRA training, with `Lora.save_raw` and `load_raw` |
| `ksos/demo/cortex_m/cortex_m_ai_weights_probe.kspl` | `make ksos-cm-ai-weights-probe` | — | real weights (a safetensors made a static array by `embed`) read with zero copies and no filesystem |
| `ksos/demo/cortex_m/cortex_m_control_ai_probe.kspl` | `make ksos-cm-control-ai-probe` | — | a control loop and continuing AI inference side by side, undisturbed |
| `ksos/demo/cortex_m/cortex_m_pilot_probe.kspl` | `make ksos-cm-pilot-probe` | — | A received policy selects the next manoeuvre locally |
| `ksos/demo/nrf51/nrf51_wfi.kspl` | — | `make ksos-nrf51-wfi` | Every task waits while the scheduler sleeps with `WFI`; the nRF51 timer interrupt gives the semaphore |

#### How far CI looks, per port

CI coverage differs by port, so deleting a demo can remove a check:

| Place | What CI does | Checking on the real board |
| :-- | :-- | :-- |
| `ksos/demo/posix/` | runs every one; `assert` stops a failing path (`make test-ksos-posix`) | not needed |
| `ksos/demo/cortex_m/` | runs every one under QEMU (`make test-ksos-qemu`), on the Cortex-M3 and, for those that fit, the Cortex-M0 too | not needed |
| `ksos/demo/nrf51/` | runs every one under QEMU (`make test-ksos-qemu`) | not needed (QEMU's chip only) |
| `ksos/demo/rp2040/` | links only (`make test-ksos-link`); QEMU has no RP2040 | a person flashes it |

Every demo run by `make test-ksos-posix` or `make test-ksos-qemu` has a time limit, `KSOS_RUN_CAP` in `ksos/Makefile`. A hung demo fails with `[FAIL] ksos-<demo> did not finish in <N>s: it hung (timeout killed it)`. On a slow machine, raise it with `make test-ksos-posix KSOS_RUN_CAP=120`.

Keep one demo per feature: combined, a failure hides which feature broke.

**A demo passes only after all checks finish.** It must exit with status 0, print no failure marker, and print `RESULT: ALL PASS` once every check has run. `ksos_run_gate` in `ksos/Makefile` enforces this; a message such as “OK” counts as no check.

* A POSIX demo uses `assert` for unexpected results and ends `main` with `verdict.finish()`. A lost wake, deadlock, or missing timeout leaves the scheduler asleep, so the time limit fails the run.
* A Cortex-M demo reports with `con.check`, then finishes with `con.print_summary` and `con.exit` ([`ksos/demo/common/semihost_console.kspl`](demo/common/semihost_console.kspl)). No checks, an early exit, or a panic fails both the result and QEMU's exit status.

#### The RP2040's demos come three ways

Every RP2040 demo is a separate small firmware, so a fault can be narrowed down. The groups below follow the flashing order; stage 1 of [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md) explains flashing. `make ksos-rp2040` alone produces only the `.elf`.

**The first step** confirms that ksos runs on the real chip.

| The make target | What it confirms |
| :-- | :-- |
| `make ksos-rp2040-buzzer` | that the flashed firmware starts running; the buzzer is the output device (semihosting is unavailable) |

**Board checks** use USB with the car on the desk. Repeat them when a fault occurs.

| The make target | What it confirms |
| :-- | :-- |
| `make ksos-rp2040-board` | USB CDC console, RTC, allocation, and atomics on the SIO spinlock. Flash log, battery, light, line, ultrasound and IR sensors, LED matrix (`ht16k33`) and WS2812. Each stage is a file in [`ksos/demo/rp2040/board_probe/`](demo/rp2040/board_probe/) |
| `make ksos-rp2040-motor` | PWM on all four wheels. Test with the wheels off the ground. |
| `make ksos-rp2040-net` | USB Ethernet through CDC-NCM: ARP, then TCP and HTTP, while answering ARP and ping |

**Combined checks** exercise the components together:

| The make target | What it confirms |
| :-- | :-- |
| `make ksos-rp2040-car-pilot` | The car receives a policy and disconnects. It then makes decisions locally. |
| `make ksos-rp2040-car-ir` | driving it with a remote |

The images link different code: `board` and `net` use LED matrix I2C, RTC, ARP/ICMP, atomics and 64-bit shift helpers, which `car-pilot` lacks. Only `car-ir` uses `__aeabi_llsr` and `__lshrdi3`. The link gate checks each image's symbol dependencies.

### Drivers, networking, and AI: `drivers/`, `net/`, `boards/`

These components support embedded devices. They are optional for a first reading; [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) describes each.

- `ksos/boards/` defines the wiring of a Freenove 4WD mecanum car with a Pico W, above the CPU ports and drivers. It supports Phase 3 of [What works, and how far](../README.md#-what-works-and-how-far). [`ksos/docs/SPEC-board.md`](docs/SPEC-board.md) defines wiring, and [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md) explains setup.

- `ksos/drivers/` accesses memory-mapped (MMIO) registers directly: GPIO, PWM, clocks, ADC, I2C, USB CDC, and others.

- `ksos/net/` provides a minimal network stack: `ksos/net/tcp_conn.kspl` implements TCP above `ksos/net/mini_ipv4.kspl` (ARP, IPv4, and UDP without fragmentation).

- `ksai` runs beside a control loop without `malloc`, as the Cortex-M AI demos show. [ksai](../ksai/README.md) introduces the engine.

- A freestanding panic saves a crash record in `.noinit_panic`, RAM that the linker scripts (`ksos/port/*/link.ld`) reserve without zeroing. After a warm reset, `take_panic_record` in `std/lang.kspl` reads the record once. `make ksos-cm-panic-probe` tests a watchdog reset, a panic, and a soft reset (`system_reset()` in `ksos/drivers/cortex_m/scs.kspl`).

## Pitfalls

These errors can break a port or its synchronization:

| The trap | What goes wrong | What to do |
| :-- | :-- | :-- |
| **Unexpected libc dependencies on bare metal**; see [`std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md) | A new libc call in `std` can break a bare-metal build, even without an explicit application call | Provide a `cfg(freestanding)` implementation. `make test-ksos-link` checks links. `make test-ksos-qemu` detects startup failures |
| **Linking `ksos-cm*`/`ksos-nrf51*`/`ksos-rp2040*` needs arm-none-eabi's libgcc** | The link fails without it | Use the development container, which has it |
| **Shared state outside a critical section**, including task fields | Interrupts and preemption cause races, such as lost wakes. `block_current` and `block_and_rearm` require the caller to hold a critical section | Access shared state within `irq_save` and `irq_restore` |
| **The POSIX signal mask** | Blocking `SIGALRM` for good stops preemption. A tick during a switch mixes the old stack with the new task, which can hang | Leave signal masks to `ksos_port_switch` and `ksos_task_start` in `ksos/port/posix/ksos_port_posix.c` (“Preemption” in [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md)) |
| **Cortex-M context frames** | A mismatch between saved and initial frames loads the wrong registers, `pc` included | Keep `ksos_port_ctx_create` consistent with `ksos/port/cortex_m/switch.S` and `ksos/port/cortex_m0/switch.S` (below) |

On Cortex-M, `PendSV_Handler` saves 16 words on the task's stack: r4–r11, then the eight hardware-saved registers r0–r3, r12, lr, pc, and xPSR. `ksos_port_ctx_create` builds this same frame for a new task.

## What has been checked on real hardware

This table is the canonical record of checks on the real car: a Freenove 4WD car with a Raspberry Pi Pico W ([`ksos/docs/SPEC-board.md`](docs/SPEC-board.md)). Only someone with the hardware can add a ✅; AI review cannot confirm hardware behavior. Stage numbers refer to [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md).

| Item | State |
|---|---|
| The Arduino sample (`06.2_Multi_Functional_Car`) | ✅ (the car moves) |
| `make ksos-rp2040`'s build, link and objdump | ✅ |
| `make ksos-rp2040-buzzer`'s UF2 | ✅ (with the format's own self-check) |
| The bundled firmware (`make ksos-rp2040-board` / `make ksos-rp2040-net`) | **not confirmed** (each ✅ below is from per-feature firmware) |
| **ksos running** | ✅ (stage 1: the buzzer sounded, from boot ROM to GPIO output) |
| GPIO output (`ksos/drivers/rp2040/gpio`) | ✅ |
| The clock tree (`ksos/drivers/rp2040/clocks`) and µs timer (`rp2040/timer`) | ✅ (pitch and interval matched; stage 2a) |
| PWM (`ksos/drivers/rp2040/pwm`) and the driving control (`motor.kspl`) | ✅ (all four wheels turned; stage 3) |
| The mecanum's signs (is positive = right / clockwise?) | ✅ (sideways motion and turning went as intended) |
| USB CDC (`ksos/drivers/rp2040/usb_cdc`) | ✅ (a COM port on Windows with text arriving; stage 2b) |
| The ADC (`ksos/drivers/rp2040/adc`) and GPIO input | ✅ (battery, light and line followed real changes; stage 4) |
| Ultrasound (`ksos/drivers/rp2040/hcsr04`) | ✅ (moving a hand closer reduced the measured distance; stage 5a) |
| IR receiving (`ksos/drivers/rp2040/ir_nec`) | ✅ (a different command per button, repeats counted while held; stage 5b) |
| Driving from the IR remote alone (`rp2040_car_ir_probe`) | **not confirmed** beyond reception and key assignments: wheel motion, face output, and each mode (stage 12) |
| I2C (`ksos/drivers/rp2040/i2c`) and the LED matrix (`ht16k33`) | ✅ (0x71 answered and a band moved; stage 5c) |
| USB Ethernet (`rp2040/usb_cdc`'s CDC-NCM part) | ✅ (a network adapter beside the COM port, `alt=1 link=up`; stage 6a) |
| Receiving a policy and deciding inside the car (`rp2040_car_pilot_probe`) | ✅ It received a policy, disconnected, and kept deciding after `kssrv` stopped. **One inference takes around 10 ms** (stage 7) |
| The NTB framework (`cdc_ncm`) and the link layer (`ksos/net/link`) | ✅ (`ping` got through, the car's MAC in `arp -a`; stage 6b) |
| ARP's requesting side (`build_arp_request` / `parse_arp_reply`) | ✅ (resolved the peer's MAC; stage 6b covers only answering) |
| The TCP 3-way handshake (`mini_ipv4`'s `build_tcp_segment` / `parse_tcp_segment`) | ✅ (SYN → SYN-ACK → ACK) |
| TCP data both ways (`ksos/net/tcp_conn`'s `tcp_stream_send` / `tcp_stream_recv`) | ✅ (an HTTP GET out, a 200 back) |
| The round trip as an HTTP client | ✅ (`status200=1`: the request arrived and was interpreted) |
| `alloc` / `Arena` / `Arc` / `std/http.parse_response` | ✅ (`RESULT pass=11 fail=0`, atomics from `ksos/port/rp2040/ksos_atomic_sio.c`; stage 6d) |
| The four atomics (`kspl_atomic_add`/`cas`/`load`/`store`) | ✅ (the SIO spinlock works on the real chip) |
| `car-pilot` remote stop, runtime limit, and speed cap | ✅ Any button gave `HALTED: stopped by remote`, and 60 seconds gave `HALTED: run time limit`. All six manoeuvres stayed within the cap. Press and release resumed it with `n` growing |
| Starting without a PC using the stored policy (`rp2040_car_pilot_probe`) | ✅ Without kssrv it reported `no fresh policy — using the one stored on board`, and all six manoeuvres reached the wheels. `last run ended` and `policy unchanged` appeared as expected (stage 9) |
| Flash writes (`ksos/drivers/rp2040/flash`) and the device log | ✅ `boot #` increased at each power-on, and `records` and `used` matched each append. A record crossing a page boundary read back correctly (stage 8) |
| USB CDC send queue (`Ring<\|512\|>` in `std/ring.kspl`) | ✅ The `make ksos-rp2040-board` lines keep arriving, a line longer than a packet among them. Bytes per round do not divide 512, so the wrap position moves |
| The hardware watchdog (`ksos/drivers/rp2040/watchdog.kspl`) | **not confirmed** (it is once "Checking the watchdog" in stage 7 of [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md) passes on the car) |
| The calendar RTC ticking (`ksos/drivers/rp2040/rtc.kspl`) | **not confirmed** (it is once `make ksos-rp2040-board`'s `[rtc]` line reads `ticking=yes` across rounds) |
| Flash chip part number | **not confirmed**. [`ksos/docs/SPEC-board.md`](docs/SPEC-board.md) names the expected part under “Flashing the firmware, and the debug output”. Boot does not require a particular chip |

## Files near the limit and how they split

Only code without shared state can move to another file unchanged. Here, state means top-level variables declared with `$`, such as `$halted: Bool = false`. Moving functions that share such variables means moving their state or passing it explicitly, so shared state, not line count, sets file boundaries. These sections remain together:

| Range | Its file | The state it shares with the rest of the file |
| :-- | :-- | :-- |
| USB enumeration: the PC identifies the board through control endpoint EP0 | `ksos/drivers/rp2040/usb_cdc.kspl` | `stage` tracks enumeration through `stage_*` values. `ncm_alt` records the selected network setting. `init`, `poll_once`, and network code also use these variables |
| Safety limits for the remote and running time | `ksos/demo/rp2040/rp2040_car_pilot_probe.kspl` | Stop state: `halted`, `halt_state`, and `halt_needs_remote`. Remote press counts: `ir_*`. Driving time: `driving_rounds`. The main loop also reads these, and the requests to dump or erase the log |
| Single-line status report | The same file | Most running totals and latest values from the main loop, including `loops`, `decisions`, `steers`, and `last_lon`, plus stop state |

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md) | Board setup stages, confirmation checks, and probe output | Anyone with the car, a USB cable, and a PC that can copy files to it |
| [`ksos/docs/SPEC-board.md`](docs/SPEC-board.md) | The car's own facts: pin assignment, motor polarity, conversion formulae | Whoever wires or drives the car, or writes a driver against it |
| [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) | Design reasons: kernel, port layer, drivers, network stack, AI on bare metal | Anyone changing ksos |
| [std](../std/README.md) | The standard library. `ksplc doc std` lists its published files | Anyone changing ksos |
| [ksai](../ksai/README.md) | The inference that runs beside the control loop, without `malloc` | Anyone changing ksos |
| [ksdb](../ksdb/README.md) | The append-only log stored on the device | Anyone changing ksos |
| The "ksos" section of [`docs/PLAN.md`](../docs/PLAN.md) | Remaining work and completion criteria | Anyone changing ksos |
