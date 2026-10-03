# Bringing the board up, one stage at a time

**You need the car on the desk, a USB cable, and a PC that can copy a file to a USB drive**: no SWD probe, no soldering. The wiring is in [`SPEC-board.md`](SPEC-board.md); this document holds the stages in order and how to carry out each.

**Do not write here how far each stage has been confirmed**: that is "What has been checked on real hardware" in [ksos](../README.md), and two copies drift.

| # | What it brings up | How it is confirmed |
|---|---|---|
| [1](#stage-1--the-buzzer-sounds) | GPIO output: the buzzer | By ear |
| [2a](#stage-2a--matching-the-clock) | The clock tree (XOSC/PLL) | By ear, and a frequency counter |
| [2b](#stage-2b--usb-cdc) | USB CDC: the log on the Serial Monitor | On the screen |
| [3](#stage-3--turning-the-four-wheels) | PWM: the four wheels in every direction | By eye |
| [4](#stage-4--the-adc-and-line-tracking) | The ADC (battery, light) and GPIO input (line tracking) | The Serial Monitor |
| [5a](#stage-5a--the-hc-sr04-ultrasonic) | The HC-SR04 ultrasonic | The Serial Monitor |
| [5b](#stage-5b--ir-receiving) | IR receiving (NEC) | The Serial Monitor |
| [5c](#stage-5c--i2c--the-led-matrix) | I2C (the VK16K33 LED matrix) | By eye |
| [6a](#stage-6a--usb-ethernet--cdc-ncm) | USB Ethernet (CDC-NCM) as a network adapter | Device Manager |
| [6b](#stage-6b--passing-8023-frames--ping) | 802.3 frames through `Link` in `ksos/net/link.kspls` | ping from the PC |
| [6c](#stage-6c--running-the-upper-layers-tcp--http--mqtt-on-real-hardware) | TCP / MQTT / HTTP | A server and a broker on the PC |
| [6d](#stage-6d--the-heap-and-the-atomics-on-armv6-m) | The heap and the atomics (`alloc` / `Arc` / `std/http`) | The `[heap]` lines |
| [6e](#stage-6e--running-a-closed-loop-with-the-pcs-kssrv) | A **closed loop** with the PC's kssrv | The wheels move / kssrv's `/api/status` |
| [7](#stage-7--receiving-a-policy-then-disconnecting-and-deciding-for-itself) | Deciding in the car on a policy received once | The wheels keep moving with `kssrv.exe` down |
| [8](#stage-8--leaving-a-record-inside-the-device) | An append-only record in the flash's last 64KB | `boot #N` grows each power cycle |
| [9](#stage-9--leaving-the-policy-and-the-observations-inside-the-car-and-starting-up-with-no-pc) | Starting with no PC, on the policy kept in the car | With no kssrv, the wheels turn at power-on |
| [10](#stage-10--showing-the-state-as-light-with-ws2812-a-display-needing-no-cable) | The WS2812 LEDs as a window needing no cable | The `[led]` colours, by eye |
| [11](#stage-11--adding-a-model-that-predicts-the-result-of-the-cars-own-motion) | The car predicting its own motion | `st,` grows and carries across restarts (on the floor; at `line=7` it does not move) |
| [12](#stage-12--driving-it-from-the-ir-remote-alone) | Driving by the IR remote alone | The keys change how it drives |

**"Tuning line following", after stage 12, is not a stage**: it holds what stages 7, 9, 11 and 12 share when the car follows a line.

**Wireless (CYW43439 / ESP-Hosted) is not among the stages** ("WiFi (CYW43439) — not implemented in this design" in [`DESIGN.md`](DESIGN.md)).

**`make ksos-rp2040-board` is one firmware for stages 2b, 4, 5c, 6d, 8 and 10**, each printing lines tagged `[tag]` in turn, one lap in about 20 seconds (how to read them: the heading of [`demo/rp2040/rp2040_board_probe.kspls`](../demo/rp2040/rp2040_board_probe.kspls)). `make ksos-rp2040-net` is one for 6a, 6b and 6c.

Caution: **Do not add the stages that turn the wheels (3, 6e, 7, 9, 12) to the board firmware**: they need the wheels lifted before writing, and it runs connected on the desk.

**The stage numbers are names, not the order of starting**; renumbering would break every reference to them.

**Stage 2 is split** because USB cannot enumerate until the clock is right ("The clocks and the µs timer" in [`DESIGN.md`](DESIGN.md)), which 2a checks by the buzzer's pitch. Stage 5 is split by the tools each part needs; IR (5b) comes before I2C (5c) because I2C needs the ultrasonic module swapped for the LED matrix, while the IR receiver stays on GPIO 3.

## Stage 1 — the buzzer sounds

```sh
make ksos-rp2040-buzzer      # -> out/ksos_rp2040/ksos_rp2040_buzzer.uf2
```

1. Connect USB **while holding the Pico W's BOOTSEL button** (if already connected, unplug and replug it holding the button). A drive named `RPI-RP2` appears.
2. Copy `ksos_rp2040_buzzer.uf2` to that drive.
3. When the copy finishes, the Pico W restarts by itself and runs the program.

**Every later stage writes its UF2 this way.** Where it reads lines, replug USB afterwards without holding BOOTSEL (a start with BOOTSEL held does not run the program) and open the Serial Monitor at 115200.

**Expected: a short 2kHz beep, repeating with a little gap.** A sound means the whole path works on the real chip. That path is the boot ROM, the stage-2 bootloader, the vector table, `Reset_Handler`, the scheduler, the tasks and the GPIO output. The drive disappearing after the copy means the boot ROM took the UF2 and restarted.

| The symptom | What to suspect |
|---|---|
| The drive stays after the copy, with the file visible | The UF2's format: the boot ROM **silently ignores** a block whose `payloadSize` is not 256 or whose `targetAddr` is not on a 256-byte boundary |
| The drive disappears but nothing happens | The family ID, or the vector table (the initial SP and entry at 0x10000100) |
| Only the buzzer is silent (the write succeeded) | The body's power switch: the Pico W runs off USB, but the buzzer may be fed from the body's power |
| The pitch is far off, or inaudible | The clock: see stage 2a |
| It sounds for an instant and stops | The task ended (it left `buzzer_task`'s endless loop) |

### Silencing the buzzer

The program stays in the flash and sounds at every power-on. **To silence it**, connect USB holding BOOTSEL: the boot ROM comes up as a drive, the program does not run, and another UF2 can replace it. To restore the original, write the Arduino sketch from the Arduino IDE as usual.

## Stage 2a — matching the clock

```sh
make ksos-rp2040-buzzer      # -> out/ksos_rp2040/ksos_rp2040_buzzer.uf2
```

**The stage 1 demo again, now measuring the pitch.** It times itself by `rp2040/timer`'s real microseconds, so the pitch must measure 2kHz; if not, the clock tree is not initialized.

| Expected | How it is confirmed |
|---|---|
| **Exactly 2000Hz** (to about ±1%) | A frequency-counter app on a phone, a tuner, or a good ear |
| 0.25 seconds on, 0.25 off: **twice a second** | 20 beeps in 10 seconds by a clock |

| The symptom | What to suspect |
|---|---|
| Silence (it sounded at stage 1) | `clocks.init()` returned false and the task returned: XOSC not awake (no crystal fitted?) or the PLL not locking |
| It freezes in silence | `delay_us` never returns: the watchdog tick (`WATCHDOG_TICK`) is not running, so TIMER does not advance |
| A random pitch, as on the ROSC | `clocks.init()` got through but clk_sys did not move to PLL_SYS: the SELECTED wait in `switch_glitchless` |
| Far too slow or fast | clk_ref is still on the ROSC, not XOSC, so TIMER's tick is not 1µs |

## Stage 2b — USB CDC

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

| Step | Expected | How it is confirmed |
|---|---|---|
| 1 | **One** beep: the clock, GPIO and USB initialized | By ear |
| 2 | A new serial port on the PC | Device Manager / `ls /dev/tty.*` / `lsusb` |
| 3 | **Two** beeps: enumeration finished (three in all, with step 1) | By ear |
| 4 | `[board] round=1`, then `[1]`, `[2]`, `[3]` **in that order**, four times at 0.5-second intervals, every lap (about 20 seconds; other stages' lines between) | The Serial Monitor / `screen /dev/ttyACM0 115200` |

The device is **`ksos CDC`**, VID/PID 0x1209/0x0001 (pid.codes' prototyping pair). Any baud rate works; over CDC it does not set the speed.

| What is visible | What it says |
|---|---|
| `[1]`, `[2]`, `[3]` always in that order | The queue works: the three are queued at once, two waiting while the first sends |
| `[2]`'s line ends with `<END` | The 91-byte line is **split into packets of 64 + 27**, with the DATA0/DATA1 alternation right |
| `[2]` is cut off before `<END` | The split does not work: only the first packet came out |
| Only `[1]` flows | It cannot queue while sending (it drops what is queued) |

**On a failure it beeps N, how far it got, again and again**: every 3 seconds during the 8 seconds it waits for enumeration, then at the head of each lap. What EP0 must do is under "USB CDC" in [`DESIGN.md`](DESIGN.md).

| N | How far it got | What to suspect |
|---|---|---|
| 1 | Initialization only; no bus reset seen | No host: the VBUS detection (`USB_PWR`), the pull-up (`SIE_CTRL.PULLUP_EN`), or a power-only USB cable |
| 2 | The bus reset | SETUP does not arrive: EP0's buffer control, `SIE_CTRL.EP0_INT_1BUF` |
| 3 | SETUP arrived | The descriptor's reply: the length, the DATA0/DATA1 alternation, truncating to `wLength` |
| 4 | The address was assigned | The 67-byte configuration descriptor is not returned in full: send it **as 64+3** (EP0 takes 64 a packet), then receive the zero-length OUT (`arm_recv(0, 1, 0)`) |
| 5 | The configuration descriptor went in full | No `SET_CONFIGURATION`: the endpoint descriptors disagree with `enable_ep`, or an unanswerable request was not STALLed |
| 6 | Configuration finished | Enumeration should have succeeded; `is_configured` is wrong |

**Nine beeps, then silence**: `usb.init()` itself failed (nine is kept far from 1 to 6).

**One beep, then silence**: suspect first that `pump()` is not turning, before enumeration succeeding with no characters.

## Stage 3 — turning the four wheels

```sh
make ksos-rp2040-motor       # -> out/ksos_rp2040/ksos_rp2040_motor.uf2
```

Caution: **Lift the wheels off before writing it**, the body on a box: a unit wired with reversed polarity drives the wrong way and falls off the desk.

| Step | What happens | The beeps |
|---|---|---|
| Start | — | 1 |
| 1 | **Each wheel alone, in turn** (front left, rear left, rear right, front right) | — |
| 2 | Forward, back, sideways both ways, diagonally, turning both ways | 2, before it starts |
| End | Stays stopped | 2 |

**Step 1 is the real check**: one wheel at a time confirms `board.wheel_polarity` and the right side's front-back swap.

| In step 1 | Expected | What it means |
|---|---|---|
| The order | Front left, rear left, rear right, front right | `motor_pin_a/b` matches the wiring (**the right side's swap included**) |
| The direction | All four forward | `wheel_polarity` (all four `-1`) is right: **a positive speed is forward** |
| Wheels that do not turn | None | All eight pins and all four PWM slices work |

At step 2, a correct mecanum moving sideways turns the front left and rear right one way, the rear left and front right the other. Moving diagonally turns only one diagonal pair. In `drive()`, **positive `lateral` is right and positive `rotation` clockwise**. The signs come from watching the body, since they depend on the rollers' direction and the formulae's convention. The speed is held to 30%, each step to 1 second.

## Stage 4 — the ADC and line tracking

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

**It needs stage 2b working.** Each lap, the `[sensor]` line is followed by eight lines, one every 0.5 seconds, with the fields in the table below.

```
[sensor] ADC 12bit (0-4095); press a remote button while these lines run
bat=7.912V(2454)  light L= 812 R= 907  line=B.W.B (101)  dist= 245mm  ir=--
```

| Field | Expected | Confirm by moving something |
|---|---|---|
| `bat=` | About 8.4V (full) to 6.8V; the brackets hold the raw 12-bit ADC value (0 to 4095) | Switch the battery off: near 0V |
| `light L= R=` | 0 to 4095 | **Hold a hand over it: it falls** (brighter is higher) |
| `line=` | Three of `B` (black) / `W` (white), left to right; the brackets hold them as `left<<2 \| centre<<1 \| right` | White paper and black tape swap them |
| `dist=` | Tens to hundreds of mm (stage 5a) | Bring a hand close: it shrinks |
| `ir=` | `--`, then like `A0:C69 x1` (stage 5b) | Press a button on the bundled remote |

Caution: **Confirm that each value moves.** A fixed value looks the same as a pin with nothing connected.

**If `bat=` reads about a quarter of the real voltage, the resolution is wrong** ("The ADC" in [`DESIGN.md`](DESIGN.md)).

| The symptom | What to suspect |
|---|---|
| `[sensor] ADC did not start (clk_adc?)` every lap | The ADC did not wake; most likely no `clk_adc` (`clocks.init`'s `switch_aux_only(clk_adc_ctrl, ...)`) |
| No lines, and N beeps at the head of each lap | USB cannot enumerate (N is how far it got): back to stage 2b |
| Only `bat=` stays near 0 | The battery switch is off, or `init_analog` was missed on GPIO 26 |
| A light sensor sticks at 0 or 4095 | The pin's digital input buffer or pull is still on (`init_analog` turns them off) |
| All three of `line=` the same, never changing | `init_in` was missed on GPIO 12/11/10, or the sensor's sensitivity trimmer is off |
| `line=` **reversed left to right** (covering the leftmost changes the right character) | `board.line_sensor_swapped` does not match the unit |

## Stage 5a — the HC-SR04 ultrasonic

**Stage 4's firmware and line**; look at `dist=`.

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

| Field | Expected | Confirm by moving something |
|---|---|---|
| `dist=` | Tens to hundreds of mm | **Bring a hand close: it shrinks**; away: it grows |
| `>3000mm` | No reflection came back | It appears pointed at a ceiling or open space; at a wall a number returns |
| `----` | ECHO never went up | **Not "far away": suspect the wiring** — TRIG 4 / ECHO 5 and the pin numbers themselves (a wrong pin number is typical, and cannot be told from "too far") |

**A measurement blocks up to 36ms and needs 36ms (`settle_us`) before the next** ("Ultrasound" in [`DESIGN.md`](DESIGN.md)): harmless at the demo's 0.5-second period, it matters in the driving loop. To calibrate, read the raw time of flight in `Distance.echo_us`.

## Stage 5b — IR receiving

**Stage 4's firmware and line**; the IR receiver is always on GPIO 3, so no wiring changes.

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

`ir=` starts as `--` and changes when a button on the bundled remote is pressed. **Press while the sensor lines flow** (4 seconds of each lap); the other stages do not watch IR.

```
... dist= 245mm  ir=A0:C69 x3
```

| Field | Expected | Confirm by moving something |
|---|---|---|
| `ir=` | `Cxx` **differs per button** | Press another button: it changes |
| `xN` | The running count of receptions | Hold a button: repeats arrive, so it **grows while held** |
| The `A` value | The same for every button | It is the remote's address |

Caution: **Confirm a different value per button.** One button alone cannot be told from noise that happened to be picked up.

| The symptom | What to suspect |
|---|---|
| It stays `ir=--` | The GPIO 3 assignment, or a remote not using NEC. First see whether `xN` grows (if so, receiving works) |
| The other lines stop too, or come unevenly | `try_receive` blocks for up to 70ms while receiving |
| `xN` grows with nothing pressed | Fluorescent light or sunlight; the loose tolerances allow it |

## Stage 5c — I2C / the LED matrix

**Only this stage changes the wiring: swap the ultrasonic module for the LED matrix** ("The ultrasonic and the LED matrix cannot be used at once" in [`SPEC-board.md`](SPEC-board.md)). The firmware rescans the bus each lap, so it can be swapped while running.

```sh
make ksos-rp2040-board       # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

The `[i2c]` stage prints the bus scan first.

```
[i2c] scan: 0x71
[i2c] using 0x71
[i2c] matrix init: ok
[i2c] frame    0 to=0x71 scan=0x71 init=ok fails=0 why=none
[i2c] frame    1 to=0x71 scan=0x71 init=ok fails=0 why=none
```

`why=` is why the last transfer failed: `addr-nack`, nobody at that address; `data-nack`, present but refusing the data; `timeout`, the device still holds the bus. **The address is not fixed**: it takes the first the scan finds, else 0x70 (some units answer on 0x71).

**`fails=0` means only that the matrix ACKed, not that it displayed**, so judge by eye.

| What to look at | Expected | What it means |
|---|---|---|
| `[i2c] scan:` | **One or more** addresses | The bus is alive and the device ACKs |
| `matrix init: ok` | `ok` | The oscillator on, the display on, the brightness: all three went through |
| The LED matrix | **A band keeps flowing** | The writes reach the display RAM |
| `fails=` | **Stays 0** | Growing: the writes are NACKed |

| The symptom | What to suspect |
|---|---|
| `scan=none` with `why=addr-nack` | Nobody answers. **The pull-ups first** (open drain: with nothing pulling High, no ACK), then the module not swapped in, then SDA/SCL's FUNCSEL(3) |
| `scan=0x..` but `init=NG why=data-nack` | The address is right but the writes fail; SCL may be too fast (`i2c.scl_hz`) |
| `why=timeout` | The device holds SCL: the bus has not recovered from the last transfer |
| `init=ok fails=0` yet nothing lights | Typically **one of the three init steps is missing**, or the rows and columns disagree with the board ("something lights but makes no picture") |
| `[i2c] init failed` every lap | The I2C block did not leave reset: was `clocks.init()` called first? |

Caution: **Put the ultrasonic module back afterwards**, or stages 4, 5a and 5b read `dist=----`.

---

## Stage 6a — USB Ethernet / CDC-NCM

```
make ksos-rp2040-net
```

Write `out/ksos_rp2040/ksos_rp2040_net.uf2` as in stage 1. **It needs stage 2b working.** One firmware serves stages 6a, 6b and 6c (in order: "What the USB-Ethernet probe does, and what it needs on the PC" in [`DESIGN.md`](DESIGN.md)); until the link is up it prints `ncm t= stage= alt= link=down` every second.

**The PID is 0x0002, not stage 2b's 0x0001**: Windows remembers the driver per VID/PID and, holding the single-function assignment, would not recognize the composite device afresh. If an old assignment lingers, enable "Show hidden devices" in Device Manager, remove the old `ksos CDC`, and replug.

| Where | Expected | What it means |
|---|---|---|
| The beeps | **Two**, then silence | Enumeration went through |
| The beeps | N, repeating | Not enumerated; N is how far it got (it keeps waiting; replugging starts over) |
| Device Manager | A COM port under Ports | The CDC-ACM side is alive |
| Device Manager | One more entry under Network adapters | The CDC-NCM side was recognized |
| The Serial Monitor | `alt=1` | The host enabled the data interface |
| The Serial Monitor | `link=up` | The connection notification went through; the link is up |
| The Serial Monitor | `t=` on the `link=down` line grows | It is alive; once up, `[ncm] link=up` appears once and it moves on |

| The symptom | What to suspect |
|---|---|
| The COM port appears, the network adapter does not | **The PID first** (above), then the IAD and the device descriptor's class (0xEF/0x02/0x01) |
| The network adapter shows a "!" | Windows 10 has no standard CDC-NCM driver (Windows 11 ships `UsbNcm.sys`): if none attaches, choose "USB NCM" by hand |
| It stays `alt=0` | No `SET_INTERFACE`: IF 3's alt 0 / alt 1 descriptors |
| `alt=1` but `link=down` | The notification (EP3 IN) does not go out: is it sent as speed change, then connection? |
| **Five** beeps repeat | No `SET_CONFIGURATION` after the full configuration descriptor: typically **a descriptor length that drifted** (grown to 160 bytes, 67 still passed to `reply_ep0`), which ksos's `make test` catches (`make debug-ksos` from the repository's root) |
| 1 to 4 beeps repeat | How far enumeration got, as in stage 2b's table. **Always run ksos's `make test` before the real board** |

### The setting on the PC side (sharing the internet connection)

To reach beyond the PC, in Windows open Settings → Network → the Wi-Fi adapter's properties → the Sharing tab, enable "Allow other network users to ... connection", and pick this USB adapter. The car then gets outside through the PC ("The candidates for a link layer" in [`DESIGN.md`](DESIGN.md)).

## Stage 6b — passing 802.3 frames / ping

```
make ksos-rp2040-net
```

**Set up the PC first**: share the Wi-Fi connection to stage 6a's USB adapter ("The setting on the PC side (sharing the internet connection)" above), which by Windows's default puts the PC at 192.168.137.1. Once the UF2 is written, at the command prompt:

```
ping 192.168.137.50
```

**With no DHCP, the car is fixed at 192.168.137.50**; for another subnet, change `init_addrs` in `ksos/demo/rp2040/common/net_client.kspls`. Setting 192.168.137.1/24 on the USB adapter by hand works in place of sharing. `ping` is answered only after stage 6c's upper layers finish (about 20 seconds of ARP retries if the PC is absent).

| What to look at | Expected | What it means |
|---|---|---|
| `ping` | Replies | Frames flow both ways |
| `rx=` (Serial Monitor) | Grows | Frames from the host arrive |
| `arp=` | Grows | It answered an ARP request for itself |
| `ping=` | Grows | It answered an ICMP echo request |
| `drop=` | **Stays 0** | Sending does not back up |
| `arp -a` on the PC | 192.168.137.50 as 02-00-00-00-00-01 | The car's MAC resolves |

A working line reads like `net t=75 rx=173 arp=1 ping=14 drop=0`. **`rx` far above `arp + ping` is normal**: the car rightly ignores the PC's broadcast and multicast, so `rx` growing alone shows the receive path works. `arp=1` staying put is normal too, since Windows caches a resolved MAC.

| The symptom | What to suspect |
|---|---|
| `rx=` does not grow | The host sends nothing: the sharing, or the adapter "not connected" |
| `rx=` grows, `arp=` does not | Nothing taken as addressed to it: **typically a wrong IP setting** (check the shared subnet) |
| `arp=` grows, `ping=` does not | ICMP: the checksum, the IP header length |
| `drop=` grows | The next NTB is queued before the last finished sending: the polling interval |

**Run `make debug` first**: it checks the NTB handling ([`ksos/drivers/cdc_ncm.kspls`](../drivers/cdc_ncm.kspls)) and the ARP and ICMP answers byte by byte on the host.

## Stage 6c — running the upper layers (TCP / HTTP / MQTT) on real hardware

**`ksos/net`'s TCP / MQTT / HTTP on the real chip, over USB Ethernet.** These run on the real chip for the first time here:

| The thing | Where |
|---|---|
| TCP data sending and receiving | `tcp_stream_send` / `tcp_stream_recv` in `ksos/net/tcp_conn.kspls` |
| ARP's requesting side | `mini_ipv4`'s `build_arp_request` / `parse_arp_reply` |
| MQTT | `ksos/net/mini_mqtt.kspls` |
| HTTP parsing under freestanding | `parse_response` in `std/http.kspls` |

Note: The link layer (`Link` in `ksos/net/link.kspls`) works from stage 6b; the wiring in `ksos/demo/rp2040/rp2040_net_probe.kspls` serves as a template.

**Where it is likely to stall**: `tcp_conn.kspls`, the densest new code; ARP's requesting side (stage 6b had only the answering side), when resolving the gateway 192.168.137.1's MAC; and USB going quiet. Keep calling `usb.poll_once()` while waiting for a reply, through `pump()` in `ksos/demo/rp2040/common/bringup.kspls`, or the host detaches the device.

**Done means both sides**: the 3-way handshake in the Serial Monitor, and the request or PUBLISH arriving on the PC.

### How to proceed

```
make ksos-rp2040-net
```

**Set up the PC first**: stage 6b's sharing (the PC at 192.168.137.1), and these two servers.

```
python -m http.server 8080                                   # HTTP
./out/ksplc_stage1.exe run tools/mqtt_stub.kspls                # MQTT (1883)
```

**mosquitto is not needed**. Write `ksos_rp2040_net.uf2`, replug, and open the Serial Monitor.

#### What comes out

| The beeps | The stage reached |
|---|---|
| 1 | USB initialized |
| 2 | NCM's link up (as in stage 6a) |
| 1 after that | Stopped at ARP |
| 2 after that | HTTP went through, MQTT did not |
| 3 after that | **Everything went through** |

The Serial Monitor shows one line per stage, then the result line every second.

```
[ncm] link=up
[net] link up, resolving peer
[arp] peer mac 02:00:00:00:00:02
[tcp] handshake ok (http)
[http] sent=58
[http] recv=1024
[http] status200=1 head=152
[http] total=2318 segs>1=1
[tcp] handshake ok (mqtt)
[mqtt] connack ok=1 rc=0
[mqtt] published + disconnected
net t=1 rx=72 arp=0 ping=0 drop=0 txf=0 upper arp=ok http=ok mqtt=ok arpf=6 et=0800 from=192.168.137.1
```

Caution: **Check `drop=0`.** If it grows, sends are lost: there is one NTB, and sending again without `drain_tx()` silently discards the previous frame.

`segs>1=1` says the response spanned several segments, confirming `tcp_stream_recv`'s seq tracking. **Check the PC side too**: `192.168.137.50 - - [...] "GET / HTTP/1.1" 200 -` on `python -m http.server`'s console, and these lines on `mqtt_stub.kspls`'s:

```
CONNECT  client_id='kanso-pico' keep_alive=60 (proto='MQTT')
PUBLISH  topic='kanso/pico' payload='hello from Kanso OS on RP2040'
DISCONNECT
```

#### When it does not work

The result line's fields after `upper` are for diagnosis alone.

| What to look at | What it means |
|---|---|
| `rx=0` | No frame arrives: the PC side (the sharing, the firewall) |
| `rx>0` with `arpf=0` | Frames but no ARP: the PC does not get the car's ARP request |
| An IP in `from=` | **The PC's real address**: set `net_client.init_addrs`'s `peer_ip` to it (and `our_ip` in its subnet) |
| `et=` | The last frame's EtherType: `0806` ARP / `0800` IPv4 / `86dd` IPv6 |

| The symptom | What to suspect |
|---|---|
| `arp=NG`, `from=` still 0.0.0.0 | Nothing reaches the PC: redo stage 6b's sharing |
| `arp=NG`, `from=` not 192.168.137.1 | Match `net_client.init_addrs` to that address |
| `arp=ok` but `[tcp] TIMEOUT: no SYN-ACK` | No server on port 8080, or Windows Defender Firewall blocking the USB adapter's side |
| `FAILED to send ...` | The send buffer never cleared: `usb.poll_once()` missing from `send_now()`'s / `send_all()`'s wait loop |
| `[http] TIMEOUT: no response body`, `drop` growing | **The request does not go out**: the one NTB buffer is overwritten if sent before the host takes the previous frame. Look for a raw `send_frame` whose return value is ignored |
| `[http] TIMEOUT: no response body`, `drop` steady | The request goes out: `tcp_stream_send`'s / `tcp_stream_recv`'s seq/ack |
| `status200=0` | A response comes; a non-zero `head=` means only the status line differs (a 404 or the like) |
| `drop=` keeps growing | USB sending backs up: `usb.poll_once()` missing from a wait loop, or frames sent back to back without `drain_tx()` (polling until `usb.ncm_tx_busy()` clears) |
| The COM port disappears partway | As above: keep polling USB while waiting |

## Stage 6d — the heap and the atomics on Armv6-M

The four atomics come from `ksos/port/rp2040/ksos_atomic_sio.c` (why: "Armv6-M has no atomic instructions — the port supplies them" in [`DESIGN.md`](DESIGN.md)).

```
make ksos-rp2040-board
```

The `[heap]` stage prints one line per check — `alloc`, the four atomics, `Arc`, `std/http.parse_response` — ending with `RESULT pass=N fail=0`. **Lines stopping partway mean it froze at that check** (taking and releasing the spinlock do not mesh). The report repeats every lap because `usb.is_configured()` means the host configured the device, not that a terminal opened the port; printed once, it would be gone before the Serial Monitor opens.

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

---

## Stage 6e — running a closed loop with the PC's kssrv

**A decision made outside the car comes back to the wheels.** A small MLP on the PC decides; the request's and response's shape are in the server's own documents.

```
read the sensors -> POST /api/car -> kssrv settles the next manoeuvre -> turn the four wheels -> repeat
```

Caution: **Lift the wheels off**: in a closed loop, a hand is too slow to catch a start in an unintended direction.

Plug in the ultrasonic module, not the LED matrix. **Lifted, the reflective sensors see nothing and read `line=7`**, which the decision takes as "a junction or an end". At a distance the answer is always `stop`, and moving a hand gives only `stop` and `emergency_back`. To see the other manoeuvres, slip white paper under the reflective sensors (`line=0`). `forward` with no paper is suspect: the sensor or the decision is ignoring the observation.

**The car applies three safety timeouts itself, whatever the reply**: the battery, point-blank range and no reply (the `car-loop` column of "The safety timeouts of each firmware" in stage 7). The battery one does not clear by itself: switch the battery off and on.

**kssrv must run on the PC** (only it answers `/api/car`); it trains its model at start-up, so its listener takes a few seconds. The sharing is as in stage 6c (the PC 192.168.137.1, the car 192.168.137.50). The connection stays open (kssrv keeps it alive), since a new TCP connection per lap does not fit the 100ms control period.

### How to proceed

```
make kssrv                     # on the PC side
./out/kssrv.exe 8080 .         # on the PC side (a few seconds until the listener comes up)
make ksos-rp2040-car-loop     # the car side's UF2
```

Write `ksos_rp2040_car_loop.uf2`, replug, and open the Serial Monitor. The buzzer sounds only until enumeration:

| The beeps | What it means |
|---|---|
| **One, then silence** | USB initialized: going well; the rest shows on the console |
| Four, then silence | The ADC did not wake (suspect `clk_adc`); with no console yet, sound is all there is |
| Five, then silence | PWM did not wake (every later instruction is ignored) |
| Nine, then silence | `usb.init()` failed: back to stage 2b |
| N, repeating | Not enumerated; N is how far it got, as in stage 2b (replugging starts over) |

Once connected:

```
[car] link up, resolving peer
[car] connected to kssrv, entering the control loop
```

Then one line every 10 laps (about a second):

```
car t=10 dist= 245mm line=2 bat=7.912V cmd=strafe_right (0,50,0) ok=10 to=0 bad=0 drop=0
```

| Field | What it counts |
|---|---|
| `ok` | Valid replies passed to the wheels. **Its growth is the closed loop's evidence** |
| `to` | Replies that never came. Growing: the PC side or the sharing |
| `bad` | Replies that could not be read. Growing: a `seq` mismatch or the JSON's form |
| `drop` | Sends lost. **Must be 0** (there is one NTB) |
| `HALTED:` | It stopped on the safe side; the reason follows (until the power is switched off and on) |

Check the PC side at the same time (**one side alone is not enough**):

```console
$ curl -s localhost:8080/api/status | python3 -m json.tool | grep -E 'commands|requests'
```

**Done means two things:**

1. **The loop is closed**: `ok` grows with `drop=0`, and the PC's `commands` keeps pace (slightly ahead, since `ok` skips emergency-retreat laps).
2. **The decision reaches the wheels**: with the paper in (`line=0`), move a hand and watch `cmd` go `forward` (over 400mm), `strafe_*` (400 to 150mm), `back` (150 to 100mm) and `emergency_back` (under 100mm, decided by the car alone). The wheels must really change.

**The sideways direction follows the right sensor, not the distance**: an odd `line` gives only `strafe_left`; for `strafe_right` make `line` even (`0` with the paper, or black under the left or centre sensor alone).

## Stage 7 — receiving a policy, then disconnecting and deciding for itself

**Here the car receives a whole policy once at start-up, disconnects, and decides alone** ("What the self-driving probe does" in [`DESIGN.md`](DESIGN.md)).

```
at start-up: GET /api/pilot -> receive the policy (the weights, the manoeuvre table, the preprocessing constants) -> close the line
after that : read the sensors -> settle the next manoeuvre inside the car -> turn the four wheels (repeat)
```

Caution: **Lift the wheels off, and plug the ultrasonic module in** (as in stage 6e).

**The car applies its safety timeouts outside the policy**: the battery, point-blank range and a missing policy (the `car-pilot` column of "The safety timeouts of each firmware" below).

**kssrv is needed only while the policy is received.** After that the PC can go down, which is the point of this stage. The sharing is as in stage 6c. The policy (about 2.0KB) arrives in several segments and is read until complete (`std/http` looks at Content-Length). Keep the received body alive while in use: the weights point into it (zero copy).

### How to proceed

```
make kssrv                     # on the PC side (only while it is being received)
./out/kssrv.exe 8080 .         # on the PC side (a few seconds until the listener comes up)
make ksos-rp2040-car-pilot    # the car side's UF2
```

Write `ksos_rp2040_car_pilot.uf2`, replug, and open the Serial Monitor; the beeps read as in stage 6e. The wheels do not move until the first line below appears (if it does not, check kssrv and the sharing).

```
[car] policy on board, link closed — deciding here from now on   <- it was received
[car] no policy — staying put                                    <- it was not
```

Then one line every 10 laps (about a second):

```
car t=10 dist= 245mm line=2 bat=7.912V drive=(0,50,0) n=10 us=12525 emerg=0 drop=0
```

| Field | What it counts |
|---|---|
| `n` | Decisions made in the car. **Its growth is the evidence of driving itself** |
| `us` | One decision's time in µs (around 10ms, a tenth of the 100ms period). **Do not rely on the absolute value**: it moves with the XIP cache's contents, and jumps about 1.5 times on the lap after a record is written (stage 9) |
| `emerg` | Laps where it overrode the policy at close range and backed off. **`n` + `emerg` = `t`** (an emergency lap is not in `n`); a mismatch means a lost count |
| `drop` | Sends lost. It sends nothing after receiving, so it must not grow |
| `HALTED:` | As in stage 6e |

#### Bringing it back when the battery stopped it

**Switch the battery off and on** to clear `HALTED: battery low` (only that halt; the switch brings back no missing policy or link).

```
car t=2100 ... HALTED: battery low (1.163V, now 1.155V)   <- still off. Switch it on and now rises
car t=2110 ... HALTED: battery low (1.163V, now 7.903V)   <- it arrived. re-armed comes out after this
[car] battery back — re-armed, deciding again
```

The parentheses hold the voltage when it stopped and `now`, the present reading. **Only `now` shows whether switching on reached the car.** It must go off first. Off reads about 1V, which no real battery reaches, so only that deliberate act counts as "back". A weakening battery cannot restart the car merely by recovering.

Caution: **Do not unplug USB, and keep the wheels lifted.** Unplugging does not reset the MCU (the Pico runs off USB), but loses the console and the received policy. The switch is the only way back, and the car starts off the instant it is on.

#### How to confirm that it is deciding for itself

**Start the car with kssrv up, then shut down the `kssrv.exe` process.** Do not pull the USB cable, which also carries the console where `n` and `us` are read. In the other order the car gets no policy and never moves. `fetch_policy` sends `Connection: close`, so kssrv shows `conn #N closed` and the loop sends nothing after. Bringing kssrv down confirms that from outside.

**`n` growing, and the wheels turning, are the evidence.** The only path to the wheels (`apply`) is `one_round` inside `if ready && !halted`. Stage 6e, treated the same way, counts `to` and stops. The car also runs on the battery alone with the cable off, but then only the wheels' motion can be seen.

### The safety timeouts of each firmware

**Each car firmware stops, or holds the wheels back, by itself in these cases**, whatever the reply or the policy says, and with no link.

| The car sees | It | `car-loop` (6e) | `car-pilot` (7, 9) | `car-ir` (12) | How it comes back |
| :-- | :-- | :--: | :--: | :--: | :-- |
| The battery under `battery_low_mv` on `low_rounds` **consecutive** laps (`ksos/demo/rp2040/common/battery.kspls`) (a motor's inrush dips it for an instant) | Stops; `car-loop` also sends no more requests | ✅ | ✅ | — | Switch the battery off and on ("Bringing it back when the battery stopped it" above) |
| The distance under `emergency_mm` (100mm) | Backs off | ✅ | ✅ | — | By itself, once the distance grows |
| No valid reply within `reply_deadline_ms` (300ms) | Stops | ✅ | — | — | By itself, at the next valid reply |
| No policy received, and none in the record | Never moves | — | ✅ | — | Receive one from kssrv (stage 9) |
| A remote button while it runs | Stops | — | ✅ any button | ✅ ▶ or 9 only | `car-pilot`: hold a key about a second, then let go ("How to stop it when it drives itself" in stage 9) |
| 60 seconds of driving (`max_driving_rounds`) | Stops. The only one that works while nobody watches | — | ✅ | — | As for the remote |
| A held key let go | Stops | — | — | ✅ | Press the key again ("It runs only while a key is held" in stage 12) |
| Every instruction to the wheels | Scales it down to the speed cap, `cap.cap` (it does not stop) | — | ✅ | ✅ | — |

## Stage 8 — leaving a record inside the device

**The sensors' time series and the received policy kept inside the device**, in an append-only record ([ksdb](../../ksdb/README.md)) in the QSPI flash's last 64KB.

```sh
make ksos-rp2040-board    # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

The `[ksdb]` stage prints this (it writes on the first lap only; later laps repeat the result):

```
[ksdb] claiming the flash region
[ksdb] no marker -> erased the region (first use, or another writer was here)
[ksdb] span ok (300B record crossing a page boundary)
[ksdb] boot #1 (records=3, used=332/65536)
[ksdb] power-cycle the board: boot # must keep going up
```

**The verdict is `boot #N` growing across power cycles** (within one start-up, RAM would pass too), with `records`/`used` matching the arithmetic (an 8-byte head plus content rounded up to a multiple of 4).

| Line | What it confirms |
| :-- | :-- |
| `span ok` | A 300-byte record crossing a page boundary makes the round trip without one byte garbled |
| `boot #N (records=M, used=…)` | The record survives power loss (N grows at every boot), and it only appends, never erasing the previous record |
| `FAIL cannot claim the flash region` | Its absence shows that the boot ROM's functions were found |

**The region is erased only the first time**, when the marker record (`ksdb1`) is missing (`no marker -> erased the region`). If that line keeps appearing, the writes do not take effect. That first time the log stops for about a second (16 sectors erased with interrupts and USB polling stopped).

**Rewriting the firmware keeps the record** ("The code that runs in RAM, and the region left for the record" in [`DESIGN.md`](DESIGN.md)); a whole-chip erase (`picotool erase`, or erasing everything from BOOTSEL) removes it. Writing stops interrupts (hundreds of µs to a few ms; a sector erase longer), so keep records infrequent against the control period.

## Stage 9 — leaving the policy and the observations inside the car, and starting up with no PC

**Stage 7's car needs kssrv at every start. Here the received policy is kept in the record (stage 8's region), so the car decides with it even with no link.** The observations are kept too.

```sh
make ksos-rp2040-car-pilot     # -> out/ksos_rp2040/ksos_rp2040_car_pilot.uf2
```

**The first time** (storing the policy; kssrv needed):

```
[car] records erased (first use, or another firmware was here)
[car] link up, resolving peer
[pilot] status=200 body=2096
[car] policy stored on board
[car] policy on board, link closed — deciding here from now on
car t=10 dist=0250mm line=0 bat=7.412V drive=(35,0,0) n=10 us=9098 emerg=0 drop=0 rec=3
```

**From the second time on** (without kssrv; USB may stay connected):

```
[car] last run ended at dist=0180mm bat=7.301V line=0 drive=(35,0,0)
[car] no fresh policy — using the one stored on board
[car] policy on board, link closed — deciding here from now on
```

**The verdict is the wheels turning without kssrv**: the path to the wheels opens only with a policy, so turning proves it was read from the record.

| What can be seen | How |
| :-- | :-- |
| The policy was stored | `policy stored on board`, the first time |
| It starts with no PC | `no fresh policy — using the one stored on board`, and the wheels turn |
| An unchanged policy is not rewritten | With kssrv up on a later start, `policy unchanged — kept the stored one` |
| The observations survived the power | `last run ended at ...` (the previous run's last) at start-up |
| The observations grow | `rec=` on the report line |
| Recording stopped | A reason, as in `rec=N(stopped: full)` (a full region is not erased: the policy would go with it) |

**Observations are kept only for laps where the manoeuvre changed, plus a heartbeat every 5 seconds** (16 bytes each; every 100ms lap would fill 64KB in minutes). An observation takes 2 pages to write, the policy 8; only observations are written inside the loop.

**Swapping firmware erases the record once.** Stage 8's probe shares the region, told apart by the marker record, so `records erased` appears once after another firmware ran, and the policy must be stored again with kssrv.

Started with no kssrv up:

```
[car] last run ended at dist=471mm bat=7.268V line=7 drive=(0,0,0)
[car] no tcp handshake (is kssrv listening?)
[car] no fresh policy — using the one stored on board
[car] policy on board, link closed — deciding here from now on
car t=360 dist= 301mm line=7 bat=8.326V drive=(0,-50,0) n=360 us=14162 emerg=0 drop=0 rec=54
```

**`last run ended` matches the previous run's last report line only when the last record was a heartbeat** (every 50 laps); usually it does not.

**The lap after a record is written decides about 1.5 times slower.** The boot ROM drops the XIP cache after writing, so instructions come from the flash again. When tightening the period, budget for this jump, not the average.

On the battery alone it waits 5 seconds for the link and 8 for the console before starting off. Otherwise the first lines (`records erased`, `last run ended`) would be lost: a `usb.write` before USB is configured discards a line without counting it in `drop=`.

### How to stop it when it drives itself

**The self-driving firmware (`rp2040_car_pilot_probe`) adds three safety timeouts for driving itself**: the remote, the run-time limit and the speed cap (the table is "The safety timeouts of each firmware" in stage 7). The remote works only when aimed at the car, so the run-time limit is the one that works unwatched.

**Any button stops it** (repeat frames carry no `cmd`): erring toward stopping is safe. Coming back acts on letting go, since re-armed while still held it would stop again on the next lap (`remote re-armed` with no start-off). To check it:

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
| `drive=` | Never over `cap.cap` in absolute value |

Caution: **`HALTED` gone is not enough; check that `n` (the decisions) grows.** Back from the run-time limit:

```
car t=600 ... n=599 ... run=600 rec=95 HALTED: run time limit
[car] remote re-armed — deciding again
car t=700 ... n=599 ... run=1 rec=95
car t=710 ... n=609 ... run=11 rec=95        <- n is growing
```

**The speed cap rewrites the policy's output**, so the report line and the record show the instruction really sent. It is set in one place, `cap` in `ksos/boards/freenove_4wd_pico/cap.kspls`, and applies to the close-range reverse too.

### Seeing the state as light while it drives itself

On the battery alone the LEDs are the only window. Only the first two elements are used (the fewer lit, the less current: "The WS2812 LEDs" in [`SPEC-board.md`](SPEC-board.md)). **The first shows the state's colour, blinking every 0.5 seconds.** The second lights red just after a safety timeout sent an instruction. It stays lit three laps so the eye can catch it (the record's `safety` column shows the same).

| The first element | The state | The report line |
| :-- | :-- | :-- |
| Cyan | Starting up (waiting for the link and the console) | — |
| Green | Running | (no `HALTED`) |
| Red | Stopped at the battery's floor | `HALTED: battery low` |
| Blue | Stopped by the remote | `HALTED: stopped by remote` |
| Yellow | Stopped at the run-time limit | `HALTED: run time limit` |
| Purple | No policy, or unreadable | `HALTED: no policy` and the like |

**The blinking is the evidence that the loop is turning.** Steadily lit or dark means it stopped, whatever the colour (that is just the last one sent). The colour and the report's text come from one place, `State` in `ksos/boards/freenove_4wd_pico/status.kspls`; add a new state to that enum.

**Starting up takes a dozen seconds or so** (5 for the link, 8 for the console), with cyan blinking. If nothing lights, `status.init` failed (six beeps).

### Reading out the record stored in the car

With neither a link nor a PC, **holding a remote key prints the whole record to the Serial Monitor**. Only the hold's length counts, not the button (repeat frames carry no `cmd`). Each action happens on letting go, so a long hold does not print on the way. The press that stopped it does not count, so let go and press again.

| The action (any button) | What happens |
| :-- | :-- |
| Press while running | It stops (`HALTED: stopped by remote`) |
| Let go, hold about a second, let go | It comes back and starts off |
| Let go, hold about three seconds, let go | **It prints the record** and stays stopped |
| Let go, hold about seven seconds, let go | **It erases the record** (`ir_wipe_rounds`) |

**The seconds are a guide**: what counts is the laps held (8 to come back, 25 to print; `ir_rearm_rounds` / `ir_dump_rounds`). Printing does not release the stop, so the car does not start off right after being picked up.

| On erasing | What happens |
| :-- | :-- |
| The region's marker | Written back (left erased, the next start would erase again) |
| The policy | Written back: without it, a start with nothing upstream cannot move |
| The observations (`kind=2`) | Dropped |
| The learned weights (`kind=3`) | Dropped; the weights in RAM stay and are written again at the next save |

**Rewriting the firmware does not erase the record**; only a changed marker (`record_marker`) does. Records of different generations then mix, and `[dump]` alone cannot show the boundary: erase before measuring again.

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
| `n` | The record's running number, not the lap's (only laps where the instruction changed are kept, plus the heartbeat) |
| `dist_mm` | The distance the decision used, in mm. `0` means not measured; `3000`, no reflection |
| `bat_mv` | The battery voltage the decision used, in mV |
| `line` | The three reflective sensors as `left<<2 \| centre<<1 \| right` (1 = black), 0 to 7 |
| `lon` `lat` `rot` | Forward-back, sideways and turning sent to the wheels, after the cap |
| `safety` | `1` if a safety timeout gave the instruction, `0` if the policy did |

Caution: **Read the correction's strength from `line`**, not `lon`/`rot`: those change with the cap and the manoeuvre table, while `line` maps to it by the rules themselves.

| `line` | Black sensors | Step |
|--:| :-- | :-- |
| 2 | The centre | On the line: forward, no correction |
| 6 / 3 | Left and centre / centre and right | The weak correction (a small deviation) |
| 4 / 1 | The left / the right | The strong correction (a large deviation) |
| 0 | None | Lost: the position unknown, it creeps forward |
| 7 | All three | A junction or an end, or lifted: it stops |

**No `6` or `3` means the weak correction never came** ("The line's width must fall within a range" under "Tuning line following" below). The count of `0` measures how badly it follows: nothing is corrected while lost.

| What can be seen | How |
| :-- | :-- |
| Everything came out | The `end` line carries no `CUT` |
| It ended partway | `end ... CUT (console full)`: it cuts off at the first dropped line. It waits up to 50ms for room before each line, and with no reader would wait silently for minutes |
| Other entries share the region | `skip kind=0` (the 4-byte marker) and `kind=1` (the policy), with their lengths |
| How many generations it spans | Several `skip kind=1 len=...` lines: runs from that many policy receptions are mixed |

**`used=` adds up only with the gaps at sector ends**: `append` never lets a record straddle a sector ([ksdb](../../ksdb/README.md)).

**The report line's `n=` and `trk=` count one run** and do not match the record's count (`rec=` is what that run left). A short run can leave `trk=` at 0, which alone does not show mid-lap steering failing.

**The record is not sampled at a fixed interval**: it keeps only laps where the triple changed, plus a heartbeat every `sample_every` laps. How long something lasted is not in it; see the report line's `emerg=`. Why the record as it stands is no training set for the policy is in "🤖 The AI on bare metal" in [`DESIGN.md`](DESIGN.md).

**Old lines carry two traps.** A line with no origin bit reads `safety=0` (mark a boundary by changing the marker and erasing once, losing the policy too). A line written under another `cap.cap` has different `lon/lat/rot` magnitudes.

**A line with `bat_mv` around 0.07V is a moment with the battery disconnected** (the divider's top open, not noise). It is a loose contact while running. Several in a row at start-up mean USB alone with the battery switch off (switching on gives `battery back — re-armed`). Hence one low reading does not stop the car.

While printing it ignores the remote (harmless: the wheels are stopped). **Saving the output is the Serial Monitor's job**, as the car holds no file.

Note: Only `ksos/demo/rp2040/common/sample.kspls` knows the columns' order, and the header line names them in that order.

## Stage 10 — showing the state as light with WS2812 (a display needing no cable)

**On the battery alone there is no Serial Monitor, and the buzzer sounds only at start-up**, so the eight fitted WS2812 LEDs (GPIO 16) become a window needing no cable.

```sh
make ksos-rp2040-board      # -> out/ksos_rp2040/ksos_rp2040_board.uf2
```

**No battery is needed** (the LEDs run off the Pico's 5V). The `[led]` stage runs once a lap, dark until the next:

| What to look at | Expected |
| :-- | :-- |
| All eight elements | Red, green, blue, a second each |
| Then | One white element sent from end to end, the rest dark |
| Then | All off |
| The Serial Monitor | `[led] all red` and the rest, in step with the colours |

**Judge by eye**: right colours prove the timing and its window for the write (the WS2812 section of [`DESIGN.md`](DESIGN.md)).

| The symptom | What to suspect |
| :-- | :-- |
| Nothing lights | The pin's function (FUNCSEL) is not PWM, or `clocks.init()` failed (the divisor is then 19 times off) |
| Wrong colours (green for red, and so on) | Not sent in G, R, B order |
| Colours shifted per element | The 24-bit boundaries do not line up |
| Flicker, or wrong colours at times | The window for the write is missed (interrupts not stopped, or the loop not in RAM) |

Caution: **Do not raise the brightness** (one place: `board.ws2812_level`). Eight elements at full white use about 0.5A, and the low-voltage watch (`battery_low_mv`) fires on their own light. To save more, light fewer elements (what a dark one still uses is under "The WS2812 LEDs" in [`SPEC-board.md`](SPEC-board.md)).

If the colours do start going wrong, doubling `bit_counts` doubles the window for the write (whether WS2812 accepts the longer Low must be confirmed on the real board).

## Stage 11 — adding a model that predicts the result of the car's own motion

**This stage brings the mechanism up; it does not show the prediction coming right.** Whether it beats "the same as last time" on the floor is "What has been checked on real hardware" in [ksos](../README.md).

The policy (stage 7) decides what to do; this stage adds a net predicting **what happens then** (`ksos/demo/common/car_model.kspls`). From the present three line bits, the previous three and the manoeuvre about to be sent, it predicts the next lap's three bits. It checks them against what that lap reads, and corrects by one step.

* **One step per control lap** (`loop_interval_ms` = 100ms). Do not learn on every 10ms steering tick: a step does not fit, the lap stretches to 230ms, and line following dulls.
* **It predicts the line, not the ultrasonic distance.**

Why it learns this way (the line and not the distance, no teacher, the policy not trained on its own record, what is refused) is in "🤖 The AI on bare metal" in [`DESIGN.md`](DESIGN.md).

| Field | What it means |
| :-- | :-- |
| `pred=` | The predicted next-lap bits (0 to 7), to compare with the next line's `line=`. `-` is no prediction (stopped, or not one step learned) |
| `perr=` | A moving average of the share of bits predicted wrong, in % (not the loss). `--` is not one step learned |
| `base=` | The share wrong for "the same as the previous tick", in %. **`perr=` below it is the only evidence of learning** (both over the same steps and window, so `[dump]` need not be recounted). A draw is not a win: it means only "no change" was learned |
| `v` | The weights' layout version (`state_version` in `demo/common/car_model.kspls`). If it differs from the local source, the other numbers still look plausible: check it first when the counting changes |
| `lus=` | One learning step's time in µs, apart from `us=` (the policy alone). A lap that sent a stop skips the forward pass and reads small: read it where `drive=` is non-zero. Do not rely on the absolute value; to shorten it, shrink `hidden` in `demo/common/car_model.kspls` |
| `st,` | Steps learned. **It accumulates across power cycles** (read back from the record), so a run's steps are the difference. One per lap (fewer than `n=` when steering was redone mid-lap), only on laps the wheels moved |
| `sv` | Saves of the weights to the record. If it stays 0, the next start-up does not resume from here |
| `resumed the forward model — N steps learned, missed E per mille of bits vs B for no-change` | The previous weights were read. Whether E is below B says whether it was learning last time (E alone says nothing) |

```
car t=300 dist= 612mm line=3 bat=7.980V drive=(20,7,12) n=300 us=9210 emerg=0 drop=0 rec=42 pred=2 perr=4.8% base=6.1% v6 lus=3100/2999st,0sv
```

**`lus=3100/2999st,0sv` is three fields in a row**, not a division: the step time in µs, the steps learned, the saves.

### Nothing can be learned unless the wheels move

**A stopped lap asks no question**: with 0 steps `perr=` shows `--`. A lap not driven (stopped, or HALTED) and a lap whose steering was redone mid-lap teach nothing either. Why is in "🤖 The AI on bare metal" in [`DESIGN.md`](DESIGN.md).

**At `line=7` the car does not move** (the policy stops at "a junction or an end"). On a stand all three sensors read black, so `st,` never grows and a hand does not help. Put it down on the floor.

### Keeping what was learned across a power cycle

The weights and **the progress (the steps and the error)** go into the record (ksdb) as one `kind=3` entry, 452 bytes with its head (`skip kind=3 len=444` in `[dump]`).

It saves every 60 seconds and the instant it stops, but **not on a battery halt**, which loses the progress since the last periodic save.

**Weights of another scale are refused.** If the version, the hidden layer's size or the speed cap differs, `load` refuses them and learning restarts. So no `resumed ...` line appears on the first start after changing `cap.cap`.

### Running it without the cable and reading the result afterwards

A learning run can go on the battery alone, with the LEDs as the window ("Seeing the state as light while it drives itself" in stage 9). **The next cabled start-up's `resumed ...` line gives the result.**

1. Start with USB and confirm the policy is in the record (`no fresh policy — using the one stored on board` is enough). If not, receive it from kssrv once first.
2. Unplug USB, put it down on the floor and let it run. Blinking LEDs show the loop is turning (at `line=7` it does not move).
3. It stops at the 60-second run-time limit and saves what it learned at that instant. To go on, hold a key about a second and let go.
4. Pick it up and connect USB: the start-up line `resumed the forward model — N steps learned, missed E per mille of bits vs B for no-change` is the previous run's result.
5. Repeat 2 to 4: **N growing and E shrinking means it is learning on the floor** (each run is one point).

To print the record, hold a key about three seconds while it is stopped ("Reading out the record stored in the car" in stage 9). `perr=`'s history is not there (the progress is inside the `kind=3` entry).

### How the learning is checked

**`make ksos-cm-car-model-probe` checks the learning on bare metal.** It uses a function standing in for the floor, which the net cannot see into. The wrong bits must drop below the "same as last time" mark, so the net can only predict from what it learned. It also checks that a stopped lap teaches nothing, the save and read-back, and the refusal of weights of another scale. Even there it does not reach 0% (the course's curve is hidden from the net), so the probe asks only whether it beats "the same as last time", not by how much.

**`base=` moves with the course, the battery and the period**, so compare `perr=` with `base=` within one run, never `perr=` across runs. Do not read the probe's result as the car's prospect: that floor is one function, and on a real floor the line barely moves between ticks.

On the floor, read these three **from the top** (a lower one means something only once those above hold):

| What to look at | The shape of it holding |
| :-- | :-- |
| Is there material to learn from | `st,` grows at a pace close to `n=` |
| Is the learning carried over | The steps grow in the `resumed ...` line after switching back on |
| Is it learning | `perr=` below `base=` |

### Tell the version written by `v`, not by `st,`

**`st,` accumulates across power cycles** and restarts from 0 when `load` refuses another version's weights, so one value can mean "resumed" or "restarted". Read `v` first: if it differs from `state_version` in the local `demo/common/car_model.kspls`, the version written is old. Then one run's steps are the difference in `st,` from the start-up `resumed ...` line.

## Stage 12 — driving it from the IR remote alone

`make ksos-rp2040-car-ir`, the counterpart of Freenove's tutorial "6.3 Multi-Functional Infrared Car", **needs neither a PC nor a link**.

| The key | The table's value | cmd | What it does |
| :-- | :-- | :-- | :-- |
| ✚ / ➖ | `BF40FF00` / `E619FF00` | `40` / `19` | Forward / backward only while held |
| ⏪ / ⏩ | `F807FF00` / `F609FF00` | `07` / `09` | Turns left / right only while held |
| ▶ / 9 | `EA15FF00` / `B54AFF00` | `15` / `4A` | Stops it (back to manual). Two keys on purpose: someone wanting to stop may look for either |
| 0 / 1 / 4 | `E916FF00` / `F30CFF00` / `F708FF00` | `16` / `0C` / `08` | Turns the head 10 degrees left / right / to the front (90 degrees) |
| TEST | `BB44FF00` | `44` | Sounds the buzzer |
| 7 / 8 | `BD42FF00` / `AD52FF00` | `42` / `52` | Advances / clears the WS2812 display |
| 2 / 5 | `E718FF00` / `E31CFF00` | `18` / `1C` | Advances / clears the face's expression |
| C / 3 | `F20DFF00` / `A15EFF00` | `0D` / `5E` | Light following / line tracking |
| 6 | `A55AFF00` | `5A` | **No obstacle dodging** (below): a refusing beep |

### `cmd` is the third byte of the table's 32-bit value, not the leftmost

NEC sends the address, its inverse, the command and its inverse, each low bit first. So printed as a 32-bit number, **the last byte sent is leftmost**.

```
BF   40   FF   00
^^ the command inverted
     ^^ the command      <- take this
          ^^ the address inverted
               ^^ the address (0x00 on this remote)
```

**The leftmost two digits are the inverted command** (`0x40 ^ 0xFF = 0xBF`) and match no key. The address is `0x00`, not `FF`. The report line's `last=00:40` puts the address left and the command right, matching the table directly.

### How to read the report line when the remote has no effect

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

| The symptom | What to suspect |
| :-- | :-- |
| It stays `ir=0/0/0` | Nothing reaches the receiver: the remote's battery, direction and distance |
| Only `bad` grows | Polling too slowly, or noise from fluorescent light or sunlight. Keep `ir_poll_us` under 1.5ms (below) |
| `ok` grows but `keys=0` | Frames arrive. If `last=`'s `cmd` differs from the table, it is not the bundled remote |

**The polling interval is the usual culprit.** The driver accepts the leader's mark (nominally 9000µs) from 7500µs. So not calling `try_receive` within 1.5ms of the leader's falling edge cuts off the start, and the frame is refused.

### It runs only while a key is held

**A held NEC key sends no command.** About every 108ms a repeat says only "still held", so the key is remembered and its life extended on each; let go and it stops. Make the life longer than the repeat interval (shorter judders in every gap), but not much longer: it keeps running that long after release.

### Line tracking redoes the steering every tick

This firmware has **no line rules of its own**. It reads the stored policy (`pilot_policy`) and asks `decide` every 10ms, only when the three bits changed (as stage 7 does); once per 100ms lap would bulge out on a curve. Do not ask twice for one observation: the answer is the same, and each 9ms forward calculation drops more IR frames. `trk=` shows whether it works.

Caution: **Run `make ksos-rp2040-car-pilot` once with kssrv up first.** With no policy in the record, `3` returns a refusing beep.

### Plug in the LED matrix, not the ultrasonic

They share GPIO 4/5 ("The ultrasonic and the LED matrix cannot be used at once" in [`SPEC-board.md`](SPEC-board.md)), and this stage assumes the matrix, so **obstacle dodging (`6`) prints one line of reason and refuses**. Do not ignore the key silently: with nothing happening, "broken" and "no such key" look the same.

The face is `ksos/boards/freenove_4wd_pico/face.kspls`; its expressions advance dark, eyes rolling, a blink, a smile, a cry, each on its own interval.

**The display is mounted turned 90 degrees**: pictures are held upright and turned 90 degrees anticlockwise just before sending (`face.turned_row`). Do not bake the tilt into the table (the board's business). An upside-down, mirrored picture means the turn is reversed (180 degrees off).

### Only ▶ and 9 stop it

Stage 7's firmware (`rp2040_car_pilot_probe`) **stops on any button** because it has no other way to stop. Here that would make the face and the light impossible to change.

### The speed is slower than the tutorial's

The tutorial drives at 50 to 80%. `cap.cap` is the only cap, held to **a speed one can catch on foot**. To raise it, change that one place in `cap.kspls`.

## Tuning line following

**What stages 7, 9, 11 and 12 share when the car follows a line**: the checks and settings to reach for when it drives badly.

### The car's own behaviour when following a line

Which manoeuvre each line reading gives is in the server's own documents; this holds only what the car itself does.

**If it turns away from the side it came off, separate the two possible causes before fixing.** They cancel out: with both reversed, the driving looks right while `line=` and the direction of avoiding an obstacle stay reversed.

| Check | If it fails |
|---|---|
| On `ksos-rp2040-board`'s sensor line, cover only the physically leftmost sensor: the left character of `line=B.W.B` must change | `board.line_sensor_swapped` does not match the unit |
| That holds, yet it turns the wrong way | `motor.drive`'s turning term: with only `rot` positive, the left two wheels must go forward and the right two back (clockwise from above) |

**The distance is read every control lap (`loop_interval_ms` = 100ms), and the line every `line_interval_ms` (10ms).** Why is in "What the self-driving probe does, and where its judgement lives" in [`DESIGN.md`](DESIGN.md). When the line moves mid-lap, only the steering is redone, counted in the report line's `trk=` apart from `n=`. If `trk=` does not grow, the line is not moving or the sensors are not answering.

### If it does not start moving, raise the kick, not the speed cap

Static friction exceeds rolling friction, so a duty that keeps it running may not start it.

Caution: **Do not raise `cap.cap` for this**: it only adds overshoot while running. A hard push at the start works instead.

| Where it acts | The value | What it does |
| :-- | :-- | :-- |
| The kick at starting | `kick_gain` / `kick_ms` | Doubles the instruction only on the lap starting from a standstill; raise it if it does not start |
| The floor per wheel | `wheel_min_percent` | Lifts a non-zero instruction below it, so no single wheel stays still on a mixed manoeuvre |
| The running speed | `cap.cap` | Higher adds overshoot (and shortens the time crossing the line) |

**The kick keeps the direction** (it only multiplies), but control does not return for `kick_ms`, so keep it short: it fires after every stop (a junction at `line=7` and the like).

**A stall while running is not fixed by the kick** (it fires only when the instruction goes from 0 to non-zero) and cannot be detected (next section). So keep the duty away from the stall threshold.

Caution: **Set `cap.cap` just above `wheel_min_percent`** (20 against 18 on this car). At the floor itself a wheel stalls while running; higher, the car overshoots the line, so check again that it stays within half the time `line_interval_ms` spans.

### There is no telling whether the wheels are turning

**There is no encoder**: the motors connect straight to the H bridges ("The motors" in [`SPEC-board.md`](SPEC-board.md)). So the car cannot know a wheel is not turning, and no indirect clue decides it:

| The clue | Why it fails |
| :-- | :-- |
| The battery voltage | The deep dips grow in a stall, but the median barely changes (judging by the tail misjudges) |
| The change in distance | Useless with many no-reflection laps (`dist=3000`) |
| The change in the line | On a straight, `line=2` persisting is normal |

**Under load the battery dips far into its margin above `battery_low_mv`.** One dip does not stop it (`low_rounds` consecutive laps are needed), but a higher `cap.cap` deepens the dips, so watch `bat=` and `HALTED`.

### The distance check comes before line following

**The policy looks at the distance first**: inside the dodging band the line's rules never run, and it moves sideways even on the line. Watching cannot tell this from a missed turn; the record's `lon,lat,rot` can (a run of `lat` at the cap is the distance).

Caution: **Picking the car up fills the record with dodges** (a hand or a body reads tens to hundreds of mm). So do not judge the driving from a run where it was put back on the line again and again.

**`lat` lines continuing while it runs suggest the ultrasonic is tilted down** at the floor. (The policy gets the median of the last three readings, so one stray value does not make it dodge.)

### Whether it can keep up with a sharp curve is decided by a multiplication

**A curve of radius R can be followed only up to `v ≤ ω_max × R`**, `ω_max` being the turning rate at `cap.cap`. On this unit it is about 230 degrees/second (measured with `rp2040_motor_probe`, `test_speed` = `cap.cap`, reading the angle turned over `step_ms`). No tuning passes that ceiling; moving sideways is exempt (`track_*`'s sideways part does not wait for the heading).

**If a gentler curve still loses the line, the cause is elsewhere.** In the record, `line` swinging between 4 and 1 is overshoot (ease `cap.cap` or tighten `line_interval_ms`). `line` staying on one side is undercorrection. The centre-black instruction has no turn, so it bulges out once before correcting. Only a shorter forward part and a tighter `line_interval_ms` help, not a stronger correction.

### The line-reading interval is set by the time taken to cross the line while turning

**The turning speed matters, not the forward speed.** The sensors sit about 100mm from the turn's centre ("Line tracking" in [`SPEC-board.md`](SPEC-board.md)), so turning on the spot sweeps them sideways, and a slow interval can miss the crossing. At this unit's settings a 20mm line takes about 75ms to cross while turning, read about seven times at `line_interval_ms`=10ms. A higher `cap.cap` or a stronger turn shortens the crossing, so tighten the interval with it; a shorter interval reads more often but follows no tighter radius.

### The line's width must fall within a range

**Whether the small step ever appears depends on the line's width against the sensor spacing:**

| The line's width | What happens | `[dump]`'s `line` column |
| :-- | :-- | :-- |
| Short of the neighbouring sensor | The weak correction never appears; every correction is the strongest, and it overshoots | `6`/`3` all but absent, `0` (lost) about half |
| Just right | Mostly the weak correction, the strong now and then | Many `6`/`3`, `0` a few per cent |
| Covering all three | `line=7`, read as "a junction or an end": it stops | Runs of `7` |

With the sensors 20 to 25mm apart ("Line tracking" in [`SPEC-board.md`](SPEC-board.md)), the window, spacing < width < 2 × spacing, is **about 25 to 45mm**. 30mm is the simplest (no `7`, more weak corrections than strong). `line=7` also means "on a wide line" and "lifted off", and halting covers those too.

**To check a line**, watch `ksos-rp2040-board`'s sensor line while shifting the car across it a little at a time. It is too narrow if no two neighbouring characters are ever `B` together, and too wide if all three turn `B` at the centre; the right width gives two neighbours together, never three.

**Changing the line is quicker than the code**: following a narrow line needs the side it was lost on remembered, which adds features and raises the format's version.
