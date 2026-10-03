#!/usr/bin/env python3
# The real UART0 (CMSDK APB UART, MMIO) receive (RX) test for
# ksos/demo/cortex_m/cortex_m_uart_echo.kspls. The thread of it belongs to
# ksos/tests/uart_probe.py; what this settles is only what to send.
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from uart_probe import echo_probe  # noqa: E402  (needs the sys.path above)

ELF = sys.argv[1] if len(sys.argv) > 1 else "out/ksos_cm/ksos_cm_uart_echo.elf"

if __name__ == "__main__":
    sys.exit(echo_probe(ELF, "uart_echo_test.sock", b"hello-uart\n",
        "UART0 RX echoed back exactly what was sent"))
