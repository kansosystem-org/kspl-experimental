/* ==========================================
 * Kanso OS — the ARM Cortex-M context switch (saving every register, over PendSV).
 * Every switch, cooperative or preemptive, goes through PendSV alone, so the saved frame is one
 * shape and mixing the two is safe. The threads use PSP and the exception handlers MSP.
 *
 * The hardware has already saved {r0-r3,r12,lr,pc,xPSR} to PSP; here {r4-r11} are saved and
 * restored, and PSP is swapped over.
 * Where they are saved to and restored from is the C side's g_pendsv_running / g_pendsv_to (a
 * ksos_ctx*, whose head is the saved SP). **Only this handler moves g_pendsv_running on**, to the
 * context it restores: an interrupt that preempts it before `cpsid i` changes only g_pendsv_to
 * (see ksos_port_switch), so the thread saved is always the one that was running.
 * The rest runs with interrupts masked (cpsid i): an interrupt handler that gives schedules too,
 * and a g_pendsv_to rewritten between its read and the restore would be lost.
 * ========================================== */
    .syntax unified
    .thumb          /* ARMv7-M without an FPU frame; a Cortex-M33 needs more (DESIGN-rtos.md) */

    .section .text.PendSV_Handler, "ax", %progbits
    .global PendSV_Handler
    .type PendSV_Handler, %function
    .thumb_func
PendSV_Handler:
    cpsid   i                   /* no interrupt in the middle (see above)      */
    mrs     r0, psp             /* r0 = the present thread's PSP               */
    stmdb   r0!, {r4-r11}       /* save the callee-saved to PSP                */
    ldr     r2, =g_pendsv_running
    ldr     r1, [r2]            /* r1 = the running thread's ksos_ctx*         */
    str     r0, [r1]            /* running->sp = PSP after saving              */
    ldr     r1, =g_pendsv_to
    ldr     r1, [r1]            /* r1 = to_ctx                                 */
    str     r1, [r2]            /* g_pendsv_running = to_ctx                   */
    ldr     r0, [r1]            /* r0 = to_ctx->sp                             */
    ldmia   r0!, {r4-r11}       /* restore the next thread's callee-saved      */
    msr     psp, r0             /* swap PSP over to the next thread            */
    cpsie   i                   /* PRIMASK was 0 on entry, or PendSV could not run */
    bx      lr                  /* EXC_RETURN (0xFFFFFFFD): return to thread/PSP */
    .size PendSV_Handler, . - PendSV_Handler
