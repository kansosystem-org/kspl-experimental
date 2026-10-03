// ==========================================
// Kanso OS — the smallest console output and exit, over ARM semihosting.
// A test aid for QEMU (-semihosting), which catches BKPT 0xAB: a demo prints and exits by itself.
// Not for real hardware.
// ==========================================
#include <stdint.h>

// The semihosting call that issues BKPT 0xAB with r0=op, r1=arg.
static void semihost(int op, void* arg) {
    register int r0 __asm__("r0") = op;
    register void* r1 __asm__("r1") = arg;
    __asm__ volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
}

// Puts one character out (SYS_WRITEC = 0x03. r1 is a pointer to the character).
void ksos_console_char(unsigned char c) {
    volatile unsigned char ch = c;
    semihost(0x03, (void*)&ch);
}

// Exits QEMU (SYS_EXIT = 0x18). In 32-bit ARM's classic form r1 is the reason code itself, not a
// pointer; ADP_Stopped_ApplicationExit gives exit code 0.
void ksos_qemu_exit(void) {
    semihost(0x18, (void*)0x20026u);
}
