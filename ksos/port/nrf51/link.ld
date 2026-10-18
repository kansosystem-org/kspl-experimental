/* ==========================================
 * Kanso OS — the nRF51822's linker script (the BBC micro:bit's chip, as QEMU's `-M microbit`).
 * FLASH is the 256KB from 0x0, RAM the 16KB from 0x20000000.
 * The vector table is cortex_m0/startup.S's (up to IRQ0) followed by vectors.S's (the nRF51's
 * own lines): the Cortex-M0 has no VTOR, so the table must sit whole at 0x0.
 * ========================================== */
ENTRY(Reset_Handler)

MEMORY
{
    FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 256K
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 16K
}

/* MSP (the exceptions') is the top 1KB of RAM, PSP (the threads' and the scheduler's) below it,
 * as in cortex_m/link.ld but a quarter of the size: 16KB holds little. The deepest handler path,
 * a panic stopping the run from SysTick, takes a few hundred bytes ("The nRF51 under QEMU" in
 * ksos/docs/DESIGN-rtos.md says how it was measured). */
_estack = ORIGIN(RAM) + LENGTH(RAM);
_thread_stack_top = _estack - 1024;

/* The room left for what `ksos_main` and the scheduler's own loop take on the PSP, from
 * _thread_stack_top down towards the end of the data: a few times what they take. */
_main_stack_room = 1024;

SECTIONS
{
    .isr_vector : {
        KEEP(*(.isr_vector))
        KEEP(*(.isr_vector.irqs))
    } > FLASH

    .text : {
        *(.text .text.*)
        *(.rodata .rodata.*)
        . = ALIGN(4);
    } > FLASH

    _sidata = LOADADDR(.data);
    .data : {
        . = ALIGN(4);
        _sdata = .;
        *(.data .data.*)
        . = ALIGN(4);
        _edata = .;
    } > RAM AT > FLASH

    .bss : {
        . = ALIGN(4);
        _sbss = .;
        *(.bss .bss.*)
        *(COMMON)
        . = ALIGN(4);
        _ebss = .;
    } > RAM

    /* The crash record from a panic (see `take_panic_record` in std/lang.kspl), left unzeroed. */
    .noinit_panic (NOLOAD) : {
        . = ALIGN(4);
        *(.noinit_panic)
        _end_of_data = .;
    } > RAM

    /* A demo whose stacks and data leave the main stack too little room fails here, at the link,
     * rather than overwriting its own data at run time. */
    ASSERT(_end_of_data + _main_stack_room <= _thread_stack_top,
        "nRF51: the data leave the main stack less than 1KB of the 16KB RAM; shrink the stacks")
}
