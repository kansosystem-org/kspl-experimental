/* ==========================================
 * Kanso OS — the linker script for the real Raspberry Pi Pico / Pico W (RP2040, Cortex-M0+).
 * FLASH is the 2MB at the XIP base 0x10000000; RAM, the 264KB of main SRAM from 0x20000000.
 * The flash's first 256 bytes are the stage 2 bootloader's alone (boot2_generic_03h.S, as .boot2):
 * the boot ROM runs it from SRAM, and once QSPI is in XIP mode it jumps through VTOR to ksos's
 * vector table at Flash+0x100 (the details are in boot2_generic_03h.S and ksos/docs/DESIGN.md).
 * ========================================== */
ENTRY(Reset_Handler)

MEMORY
{
    FLASH (rx)  : ORIGIN = 0x10000000, LENGTH = 2048K /* the Pico / Pico W's QSPI flash */
    RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 264K  /* the RP2040's main SRAM (banks 0-5) */
}

/* MSP (the exceptions') is the top of RAM, PSP (the threads' and the scheduler's) 4KB below. */
_estack = ORIGIN(RAM) + LENGTH(RAM);
_thread_stack_top = _estack - 4096;

SECTIONS
{
    /* Stage 2, 256 bytes (the binary .incbin'ed with pad_checksum.kspls's padding and checksum),
     * **always at the flash's head**. */
    .boot2 0x10000000 : {
        KEEP(*(.boot2))
    } > FLASH

    /* ksos's real exception vectors (g_vector_table). Stage 2's exit reads Flash+0x100
     * unconditionally, so this is fixed at that absolute address. */
    .isr_vector 0x10000100 : {
        KEEP(*(.isr_vector))
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
        /* The code run while XIP is stopped (`#section(".ram_text")`), inside .data so that the
         * start-up copies it to RAM (a copy of its own would be a second place).
         * Caution: **Call nothing outside it in that window**: no flash instruction can be read
         * there, so such a call has no way back (ksos/drivers/rp2040/flash.kspls). */
        . = ALIGN(4);
        *(.ram_text .ram_text.*)
        . = ALIGN(4);
        *(.data .data.*)
        . = ALIGN(4);
        _edata = .;
    } > RAM AT > FLASH

    /* The flash's last 64KB, left free for the record (the append-only place).
     * Caution: **The firmware's image must not reach here**, or it steps on the record written.
     * The same value is region_base in ksos/drivers/rp2040/flash.kspls (`make test-conventions`
     * looks at their agreement). */
    _flash_image_end = LOADADDR(.data) + SIZEOF(.data);
    ASSERT(_flash_image_end <= ORIGIN(FLASH) + 0x1f0000,
        "firmware image reaches into the flash region reserved for records (0x1f0000..)")

    .bss : {
        . = ALIGN(4);
        _sbss = .;
        *(.bss .bss.*)
        *(COMMON)
        . = ALIGN(4);
        _ebss = .;
    } > RAM

    /* The crash record from a panic (see ksos/port/cortex_m/link.ld). */
    .noinit_panic (NOLOAD) : {
        . = ALIGN(4);
        *(.noinit_panic)
    } > RAM

    /* throw the unwinding information away, which bare metal does not need */
    /DISCARD/ : {
        *(.ARM.exidx*)
        *(.ARM.extab*)
    }
}
