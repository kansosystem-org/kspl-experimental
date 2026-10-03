# Third-Party Notices

The license for this repository as a whole is [`LICENSE.md`](LICENSE.md) (MIT). **Only the files listed below originate from work under another license**, so their notices are here beside it.

Caution: **When you add a file that declares an origin, add it here too.** A source's comments may name the origin as well, but a recipient of the distributed files cannot look in a comment. This document is the notices' canonical source.

`make test-conventions` guards four rules on it:

* **A file carrying a license's own words is listed here** (an `SPDX-License-Identifier`, a `Copyright (c)` line, a license's grant), since code copied with its header brings its terms with it.
* **Every file listed here exists**, so a rename cannot leave a notice pointing at nothing.
* **A file owing a notice is outside what the release ships.** The release's zip holds `LICENSE.md` but not this file, which is correct only while every such file is under `ksos/`.
* **Every binary file is listed under "Binary files" with where it comes from**, since a model's weights inherit the license of the model they were converted from.

## Raspberry Pi pico-sdk / pico-examples (BSD-3-Clause)

* Origin: `https://github.com/raspberrypi/pico-sdk` and `https://github.com/raspberrypi/pico-examples`
* Copyright holder: Raspberry Pi (Trading) Ltd.
* License: BSD-3-Clause (the full text is below)

**The sources themselves are not copied.** They are rewritten as plain register offsets, without using pico-sdk's headers. The values are computed from pico-sdk's sources and register-definition headers, and confirmed by comparing the resulting byte sequences.

The notice is here anyway because **it is cheaper than arguing over whether the work is derivative**.

| File | What it originates from |
| :-- | :-- |
| `ksos/port/rp2040/boot2_generic_03h.S` | the order of the SSI settings and the exit handling in `boot_stage2/boot2_generic_03h.S` and `exit_from_boot2.S` |
| `ksos/port/rp2040/pad_checksum.kspls` | how `boot_stage2/pad_checksum` applies the checksum |
| `ksos/port/rp2040/elf2uf2.kspls` | the shape of `elf2uf2`'s output |
| `ksos/drivers/rp2040/adc.kspls` | the register addresses and field positions in `regs/adc.h` and `regs/resets.h` |
| `ksos/drivers/rp2040/clocks.kspls` | the values in the register headers, and the procedures in `xosc.c`, `pll.c` and `runtime_init_clocks.c` |
| `ksos/drivers/rp2040/gpio.kspls` | the register addresses and field positions in `hardware_regs` |
| `ksos/drivers/rp2040/i2c.kspls` | the values in `regs/i2c.h`, the derivation of the SCL divisor, and the initialization procedure |
| `ksos/drivers/rp2040/pwm.kspls` | the register addresses and field positions in `regs/{pwm,resets,addressmap}.h` |
| `ksos/drivers/rp2040/resets.kspls` | the procedure for waiting on the release |
| `ksos/drivers/rp2040/rtc.kspls` | the values in the register headers, and the numbering of the days of the week |
| `ksos/drivers/rp2040/timer.kspls` | the register addresses and field positions in `regs/{timer,addressmap}.h` |
| `ksos/drivers/rp2040/usb_cdc.kspls` | the values in the register headers and `structs/usb_dpram.h`, and pico-examples' USB start-up procedure |

```text
Copyright (c) 2020 Raspberry Pi (Trading) Ltd.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Public-domain origins

**No notice is owed for these.** They are listed so that every origin a source declares is found in one place (the caution above).

| File | What it originates from | Origin |
| :-- | :-- | :-- |
| `std/time.kspls` | `civil_from_days`, the conversion from a day count to a date (Howard Hinnant) | `https://howardhinnant.github.io/date_algorithms.html` |
| `std/ds.kspls` | `fmix32`, MurmurHash3's finalizer (Austin Appleby) | `https://github.com/aappleby/smhasher` |

## What is not bundled

**What is listed here appears only by name; the content is not included.** No notice is owed, but a reader not told that it is missing goes looking for it.

| Name | Where it appears | What is not included |
| :-- | :-- | :-- |
| Freenove 4WD car kit | `ksos/boards/freenove_4wd_pico/` | The vendor material itself. **It is a rule not to copy it in** ("Where the facts come from" in [`ksos/docs/SPEC-board.md`](ksos/docs/SPEC-board.md)). Only hardware facts, such as pin numbers, are used, read from the official repository |
| Qwen | `ksai/examples/qwen_infer/`, `tools/ai_assist/` | The weights. Only the tools that convert them are present. **Whoever downloads and uses them follows Qwen's own license** |
| Llama | `ksai/examples/llama_engine/` | Meta's weights. The bundled `mini_llama.safetensors` is made here, with a vocabulary of 12 and two layers; only the shape is borrowed |
| PyTorch / transformers / peft | `tools/ai_assist/*.py` | The packages themselves. The tools assume you install them on your own machine |
| OpenSSL | `std/tls` (`make TLS=1`) | The library itself. Only the caller's declarations are present |

## Binary files

**Every file git treats as binary is here, with where it comes from.** A borrowed one is also listed in its license's section above, with the notice it owes.

| File | Where it comes from | License |
| :-- | :-- | :-- |
| `ksai/examples/llama_engine/mini_llama.safetensors` | Made here: tiny weights of Llama's shape (a vocabulary of 12, two layers), trained by this repository's own code | This repository's ([`LICENSE.md`](LICENSE.md)) |
| `ksos/demo/cortex_m/pilot_policy.safetensors` | Made here: the Edge AI car's piloting policy, trained on a PC by this repository's own code | This repository's |
| `ksplc/tests/prog/embed_data/raw.bin` | Made here: sample bytes for the `embed` tests | This repository's |

## Further reading

* [`LICENSE.md`](LICENSE.md) — the license for this repository as a whole.
* [`ksos/docs/DESIGN.md`](ksos/docs/DESIGN.md) — "The RP2040 port" says how the three files under `ksos/port/rp2040/` above compute their values and how they are confirmed; "🔧 The peripheral drivers" says what each driver originates from.
