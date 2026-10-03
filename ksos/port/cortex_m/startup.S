/* ==========================================
 * Kanso OS — the smallest start-up for ARM Cortex-M (Armv7-M / Armv8-M).
 * It puts the vector table (the initial MSP plus the reset handler) at the head of FLASH and, after
 * reset, copies .data from FLASH to RAM and zeroes .bss before calling ksos_main.
 * It uses no CPU-dependent instruction, so the same thing works on a Cortex-M3 and a Cortex-M33.
 * ========================================== */
    .syntax unified
    .thumb          /* the CPU (cortex-m3 / cortex-m33 etc.) is named by the -mcpu compile flag */

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
    .word Default_Handler   /*  4: MemManage                           */
    .word Default_Handler   /*  5: BusFault                            */
    .word Default_Handler   /*  6: UsageFault                          */
    .word 0                 /*  7-10: reserved                         */
    .word 0
    .word 0
    .word 0
    .word Default_Handler   /* 11: SVCall                              */
    .word Default_Handler   /* 12: DebugMonitor                        */
    .word 0                 /* 13: reserved                            */
    .word PendSV_Handler    /* 14: PendSV  (the context switch)        */
    .word SysTick_Handler   /* 15: SysTick (the preemptive tick)       */
    .word uart0_irq0_handler /* 16: IRQ0 (an external interrupt. On the mps2-an385 it is
                                 assigned to UART0's RX interrupt. The weak default does
                                 nothing) */
    .size g_vector_table, . - g_vector_table

/* --- the reset handler --- */
    .section .text.Reset_Handler, "ax", %progbits
    .global Reset_Handler
    .type Reset_Handler, %function
    .thumb_func
Reset_Handler:
    /* Switch thread mode to PSP (the exception handlers go on using MSP). From here ksos_main, the
     * scheduler and every task run on PSP, and PendSV can switch them uniformly.
     * MSP uses _estack, and the thread's (the main) PSP uses _thread_stack_top. */
    ldr     r0, =_thread_stack_top
    msr     psp, r0
    movs    r0, #2          /* CONTROL: SPSEL=1 (PSP), nPRIV=0 (privileged) */
    msr     control, r0
    isb
    /* copy .data from the LMA (FLASH) to the VMA (RAM) */
    ldr     r0, =_sdata
    ldr     r1, =_edata
    ldr     r2, =_sidata
1:
    cmp     r0, r1
    bcs     2f              /* where r0 >= r1, done */
    ldr     r3, [r2], #4
    str     r3, [r0], #4
    b       1b
2:
    /* zero .bss */
    ldr     r0, =_sbss
    ldr     r1, =_ebss
    movs    r3, #0
3:
    cmp     r0, r1
    bcs     4f
    str     r3, [r0], #4
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
