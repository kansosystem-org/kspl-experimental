/* ==========================================
 * Kanso OS — the ARM Cortex-M linker script.
 * The general ARMv7-M layout of FLASH@0x0 / RAM@0x20000000 (compatible with QEMU's mps2-an385).
 * ========================================== */
ENTRY(Reset_Handler)

MEMORY
{
    FLASH (rx)  : ORIGIN = 0x00000000, LENGTH = 512K
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
}

/* The stacks' heads (full descending). _estack, the top of RAM, is the MSP (the handlers'; it
 * goes into the vector table's initial SP); _thread_stack_top is the PSP (the threads' and the
 * scheduler's), leaving the top free for the handlers. */
_estack = ORIGIN(RAM) + LENGTH(RAM);
_thread_stack_top = _estack - 4096;

/* The room left for what `ksos_main` and the scheduler's own loop take on the PSP, from
 * _thread_stack_top down towards the end of the data: a few times what they take. */
_main_stack_room = 4096;

SECTIONS
{
    /* the vector table is fixed at the head of FLASH (0x0) */
    .isr_vector : {
        KEEP(*(.isr_vector))
    } > FLASH

    /* the code and the read-only data live in FLASH */
    .text : {
        *(.text .text.*)
        *(.rodata .rodata.*)
        . = ALIGN(4);
    } > FLASH

    /* .data's LMA (where its initial values are stored in FLASH) */
    _sidata = LOADADDR(.data);

    /* the initialized data: the VMA is RAM and the LMA FLASH (copied at start-up) */
    .data : {
        . = ALIGN(4);
        _sdata = .;
        *(.data .data.*)
        . = ALIGN(4);
        _edata = .;
    } > RAM AT > FLASH

    /* the uninitialized data: zeroed at start-up */
    .bss : {
        . = ALIGN(4);
        _sbss = .;
        *(.bss .bss.*)
        *(COMMON)
        . = ALIGN(4);
        _ebss = .;
    } > RAM

    /* The crash record from a panic (see `take_panic_record` in std/lang.kspl). (NOLOAD),
     * outside .bss: nothing zeroes or reloads it, so after a warm reset the next start-up reads
     * the previous panic by its magic value. */
    .noinit_panic (NOLOAD) : {
        . = ALIGN(4);
        _panic_rec_start = .; /* where `cortex_m_panic_record_bounds.kspl` plants records */
        *(.noinit_panic)
        _end_of_data = .;
    } > RAM

    /* A firmware whose data leave the main stack too little room fails here, at the link, rather
     * than overwriting its own data at run time (the same check as the nRF51's). */
    ASSERT(_end_of_data + _main_stack_room <= _thread_stack_top,
        "Cortex-M: the data leave the main stack less than 4KB of room; shrink the stacks or buffers")
}
