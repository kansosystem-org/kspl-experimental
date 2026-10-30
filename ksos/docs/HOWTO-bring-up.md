# Bringing the board up, one stage at a time

**You need the car on the desk, a USB cable, and a PC that can copy a file to a USB drive.** You need no SWD probe (a debugging adapter wired to the chip's debug pins) and no soldering. The car is a Freenove 4WD kit carrying a Raspberry Pi Pico W; what is wired to what is in [`SPEC-board.md`](SPEC-board.md).

Each *stage* builds a small test program, copies it onto the car, and watches for a beep, a light or a line of text. Each adds one new part to parts already checked, so when a stage fails, the new part is the first suspect.

**Do not write here how far each stage has been confirmed.** That is "What has been checked on real hardware" in [ksos](../README.md), and two copies drift.

## What you need first

| What | What it is for | First needed at stage |
| :-- | :-- | :-- |
| The car, its battery charged | Everything; the buzzer and the motors are fed from the battery | 1 |
| A USB cable that carries data, not only power | Copying the program onto the car, and reading its log | 1 |
| A PC that can copy a file to a USB drive | Writing each test program | 1 |
| This repository's build tools (`clang` and the `arm-none-eabi` toolchain; the development container has both) | Building each test program with `make` | 1 |
| A phone frequency-counter app or a tuner (optional) | Measuring the buzzer's pitch | 2a |
| A serial terminal: the Arduino IDE's Serial Monitor, or `screen` | Reading the lines the car prints | 2b |
| A box or stand to put the car's body on, wheels in the air | Any stage that turns the wheels | 3 |
| White paper and black tape | Giving the line sensors something to see | 4 |
| The bundled IR remote | The infrared receiver and driving by remote | 5b |
| The LED matrix module (it takes the ultrasonic module's connector) | The I2C check and the car's face | 5c |
| A PC that can share its connection with the car's USB adapter (the steps here are Windows's) | The network stages | 6a |
| Python (`python -m http.server`) | A web server for the car to call | 6c |
| kssrv built on the PC (`make kssrv`) | The server that hands the car its policy | 7 |

## Words used in this guide

"Words used in this document" in [`SPEC-board.md`](SPEC-board.md#words-used-in-this-document) gives the words for the board's parts and pins, such as GPIO and UF2. These are the rest, in roughly the order they appear.

| Word | What it means here |
| :-- | :-- |
| microcontroller (MCU) | A small computer on one chip. The Pico W's microcontroller is the **RP2040** (a Cortex-M0+ CPU) |
| firmware | The program stored in the microcontroller, which runs at power-on. Each stage writes one firmware |
| probe | A small test firmware that checks one feature and reports by beeps, light or text |
| flash | The chip that keeps the program and data with the power off (2MB on a Pico W). *Flashing* means writing firmware into it |
| boot ROM | Code built into the chip. It runs first after every reset, and it is what takes a UF2 |
| clock tree | The chip's clocks: **XOSC** is the accurate crystal, and the **PLL** multiplies it up |
| enumeration | The exchange right after a USB device is plugged in, in which the PC learns what it is. No data flows until it finishes |
| descriptor | A block of bytes a USB device sends during enumeration to describe itself |
| VID/PID | The vendor and product numbers by which a PC recognises a USB device and remembers its driver |
| NEC | The most common infrared remote protocol. Each press sends an address (which remote) and a command (which button) |
| CDC-NCM | A kind of USB device that looks like a network adapter to the PC ("USB Ethernet") |
| frame, MAC, ARP, ICMP, TCP, HTTP | The network layers. A *frame* is one packet on the wire, sent to a *MAC* (hardware) address. *ARP* finds the MAC for an IP address. *ICMP* carries `ping`. *TCP* is a connection over IP, and *HTTP* runs over TCP |
| atomic operation | A read-and-change of memory that nothing can interrupt. The RP2040's CPU has no instruction for it, so ksos uses the chip's hardware lock (the SIO *spinlock*) |
| kssrv | Kanso's web server, run on the PC in stages 7 and 9 |
| policy | The small neural network and its tables that turn the car's sensor readings into the next manoeuvre |
| manoeuvre | One of the car's moves: `forward`, `back`, `strafe_left` / `strafe_right` (sideways), turning, `stop`, `emergency_back` |
| the record | An append-only log kept in the flash's last 64KB by [ksdb](../../ksdb/README.md) |
| lap | One turn of a firmware's main loop: about 20 seconds for the board firmware, 100ms for a car firmware |
| WS2812 | An RGB LED with its own controller; several are chained and set by one timed signal |

## How the stages fit together

**The stage numbers are names, not the order of starting**; renumbering would break every reference to them. An arrow means "get this working first".

```mermaid
flowchart LR
    S1["1: the buzzer"] --> S2a["2a: the clock"]
    S1 --> S3["3: the wheels"]
    S2a --> S2b["2b: the log over USB"]
    S2b --> S4["4, 5a, 5b, 5c: the sensors"]
    S2b --> B["6d, 8, 10: heap, record, LEDs"]
    S2b --> N["6a, 6b, 6c: a network over USB"]
    N --> D["7: receiving a policy from kssrv"]
    S3 --> D
    D --> S9["9: starting with no PC"]
    B --> S9
    S9 --> L["12: the IR remote"]
```

| # | What it brings up | How you know it worked |
|---|---|---|
| [1](#stage-1--the-buzzer-sounds) | GPIO output: the buzzer | By ear |
| [2a](#stage-2a--matching-the-clock) | The clock tree (XOSC/PLL) | By ear, and a frequency counter |
| [2b](#stage-2b--usb-cdc) | USB CDC: the log on the Serial Monitor | On the screen |
| [3](#stage-3--turning-the-four-wheels) | PWM: the four wheels in every direction | By eye |
| [4](#stage-4--the-adc-and-line-tracking) | The ADC (battery, light) and GPIO input (line tracking) | The Serial Monitor |
| [5a](#stage-5a--the-hc-sr04-ultrasonic) | The HC-SR04 ultrasonic distance sensor | The Serial Monitor |
| [5b](#stage-5b--ir-receiving) | IR receiving (NEC) | The Serial Monitor |
| [5c](#stage-5c--i2c--the-led-matrix) | I2C (the VK16K33 LED matrix) | By eye |
| [6a](#stage-6a--usb-ethernet--cdc-ncm) | USB Ethernet (CDC-NCM) as a network adapter | Device Manager |
| [6b](#stage-6b--passing-8023-frames--ping) | 802.3 frames through `Link` in `ksos/net/link.kspl` | ping from the PC |
| [6c](#stage-6c--running-tcp-and-http-on-real-hardware) | TCP / HTTP | A server on the PC |
| [6d](#stage-6d--heap-and-atomics-on-armv6-m) | The heap and the atomics (`alloc` / `Arc` / `std/http`) | The `[heap]` lines |
| [7](#stage-7--receiving-a-policy-then-deciding-alone) | Deciding in the car on a policy received once | The wheels keep moving with `kssrv.exe` down |
| [8](#stage-8--leaving-a-record-inside-the-device) | An append-only record in the flash's last 64KB | `boot #N` grows each power cycle |
| [9](#stage-9--the-car-keeps-its-policy-and-starts-alone) | Starting with no PC, on the policy kept in the car | With no kssrv, the wheels turn at power-on |
| [10](#stage-10--showing-the-state-as-ws2812-light) | The WS2812 LEDs as a window needing no cable | The `[led]` colours, by eye |
| [12](#stage-12--driving-it-from-the-ir-remote-alone) | Driving by the IR remote alone | The keys change how it drives |

**"Tuning line following", after stage 12, is not a stage**: it holds what stages 7, 9 and 12 share when the car follows a line. **Wireless is not among the stages** ("WiFi (CYW43439) — not implemented in this design" in [`DESIGN-rtos.md`](DESIGN-rtos.md)).

**`make ksos-rp2040-board` is one firmware for stages 2b, 4, 5c, 6d, 8 and 10.** It prints lines tagged `[tag]` for each stage in turn, one lap in about 20 seconds (how to read them: the heading of [`demo/rp2040/rp2040_board_probe.kspl`](../demo/rp2040/rp2040_board_probe.kspl)). `make ksos-rp2040-net` is one firmware for 6a, 6b and 6c.

Caution: **Do not add the stages that turn the wheels (3, 7, 9, 12) to the board firmware.** They need the wheels lifted before writing, and the board firmware runs connected on the desk.

**Stage 2 is split** because USB cannot enumerate until the clock is right, so 2a checks the clock by the buzzer's pitch. **Stage 5 is split** by the tools each part needs. I2C (5c) comes last because it needs the ultrasonic module swapped for the LED matrix.

## Stage 1 — the buzzer sounds

**Goal: a program you built runs on the real chip.** Before USB works a beep is the only output, and these flashing steps are the ones every later stage repeats.

1. Build it:

   ```sh
   make ksos-rp2040-buzzer      # -> out/ksos_rp2040/ksos_rp2040_buzzer.uf2
   ```

2. Connect USB **while holding the Pico W's BOOTSEL button** (if it is connected, unplug it first). A drive named `RPI-RP2` appears.
3. Copy `ksos_rp2040_buzzer.uf2` to that drive. The drive disappears and the Pico W restarts into the program.
4. Expected: **a short 2kHz beep, repeating with a little gap.**

**Every later stage writes its UF2 this way.** Where a stage reads lines of text, unplug USB and plug it in again *without* holding BOOTSEL. With BOOTSEL held, the program does not run. Then open the Serial Monitor at 115200.

Caution: **Switch the car's battery on.** The Pico W runs off USB, but the battery feeds the buzzer and the motors. With the battery off, the write succeeds and nothing sounds.

Caution: **If the drive stays after the copy, the boot ROM ignored the file without a word.** Run ksos's `make test`, which checks the UF2 maker.

### Silencing the buzzer

The program stays in the flash and beeps at every power-on. **To silence it**, connect USB holding BOOTSEL: the program does not run, and another UF2 can replace it. The Arduino IDE writes the car's original sketch back as usual.

## Stage 2a — matching the clock

**Goal: the clocks run from the crystal.** Stage 1's firmware times its beeps with the real µs timer. So its pitch and rhythm are right only if the clock tree is set up.

1. Write stage 1's firmware:

   ```sh
   make ksos-rp2040-buzzer      # -> out/ksos_rp2040/ksos_rp2040_buzzer.uf2
   ```

2. Measure the pitch with a phone's frequency-counter app or a tuner. Expected: **2000Hz, within about 1%.**
3. Count the beeps for 10 seconds by a clock. Expected: **20** (0.25 seconds on, 0.25 off).

**Silence where stage 1 sounded, or a pitch far off, means the clock set-up failed** ("The clocks and the µs timer" in [`DESIGN-rtos.md`](DESIGN-rtos.md)).

## Stage 2b — USB CDC

**Goal: the car prints text on the PC through a USB serial port**, so later stages read a log instead of counting beeps.

1. Write the board firmware:

   ```sh
   make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
   ```

2. Unplug USB and plug it in again without BOOTSEL. Expected: **one** beep (initialized), then **two** more once the PC has enumerated it.
3. A new serial port appears (Device Manager, `ls /dev/tty.*` or `lsusb`): **`ksos CDC`**, VID/PID 0x1209/0x0001.
4. Open it in the Serial Monitor, or with `screen /dev/ttyACM0 115200`. Any baud rate works.
5. Expected, every lap (about 20 seconds, with other stages' lines between): `[board] round=1`, then `[1]`, `[2]`, `[3]` **in that order**, four times at 0.5-second intervals, and **`[2]`'s line ends with `<END`**.

`[2]` is 91 bytes, more than one USB packet, so `<END` shows a line split across packets arrives whole. `[2]` cut short, or only `[1]` arriving, means the send queue is broken.

**When enumeration fails, the car beeps N, how far it got, again and again.** It beeps every 3 seconds while it waits 8 seconds, then at the head of each lap. What each step needs is "USB CDC" in [`DESIGN-rtos.md`](DESIGN-rtos.md).

| N | How far it got |
|---|---|
| 1 | Initialized; no bus reset from a host. **Suspect a power-only USB cable first** |
| 2 | The bus reset; no SETUP request arrived |
| 3 | SETUP arrived; the descriptor's reply failed |
| 4 | An address was assigned; the 67-byte configuration descriptor did not go out in full |
| 5 | The configuration descriptor went out; no `SET_CONFIGURATION` came |
| 6 | Configured; `is_configured` reads wrong |
| 9, then silence | `usb.init()` itself failed |

## Stage 3 — turning the four wheels

**Goal: each motor is wired and signed right**: each wheel alone, then the car in every direction.

Caution: **Lift the wheels off before writing it.** Put the body on a box so that no wheel touches anything. A wheel wired with reversed polarity drives the wrong way, and the car falls off the desk.

1. Put the car's body on a box, and switch the battery on.
2. Write the motor firmware:

   ```sh
   make ksos-rp2040-motor       # -> out/ksos_rp2040/ksos_rp2040_motor.uf2
   ```

3. Expected, at 30% speed and 1 second a step:
   1. **One** beep, then **each wheel alone, all forward**, in the order front left, rear left, rear right, front right.
   2. **Two** beeps, then forward, back, sideways both ways, diagonally, turning both ways.
   3. **Two** beeps, and the wheels stay stopped.

**The first part is the real check.** A wrong order means `motor_pin_a/b` disagrees with the wiring ("The right side reverses pin names and forward/back" in [`SPEC-board.md`](SPEC-board.md)). A wheel turning backward means `board.WHEEL_POLARITY` does not fit this unit ("The direction of rotation differs from unit to unit" in [`SPEC-board.md`](SPEC-board.md)).

In the second part, moving sideways turns the front left and rear right one way, and the other pair the other way. Moving diagonally turns only one diagonal pair. The body must move right for positive `lateral` and clockwise for positive `rotation` in `drive()`.

## Stage 4 — the ADC and line tracking

**Goal: the battery voltage, the two light sensors (ADC) and the three line sensors (GPIO input) follow real changes.** It needs stage 2b working.

1. Write the board firmware, and open the Serial Monitor:

   ```sh
   make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
   ```

2. Each lap, the `[sensor]` line is followed by eight lines, one every 0.5 seconds:

   ```
   [sensor] ADC 12bit (0-4095); press a remote button while these lines run
   bat=7.912V(2454)  light L= 812 R= 907  line=B.W.B (101)  dist= 245mm  ir=--
   ```

3. Change what each sensor sees, and watch its field move (`dist=` and `ir=` are stages 5a and 5b):

| Field | Expected | Confirm by moving something |
| :-- | :-- | :-- |
| `bat=` | About 8.4V (full) to 6.8V; the raw 12-bit value in brackets | Switch the battery off: near 0V |
| `light L= R=` | 0 to 4095 | **Hold a hand over it: it falls** |
| `line=` | Three of `B` (black) / `W` (white), left to right; in brackets as `left<<2 \| centre<<1 \| right` | White paper and black tape swap them |

Caution: **Confirm that each value moves.** A fixed value looks the same as a pin with nothing connected.

Caution: **Cover the leftmost line sensor and check that the left character changes.** If the right one changes instead, flip `board.LINE_SENSOR_SWAPPED` ("Line tracking" in [`SPEC-board.md`](SPEC-board.md)). All three stuck the same usually means the sensor board's sensitivity trimmer (a small adjustable resistor) needs turning.

**No lines and N beeps at the head of each lap** means USB did not enumerate: back to stage 2b. **`bat=` at about a quarter of the real voltage** means the 12-bit resolution was mixed up with Arduino's 10 ("The ADC" in [`DESIGN-rtos.md`](DESIGN-rtos.md)).

## Stage 5a — the HC-SR04 ultrasonic

**Goal: the ultrasonic distance follows a hand.** It uses stage 4's firmware and line; look at `dist=`.

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

Expected: **tens to hundreds of mm, shrinking as a hand comes close** and growing as it goes away. `>3000mm` means no echo came back, as when pointed at a ceiling.

Caution: **`----` is not "far away"**: ECHO never went up. Suspect the wiring: the module plugged into the GPIO 4/5 connector, TRIG on 4 and ECHO on 5.

## Stage 5b — IR receiving

**Goal: the infrared receiver decodes the bundled remote.** It uses stage 4's firmware and line; look at `ir=`. The receiver is always on GPIO 3, so no wiring changes.

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

**Press buttons while the sensor lines flow** (4 seconds of each lap). Expected, after `--`:

```
... dist= 245mm  ir=A0:C69 x3
```

`C` is the button and **differs per button**; `A` is the remote's address and stays the same; `xN` counts receptions and **grows while a button is held**.

Caution: **Confirm a different `C` for each of several buttons.** One button alone cannot be told from noise.

Caution: **`xN` growing with nothing pressed is fluorescent light or sunlight**: shade the receiver. The lines pausing while a button is held is expected (a frame takes up to 70ms).

## Stage 5c — I2C / the LED matrix

**Goal: the I2C bus works, shown by drawing on the LED matrix.**

Caution: **Only this stage changes the wiring.** **Swap the ultrasonic module for the LED matrix** on the GPIO 4/5 connector ("The ultrasonic and the LED matrix exclude each other" in [`SPEC-board.md`](SPEC-board.md)). The firmware rescans the bus each lap, so it can be swapped while running.

1. Unplug the ultrasonic module from the GPIO 4/5 connector and plug in the LED matrix.
2. Write the board firmware, if it is not already on the car:

   ```sh
   make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
   ```

3. Expected `[i2c]` lines:

   ```
   [i2c] scan: 0x71
   [i2c] using 0x71
   [i2c] matrix init: ok
   [i2c] frame    0 to=0x71 scan=0x71 init=ok fails=0 why=none
   [i2c] frame    1 to=0x71 scan=0x71 init=ok fails=0 why=none
   ```

4. Expected on the matrix: **a band keeps flowing.**

The address is the first one the scan finds, else 0x70; this unit answers on 0x71. `why=` names the last failure: `addr-nack` (nobody at that address), `data-nack` (present but refusing the data), `timeout` (the device still holds the bus).

Caution: **`fails=0` means only that the matrix acknowledged the writes, not that it displayed**, so judge by eye.

Caution: **If `why=timeout` stays, unplug the matrix and plug it back in** to make it let go of the bus. If it persists, switch the car off and on. `scan=none` with `why=addr-nack` means nothing answers: check that the matrix is plugged in.

Caution: **Put the ultrasonic module back afterwards**, or stages 4, 5a and 5b read `dist=----`.

---

## Stage 6a — USB Ethernet / CDC-NCM

**Goal: the car shows up on the PC as a network adapter (CDC-NCM)** beside stage 2b's serial port, on one cable. It needs stage 2b working. One firmware serves stages 6a, 6b and 6c ("The USB-Ethernet probe's steps and what the PC needs" in [`DESIGN-rtos.md`](DESIGN-rtos.md)).

1. Build the network firmware, and write `out/ksos_rp2040/ksos_rp2040_net.uf2` as in stage 1:

   ```sh
   make ksos-rp2040-net
   ```

2. Unplug USB and plug it in again, and open the Serial Monitor.
3. Expected:
   * **Two** beeps, then silence. N beeps repeating instead is how far enumeration got, as in stage 2b's table.
   * Device Manager: a COM port under Ports, and **one more entry under Network adapters**.
   * The Serial Monitor: `ncm t= stage= alt= link=down` every second, then `[ncm] link=up` once, with `alt=1`.

Caution: **If the COM port appears but the network adapter does not, remove the old `ksos CDC` and replug.** Windows remembers the driver per VID/PID, and this firmware's PID is 0x0002, not stage 2b's 0x0001. Enable "Show hidden devices" in Device Manager to see the old entry.

Caution: **Windows 10 has no standard CDC-NCM driver**: the adapter shows a "!", and "USB NCM" has to be chosen by hand. Windows 11 ships `UsbNcm.sys`.

### The setting on the PC side (sharing the internet connection)

Windows's internet connection sharing lets the car reach beyond the PC, through the PC's Wi-Fi.

1. In Windows, open Settings → Network → the Wi-Fi adapter's properties → the Sharing tab.
2. Enable "Allow other network users to ... connection".
3. Pick this USB adapter.

By Windows's default this puts the PC at 192.168.137.1.

## Stage 6b — passing 802.3 frames / ping

**Goal: network frames flow both ways over the cable**, shown by pinging the car from the PC.

1. **Set up the PC first**: share the Wi-Fi connection to stage 6a's USB adapter ("The setting on the PC side (sharing the internet connection)" above).
2. Write the network firmware (the same as stage 6a):

   ```sh
   make ksos-rp2040-net
   ```

3. At the command prompt:

   ```
   ping 192.168.137.50
   ```

4. Expected: **replies**, once stage 6c's run has finished (about 20 seconds of ARP retries if no server answers). The Serial Monitor shows a line like `net t=75 rx=173 arp=1 ping=14 drop=0`, with `rx=` and `ping=` growing and **`drop=` staying 0**. `arp -a` on the PC lists 192.168.137.50 as 02-00-00-00-00-01.

`rx` far above `arp + ping` is normal (the car ignores broadcast and multicast), and so is `arp=1` staying put (Windows caches a resolved MAC).

Caution: **The car's address is fixed at 192.168.137.50, with no DHCP.** `rx=` growing while `arp=` does not means the shared subnet is another one. Change `init_addrs` in `ksos/demo/rp2040/common/net_client.kspl`, or set 192.168.137.1/24 on the USB adapter by hand.

## Stage 6c — running TCP and HTTP on real hardware

**Goal: `ksos/net`'s TCP and HTTP run on the real chip.** The car resolves the PC's MAC over ARP and opens a TCP connection to a web server on the PC. It sends an HTTP GET and reads the answer. **Done means both sides**: the handshake in the Serial Monitor, and the request on the PC.

1. **Set up the PC first**: stage 6b's sharing (the PC at 192.168.137.1), and an HTTP server:

   ```
   python -m http.server 8080
   ```

2. Write the network firmware, replug, and open the Serial Monitor:

   ```sh
   make ksos-rp2040-net
   ```

3. Expected beeps: **one** (USB initialized), **two** (the link up, as in stage 6a), then **three** (everything went through). One after the link means it stopped at ARP; two means ARP went through and HTTP did not.
4. Expected lines, then the result line every second:

   ```
   [ncm] link=up
   [net] link up, resolving peer
   [arp] peer mac 02:00:00:00:00:02
   [tcp] handshake ok (http)
   [http] sent=58
   [http] recv=1024
   [http] status200=1 head=152
   [http] total=2318 segs>1=1
   net t=1 rx=72 arp=0 ping=0 drop=0 txf=0 upper arp=ok http=ok arpf=6 et=0800 from=192.168.137.1
   ```

5. Expected on `python -m http.server`'s console: `192.168.137.50 - - [...] "GET / HTTP/1.1" 200 -`.

| The symptom | What to do |
| :-- | :-- |
| `arp=NG`, `from=` still 0.0.0.0 | Nothing reaches the PC: redo stage 6b's sharing |
| `arp=NG`, `from=` another address | The PC is there: set `peer_ip` in `net_client.init_addrs` to it, and `our_ip` in its subnet |
| `arp=ok` but `[tcp] TIMEOUT: no SYN-ACK` | Start the server on port 8080, and let it through Windows Defender Firewall on the USB adapter's side |
| `status200=0` with a non-zero `head=` | The server answered another status (a 404 or the like): check its console |

## Stage 6d — heap and atomics on Armv6-M

**Goal: the heap and the atomic operations work on this chip.** Its CPU has no atomic instructions ("Armv6-M has no atomics, so the port supplies them" in [`DESIGN-rtos.md`](DESIGN-rtos.md)).

1. Write the board firmware and open the Serial Monitor:

   ```sh
   make ksos-rp2040-board
   ```

2. Expected: the `[heap]` stage prints one `[ok]` line per check and ends with **`RESULT pass=11 fail=0`**:

   ```
   [heap] SIO spinlock, round=1
   [ok]   alloc: three blocks are independent
   [ok]   alloc: freed block is reused
   [ok]   alloc: adjacent free blocks coalesce
   [ok]   atomic: store/load
   [ok]   atomic: fetch_add returns the old value
   [ok]   atomic: cas succeeds on a match
   [ok]   atomic: cas fails on a mismatch
   [ok]   Arc: new/clone/get and scope-exit release
   [ok]   std/http: status line
   [ok]   std/http: header lookup
   [ok]   std/http: body
   RESULT pass=11 fail=0
   ```

**Lines stopping partway mean it froze at that check** (taking and releasing the spinlock do not mesh). The report repeats every lap.

---

## Stage 7 — receiving a policy, then deciding alone

**Here the car receives a whole policy once at start-up, disconnects, and decides alone** ("What the self-driving probe does" in [`DESIGN-rtos.md`](DESIGN-rtos.md)).

```mermaid
sequenceDiagram
    participant Car
    participant PC as kssrv on the PC
    Note over Car,PC: at start-up
    Car->>PC: GET /pilot_policy.safetensors
    PC->>Car: the policy (the weights, the manoeuvre table, the preprocessing constants)
    Car->>PC: close the connection
    Note over Car: after that, with no PC
    loop every lap
        Car->>Car: read the sensors, settle the next manoeuvre, turn the four wheels
    end
```

Caution: **Lift the wheels off**: a hand is too slow to catch a start in an unintended direction.

**Plug in the ultrasonic module, not the LED matrix.** Lifted, the reflective sensors see nothing and read `line=7` ("a junction or an end"), so the answer is always `stop`. To see the other manoeuvres, slip white paper under the reflective sensors (`line=0`).

**The car applies its safety timeouts outside the policy** ("The safety timeouts of each firmware" below). **kssrv is needed only while the policy is received**: it serves the folder holding `ksos/demo/cortex_m/pilot_policy.safetensors`, with the sharing as in stage 6c.

### How to proceed

1. On the PC, build and start kssrv, then build the car's firmware:

   ```
   make kssrv                     # on the PC side (only while it is being received)
   ./out/kssrv.exe 8080 ksos/demo/cortex_m   # on the PC side: serves the policy file
   make ksos-rp2040-car-pilot    # the car side's UF2
   ```

2. Write `ksos_rp2040_car_pilot.uf2`, replug, and open the Serial Monitor. The buzzer sounds only until enumeration: **one beep, then silence** is going well (the other counts are in the table after these steps).
3. The wheels do not move until the first line below appears (if it does not, check kssrv and the sharing):

   ```
   [car] policy on board, link closed — deciding here from now on   <- it was received
   [car] no policy — staying put                                    <- it was not
   ```

   **A refused policy names its source and the check that refused it**, as in `[car] fresh policy refused: bad_shape`. A refused fresh policy falls back to the stored one (`fresh policy refused — using the one stored on board`). It stays put only when neither can be used.

4. Then it prints one line every 10 laps (about a second):

   ```
   car t=10 dist= 245mm line=2 bat=7.912V drive=(0,50,0) n=10 us=12525 emerg=0 drop=0
   ```

| Field | What it counts |
|---|---|
| `n` | Decisions made in the car. **Its growth is the evidence of driving itself** |
| `us` | One decision's time in µs (around 10ms). **Do not rely on the absolute value.** It moves with the XIP cache (through which the CPU runs code from flash), and jumps after a record is written |
| `emerg` | Laps where it overrode the policy at close range and backed off. **`n` + `emerg` = `t`**; a mismatch means a lost count |
| `drop` | Sends lost. It sends nothing after receiving, so it must not grow |
| `HALTED:` | It stopped on the safe side; the reason follows |

What the beeps in step 2 mean:

| The beeps | What it means |
|---|---|
| **One, then silence** | USB initialized: going well; the rest shows on the console |
| Four, then silence | The ADC did not wake (suspect `clk_adc`) |
| Five, then silence | PWM did not wake (every later instruction is ignored) |
| Nine, then silence | `usb.init()` failed: back to stage 2b |
| N, repeating | Not enumerated; N is how far it got, as in stage 2b (replugging starts over) |

#### Bringing it back when the battery stopped it

**Switch the battery off and on** to clear `HALTED: battery low` (only that halt).

```
car t=2100 ... HALTED: battery low (1.163V, now 1.155V)   <- still off. Switch it on and now rises
car t=2110 ... HALTED: battery low (1.163V, now 7.903V)   <- it arrived. re-armed comes out after this
[car] battery back — re-armed, deciding again
```

The parentheses hold the voltage when it stopped, and `now`, the present reading. **Only `now` shows whether switching on reached the car.** Off reads about 1V, so only a deliberate off and on counts as "back", never a weak battery recovering.

Caution: **Do not unplug USB, and keep the wheels lifted.** Unplugging loses the console and the received policy. The car starts off the instant the battery is on.

#### How to confirm that it is deciding for itself

1. **Start the car with kssrv up.** In the other order the car gets no policy and never moves.
2. **Then shut down the `kssrv.exe` process.** Do not pull the USB cable, which also carries the console where `n` and `us` are read.
3. `fetch_policy` sends `Connection: close`, so kssrv shows `conn #N closed` and the loop sends nothing after.
4. **`n` growing, and the wheels turning, are the evidence.**

The only path to the wheels (`apply`) is `one_round` inside `if ready && !halted`. The car also runs on the battery with the cable off, but then only the wheels can be seen.

### The safety timeouts of each firmware

**Each car firmware stops, or holds the wheels back, by itself in these cases**, whatever the policy says, and with no link.

| The car sees | It | `car-pilot` (7, 9) | `car-ir` (12) | How it comes back |
| :-- | :-- | :--: | :--: | :-- |
| The battery under `BATTERY_LOW_MV` on `LOW_ROUNDS` **consecutive** laps (`ksos/demo/rp2040/common/battery.kspl`) (a motor's inrush dips it for an instant) | Stops | ✅ | — | Switch the battery off and on ("Bringing it back when the battery stopped it" above) |
| The distance under `emergency_mm` (100mm) | Backs off | ✅ | — | By itself, once the distance grows |
| No policy received, and none in the record | Never moves | ✅ | — | Receive one from kssrv (stage 9) |
| A remote button while it runs | Stops | ✅ any button | ✅ ▶ or 9 only | `car-pilot`: hold a key about a second, then let go ("How to stop it when it drives itself" in stage 9) |
| 60 seconds of driving (`max_driving_rounds`) | Stops. The only one that works while nobody watches | ✅ | — | As for the remote |
| A held key let go | Stops | — | ✅ | Press the key again ("It runs only while a key is held" in stage 12) |
| Every instruction to the wheels | Scales it down to the speed cap, `motor.CAP` (it does not stop) | ✅ | ✅ | — |

## Stage 8 — leaving a record inside the device

**The sensors' time series and the received policy are kept in an append-only record** ([ksdb](../../ksdb/README.md)) in the QSPI flash's last 64KB. This stage checks that the record survives a power cut.

1. Write the board firmware and open the Serial Monitor:

   ```sh
   make ksos-rp2040-board    # -> out/ksos_rp2040/ksos_rp2040_board.uf2
   ```

2. Find the `[ksdb]` stage. It writes on the first lap only; later laps repeat the result:

   ```
   [ksdb] claiming the flash region
   [ksdb] no marker -> erased the region (first use, or another writer was here)
   [ksdb] span ok (300B record crossing a page boundary)
   [ksdb] boot #1 (records=3, used=332/65536)
   [ksdb] power-cycle the board: boot # must keep going up
   ```

3. Switch the power off and on, and read the line again.

**The verdict is `boot #N` growing across power cycles**, which RAM cannot fake. `records`/`used` must match the arithmetic: an 8-byte head plus content rounded up to a multiple of 4.

| Line | What it confirms |
| :-- | :-- |
| `span ok` | A 300-byte record crossing a page boundary makes the round trip without one byte garbled |
| `boot #N (records=M, used=…)` | The record survives power loss (N grows at every boot), and it only appends, never erasing the previous record |
| `FAIL cannot claim the flash region` | Its absence shows that the boot ROM's functions were found |

**The region is erased only when the marker record (`ksdb1`) is missing** (`no marker -> erased the region`). If that line keeps appearing, the writes do not take effect. That first time the log stops for about a second (16 sectors erased with interrupts and USB polling stopped).

**Rewriting the firmware keeps the record**; a whole-chip erase (`picotool erase`, or from BOOTSEL) removes it. A write stops interrupts for up to a few ms, and an erase longer, so keep records infrequent.

## Stage 9 — the car keeps its policy and starts alone

**Stage 7's car needs kssrv at every start. Here the received policy is kept in the record (stage 8's region), so the car decides with it even with no link.** The observations are kept too.

1. **The first time**, store the policy: start kssrv as in stage 7, then write the firmware:

   ```sh
   make ksos-rp2040-car-pilot     # -> out/ksos_rp2040/ksos_rp2040_car_pilot.uf2
   ```

   Expected:

   ```
   [car] records erased (first use, or another firmware was here)
   [car] link up, resolving peer
   [pilot] status=200 body=2096
   [car] policy stored on board
   [car] using the fresh policy
   [car] policy on board, link closed — deciding here from now on
   car t=10 dist=0250mm line=0 bat=7.412V drive=(35,0,0) n=10 us=9098 emerg=0 drop=0 rec=3
   ```

2. **From the second time on**, start it without kssrv (USB can stay connected). Expected:

   ```
   [car] last run ended at dist=0180mm bat=7.301V line=0 drive=(35,0,0)
   [car] no fresh policy — using the one stored on board
   [car] policy on board, link closed — deciding here from now on
   ```

**The verdict is the wheels turning without kssrv.** The path to the wheels opens only with a policy, so turning proves the policy was read from the record.

| What can be seen | How |
| :-- | :-- |
| The policy was stored | `policy stored on board`, the first time |
| It starts with no PC | `no fresh policy — using the one stored on board`, and the wheels turn |
| An unchanged policy is not rewritten | With kssrv up on a later start, `policy unchanged — kept the stored one` |
| The observations survived the power | `last run ended at ...` (the previous run's last) at start-up |
| The observations grow | `rec=` on the report line |
| Recording stopped | A reason, as in `rec=N(stopped: full)` (a full region is not erased: the policy would go with it) |

**Observations are kept only for laps where the manoeuvre changed, plus a heartbeat every 5 seconds** (16 bytes each).

**Swapping firmware erases the record once.** Stage 8's probe shares the region, told apart by the marker record. So `records erased` appears once after another firmware ran, and the policy must be stored again with kssrv.

Started with no kssrv up:

```
[car] last run ended at dist=471mm bat=7.268V line=7 drive=(0,0,0)
[car] no tcp handshake (is kssrv listening?)
[car] no fresh policy — using the one stored on board
[car] policy on board, link closed — deciding here from now on
car t=360 dist= 301mm line=7 bat=8.326V drive=(0,-50,0) n=360 us=14162 emerg=0 drop=0 rec=54
```

**`last run ended` matches the previous run's last report line only when the last record was a heartbeat** (every 50 laps).

**The lap after a record is written decides about 1.5 times slower**, since the boot ROM drops the XIP cache after writing. When tightening the period, budget for this jump, not the average.

On the battery alone it waits 5 seconds for the link and 8 for the console before starting off. Otherwise the first lines would be lost: a `usb.write` before USB is configured discards a line without counting it in `drop=`.

### How to stop it when it drives itself

**The self-driving firmware (`rp2040_car_pilot_probe`) adds the remote, the run-time limit and the speed cap** ("The safety timeouts of each firmware" in stage 7). Only the run-time limit works unwatched.

```mermaid
stateDiagram-v2
    state "Starting up" as Starting
    state "Running" as Running
    state "Stopped by the remote, the run-time limit or a watchdog restart" as Halted
    state "Stopped at the battery's floor" as Low
    state "No policy" as NoPolicy
    [*] --> Starting
    Starting --> Running : a policy received or stored
    Starting --> NoPolicy : none received, none stored
    Starting --> Halted : the watchdog restarted it
    Running --> Halted : any remote button, or 60 seconds of driving
    Halted --> Running : hold a key about a second, then let go
    Running --> Low : low battery on consecutive laps
    Low --> Running : battery switched off and on
```

**Any button stops it** (repeat frames carry no `cmd`): erring toward stopping is safe. Coming back acts on letting go, since re-armed while still held it would stop again on the next lap. To check it, write the firmware and work through the table:

```sh
make ksos-rp2040-car-pilot
```

| Do or look at | Expected |
| :-- | :-- |
| Press the remote | The wheels stop within about 0.2 seconds; `HALTED: stopped by remote` |
| Press about a second, let go | `remote re-armed — deciding again`; from the next line `HALTED` is gone and `n` grows again |
| Press briefly, let go | Nothing (a brief press bringing it back would be dangerous) |
| Leave it | At 60 seconds, `HALTED: run time limit` and it stops |
| `ir=` on the report line | Grows with every press (receiving works) |
| `run=` | Grows only while it runs; coming back resets it to 0 |
| `drive=` | Never over `motor.CAP` in absolute value |

Caution: **`HALTED` gone is not enough; check that `n` (the decisions) grows.** Back from the run-time limit:

```
car t=600 ... n=599 ... run=600 rec=95 HALTED: run time limit
[car] remote re-armed — deciding again
car t=700 ... n=599 ... run=1 rec=95
car t=710 ... n=609 ... run=11 rec=95        <- n is growing
```

### Checking the watchdog

**If the program stops answering while driving, the watchdog restarts the chip within a second, and the restart stops the motors** ("The watchdog (`watchdog.kspl`)" in [`DESIGN-rtos.md`](DESIGN-rtos.md)). Afterwards the car stays stopped, its first LED white, until a held press brings it back. Nothing here can check that on the host, so check it on the car.

Caution: **Lift the wheels off for every step**: the hang test leaves the wheels turning until the watchdog fires.

| Do | Expected |
| :-- | :-- |
| Drive normally for the 60 seconds, with the remote's stop and re-arm in between | No restart: the report line's `t=` keeps growing and no `restarted by` line appears |
| Hold about seven seconds to erase the record, then hold about three to print it | No restart during either (`records erased — the policy was written back`, then the whole `[dump]`) |
| Copy a fresh UF2 with BOOTSEL | The first lines say `restarted by a reboot (boot ROM or debugger)`, or nothing on a power-on; the car drives as usual |
| A test build: set `HANG_AFTER_ROUNDS` in `ksos/demo/rp2040/rp2040_car_pilot_probe.kspl` to 30, write it, let it drive | About three seconds after starting off the wheels keep turning for at most a second, then stop. The console comes back with `restarted by the watchdog: the program had stopped answering`, the first LED is white, and the line reads `HALTED: restarted by watchdog` |
| In that build, hold a key about a second | `remote re-armed`, and it drives until the hang again |
| Write the normal build back (`HANG_AFTER_ROUNDS` at 0) | It drives as before |

**The Serial Monitor drops the port on the restart**; reopen it, or use one that reconnects by itself, to see the first lines.

**The speed cap rewrites the policy's output**, so the report line and the record show the instruction really sent. It is set in one place, `CAP` in `ksos/boards/freenove_4wd_pico/motor.kspl`, and applies to the close-range reverse too.

### Seeing the state as light while it drives itself

On the battery alone the LEDs are the only window; only the first two are used, to save current. **The first shows the state's colour, blinking every 0.5 seconds.** The second lights red for three laps after a safety timeout sent an instruction.

| The first element | The state | The report line |
| :-- | :-- | :-- |
| Cyan | Starting up (waiting for the link and the console) | — |
| Green | Running | (no `HALTED`) |
| Red | Stopped at the battery's floor | `HALTED: battery low` |
| Blue | Stopped by the remote | `HALTED: stopped by remote` |
| Yellow | Stopped at the run-time limit | `HALTED: run time limit` |
| White | Stopped after the watchdog restarted it (the program had stopped answering) | `HALTED: restarted by watchdog` |
| Purple | No policy, or unreadable | `HALTED: no policy` and the like |

**The blinking is the evidence that the loop is turning.** Steadily lit or dark means it stopped, whatever the colour. The colour and the report's text come from one place, `State` in `ksos/boards/freenove_4wd_pico/status.kspl`; add a new state to that enum.

**Starting up takes a dozen seconds or so**, with cyan blinking. If nothing lights, `status.init` failed (six beeps).

### Reading out the record stored in the car

With neither a link nor a PC, **holding a remote key prints the whole record to the Serial Monitor**. Only the hold's length counts, and each action happens on letting go. The press that stopped it does not count.

| The action (any button) | What happens |
| :-- | :-- |
| Press while running | It stops (`HALTED: stopped by remote`) |
| Let go, hold about a second, let go | It comes back and starts off |
| Let go, hold about three seconds, let go | **It prints the record** and stays stopped |
| Let go, hold about seven seconds, let go | **It erases the record** (`ir_wipe_rounds`) |

**The seconds are a guide**: what counts is the laps held (8 to come back, 25 to print; `ir_rearm_rounds` / `ir_dump_rounds`). Printing does not release the stop.

| On erasing | What happens |
| :-- | :-- |
| The region's marker | Written back (left erased, the next start would erase again) |
| The policy | Written back: without it, a start with nothing upstream cannot move |
| The observations (`kind=2`) | Dropped, and recording starts again: `rec=` counts from 0, and a `(stopped: full)` goes |
| A power cut while it erases (a second or more) | **The marker and the stored policy survive.** They are copied aside before anything is erased ("Keeping a few records through an erase" in [`ksdb/docs/DESIGN-storage.md`](../../ksdb/docs/DESIGN-storage.md)). Some observations can remain; erase again to drop them |

**Rewriting the firmware does not erase the record**; only a changed marker (`record_marker`) does. So erase before measuring again, or generations mix.

The output, one line per entry (without the `[dump] ` prefix it is CSV):

```
[dump] begin used=15472
[dump] n,dist_mm,bat_mv,line,lon,lat,rot,safety
[dump] skip kind=0 len=4
[dump] skip kind=1 len=2096
[dump] 1,507,8409,7,0,0,0,0
   :
[dump] 855,294,8284,7,0,-30,0,0
[dump] end samples=855 other=2
```

| Column | Meaning (a line is one moment: the observation and the instruction it caused) |
| :-- | :-- |
| `n` | The record's running number, not the lap's |
| `dist_mm` | The distance the decision used, in mm. `0` means not measured; `3000`, no reflection |
| `bat_mv` | The battery voltage the decision used, in mV |
| `line` | The three reflective sensors as `left<<2 \| centre<<1 \| right` (1 = black), 0 to 7 |
| `lon` `lat` `rot` | Forward-back, sideways and turning sent to the wheels, after the cap |
| `safety` | `1` if a safety timeout gave the instruction, `0` if the policy did |

Caution: **Read the correction's strength from `line`**, not `lon`/`rot`, which change with the cap and the manoeuvre table.

| `line` | Black sensors | Step |
|--:| :-- | :-- |
| 2 | The centre | On the line: forward, no correction |
| 6 / 3 | Left and centre / centre and right | The weak correction (a small deviation) |
| 4 / 1 | The left / the right | The strong correction (a large deviation) |
| 0 | None | Lost: the position unknown, it creeps forward |
| 7 | All three | A junction or an end, or lifted: it stops |

**No `6` or `3` means the weak correction never came** ("The line's width must fall within a range" below). The count of `0` measures how badly it follows.

| What can be seen | How |
| :-- | :-- |
| Everything came out | The `end` line carries no `CUT` |
| It ended partway | `end ... CUT (console full)`: it cuts off at the first dropped line, after waiting up to 50ms for room |
| Other entries share the region | `skip kind=0` (the 4-byte marker) and `kind=1` (the policy), with their lengths |
| How many generations it spans | Several `skip kind=1 len=...` lines: runs from that many policy receptions are mixed |

**`used=` adds up only with the gaps at sector ends**: `append` never lets a record straddle a sector. The report line's `n=` and `trk=` count one run, not the record.

**The record is not sampled at a fixed interval**, so how long something lasted is not in it; see the report line's `emerg=`. Why it is no training set for the policy is in "🤖 The AI on bare metal" in [`DESIGN-rtos.md`](DESIGN-rtos.md).

**Old lines carry two traps.** A line with no origin bit reads `safety=0`, and a line written under another `motor.CAP` has other `lon/lat/rot` magnitudes.

**A line with `bat_mv` around 0.07V is a moment with the battery disconnected.** It is a loose contact while running, or, in a run at start-up, the battery switch off. Hence one low reading does not stop the car.

While printing it ignores the remote. **Saving the output is the Serial Monitor's job.**

Note: Only `ksos/demo/rp2040/common/sample.kspl` knows the columns' order, and the header line names them in that order.

## Stage 10 — showing the state as WS2812 light

**On the battery alone there is no Serial Monitor, and the buzzer sounds only at start-up.** So the eight WS2812 LEDs (GPIO 16) become a window needing no cable. This stage checks that they show the colours asked for.

1. Write the board firmware. **No battery is needed** (the LEDs run off the Pico's 5V).

   ```sh
   make ksos-rp2040-board      # -> out/ksos_rp2040/ksos_rp2040_board.uf2
   ```

2. Watch the LEDs during the `[led]` stage. It runs once a lap, and the LEDs stay dark until the next lap:

| What to look at | Expected |
| :-- | :-- |
| All eight elements | Red, green, blue, a second each |
| Then | One white element sent from end to end, the rest dark |
| Then | All off |
| The Serial Monitor | `[led] all red` and the rest, in step with the colours |

**Judge by eye**: right colours prove the timing and its window for the write (the WS2812 section of [`DESIGN-rtos.md`](DESIGN-rtos.md)).

| The symptom | The likely cause | What to do |
| :-- | :-- | :-- |
| Nothing lights | The pin's function (FUNCSEL) is not PWM, or `clocks.init()` failed (the divisor is then 19 times off) | Check the pin's function, then stage 2a |
| Wrong colours (green for red, and so on) | Not sent in G, R, B order | Check `fill_wire` in `ksos/drivers/rp2040/ws2812.kspl`: each LED's three bytes must go out green, red, blue |
| Colours shifted per element | The 24-bit boundaries do not line up | Check that each element gets exactly 24 bits |
| Flicker, or wrong colours at times | The window for the write is missed (interrupts not stopped, or the loop not in RAM) | Check both |

Caution: **Do not raise the brightness** (one place: `board.WS2812_LEVEL`). Eight elements at full white use about 0.5A, and the low-voltage watch (`battery_low_mv`) fires. To save more, light fewer elements ("The WS2812 LEDs" in [`SPEC-board.md`](SPEC-board.md)).

If the colours start going wrong, doubling `bit_counts` doubles the window for the write. Whether WS2812 accepts the longer Low must be confirmed on the real board.

## Stage 12 — driving it from the IR remote alone

`make ksos-rp2040-car-ir`, the counterpart of Freenove's tutorial "6.3 Multi-Functional Infrared Car", **needs neither a PC nor a link**. Each key of the bundled remote does one thing:

| The key | The table's value | cmd | What it does |
| :-- | :-- | :-- | :-- |
| ✚ / ➖ | `BF40FF00` / `E619FF00` | `40` / `19` | Forward / backward only while held |
| ⏪ / ⏩ | `F807FF00` / `F609FF00` | `07` / `09` | Turns left / right only while held |
| ▶ / 9 | `EA15FF00` / `B54AFF00` | `15` / `4A` | Stops it (back to manual). Two keys on purpose: someone wanting to stop can look for either |
| 0 / 1 / 4 | `E916FF00` / `F30CFF00` / `F708FF00` | `16` / `0C` / `08` | Turns the head 10 degrees left / right / to the front (90 degrees) |
| TEST | `BB44FF00` | `44` | Sounds the buzzer |
| 7 / 8 | `BD42FF00` / `AD52FF00` | `42` / `52` | Advances / clears the WS2812 display |
| 2 / 5 | `E718FF00` / `E31CFF00` | `18` / `1C` | Advances / clears the face's expression |
| C / 3 | `F20DFF00` / `A15EFF00` | `0D` / `5E` | Light following / line tracking |
| 6 | `A55AFF00` | `5A` | **No obstacle dodging** (below): a refusing beep |

1. Store a policy in the record first: run `make ksos-rp2040-car-pilot` once with kssrv up (stage 9).
2. Plug in the LED matrix, not the ultrasonic module.
3. Write the firmware and open the Serial Monitor:

   ```sh
   make ksos-rp2040-car-ir
   ```

4. Hold a key and watch the car; read the report line when a key has no effect.

### `cmd` is the value's third byte, not the leftmost

NEC sends the address, its inverse, the command and its inverse, each low bit first. So printed as a 32-bit number, **the last byte sent is leftmost**.

```
BF   40   FF   00
^^ the command inverted
     ^^ the command      <- take this
          ^^ the address inverted
               ^^ the address (0x00 on this remote)
```

**The leftmost two digits are the inverted command** (`0x40 ^ 0xFF = 0xBF`) and match no key. The report line's `last=00:40` puts the address left and the command right, matching the table directly.

### Reading the report line when the remote does nothing

```
car t=10 mode=manual drive=(0,0,0) servo=90 line=7 ws=0 face=71 trk=0 keys=0 ir=0/0/0 last=00:00 drop=0
```

| Field | What it means |
| :-- | :-- |
| `face=` | The LED matrix's I2C address. `00` means nobody answered (not plugged in, or the wrong pins) |
| `trk=` | Steering redone mid-lap. Not growing during line tracking means the per-tick review is not working |
| `keys=` | Times an assigned key took effect |
| `ir=<ok>/<rep>/<bad>` | Frames received / repeats from a held key / times the input moved without making a frame |
| `last=<addr>:<cmd>` | The last address and command, in hex (matched to the table as in the section above) |

**`keys=0` alone locates nothing; read `ir=`:**

| The symptom | The likely cause | What to do |
| :-- | :-- | :-- |
| It stays `ir=0/0/0` | Nothing reaches the receiver | Check the remote's battery, direction and distance |
| Only `bad` grows | Polling too slowly, or noise from fluorescent light or sunlight | Keep `ir_poll_us` under 1.5ms (below) |
| `ok` grows but `keys=0` | Frames arrive, but their command (`last=`'s `cmd`) is in no row of the table, and is ignored with no beep | Use the bundled remote, and a key from the table |

**The polling interval is the usual culprit.** The driver accepts the leader's mark (nominally 9000µs) from 7500µs. So not calling `try_receive` within 1.5ms of the leader's falling edge refuses the frame.

### It runs only while a key is held

**A held NEC key sends no command.** About every 108ms a repeat says only "still held", which extends the key's life; let go and it stops. Make the life longer than the repeat interval, or it judders, but not much longer, or it runs on after release.

### Line tracking redoes the steering every tick

This firmware has **no line rules of its own**. It asks the stored policy (`pilot_policy`) to `decide` every 10ms when the three bits changed, as stage 7 does; `trk=` counts it. Each 9ms decision drops IR frames, so it never asks twice for one observation.

Caution: **Run `make ksos-rp2040-car-pilot` once with kssrv up first.** With no policy in the record, `3` returns a refusing beep.

### Plug in the LED matrix, not the ultrasonic

They share GPIO 4/5 ("The ultrasonic and the LED matrix exclude each other" in [`SPEC-board.md`](SPEC-board.md)). So **obstacle dodging (`6`) prints one line of reason and refuses**, rather than ignoring the key: silently, "broken" and "no such key" look the same.

The face is `ksos/boards/freenove_4wd_pico/face.kspl`; its expressions advance dark, eyes rolling, a blink, a smile, a cry.

**The display is mounted turned 90 degrees**: pictures are held upright and turned 90 degrees anticlockwise just before sending (`face.turned_row`). An upside-down, mirrored picture means the turn is reversed.

### Only ▶ and 9 stop it

Stage 7's firmware **stops on any button** because it has no other way to stop. Here that would make the face and the light impossible to change.

### The speed is slower than the tutorial's

The tutorial drives at 50 to 80%. `motor.CAP` is the only cap, held to **a speed one can catch on foot**. To raise it, change that one place in `motor.kspl`.

## Tuning line following

**What stages 7, 9, 11 and 12 share when the car follows a line**: the checks and settings to reach for when it drives badly.

### The car's own behaviour when following a line

Which manoeuvre each line reading gives is set by `MANEUVERS` and `rule_action` in [`ksai/examples/car_pilot/policy.kspl`](../../ksai/examples/car_pilot/policy.kspl), which write the policy file ("The car's policy file" in [`ksai/README.md`](../../ksai/README.md)). This section holds only what the car itself does.

**If it turns away from the side it came off, separate the two possible causes before fixing.** With both reversed they cancel out: the driving looks right, but `line=` and obstacle avoidance stay reversed.

| Check | If it fails |
|---|---|
| On `ksos-rp2040-board`'s sensor line, cover only the physically leftmost sensor: the left character of `line=B.W.B` must change | `board.LINE_SENSOR_SWAPPED` does not match the unit |
| That holds, yet it turns the wrong way | `motor.drive`'s turning term: with only `rot` positive, the left two wheels must go forward and the right two back (clockwise from above) |

**The distance is read every control lap (`loop_interval_ms` = 100ms), and the line every `line_interval_ms` (10ms).** Steering redone mid-lap is counted in `trk=`; if it does not grow, the line is not moving or the sensors are not answering.

### To start it, raise the kick, not the speed cap

A car standing still needs a harder push to start than to keep rolling. Caution: **Do not raise `motor.CAP` for this**: it only adds overshoot while running.

| Where it acts | The value | What it does |
| :-- | :-- | :-- |
| The kick at starting | `kick_gain` / `kick_ms` | Doubles the instruction only on the lap starting from a standstill; raise it if it does not start |
| The floor per wheel | `wheel_min_percent` | Lifts a non-zero instruction below it, so no single wheel stays still on a mixed manoeuvre |
| The running speed | `motor.CAP` | Higher adds overshoot (and shortens the time crossing the line) |

**The kick keeps the direction** (it only multiplies), but control does not return for `kick_ms`, so keep it short. It fires after every stop, and only then: it does not fix a stall while running.

Caution: **Set `motor.CAP` just above `wheel_min_percent`** (20 against 18 on this car). At the floor itself a wheel stalls while running, and nothing detects it (next section). Higher, the car overshoots, and the sensors cross the line faster ("The crossing time while turning sets the line-reading interval" below).

### There is no telling whether the wheels are turning

**There is no encoder** (a sensor that counts a wheel's turns): the motors connect straight to the H bridges ("The motors" in [`SPEC-board.md`](SPEC-board.md)). No indirect clue decides it either:

| The clue | Why it fails |
| :-- | :-- |
| The battery voltage | The deep dips grow in a stall, but the median barely changes |
| The change in distance | Useless with many no-reflection laps (`dist=3000`) |
| The change in the line | On a straight, `line=2` persisting is normal |

**Under load the battery dips far into its margin above `battery_low_mv`.** One dip does not stop it, but a higher `motor.CAP` deepens the dips, so watch `bat=` and `HALTED`.

### The distance check comes before line following

**The policy looks at the distance first**: inside the dodging band it moves sideways even on the line. In the record, a run of `lat` at the cap is the distance, not a missed turn. **`lat` lines continuing while it runs suggest the ultrasonic is tilted down** at the floor.

Caution: **Picking the car up fills the record with dodges** (a hand reads tens to hundreds of mm). Do not judge the driving from a run where it was put back on the line again and again.

### A multiplication decides if it follows a sharp curve

**A curve of radius R can be followed only up to `v ≤ ω_max × R`**, `ω_max` being the turning rate at `motor.CAP`. On this unit it is about 230 degrees/second (measured with `rp2040_motor_probe`, `test_speed` = `motor.CAP`, reading the angle turned over `step_ms`). No tuning passes that ceiling; moving sideways is exempt.

**If a gentler curve still loses the line, the cause is elsewhere:**

| In the record | What it is | What helps |
| :-- | :-- | :-- |
| `line` swinging between 4 and 1 | Overshoot | Ease `motor.CAP`, or tighten `line_interval_ms` |
| `line` staying on one side | Undercorrection: the `track_*` manoeuvres turn too little for how far they move forward | Lower the forward part (`lon`) of the `track_*` manoeuvres in `MANEUVERS` (`ksai/examples/car_pilot/policy.kspl`), write the policy file again with `car_pilot`, and receive it again. Raising `motor.CAP` scales all three parts, so it does not help |
| It bulges out once before correcting | The centre-black instruction has no turn | Only a shorter forward part and a tighter `line_interval_ms`, not a stronger correction |

### The crossing time while turning sets the line-reading interval

**The turning speed matters, not the forward speed.** The sensors sit about 100mm from the turn's centre ("Line tracking" in [`SPEC-board.md`](SPEC-board.md)), so turning on the spot sweeps them sideways. The line must be read at least twice per crossing, so `line_interval_ms` must be at most half the crossing time. At this unit's settings a 20mm line takes about 75ms to cross, read about seven times at 10ms. A higher `motor.CAP` or a stronger turn shortens the crossing, so tighten the interval with it.

### The line's width must fall within a range

**Whether the small step ever appears depends on the line's width against the sensor spacing:**

| The line's width | What happens | `[dump]`'s `line` column |
| :-- | :-- | :-- |
| Short of the neighbouring sensor | The weak correction never appears; every correction is the strongest, and it overshoots | `6`/`3` all but absent, `0` (lost) about half |
| Just right | Mostly the weak correction, the strong now and then | Many `6`/`3`, `0` a few per cent |
| Covering all three | `line=7`, read as "a junction or an end": it stops | Runs of `7` |

With the sensors 20 to 25mm apart, the window, spacing < width < 2 × spacing, is **about 25 to 45mm**; 30mm is the simplest. **To check a line**, shift the car across it a little at a time while watching `ksos-rp2040-board`'s sensor line: two neighbours read `B` together, never three.

**Changing the line is quicker than changing the code.** Following a narrow line would need the car to remember the side it lost the line on, which adds features and raises the format's version.
