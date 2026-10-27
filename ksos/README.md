# ksos

ksos is Kanso OS, a small real-time operating system (RTOS) written entirely in KSPL. It schedules tasks by priority and supports cooperative yield, preemption, semaphores, message queues, mutexes, and event flags. The same kernel runs on Linux and directly on microcontrollers without another operating system. Running without an operating system is called *bare metal*. ksos also controls a small robot car.

This guide introduces the code and its reading order without assuming RTOS knowledge. Start with `make ksos` below. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) explains the design and the checks behind each make target.

## Run it

The POSIX demo needs only `clang`. It needs neither an ARM cross compiler, which builds for another CPU, nor QEMU, which emulates a microcontroller on a PC.

```sh
make ksos   # on a POSIX host, runs the demo where two tasks (producer/consumer) cooperate on a semaphore
```

The producer creates five items, with `Task.delay` between them. The higher-priority consumer takes each item immediately. The output shows `tick` advancing. Both tasks finish, then `start_scheduler()` returns.

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

The local [`Makefile`](Makefile) supports building and testing an independent copy of this folder. It provides `make test` and the demo and gate targets below. The targets find `ksai` and `ksdb` through the compiler's package paths. The Makefile header lists additional requirements. Targets with the same names at the repository root use the repository compiler.

`ksos/tests/` contains unit tests, USB descriptor text checks, and firmware conversion tests. The conversion tool, elf2uf2, produces firmware files for real chips.

## The idea

An RTOS does two things:

1. **Scheduling** selects the next task by priority. A task behaves like a thread. Switching tasks restores the selected task's CPU registers, called its context.
2. **Synchronization** lets tasks wait for conditions and share resources exclusively through semaphores, queues, mutexes, and event flags.

The scheduler runs the highest-priority `ready` task. See task states in [the scheduler design](docs/DESIGN-rtos.md#-what-sets-the-scheduler-apart).

The table maps each RTOS word to everyday words and to the name in the code.

| RTOS term | In everyday words | In KSPL |
|---|---|---|
| TCB (task control block) | holds one task's state (priority, stack, run state) | `Task`, allocated statically by the caller |
| the scheduler | picks which task runs next | `pick_next` / `schedule` |
| a context switch | swaps the whole set of CPU registers to change task | `ksos_port_switch`, a C ABI the port implements |
| a cooperative yield | A task voluntarily releases the CPU | `Task.yield()` |
| preemption | A timer interrupt forces a task switch | `enable_preemption()` + `ksos_tick()` |
| blocking | a task sleeps until a condition holds | `block_current` / `block_and_rearm` |
| a tick | A periodic timer event used to count delays and timeouts | `ksos_tick()` |
| a semaphore | a counter of available things: `take` waits while it is 0, `give` adds one | `Sem` (`ksos/kernel/sync.kspl`) |
| a message queue | A fixed-size queue for sending values between tasks | `Queue<\|T\|>` (`ksos/kernel/sync.kspl`) |
| a mutex | a lock only one task holds at a time | `Mutex` (`ksos/kernel/sync.kspl`) |
| priority inheritance | A waiting task raises the lock holder's priority. This prevents a medium-priority task from delaying the holder and its higher-priority waiter | `Mutex` (`ksos/kernel/sync.kspl`) |
| an event flag | waits on an AND/OR of several bits | `Event` (`ksos/kernel/sync.kspl`) |
| tickless idle | with nothing to do, moves **logical** time to the next delay's expiry | the fallback inside `pick_next` |
| a port | the architecture-dependent part: context switching, the timer, interrupt control | `ksos_port_*` (POSIX and Cortex-M implement it) |
| an interrupt handler (ISR, interrupt service routine) | Code that interrupts a task to handle a hardware event | `ksos_port_in_isr()` identifies this context |
| a critical section | Code that runs with interrupts disabled | `irq_save()` / `irq_restore(state)` |

The kernel allocates no memory internally and does not depend on `malloc`. The caller supplies tasks, stacks, and queue buffers as globals or static arrays. Examples include `tcb_p` and `stack_p` in `ksos/demo/posix/producer_consumer.kspl`.

## What is here

| Folder | What it holds |
| :-- | :-- |
| `ksos/kernel/` | The scheduler and the synchronizing primitives, with neither hardware nor libc |
| `ksos/port/` | One folder per architecture and OS: the context switch, the timer and the boot |
| `ksos/drivers/` | Drivers reading and writing a microcontroller's registers directly |
| `ksos/net/` | A minimal network stack (ARP, IPv4, UDP, TCP) |
| `ksos/boards/` | Connections between components on a board |
| `ksos/demo/` | The demos, one firmware each; the POSIX and Cortex-M ones are tests too |
| `ksos/tests/` | The unit tests, the USB descriptors read as text, and elf2uf2 |
| [`ksos/docs/`](docs/) | Design, board specifications, and setup instructions; see “Further reading” below |

Imports follow this order: `kernel` < `drivers` < `boards` < `demo`. A folder can import only lower layers. `net` is beside `drivers`. It needs neither the kernel nor hardware registers. Only `demo` uses it.

Importing a board from a driver would restrict that driver to one board. `make test-conventions` enforces this order.

## Reading order

Read from the bottom of the dependencies up, so each file's prerequisites come first.

### Tasks and scheduling: `ksos/kernel/task.kspl`

The main operations register a task, select the next task, and switch contexts. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) explains each operation.

- `Task.create(stack, entry, arg, prio, name): Bool` fills the receiving task, as in `tcb.create(...)`. The stack slice, such as `U8$[]::stack_a`, defines the stack memory and size. Larger `prio` values mean higher priority. Priority 0 belongs to the idle task. At `max_tasks`, creation returns `false` without changing anything.

- `start_scheduler()` runs registered tasks until all end or one calls `stop_scheduler()`. If all remaining tasks are blocked without deadlines, it sleeps until an interrupt. An interrupt handler can therefore wake a task by giving its semaphore. `run_single_task(tcb, stack, entry, name, on_idle)` combines registration and scheduling for a single-task `ksos_main`. It then calls `on_idle` and loops forever.

- `Task.yield()` lets another task run. `Task.delay(ticks)` waits for a relative delay. `Task.delay_until(wake_tick)` uses an absolute tick to prevent work duration from shifting a periodic schedule. Ticks represent logical time, not elapsed time. See tickless idle in the scheduler design.

- `Task.suspend()` and `Task.resume()` pause and resume another task while preserving its wait condition. `Task.delete()` marks the task `done` and releases its slot and port context. The caller retains ownership of its memory. Deleting a mutex holder causes a panic.

- `irq_save()` and `irq_restore(state)` disable and restore interrupts around a critical section. Every synchronization primitive in `ksos/kernel/sync.kspl` uses them.

- A *canary* is a known value at the lowest stack address. Every `schedule()` checks it. A stack overflow overwrites the canary and causes a panic with `ksos: stack overflow detected`.

- The nine `ksos_port_*` functions declared `extern "C"` define the kernel's entire interface to the port. The kernel knows their signatures, not their register operations.

### Synchronization: `ksos/kernel/sync.kspl`

All four primitives use `block_and_rearm` and `wake` from `ksos/kernel/task.kspl`. Within `task.irq_save()` and `task.irq_restore()`, each checks its condition and blocks if necessary. After waking, it checks the condition again.

- `Sem` (a semaphore): `take`/`give`.

- `Queue<|T|>` (a message queue of any `T`): `send`/`recv`, blocking when full too.

- `Mutex` (priority-inheriting): `lock`/`unlock`.

- `Event` (event flags): `wait`/`set` on an AND (`.all`) or OR (`.any`) of bits.

- Interrupt handlers can call only operations that do not wait: `give`, `set`, and `try_*`.

- The operation name defines its wait behavior. The plain form waits until woken. `try_` returns immediately. `_for(ticks)` times out. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) defines these rules and conversion from elapsed time.

### Heap allocation and task management

The static API uses caller-supplied tasks, stacks, and queue buffers. These modules allocate them on the heap:

- `ksos/kernel/heap.kspl` provides `heap_alloc` and `heap_free`. It makes the freestanding heap from `std/mem.kspl` safe to use from tasks and interrupt handlers.

- `ksos/kernel/dynamic.kspl` adds associated creation functions with `_dyn`, such as `Task.create_dyn`. Deletion uses instance methods such as `t.delete_dyn()`. See the names in [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md#-what-sets-the-scheduler-apart). A task deletes itself with `Task.current().delete_dyn()`. The next call into this module or `install_idle_reap(stack)` later releases its stack.

- `enable_idle_task(stack, hook)` enables a priority-0 task in `ksos/kernel/task.kspl`. It runs only when no other task can run and calls `hook` between pauses. It sleeps until an interrupt while other tasks are blocked. It never ends, so the scheduler returns only after `stop_scheduler()`.

- Task managers use `t.cpu_percent()`, `Task.get_prio`, `get_name`, `get_state`, `Task.count`, and `Task.at` from `ksos/kernel/task.kspl`. The kernel performs no display input or output. See `make ksos-task-manager`. Heap usage comes directly from `heap_used_bytes` and `heap_peak_used_bytes` in `std/mem.kspl`.

### Ports: `port/posix/`, `port/cortex_m/`, `port/cortex_m0/`, `port/rp2040/`, `port/nrf51/`

Each port implements the nine `extern "C"` functions declared in `ksos/kernel/task.kspl`. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) describes their files and design.

- `ksos/port/posix/` uses `ucontext` for switching and `SIGALRM` for preemption. It needs no special tools. Start here with `make ksos`.

- `ksos/port/cortex_m/` supports ARMv7-M (`thumbv7m`) bare metal. Every switch uses PendSV, a low-priority CPU exception. QEMU runs it with targets such as `make ksos-cm-run`.

- `ksos/port/cortex_m0/` supports ARMv6-M (`thumbv6m`, Cortex-M0/M0+). Its `startup.S` and `switch.S` use the smaller Thumb-1 instruction set. It recompiles the remaining code from `cortex_m/`.

- `ksos/port/rp2040/` supports the Raspberry Pi Pico and Pico W, whose RP2040 uses Cortex-M0+. It builds on `ksos/port/cortex_m0/`. `make ksos-rp2040` builds and inspects the 256-byte second-stage bootloader and checksum required by the boot ROM.

- `ksos/port/nrf51/` supports QEMU's BBC micro:bit model (`-M microbit`), with its nRF51 Cortex-M0. It supplies the memory map and interrupt vectors for `ksos/port/cortex_m0/`. Targets include `make ksos-cm0-preempt`.

Only the RP2040 car has real-chip confirmation. For other bare-metal checks, run `ksos/port/cortex_m/` on QEMU's `mps2-an385`, or `ksos/port/cortex_m0/` on its micro:bit. See “The nRF51 under QEMU” in [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) for checks that require real hardware.

### Worked examples: `demo/`

Each file directly inside `demo/<port>/` must be a standalone demo with `ksos_main`. `demo_stems` in `ksos/Makefile` derives the demo list from that directory. A file without this entry point fails to link.

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
| `ksos/demo/posix/mutex_nested_demo.kspl` | `make ksos-mutex-nested` | Two mutexes held together and released in either order. Priority inheritance remains active through the mutex still held. |
| `ksos/demo/posix/wake_preempt_demo.kspl` | `make ksos-wake-preempt` | A higher-priority task woken by `give`, `unlock`, `send`, `set`, or `resume` runs immediately. It runs before the waking task continues, without a timer. |
| `ksos/demo/posix/wake_pass_on_demo.kspl` | `make ksos-wake-pass-on` | A waiter receives a wake from `unlock`, `give`, `send`, or `recv`. Deleting or suspending it before execution passes the wake to the next waiter. Suspension removes the priority it gave the holder. A medium-priority task then runs before the holder continues. |
| `ksos/demo/posix/event_demo.kspl` | `make ksos-event` | Waiting for all or any event bits. One `set` releases three waiters, each of which clears the bit on exit. |
| `ksos/demo/posix/posix_preempt_demo.kspl` | `make ksos-preempt` | timer-driven preemption |
| `ksos/demo/posix/delay_until_demo.kspl` | `make ksos-delay-until` | a period with no drift, via `Task.delay_until` |
| `ksos/demo/posix/lifecycle_demo.kspl` | `make ksos-lifecycle` | `Task.suspend`/`Task.resume`/`Task.delete` |
| `ksos/demo/posix/panic_demo.kspl stack-overflow` | `make ksos-stack-overflow` | the canary catching a stack overflow |
| `ksos/demo/posix/isr_signal_demo.kspl` | `make ksos-isr` | `Queue<\|T\|>.try_send` from an ISR (SIGUSR1 stands in for the interrupt) |
| `ksos/demo/posix/sleep_demo.kspl` | `make ksos-sleep` | All tasks wait for a semaphore given only by an interrupt. CPU time confirms that the scheduler and idle task sleep. `stop_scheduler` returns despite the idle task. |
| `ksos/demo/posix/task_manager_demo.kspl` | `make ksos-task-manager` | Heap-allocated tasks and queues from `dynamic.kspl`. The idle task releases deleted stacks. `Task.cpu_percent` in `ksos/kernel/task.kspl` follows the CPU usage each task requests. |
| `ksos/demo/posix/kernel_check.kspl` | `make ksos-kernel-check` | Priority-ordered wakes, with longest-waiting tasks first among equals. Suspension and deletion while blocked, suspension during delay, and past deadlines for `delay_until`. Removing a deleted waiter's priority from the holder and enforcing the task limit. |
| `ksos/demo/posix/panic_demo.kspl mutex-relock` | `make ksos-mutex-relock` | Relocking a held mutex causes a panic instead of waiting forever. The expected panic passes the test. |
| `ksos/demo/posix/panic_demo.kspl mutex-foreign-unlock` | `make ksos-mutex-foreign-unlock` | Unlocking another task's mutex causes a panic. The expected panic passes the test. |
| `ksos/demo/posix/panic_demo.kspl delete-holder` | `make ksos-delete-holder` | Deleting a mutex holder causes a panic instead of leaving the lock held forever. The expected panic passes the test. |
| `ksos/demo/posix/timeout_demo.kspl` | `make ksos-timeout` | Timeouts for `take_for`, `recv_for`, `send_for`, `lock_for`, and `wait_for`. Oversized timeouts, immediate `try_take` and `try_lock`, and upward rounding in `ms_to_ticks`. |
| `ksos/demo/posix/panic_demo.kspl timeout-zero` | `make ksos-timeout-zero` | A zero timeout causes a panic instead of acting like `try_`. The expected panic passes the test. |
| `ksos/demo/posix/panic_demo.kspl event-no-bits` | `make ksos-event-no-bits` | Waiting for no event bits causes a panic instead of waiting forever. The expected panic passes the test. |
| `ksos/demo/posix/panic_demo.kspl stop-outside` | `make ksos-stop-outside` | Calling `stop_scheduler` without a running scheduler causes a panic. The expected panic passes the test. |
| `ksos/demo/posix/tick_mid_switch_demo.kspl` | `make ksos-tick-mid-switch` | A tick delayed across a switch reaches a new task after the switch. The task still executes its code. Thousands of `start_scheduler` calls start their first task despite ticks every 30 μs. |
| `ksos/demo/posix/dyn_race_demo.kspl` | `make ksos-dyn-race` | Three tasks concurrently create and delete heap-allocated tasks, with ticks every 100 μs. Each task and stack returns to the heap exactly once. |

The Cortex-M demos require a cross compiler and QEMU, both provided in the development container. `make test-ksos-qemu` runs them all. `make ksos-cm` builds `cortex_m_min.kspl` and checks its vector table and PendSV with objdump. `make ksos-cm-run` runs the resulting ELF file on QEMU's `mps2-an385`. Other targets build and run together.

| The demo | The make target | What it demonstrates |
|---|---|---|
| `ksos/demo/cortex_m/cortex_m_min.kspl` | `make ksos-cm-run` | Cooperative scheduling on bare metal. Higher-priority tasks run first regardless of registration order. `Task.delay` waits for its tick; `Task.yield` lets another task run. |
| `ksos/demo/cortex_m/cortex_m_preempt.kspl` | `make ksos-cm-preempt` | SysTick preempts two tasks that never yield. Each task retains its own r4–r11 registers across switches. A monitor waiting in `Task.delay` still wakes. |
| `ksos/demo/cortex_m/cortex_m_pi.kspl` | `make ksos-cm-pi` | Priority inheritance lets a high-priority requester obtain the lock despite a medium-priority task that never yields. Acquisition waits until the holder finishes its critical section. The holder then returns to its original priority. |
| `ksos/demo/cortex_m/cortex_m_event.kspl` | `make ksos-cm-event` | a barrier of event flags: three workers' bits raised under preemption, and clear-on-exit |
| `ksos/demo/cortex_m/cortex_m_mq.kspl` | `make ksos-cm-mq` | a queue under preemption (the critical section) |
| `ksos/demo/cortex_m/cortex_m_timeout.kspl` | `make ksos-cm-timeout` | SysTick alone carrying `take_for`'s timeout while a spinner that never yields holds the CPU |
| `ksos/demo/cortex_m/cortex_m_isr_block.kspl` | `make ksos-cm-isr-block` | `Sem.take` in an interrupt handler panics, even when its count is positive. This prevents blocking the interrupted task. The expected panic passes the test. |
| `ksos/demo/cortex_m/cortex_m_isr_unlock.kspl` | `make ksos-cm-isr-unlock` | `Mutex.unlock` in an interrupt handler panics instead of releasing the interrupted task's mutex. The expected panic passes the test. |
| `ksos/demo/cortex_m/cortex_m_isr_give.kspl` | `make ksos-cm-isr-give` | Tasks woken by an interrupt handler's `give` calls run when the handler returns, highest priority first. They run before the interrupted task continues. |
| `ksos/demo/cortex_m/cortex_m_stack_guard.kspl` | `make ksos-cm-stack-guard` | After a task switches out and back, its damaged canary causes a panic at the next SysTick switch. The expected panic passes the test. |
| `ksos/demo/cortex_m/cortex_m_heap_probe.kspl` | `make ksos-cm-heap-probe` | The freestanding heap (`mem.init_freestanding_heap`) and `Arc<T>` work without an OS or `malloc`. Creating and deleting 120 tasks exercises reuse of the port's 33 contexts. |
| `ksos/demo/cortex_m/cortex_m_panic_probe.kspl` | `make ksos-cm-panic-probe` | a panic's crash record read back across a real soft reset |
| `ksos/demo/cortex_m/cortex_m_ai_probe.kspl` | `make ksos-cm-ai-probe` | `ksai` inference (a whole `Transformer_block`) on bare metal, matching the host's numbers |
| `ksos/demo/cortex_m/cortex_m_ai_train_probe.kspl` | `make ksos-cm-ai-train-probe` | On-device low-rank adaptation (LoRA) trains small matrices added to model weights. `Lora.save_raw` and `load_raw` save and restore the adapter. |
| `ksos/demo/cortex_m/cortex_m_ai_weights_probe.kspl` | `make ksos-cm-ai-weights-probe` | real weights (a safetensors made a static array by `embed`) read with zero copies and no filesystem |
| `ksos/demo/cortex_m/cortex_m_control_ai_probe.kspl` | `make ksos-cm-control-ai-probe` | a control loop and continuing AI inference side by side, undisturbed |
| `ksos/demo/cortex_m/cortex_m_pilot_probe.kspl` | `make ksos-cm-pilot-probe` | A received policy selects the next manoeuvre locally |

The Cortex-M0 port in `port/cortex_m0/` also supports the RP2040 CPU. QEMU runs it through `port/nrf51/` on the micro:bit (`-M microbit`). `make test-ksos-qemu` includes these runs. Demos must fit 16 KB of RAM and need no atomic instructions, which ARMv6-M lacks. Each task receives a 1 KB stack.

| The demo | The make target | What it demonstrates on the Cortex-M0 |
|---|---|---|
| `ksos/demo/cortex_m/cortex_m_min.kspl` | `make ksos-cm0-min` | the cooperative scheduler, as `make ksos-cm-run` |
| `ksos/demo/cortex_m/cortex_m_preempt.kspl` | `make ksos-cm0-preempt` | preemption, and r4-r11 restored by Thumb-1's `switch.S`, which moves r8-r11 by way of r4-r7 |
| `ksos/demo/cortex_m/cortex_m_mq.kspl` | `make ksos-cm0-mq` | a queue under preemption |
| `ksos/demo/cortex_m/cortex_m_pi.kspl` | `make ksos-cm0-pi` | Priority inheritance despite a task that never yields. |
| `ksos/demo/cortex_m/cortex_m_event.kspl` | `make ksos-cm0-event` | a barrier of event flags under preemption |
| `ksos/demo/cortex_m/cortex_m_timeout.kspl` | `make ksos-cm0-timeout` | SysTick alone carrying `take_for`'s timeout |
| `ksos/demo/cortex_m/cortex_m_isr_block.kspl` | `make ksos-cm0-isr-block` | `Sem.take` in an interrupt handler panics (panic = pass) |
| `ksos/demo/cortex_m/cortex_m_isr_unlock.kspl` | `make ksos-cm0-isr-unlock` | `Mutex.unlock` in an interrupt handler panics (panic = pass) |
| `ksos/demo/cortex_m/cortex_m_isr_give.kspl` | `make ksos-cm0-isr-give` | two gives in one handler: PendSV still saves the task really running |
| `ksos/demo/cortex_m/cortex_m_stack_guard.kspl` | `make ksos-cm0-stack-guard` | the canary checked at a preempting switch (panic = pass) |
| `ksos/demo/cortex_m/cortex_m_panic_probe.kspl` | `make ksos-cm0-panic-probe` | a panic's crash record read back across a soft reset (AIRCR, which Armv6-M has too) |
| `ksos/demo/nrf51/nrf51_wfi.kspl` | `make ksos-nrf51-wfi` | All tasks wait on a semaphore while the scheduler sleeps with `WFI`. The nRF51 timer interrupt wakes the scheduler and gives the semaphore. |

#### How far CI looks, per port

CI coverage differs by port. Deleting a demo can remove a check:

| Place | What CI does | Checking on the real board |
| :-- | :-- | :-- |
| `ksos/demo/posix/` | runs every one; `assert` stops a failing path (`make test-ksos-posix`) | not needed |
| `ksos/demo/cortex_m/` | runs every one under QEMU (`make test-ksos-qemu`), on the Cortex-M3 and, for those that fit, the Cortex-M0 too | not needed |
| `ksos/demo/nrf51/` | runs every one under QEMU (`make test-ksos-qemu`) | not needed (QEMU's chip only) |
| `ksos/demo/rp2040/` | links only (`make test-ksos-link`); QEMU has no RP2040 | a person flashes it |

Every demo run by `make test-ksos-posix` or `make test-ksos-qemu` has a time limit. `KSOS_RUN_CAP` in `ksos/Makefile` sets it; its comment explains the value. A hung demo fails with `[FAIL] ksos-<demo> did not finish in <N>s: it hung (timeout killed it)`. On a slow machine, increase the limit with `make test-ksos-posix KSOS_RUN_CAP=120`.

The POSIX and Cortex-M demos are tests. Deleting a demo removes its checks. Combining them obscures which feature failed and prevents later checks from running after the first failure.

**A demo passes only after all checks finish.** A passing demo must exit with status 0, contain no failure marker, and print `RESULT: ALL PASS`. `ksos_run_gate` in `ksos/Makefile` enforces these requirements. A demo prints its result only after all checks finish. The gate does not treat a message such as “OK” as a check.

* A POSIX demo uses `assert` for unexpected results and ends `main` with `verdict.finish()`. `start_scheduler` returns after all tasks end or `stop_scheduler` runs. A lost wake, deadlock, or missing timeout can leave a task blocked forever. The scheduler continues sleeping, so the demo never reaches its verdict. The time limit then fails the run.
* A Cortex-M demo reports claims with `con.check`, then finishes with `con.print_summary` and `con.exit` ([`ksos/demo/common/semihost_console.kspl`](demo/common/semihost_console.kspl)). No checks, an early exit, or a panic produces failure in both the result and QEMU exit status.

RP2040 demos run only on the real board. Each small demo provides a separate firmware image for finding faults.

#### The RP2040's demos come three ways

All RP2040 demo filenames end in `*_probe.kspl`, so the groups below distinguish their purposes. Their order follows the flashing sequence. Stage 1 of [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md) explains flashing. `make ksos-rp2040` alone produces only the `.elf`.

**The first step** confirms that ksos runs on the real chip.

| The make target | What it confirms |
| :-- | :-- |
| `make ksos-rp2040-buzzer` | that the flashed firmware starts running; the buzzer is the output device (semihosting is unavailable) |

**Board checks** use USB while the car remains on the desk. Repeat these checks when a fault occurs.

| The make target | What it confirms |
| :-- | :-- |
| `make ksos-rp2040-board` | USB CDC console, calendar RTC, free-list allocation, and atomics using the SIO spinlock. Flash log, battery, light, line-following, ultrasound, and IR sensors. I2C LED matrix (`ht16k33`) and WS2812. Each stage has a file in [`ksos/demo/rp2040/board_probe/`](demo/rp2040/board_probe/). |
| `make ksos-rp2040-motor` | PWM on all four wheels. Test with the wheels off the ground. |
| `make ksos-rp2040-net` | USB Ethernet from the PC through CDC-NCM. ARP requests followed by TCP and HTTP, with continued replies to ARP and ping. |

**Combined checks** exercise the components together:

| The make target | What it confirms |
| :-- | :-- |
| `make ksos-rp2040-car-pilot` | The car receives a policy and disconnects. It then makes decisions locally. |
| `make ksos-rp2040-car-ir` | driving it with a remote |

The car and board firmware link different code. `board` and `net` use shared code absent from `car-pilot`: LED matrix I2C, calendar RTC, ARP/ICMP, atomics, and 64-bit shift helpers. Only `car-ir` uses `__aeabi_llsr` and `__lshrdi3`. The link gate checks these symbol dependencies.

### Drivers, networking, and AI: `drivers/`, `net/`, `boards/`

These components support embedded devices. They are optional for a first reading.

- `ksos/boards/` defines board wiring above the CPU ports and peripheral drivers. The board is a Freenove 4WD mecanum car with a Pico W. It supports Phase 3 of [What works, and how far](../README.md#-what-works-and-how-far). [`ksos/docs/SPEC-board.md`](docs/SPEC-board.md) defines wiring. [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md) explains setup.

- `ksos/drivers/` accesses memory-mapped input/output (MMIO) registers directly. These memory addresses control GPIO, PWM, clocks, ADC, I2C, USB CDC, and other peripherals. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) describes each driver. Operations such as `transfer` stop after a limited number of iterations if hardware does not respond. They report failure through `Bool` or `T?`.

- `ksos/net/` provides a minimal network stack. `ksos/net/tcp_conn.kspl` implements TCP above `ksos/net/mini_ipv4.kspl`, which provides ARP, IPv4, and UDP without fragmentation. See [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md).

- `ksai` runs beside a control loop without `malloc`, as the Cortex-M AI demos show. [`ksos/docs/DESIGN-rtos.md`](docs/DESIGN-rtos.md) lists its requirements. [ksai](../ksai/README.md) introduces the engine.

- A freestanding panic saves a crash record in `.noinit_panic`. The linker scripts, `ksos/port/*/link.ld`, reserve this RAM without zeroing it at startup. After a warm reset without power loss, `take_panic_record` in `std/lang.kspl` reads the record once. `make ksos-cm-panic-probe` tests a watchdog reset, panic, and soft reset in one QEMU run. The soft reset uses `system_reset()` from `ksos/drivers/cortex_m/scs.kspl`.

## Pitfalls

These errors can break a port or its synchronization:

| The trap | What goes wrong | What to do |
| :-- | :-- | :-- |
| **Unexpected libc dependencies on bare metal**; see [`std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md) | A new libc call in `std` can break a bare-metal build, even without an explicit application call | Provide a `cfg(freestanding)` implementation. `make test-ksos-link` checks links. `make test-ksos-qemu` detects startup failures |
| **Linking `ksos-cm*`/`ksos-nrf51*`/`ksos-rp2040*` needs arm-none-eabi's libgcc** | The link fails without it | Use the development container, which has it |
| **Shared state outside a critical section**, including task fields | Interrupts and preemption can cause races, such as lost wakes. `block_current` and `block_and_rearm` require the caller to hold a critical section | Access shared state within `irq_save` and `irq_restore` |
| **The POSIX signal mask** | Blocking `SIGALRM` permanently stops timer preemption. Allowing a tick during a switch mixes the old stack with the new current task. The new task can hang or appear never to run. Pending ticks make this likely under load | Leave signal masks to `ksos_port_switch` and `ksos_task_start` in `ksos/port/posix/ksos_port_posix.c`. See the details below |
| **Cortex-M context frames** | A mismatch between saved and initial frames loads incorrect registers, including `pc`. A new task can start at the wrong address or fault | Keep `ksos_port_ctx_create` consistent with `ksos/port/cortex_m/switch.S` and `ksos/port/cortex_m0/switch.S`. Both ports use the frame described below |

`ksos_port_switch` blocks interrupt signals throughout `swapcontext`. It restores each task's mask only after control returns to that task. Every saved context, including a new context, keeps those signals blocked. A switch from the tick handler leaves `SIGALRM` blocked until the interrupted task resumes and returns from that handler. A new task unblocks signals in `ksos_task_start`.

`swapcontext` alone installs the next mask before restoring registers, which permits a tick during the switch. `make ksos-tick-mid-switch` tests a tick delayed across a switch into a new task on every run.

On Cortex-M, `PendSV_Handler` saves 16 words on the task's stack. These are r4–r11 followed by the eight hardware-saved registers: r0–r3, r12, lr, pc, and xPSR. `ksos_port_ctx_create` constructs this same frame for a new task. All cooperative and preemptive switches use `PendSV_Handler`.

## What has been checked on real hardware

This table is the canonical record of checks performed on the real car. A ✅ means confirmation on a Freenove 4WD car with a Raspberry Pi Pico W ([`ksos/docs/SPEC-board.md`](docs/SPEC-board.md)). Only someone with the hardware can add a ✅. AI review cannot confirm hardware behavior. Stage numbers refer to [`ksos/docs/HOWTO-bring-up.md`](docs/HOWTO-bring-up.md).

| Item | State |
|---|---|
| The Arduino sample (`06.2_Multi_Functional_Car`) | ✅ (the car moves) |
| `make ksos-rp2040`'s build, link and objdump | ✅ |
| `make ksos-rp2040-buzzer`'s UF2 | ✅ (with the format's own self-check) |
| The bundled firmware (`make ksos-rp2040-board` / `make ksos-rp2040-net`) | **not confirmed** (each ✅ below is from per-feature firmware) |
| **ksos running** | ✅ (stage 1: the buzzer sounded on a real Pico W, the whole path from boot ROM to GPIO output) |
| GPIO output (`ksos/drivers/rp2040/gpio`) | ✅ |
| The clock tree (`ksos/drivers/rp2040/clocks`) and µs timer (`rp2040/timer`) | ✅ (pitch and interval matched; stage 2a) |
| PWM (`ksos/drivers/rp2040/pwm`) and the driving control (`motor.kspl`) | ✅ (all four wheels turned; stage 3) |
| The mecanum's signs (is positive = right / clockwise?) | ✅ (sideways motion and turning went as intended) |
| USB CDC (`ksos/drivers/rp2040/usb_cdc`) | ✅ (a COM port on Windows, text reaching the Serial Monitor; stage 2b) |
| The ADC (`ksos/drivers/rp2040/adc`) and GPIO input | ✅ (battery voltage, light and line tracking followed real changes; stage 4) |
| Ultrasound (`ksos/drivers/rp2040/hcsr04`) | ✅ (moving a hand closer reduced the measured distance; stage 5a) |
| IR receiving (`ksos/drivers/rp2040/ir_nec`) | ✅ (a different command per button, repeats counted while held; stage 5b) |
| Driving from the IR remote alone (`rp2040_car_ir_probe`) | **not confirmed** beyond reception and key assignments. Wheel motion, face output, and each mode's motion remain unconfirmed (stage 12) |
| I2C (`ksos/drivers/rp2040/i2c`) and the LED matrix (`ht16k33`) | ✅ (address 0x71 responded and a band moved across the display; stage 5c) |
| USB Ethernet (`rp2040/usb_cdc`'s CDC-NCM part) | ✅ (a network adapter appeared alongside the COM port, with `alt=1 link=up`; stage 6a) |
| Receiving a policy and deciding inside the car (`rp2040_car_pilot_probe`) | ✅ The car received a policy and disconnected. It continued making decisions after `kssrv` stopped. **One inference takes around 10 ms** (stage 7) |
| The NTB framework (`cdc_ncm`) and the link layer (`ksos/net/link`) | ✅ (`ping` from the PC got through, this side's MAC in `arp -a`; stage 6b) |
| ARP's requesting side (`build_arp_request` / `parse_arp_reply`) | ✅ (resolved the peer's MAC; stage 6b covers only answering) |
| The TCP 3-way handshake (`mini_ipv4`'s `build_tcp_segment` / `parse_tcp_segment`) | ✅ (SYN → SYN-ACK → ACK) |
| TCP data both ways (`ksos/net/tcp_conn`'s `tcp_stream_send` / `tcp_stream_recv`) | ✅ (an HTTP GET out, a 200 back) |
| The round trip as an HTTP client | ✅ (`status200=1`: the request arrived and was interpreted) |
| `alloc` / `Arena` / `Arc` / `std/http.parse_response` | ✅ (`RESULT pass=11 fail=0`, the atomics filled in from SIO's hardware spinlock by `ksos/port/rp2040/ksos_atomic_sio.c`; stage 6d) |
| The four atomics (`kspl_atomic_add`/`cas`/`load`/`store`) | ✅ (the SIO spinlock works on the real chip) |
| `car-pilot` remote stop, runtime limit, and speed cap | ✅ Any button reports `HALTED: stopped by remote`. At 60 seconds, it reports `HALTED: run time limit`. All six manoeuvres stayed within the speed cap. Pressing and releasing resumed operation with `n` growing. See “How to stop it when it drives itself” in `ksos/docs/HOWTO-bring-up.md` |
| Starting without a PC using the stored policy (`rp2040_car_pilot_probe`) | ✅ Without kssrv, it reports `no fresh policy — using the one stored on board`. All six manoeuvres reached the wheels. `last run ended` reports the previous observation. `policy unchanged` confirms that an unchanged policy was not written again (stage 9) |
| Flash writes (`ksos/drivers/rp2040/flash`) and the device log | ✅ `boot #` increased at each power-on. `records` and `used` matched each append exactly. A record crossing a flash page boundary read back correctly (stage 8) |
| USB CDC send queue (`Ring<\|512\|>` in `std/ring.kspl`) | ✅ The three `make ksos-rp2040-board` lines continue arriving. A line longer than one packet exercises multiple packets. Bytes per round do not divide 512, so the wrap position changes each round |
| The calendar RTC ticking (`ksos/drivers/rp2040/rtc.kspl`) | **not confirmed** (it is once `make ksos-rp2040-board`'s `[rtc]` line reads `ticking=yes` across rounds) |
| Flash chip part number | **not confirmed**. [`ksos/docs/SPEC-board.md`](docs/SPEC-board.md) names the expected part under “Flashing the firmware, and the debug output”. Boot does not require a particular chip |

## Files near the limit and how they split

Only code without shared state can move to another file unchanged. Here, state means top-level variables declared with `$`, such as `$halted: Bool = false`. Driver and demo functions share these variables. Moving those functions requires moving their state or passing it explicitly. Shared state determines file boundaries, not line counts. These sections remain together:

| Range | Its file | The state it shares with the rest of the file |
| :-- | :-- | :-- |
| USB enumeration: the PC identifies the board through control endpoint EP0 | `ksos/drivers/rp2040/usb_cdc.kspl` | `stage` tracks enumeration through `stage_*` values. `ncm_alt` records the selected network setting. `init`, `poll_once`, and network code also use these variables |
| Safety limits for the remote and running time | `ksos/demo/rp2040/rp2040_car_pilot_probe.kspl` | Stop state: `halted`, `halt_state`, and `halt_needs_remote`. Remote press counts: `ir_*`. Driving time: `driving_rounds`. The main loop also accesses these values and requests to dump or erase the log |
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
