#!/usr/bin/env python3
# The interrupt-driven UART0 RX echo demonstration test for
# ksos/demo/cortex_m/cortex_m_uart_irq_echo.kspls. The thread of it belongs to
# ksos/tests/uart_probe.py; what this settles is only what to send.
#
# **One byte is enough**: the demo receives it only once NVIC IRQ0 (the UART0 RX interrupt) wakes
# it from WFI, so the round trip is itself the proof of interrupt-driven I/O.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from uart_probe import echo_probe  # noqa: E402  (needs the sys.path above)

ELF = sys.argv[1] if len(sys.argv) > 1 else "out/ksos_cm/ksos_cm_uart_irq_echo.elf"

if __name__ == "__main__":
    sys.exit(echo_probe(ELF, "uart_irq_echo_test.sock", b"Q",
        "UART0 RX byte echoed back via a genuine NVIC interrupt + WFI wakeup"))
