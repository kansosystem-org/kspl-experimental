#!/usr/bin/env python3
"""It connects to QEMU's UART0 from outside and looks at whether the bytes sent come
back as they were.

There are two demonstrations of the UART echo in `ksos/demo/cortex_m/` (plain MMIO polling, and
NVIC interrupt-driven).
**The thread looked at is the same** — QEMU's (mps2-an385) UART0
chardev is pointed at a Unix domain socket, sent to, and the return matched. The ARM semihosting
side (standard output) is ignored, and only the bytes going through UART0 are looked at.

Caution: **Do not copy the thread out per demo.** The two copies were 68 and 71 lines, differing only in
the ELF's path, the socket's name, the bytes sent and the sentence reported. Copied, a shape where
the waiting or the tidying up was mended on one side alone stays in silence.
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

# How many times to wait, and at what interval, until the socket exists and also accepts a
# connection.
# Caution: **Do not look once and give up.** There is no socket until QEMU has come up.
CONNECT_TRIES = 50
CONNECT_WAIT_S = 0.1
RECV_TIMEOUT_S = 5
QEMU_WAIT_S = 5

# The length usable for the socket's path.
#
# Caution: **An AF_UNIX path is cut at around 108 bytes** (`sockaddr_un.sun_path`), **so do not
# make it inside the repository**, which may be deep or **carry non-ASCII**; the temporary place
# is short.
# **Refuse when it is short**: a plain `AF_UNIX path too long` sends the reader to suspect QEMU.
SOCK_PATH_LIMIT = 100


def _connect(sock_path):
    """It waits until the socket connects. None where it does not."""
    for _ in range(CONNECT_TRIES):
        try:
            client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            client.connect(sock_path)
            return client
        except (FileNotFoundError, ConnectionRefusedError):
            time.sleep(CONNECT_WAIT_S)
    return None


def echo_probe(elf, sock_name, payload, pass_note):
    """It raises `elf` under QEMU, sends `payload` to UART0 and matches the return.

    **What comes back is an exit code** (the caller passes it to `sys.exit`). The
    verdict's line is printed here.
    """
    # Caution: **Do not place it beside the ELF** (the caution on `SOCK_PATH_LIMIT` above).
    hold = tempfile.mkdtemp(prefix="ksos-uart-")
    sock_path = os.path.join(hold, sock_name)
    if len(sock_path.encode("utf-8")) > SOCK_PATH_LIMIT:
        shutil.rmtree(hold, ignore_errors=True)
        print("RESULT: SOME FAILED (1) -> the socket path is too long for AF_UNIX "
              f"({len(sock_path.encode('utf-8'))} bytes > {SOCK_PATH_LIMIT}): {sock_path}")
        return 1
    proc = subprocess.Popen(
        [
            "qemu-system-arm", "-M", "mps2-an385", "-cpu", "cortex-m3", "-nographic",
            "-semihosting", "-chardev",
            f"socket,id=uart0,path={sock_path},server=on,wait=off", "-serial",
            "chardev:uart0", "-kernel", elf
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        client = _connect(sock_path)
        if client is None:
            print("RESULT: SOME FAILED (1) -> could not connect to the UART0 chardev socket")
            return 1

        client.settimeout(RECV_TIMEOUT_S)
        client.sendall(payload)
        received = b""
        while len(received) < len(payload):
            chunk = client.recv(len(payload) - len(received))
            if not chunk:
                break
            received += chunk
        client.close()

        print(f"sent    : {payload!r}")
        print(f"received: {received!r}")
        if received == payload:
            print(f"RESULT: ALL PASS ({pass_note})")
            return 0
        print("RESULT: SOME FAILED (1) -> the echoed bytes did not match")
        return 1
    finally:
        # **Always tidy up**, or the next round cannot take the same socket.
        try:
            proc.wait(timeout=QEMU_WAIT_S)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        # **Delete the temporary place too** (left behind, they grow every turn).
        shutil.rmtree(hold, ignore_errors=True)
