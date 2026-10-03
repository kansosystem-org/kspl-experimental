# ksos — what is left

**Only what is not done stands here.** A done stage is deleted, and its result goes into the document of its kind ("Document naming" in [`SPEC-documents.md`](../../docs/SPEC-documents.md)). What spans packages is in [`docs/PLAN.md`](../../docs/PLAN.md). What runs, and where it was confirmed, is in [ksos](../README.md). The decisions and their grounds are in [`ksos/docs/DESIGN.md`](DESIGN.md).

| | What is left | What marks it as done |
| :-- | :-- | :-- |
| stage 1 | **Power-saving tickless idle.** The tickless idle that exists only moves the logical time forward. Sleeping until the next expiry and reading the real elapsed time on waking (FreeRTOS's `configUSE_TICKLESS_IDLE`) is not started. It is needed once battery-powered devices are a target | A board probe that sleeps through a `delay` and reads the real elapsed time from a hardware timer |
| stage 2 | **The second core.** core1 is not started. The atomics hold between cores (`ksos/port/rp2040/ksos_atomic_sio.c`), so the runtime needs no fix. One queue used from both cores at once is unconfirmed. `PRIMASK` stops interrupts only on its own core, so the window that stops interrupts (the Flash erase and write in `ksos/drivers/rp2040/flash.kspls`) does not stop the other core | A probe on the real board with both cores using one queue, and the Flash window closed against the second core |
| stage 3 | **A port for a real Cortex-M33 chip** (an RA6M4 or an RP2350). Hardware checks cover only the RP2040: QEMU models no equivalent, and no Cortex-M33 board is available | The port under `ksos/port/`, `make test-ksos-link` covering it, and a board probe on the chip |
