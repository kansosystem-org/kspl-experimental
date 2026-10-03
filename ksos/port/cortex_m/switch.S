/* ==========================================
 * Kanso OS — the ARM Cortex-M context switch (saving every register, over PendSV).
 * Every switch, cooperative or preemptive, goes through PendSV alone, so the saved frame is one
 * shape and mixing the two is safe. The threads use PSP and the exception handlers MSP.
 *
 * The hardware has already saved {r0-r3,r12,lr,pc,xPSR} to PSP; here {r4-r11} are saved and
 * restored, and PSP is swapped over.
 * Where they are saved to and restored from is the C side's g_pendsv_from / g_pendsv_to (a
 * ksos_ctx*, whose head is the saved SP).
 * ========================================== */
    .syntax unified
    .thumb          /* the CPU (cortex-m3 / cortex-m33 etc.) is named by the -mcpu compile flag */

    .section .text.PendSV_Handler, "ax", %progbits
    .global PendSV_Handler
    .type PendSV_Handler, %function
    .thumb_func
PendSV_Handler:
    mrs     r0, psp             /* r0 = the present thread's PSP               */
    stmdb   r0!, {r4-r11}       /* save the callee-saved to PSP                */
    ldr     r1, =g_pendsv_from
    ldr     r1, [r1]            /* r1 = from_ctx (ksos_ctx*)                    */
    str     r0, [r1]            /* from_ctx->sp = PSP after saving             */
    ldr     r1, =g_pendsv_to
    ldr     r1, [r1]            /* r1 = to_ctx                                 */
    ldr     r0, [r1]            /* r0 = to_ctx->sp                             */
    ldmia   r0!, {r4-r11}       /* restore the next thread's callee-saved      */
    msr     psp, r0             /* swap PSP over to the next thread            */
    bx      lr                  /* EXC_RETURN (0xFFFFFFFD): return to thread/PSP */
    .size PendSV_Handler, . - PendSV_Handler
