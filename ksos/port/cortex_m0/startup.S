/* ==========================================
 * Kanso OS — the smallest start-up for ARM Cortex-M0/M0+ (Armv6-M).
 * The same role as cortex_m/startup.S's (Armv7-M/Armv8-M), in its own file because Thumb-1 has no
 * post-incrementing ldr/str (ldr r3, [r2], #4).
 * The vector table's shape is lined up with cortex_m/startup.S's (the words an M0+ lacks are not
 * referred to), so the two files differ only where they must.
 * ========================================== */
    .syntax unified
    .thumb          /* the CPU is fixed at -mcpu=cortex-m0plus (Armv6-M) */

/* --- the vector table (on reset the CPU reads [0]=the initial SP, [4]=Reset) --- */
    .section .isr_vector, "a", %progbits
    .align 2
    .global g_vector_table
    .type g_vector_table, %object
g_vector_table:
    .word _estack           /*  0: the initial stack pointer (MSP)     */
    .word Reset_Handler     /*  1: reset                               */
    .word Default_Handler   /*  2: NMI                                 */
    .word Default_Handler   /*  3: HardFault                           */
    .word 0                 /*  4-10: reserved (an M0+ has no MemManage/BusFault/
                                UsageFault, and they are not referred to)   */
    .word 0
    .word 0
    .word 0
    .word 0
    .word 0
    .word 0
    .word Default_Handler   /* 11: SVCall                              */
    .word 0                 /* 12: reserved (there is no DebugMonitor) */
    .word 0                 /* 13: reserved                            */
    .word PendSV_Handler    /* 14: PendSV  (the context switch)        */
    .word SysTick_Handler   /* 15: SysTick (the preemptive tick)       */
    .word uart0_irq0_handler /* 16: IRQ0 (an external interrupt. The default is a weak
                                 implementation that does nothing) */
    .size g_vector_table, . - g_vector_table

/* --- the reset handler --- */
    .section .text.Reset_Handler, "ax", %progbits
    .global Reset_Handler
    .type Reset_Handler, %function
    .thumb_func
Reset_Handler:
    /* switch thread mode to PSP (the same scheme as cortex_m/startup.S's) */
    ldr     r0, =_thread_stack_top
    msr     psp, r0
    movs    r0, #2          /* CONTROL: SPSEL=1 (PSP), nPRIV=0 (privileged) */
    msr     control, r0
    isb
    /* Copy .data from the LMA (FLASH) to the VMA (RAM), advancing the pointers with an explicit
     * adds (the only real difference from cortex_m/startup.S). */
    ldr     r0, =_sdata
    ldr     r1, =_edata
    ldr     r2, =_sidata
1:
    cmp     r0, r1
    bcs     2f              /* where r0 >= r1, done */
    ldr     r3, [r2]
    str     r3, [r0]
    adds    r2, r2, #4
    adds    r0, r0, #4
    b       1b
2:
    /* zero .bss */
    ldr     r0, =_sbss
    ldr     r1, =_ebss
    movs    r3, #0
3:
    cmp     r0, r1
    bcs     4f
    str     r3, [r0]
    adds    r0, r0, #4
    b       3b
4:
    bl      ksos_main        /* the KSPL demo's #export entry */
5:
    b       5b              /* halt where it returns */
    .size Reset_Handler, . - Reset_Handler

/* --- the default handler (catching an unused exception) --- */
    .section .text.Default_Handler, "ax", %progbits
    .global Default_Handler
    .type Default_Handler, %function
    .thumb_func
Default_Handler:
    b       Default_Handler
    .size Default_Handler, . - Default_Handler
