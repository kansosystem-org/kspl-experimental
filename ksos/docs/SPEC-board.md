# The Freenove 4WD car — what is wired to what

**This document gives the hardware's own facts** for a Raspberry Pi Pico W (RP2040 / Cortex-M0+, CYW43439 WiFi) on a Freenove FNK0089 4WD mecanum car. The facts are pin numbers, PWM frequencies, and the conversion formulae a driver must match. A driver is the code that talks to one part of the car, such as a motor or a sensor.

**"The car" is a palm-sized commercial kit carrying one Pico W**, not one a person rides in. The Pico W is a small board holding the RP2040 microcontroller (a computer on one chip) and a CYW43439 WiFi chip.

**Nothing here is ksos's to decide.** These are facts about a board somebody else made, matched against the vendor's material and never the code. Where they disagree, the board is right. What ksos does with them is in [`DESIGN-rtos.md`](DESIGN-rtos.md), and the bring-up order is in [`HOWTO-bring-up.md`](HOWTO-bring-up.md).

## Words used in this document

This table is the one definition of the words for the board's parts and pins.

| Word | What it means here |
| :-- | :-- |
| GPIO | A general-purpose pin of the RP2040 that a program can switch High or Low, or read. Pins are named by number: GPIO 2, GPIO 3 … |
| PWM | Switching a pin on and off very fast. The share of each cycle it is on is the *duty* (0 to 100%); the cycles per second are its frequency. The duty sets a motor's speed; the frequency sets the buzzer's pitch |
| ADC | Analog-to-digital converter: it turns a voltage on a pin into a number. The RP2040's has 12 bits: 0 to 4095 |
| H bridge | The motor-driver circuit that lets a pair of pins turn a motor either way |
| mecanum wheel | A wheel with rollers set at an angle around its rim. Turning four of them in different directions moves the car sideways or diagonally without steering |
| servo | A small motor that turns to an angle it is told, rather than spinning |
| I2C | A two-wire bus, SDA (data) and SCL (clock), on which each device answers at its own address. **ACK** is a device's "received"; **NACK** is no answer or a refusal |
| BOOTSEL | A button on the Pico W. Held while USB is plugged in, it makes the chip show up as a USB drive instead of running its program |
| UF2 | A firmware file format. Copying a `.uf2` file onto the Pico's USB drive (see BOOTSEL) writes the firmware into the chip's flash |
| SWD probe | A debugging adapter wired to the chip's debug pins |
| USB CDC | A kind of USB device that looks like a serial port to the PC: a COM port on Windows, `/dev/ttyACM0` on Linux |

## Where the facts come from

Every number is read off `Mecanum_wheels/Sketches/06.2_Multi_Functional_Car/` in Freenove's repository [`Freenove/Freenove_4WD_Car_Kit_for_Raspberry_Pi_Pico`](https://github.com/Freenove/Freenove_4WD_Car_Kit_for_Raspberry_Pi_Pico) (whose description says "Apply to FNK0089").

**The vendor's material itself is not copied into this repository.** Freenove distributes it under CC BY-NC-SA 3.0 (non-commercial only), which cannot mix into this MIT tree. A hardware fact is not copyrightable, so it is written here in our own words.

## The pin assignment (GPIO numbers)

This table says which RP2040 pin goes to which part of the car. The source is the `#define`s of Freenove's shared header `Freenove_4WD_Car_For_Pico_W.h`, not the sketch, together with Tutorial.pdf's "Pins of the Car" table.

**Do not work a pin back from the code that calls it.** The plausible guess "4/5 collide with I2C, so it must be 22/17" is wrong, since 22 and 17 are Unused GPIO.

| GPIO | What it is for | The official name |
|---|---|---|
| 18 / 19 | Motor M1 (front left) | M1_IN1 / M1_IN2 |
| 20 / 21 | Motor M2 (rear left) | M2_IN1 / M2_IN2 |
| 6 / 7 | Motor M3 (the rear right, see below) | M3_IN1 / M3_IN2 |
| 8 / 9 | Motor M4 (the front right, see below) | M4_IN1 / M4_IN2 |
| 13 / 14 / 15 | Three servos (13 swings the ultrasonic's head) | Servo1 / Servo2 / Servo3 |
| 10 / 11 / 12 | Three for line tracking | Track1 / Track2 / Track3 |
| **4 / 5** | The I2C port, doubling as the ultrasonic module's | SDA/Trig / SCL/Echo |
| 16 | Eight WS2812 RGB LEDs (also usable as PWM slice 0 channel A) | WS2812 |
| 26 | The battery voltage (ADC) | A0 |
| 27 / 28 | Two light sensors (ADC) | A1 / A2 |
| 3 | IR receiving | IR |
| 2 | The buzzer | Buzzer |
| 0 / 1 | The serial port | TX / RX |
| 17 / 22 | **Unused** | Unused GPIO |

### The ultrasonic and the LED matrix exclude each other

GPIO 4 / 5 are **one connector shared by two modules** (the official table's "I2C port/Ultrasonic module interface"). In the mecanum arrangement, only one can be plugged in mechanically. The pins change meaning with the module:

| The module plugged in | GPIO 4 | GPIO 5 |
|---|---|---|
| The HC-SR04 ultrasonic | TRIG (output) | ECHO (input) |
| The VK16K33 LED matrix | SDA | SCL |

### Which side is which

Tutorial.pdf's table names only Track1–3 and A1/A2, which do not say left from right. **The header names the sides.**

| The definition | GPIO |
|---|---|
| `Left_PHOTOSENSITIVE_PIN` / `Right_PHOTOSENSITIVE_PIN` | 28 / 27 |
| `PIN_TRACKING_LEFT` / `_CENTER` / `_RIGHT` | 12 / 11 / 10 |

**The light sensors put the larger GPIO number on the left** (28), so number order reverses them.

## The motors

Each wheel has its own motor, driven by an H bridge from two PWM pins. **PWM runs at 500 Hz**, with the duty 0 to 100. A speed is given as -100 to 100, and the sign picks which pin carries the duty:

| The speed | The first pin | The second pin | The motor |
| :-- | :-- | :-- | :-- |
| Positive | The duty | 0 | Turns one way |
| Negative | 0 | The duty | Turns the other way |
| 0 | 0 | 0 | Stops |

### The right side reverses pin names and forward/back

In the mecanum's formulae, only the right side has its pin groups and wheels swapped. Here `LY` is forward-back, `LX` sideways and `RX` turning, and `FL`, `BL`, `BR`, `FR` are the front-left, back-left, back-right and front-right wheels:

```
FR = LY - LX + RX      FL = LY + LX - RX
BL = LY - LX - RX      BR = LY + LX + RX
Motor_M_Move(FL, BL, BR, FR)   // the third argument is BR and the fourth is FR
```

`Motor_M_Move(M1,M2,M3,M4)` sends each argument to one pin group:

* M1 to the front-left pin group;
* M2 to the rear-left;
* M3 to the right's first group;
* M4 to the right's third.

So the real correspondence is:

| The pin group | The real wheel |
|---|---|
| 18 / 19 | The **front** left |
| 21 / 20 | The **rear** left |
| 7 / 6 | The **rear** right (named `RIGHT1/2`) |
| 9 / 8 | The **front** right (named `RIGHT3/4`) |

The left goes front then rear, the right rear then front (the board's connectors mirror left and right). **Ported as if symmetric, straight moves forwards, backwards, left and right all look correct, while only diagonals and turns break.** That is hard to notice.

### The direction of rotation differs from unit to unit

The motors' wiring differs per unit (on the unit here, all four are reversed). The Arduino version expresses it with commented-out `#define`s, `REVERSE_MOTOR1` to `4` in `Freenove_4WD_Car_For_Pico_W.h`. How ksos holds it is "What is in `boards/freenove_4wd_pico/`" in [`DESIGN-rtos.md`](DESIGN-rtos.md).

## The servos

A servo turns to the angle its PWM signal asks for.

* PWM at **50 Hz**, mapping 0–180° linearly onto a duty of 2.5% to 12.5% (a pulse of 0.5 to 2.5ms in every 20ms).
* The software limits it to **30° to 150°**. Beyond that, the mechanism interferes with itself.

## The battery voltage

The battery reaches the ADC through a voltage divider. The divider is two resistors that scale the voltage down to what the pin can read. So the reading is multiplied back up:

```
voltage = (the ADC value / 1023 * 3.3) * 4       (4 is the voltage divider's coefficient)
```

For example, an ADC value of 640 gives about 8.26V.

* Full charge is **8.4V** (two 18650 lithium cells in series).
* The sample **reads the ADC five times and averages** them, against noise.
* The low-voltage threshold compares the raw ADC value against **525**, not the formula's voltage (525 is about 6.8V by the formula).

## The ultrasonic sensor (HC-SR04)

The sensor sends a burst of sound and times its echo; the time gives the distance.

* It sends a **10µs** High pulse on TRIG and measures ECHO's High width.
* The distance in cm is `the High width in µs * 340 / 2 / 10000` (sound at 340 m/s, halved for the way there and back). A width of 1000µs is 17cm.
* The timeout is `a maximum distance of 300cm × 60` = **18000µs**. Beyond it, the distance is taken as 300cm.
* Measuring continuously, the sample waits `2 × the timeout`, so as not to catch a leftover reflection.

## Line tracking

Three sensors under the front of the car tell a dark line from a light floor.

* Three GPIO inputs. **White = 0 / black = 1**.
* They pack into the three bits left<<2 | centre<<1 | right, which are branched on (`010` = only the centre is black = go straight).
* **The sensors sit 20 to 25mm apart, about 100mm ahead of the point the car turns about.** Measured on this unit: a 20mm line cannot cover two neighbours, and a 50mm line covers all three.
* **Some units have the left and right sensors mounted swapped.** Where ksos corrects it is "What is in `boards/freenove_4wd_pico/`" in [`DESIGN-rtos.md`](DESIGN-rtos.md).

## The WS2812 LEDs

Each WS2812 is an RGB LED with a small control chip inside it; eight are chained on GPIO 16.

* **A dark element still uses current.** The control IC inside each element takes a static current whether a colour is lit or not, about 0.6mA in Worldsemi's WS2812B datasheet (V5). A lit colour adds its LED's current on top, so darkening an element saves only that part.
* **The part fitted on this unit is not checked against its marking.** The static current differs by revision (the WS2812B-V6 rates it under 1µA).

## Flashing the firmware, and the debug output

Flashing means writing the program (the firmware) into the Pico's storage. The debug output is how the program reports what it is doing.

* Writing it takes **the BOOTSEL button plus a UF2** copied to USB mass storage; no SWD probe is needed.
* **A standard Pico / Pico W carries 2MB of QSPI Flash**, a W25Q16JVxQ or equivalent. The part fitted on this unit is not checked against its marking.
* **Semihosting cannot be used here.** Semihosting is printing through an attached debugger: it needs a debugger attached, and with no SWD probe the output halts the instruction that produces it.
* Reaching the Arduino IDE's Serial Monitor takes a USB CDC driver for the RP2040's USB controller: `ksos/drivers/rp2040/usb_cdc.kspl`.
  * Note: **Before USB is initialized, and where enumeration fails, the buzzer is the only clue.** (Enumeration is the exchange in which the PC learns what a newly plugged-in USB device is.) What each beep count means is stage 2b in [`HOWTO-bring-up.md`](HOWTO-bring-up.md).
* **USB takes no GPIO.** The RP2040's dedicated pins (`USB_DP` / `USB_DM`) go straight to the micro-USB connector, not the 40-pin header (whose `VBUS` is USB's 5V supply, not a data line). So USB Ethernet can provide the link layer with zero extra parts and zero extra GPIO.
* **The Serial Monitor's COM port is USB CDC (a virtual serial port), not the UART on GPIO 0/1.** The car has two serial paths: USB's virtual serial, and the physical UART (a serial port on two wires) on connector P7. Only the first is in use. The `[0]`, `[1]`, `[17]` and `[22]` on the board's terminals are GPIO numbers, not the pinout diagram's physical pins.
* **The Pico W's on-board LED is wired to the WiFi chip (CYW43439), not a GPIO** (the plain Pico's is GPIO25). So blinking it needs the WiFi chip initialized and does not suit a first check. This is not checked against the data sheet.
