/* ==========================================
 * Kanso OS — the ARM Cortex-M0/M0+ (Armv6-M) context switch (saving every register, over PendSV).
 *
 * Its role and saved-frame format are cortex_m/switch.S's, rewritten: Thumb-1's `stmia`/`ldmia`
 * cover r0-r7 alone, so r8-r11 go by way of r4-r7 with `mov` (the usual Cortex-M0 RTOS procedure).
 *
 * The frame is the same as cortex_m/switch.S's (the initial frame ksos_port_ctx_create in
 * ksos_port_cm.c assembles is CPU-independent):
 *   [sp+0..+28]  the callee-saved r4,r5,r6,r7,r8,r9,r10,r11 (which this handler reads and writes)
 *   [sp+32..+60] r0-r3,r12,lr,pc,xPSR, which the hardware saves and restores by itself
 * The hardware has already saved the latter; here r4-r11 are saved and restored, and PSP swapped.
 * Where they are saved to and restored from is the C side's g_pendsv_from / g_pendsv_to (a
 * ksos_ctx*, whose head is the saved SP).
 * ========================================== */
    .syntax unified
    .thumb          /* the CPU is fixed at -mcpu=cortex-m0plus (Armv6-M) */

    .section .text.PendSV_Handler, "ax", %progbits
    .global PendSV_Handler
    .type PendSV_Handler, %function
    .thumb_func
PendSV_Handler:
    mrs     r0, psp             /* r0 = the present thread's PSP               */
    subs    r0, r0, #32         /* take room to save r4-r11 (8 words)          */
    stmia   r0!, {r4-r7}        /* save r4-r7 (r0 advances by +16)             */
    mov     r4, r8
    mov     r5, r9
    mov     r6, r10
    mov     r7, r11
    stmia   r0!, {r4-r7}        /* save r8-r11 by way of r4-r7 (r0 is head+32 = the old PSP) */
    subs    r0, r0, #32         /* return r0 to the saved area's head (the new saved PSP) */
    ldr     r1, =g_pendsv_from
    ldr     r1, [r1]            /* r1 = from_ctx (ksos_ctx*)                    */
    str     r0, [r1]            /* from_ctx->sp = PSP after saving             */
    ldr     r1, =g_pendsv_to
    ldr     r1, [r1]            /* r1 = to_ctx                                 */
    ldr     r0, [r1]            /* r0 = to_ctx->sp (the saved area's head)     */
    mov     r1, r0
    adds    r1, r1, #16         /* r1 = where r8-r11 are saved                 */
    ldmia   r1!, {r4-r7}        /* read r8-r11's values into r4-r7 (r1 advances by +16) */
    mov     r8, r4
    mov     r9, r5
    mov     r10, r6
    mov     r11, r7
    ldmia   r0!, {r4-r7}        /* restore the next thread's own r4-r7         */
    msr     psp, r1             /* r1 is the saved area's head+32 = the head of the hardware's
                                   saved frame */
    bx      lr                  /* EXC_RETURN (0xFFFFFFFD): return to thread/PSP */
    .size PendSV_Handler, . - PendSV_Handler
