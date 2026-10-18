/* ==========================================
 * Kanso OS — the nRF51's external interrupts, after the vector table cortex_m0/startup.S holds.
 * That table ends at IRQ0, the one line the shared demos raise from software; the nRF51's own
 * lines go on from IRQ1 here, and link.ld places this section straight after it. The table stops
 * at the last line something here uses (TIMER0's), since nothing enables a later one.
 * An nRF51 peripheral's line is its address's ID: TIMER0 at 0x40008000 is IRQ8.
 * ========================================== */
    .syntax unified
    .thumb

    .section .isr_vector.irqs, "a", %progbits
    .align 2
    .word Default_Handler       /* 17: IRQ1 RADIO                          */
    .word Default_Handler       /* 18: IRQ2 UART0                          */
    .word Default_Handler       /* 19: IRQ3 SPI0/TWI0                      */
    .word Default_Handler       /* 20: IRQ4 SPI1/TWI1                      */
    .word Default_Handler       /* 21: IRQ5 (no peripheral)                */
    .word Default_Handler       /* 22: IRQ6 GPIOTE                         */
    .word Default_Handler       /* 23: IRQ7 ADC                            */
    .word timer0_irq8_handler   /* 24: IRQ8 TIMER0 (ksos/drivers/nrf51/timer.kspl) */

/* TIMER0's handler where no demo exports one: the interrupt is enabled only by a demo that
 * handles it, so reaching here is a fault, and it stops as Default_Handler does. */
    .section .text.timer0_irq8_handler, "ax", %progbits
    .weak timer0_irq8_handler
    .type timer0_irq8_handler, %function
    .thumb_func
timer0_irq8_handler:
    b       timer0_irq8_handler
    .size timer0_irq8_handler, . - timer0_irq8_handler
