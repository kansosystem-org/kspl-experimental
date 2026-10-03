/* ==========================================
 * Kanso OS — the Raspberry Pi Pico / Pico W (RP2040) stage 2 bootloader.
 *
 * The boot ROM copies this file (the flash's first 256 bytes) to the end of SRAM and runs it. It
 * sets SSI (the QSPI controller) into XIP mode, so reads of the flash address space become 03h
 * serial read commands, then — only where it came from the boot ROM — jumps by way of VTOR to the
 * real vector table at Flash+0x100.
 *
 * This file is the same SSI setting sequence and exit handling as pico-sdk's two files below (both
 * Raspberry Pi (Trading) Ltd., BSD-3-Clause), rewritten as bare register offsets with none of
 * pico-sdk's headers:
 *   - src/rp2040/boot_stage2/boot2_generic_03h.S    (the SSI setting)
 *   - src/rp2040/boot_stage2/asminclude/boot2_helpers/exit_from_boot2.S (the exit handling)
 * It takes the most conservative setting, standard 1-bit SPI's 03h read, so it depends on no
 * particular flash chip: certainty ahead of performance.
 *
 * Position-independent code is required: the link address and the execution address differ
 * (ldr rX,=literal is a PC-relative load, so it is fine).
 * After the build, pad_checksum.kspls shapes it into 256 bytes (the code plus the padding plus the
 * 4-byte checksum) and it goes into the final link (the details are in ksos/docs/DESIGN.md).
 * ========================================== */
    .syntax unified
    .cpu cortex-m0plus
    .thumb

    .section .entry, "ax", %progbits
    .global _stage2_boot
    .type _stage2_boot, %function
    .thumb_func
_stage2_boot:
    push    {lr}                   /* lr==0 means from the boot ROM, and non-zero an ordinary call
                                      in RAM */

    ldr     r3, =0x18000000        /* XIP_SSI_BASE */

    /* disable SSI once so the settings can be changed */
    movs    r1, #0
    str     r1, [r3, #0x08]        /* SSI_SSIENR_OFFSET */

    /* the baud rate's divisor (clk_sys / 4. pico-sdk's PICO_FLASH_SPI_CLKDIV default) */
    movs    r1, #4
    str     r1, [r3, #0x14]        /* SSI_BAUDR_OFFSET */

    /* CTRLR0: a standard 1-bit SPI frame, a 32-bit transfer, EEPROM read mode
     * (SPI_FRF=STD(0)<<21 | DFS_32=31<<16 | TMOD=EEPROM_READ(3)<<8) */
    ldr     r1, =0x001f0300
    str     r1, [r3, #0x00]        /* SSI_CTRLR0_OFFSET */

    /* SPI_CTRLR0: the 03h (READ) command, a 24-bit address, an 8-bit command length, and both the
     * command and the address 1-bit serial (TRANS_TYPE=1C1A=0)
     * (CMD=0x03<<24 | ADDR_L=6<<2 | INST_L=2<<8) */
    ldr     r1, =0x03000218
    ldr     r0, =0x180000f4        /* XIP_SSI_BASE + SSI_SPI_CTRLR0_OFFSET */
    str     r1, [r0]

    /* NDF=0 (one 32-bit word alone is read per APB access) */
    movs    r1, #0
    str     r1, [r3, #0x04]        /* SSI_CTRLR1_OFFSET */

    /* re-enable SSI. From here reads of the XIP address space are turned transparently into 03h
     * commands */
    movs    r1, #1
    str     r1, [r3, #0x08]        /* SSI_SSIENR_OFFSET */

    /* --- the exit handling (the exit_from_boot2 equivalent) --- */
    pop     {r0}
    cmp     r0, #0
    beq     1f
    bx      r0                      /* where it was called as an ordinary function from RAM, it
                                       returns here */
1:
    ldr     r0, =0x10000100         /* XIP_BASE + 0x100 (ksos's real vector table g_vector_table) */
    ldr     r1, =0xe000ed08         /* PPB_BASE + M0PLUS_VTOR_OFFSET(SCB->VTOR) */
    str     r0, [r1]
    ldmia   r0, {r0, r1}            /* r0=the initial MSP, r1=Reset_Handler (no writeback: the
                                       result overwrites r0, as in pico-sdk's own) */
    msr     msp, r0
    bx      r1
    .size _stage2_boot, . - _stage2_boot
