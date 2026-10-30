# Third-Party Notices

The license for this repository as a whole is [`LICENSE.md`](LICENSE.md) (MIT). **Only the files listed below originate from work under another license**, so their notices are here beside it.

Caution: **When you add a file that declares an origin, add it here too.** A source's comments can name the origin as well, but a recipient of the distributed files cannot look in a comment. This document is the notices' canonical source.

`make test-conventions` guards four rules on it:

* **A file carrying a license's own words is listed here.** Such words are an `SPDX-License-Identifier`, a `Copyright (c)` line or a license's grant. Code copied with its header brings its terms with it.
* **Every file listed here exists**, so a rename cannot leave a notice pointing at nothing.
* **A file owing a notice is outside what the release ships.** The release's zip holds `LICENSE.md` but not this file. So no such file may stand in what the zip takes (`RELEASED` in `tests/support/conventions_notice.kspl`). Today they stand under `ksos/`, `ksai/` and `ksagent/`, which it does not take.
* **Every binary file is listed under "Binary files" with where it comes from.** A model's weights inherit the license of the model that they were converted from.

## Raspberry Pi pico-sdk / pico-examples (BSD-3-Clause)

* Origin: `https://github.com/raspberrypi/pico-sdk` and `https://github.com/raspberrypi/pico-examples`
* Copyright holder: Raspberry Pi (Trading) Ltd.
* License: BSD-3-Clause (the full text is below)

**The sources themselves are not copied.** They are rewritten as plain register offsets, without using pico-sdk's headers. The values are computed from pico-sdk's sources and register-definition headers, and confirmed by comparing the resulting byte sequences.

The notice is here anyway because **it is cheaper than arguing over whether the work is derivative**.

| File | What it originates from |
| :-- | :-- |
| `ksos/port/rp2040/boot2_generic_03h.S` | the order of the SSI settings and the exit handling in `boot_stage2/boot2_generic_03h.S` and `exit_from_boot2.S` |
| `ksos/port/rp2040/pad_checksum.kspl` | how `boot_stage2/pad_checksum` applies the checksum |
| `ksos/port/rp2040/elf2uf2.kspl` | the shape of `elf2uf2`'s output |
| `ksos/drivers/rp2040/adc.kspl` | the register addresses and field positions in `regs/adc.h` and `regs/resets.h` |
| `ksos/drivers/rp2040/clocks.kspl` | the values in the register headers, and the procedures in `xosc.c`, `pll.c` and `runtime_init_clocks.c` |
| `ksos/drivers/rp2040/gpio.kspl` | the register addresses and field positions in `hardware_regs` |
| `ksos/drivers/rp2040/i2c.kspl` | the values in `regs/i2c.h`, the derivation of the SCL divisor, and the initialization procedure |
| `ksos/drivers/rp2040/pwm.kspl` | the register addresses and field positions in `regs/{pwm,resets,addressmap}.h` |
| `ksos/drivers/rp2040/resets.kspl` | the procedure for waiting on the release |
| `ksos/drivers/rp2040/rtc.kspl` | the values in the register headers, and the numbering of the days of the week |
| `ksos/drivers/rp2040/timer.kspl` | the register addresses and field positions in `regs/{timer,addressmap}.h` |
| `ksos/drivers/rp2040/usb_cdc.kspl` | the values in the register headers and `structs/usb_dpram.h`, and pico-examples' USB start-up procedure |

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

## llama.cpp (MIT)

* Origin: `https://github.com/ggml-org/llama.cpp`, as vendored by the `llama-cpp-python` package 0.3.36
* Copyright holder: The ggml authors
* License: MIT (the full text is below)

**No source is copied.** The table is generated from llama.cpp's data, and the splitting rule is written anew in KSPL. ksai must give the same tokens as llama.cpp, so it follows llama.cpp's data and its reading of the rule. **The quantized weights and Qwen3.5's delta net are written anew too.** They follow the order of operations of ggml, llama.cpp's tensor library, so that ksai's numbers are the same bits as llama.cpp's.

| File | What it originates from |
| :-- | :-- |
| `ksai/unicode_class.kspl` | the letter, number and white-space classes in `unicode-data.cpp`, generated by `tools/ai_assist/gen_unicode_class.py` |
| `ksai/pretokenizer.kspl` | the order and corner cases of `unicode_regex_split_custom_qwen2` in `unicode.cpp`, and its reading of UTF-8 |
| `ksai/quant.kspl` | the block decoders of `dequantize_row_*` in `ggml-quants.c`, product by product. The integer products of `ggml_vec_dot_q3_K_q8_K` to `ggml_vec_dot_q6_K_q8_K`, `ggml_vec_dot_q8_0_q8_0` and `ggml_vec_dot_q5_0_q8_0`. The rounding of inputs in `quantize_row_q8_K_ref` and `quantize_row_q8_0` |
| `ksai/quantize.kspl` | the reference quantizers `quantize_row_q8_0_ref` and `quantize_row_q4_K_ref`, with `make_qkx2_quants`, expression by expression |
| `ksai/delta_net.kspl` | the steps of llama.cpp's `qwen35` graph, with ggml's `ssm_conv` and its fused `gated_delta_net` |

```text
MIT License

Copyright (c) 2023-2026 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## The Unicode Character Database (Unicode License v3)

* Origin: `https://www.unicode.org/ucd/`, through llama.cpp's `unicode-data.cpp`, which is built from it
* Copyright holder: Unicode, Inc.
* License: Unicode License v3 (the full text is below)

**The letter, number and white-space classes are Unicode's data.** llama.cpp turns the Unicode Character Database into its tables, and ksai's table is generated from those. So the notice of the data's own source travels with it.

| File | What it originates from |
| :-- | :-- |
| `ksai/unicode_class.kspl` | the general categories and white-space property of the Unicode Character Database, as llama.cpp's `unicode-data.cpp` holds them |

```text
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 1991-2023 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
```

## Qwen3-4B-Instruct-2507's chat template (Apache-2.0)

* Origin: `https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507`, as the GGUF file of `https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF` carries it
* Copyright holder: Alibaba Cloud (the Qwen team)
* License: Apache-2.0, `https://www.apache.org/licenses/LICENSE-2.0`

**Only the chat template is copied, not the weights.** A chat template is the text a model was trained to read around each message. A server must write it exactly, so it is copied word for word.

| File | What it originates from |
| :-- | :-- |
| `ksai/tests/qwen_data/tiny_qwen3.gguf` | the template, as the value of its `tokenizer.chat_template` |
| `ksai/tests/qwen_data/template_cases.json` | conversations, each with the text the template renders for it |
| `ksai/examples/chat_server/template.kspl` | the template's fixed text, and the order of its branches |

## Qwen3.5-9B's chat template (Apache-2.0)

* Origin: `https://huggingface.co/Qwen/Qwen3.5-9B`, as the GGUF file of `https://huggingface.co/unsloth/Qwen3.5-9B-GGUF` carries it
* Copyright holder: Alibaba Cloud (the Qwen team)
* License: Apache-2.0, `https://www.apache.org/licenses/LICENSE-2.0`

**Only the chat template is copied, not the weights**, for the reason the section above gives.

| File | What it originates from |
| :-- | :-- |
| `ksai/tests/qwen_data/tiny_qwen35.gguf` | the template, as the value of its `tokenizer.chat_template` |
| `ksai/tests/qwen_data/template35_cases.json` | conversations, each with the text the template renders for it |
| `ksai/examples/chat_server/template35.kspl` | the template's fixed text, and the order of its branches |

## puff, in zlib's `contrib/` (zlib License)

* Origin: `https://github.com/madler/zlib`, the files `contrib/puff/puff.c` and `contrib/puff/puff.h`, version 2.3
* Copyright holder: Mark Adler
* License: the zlib License (puff's notice in full is below)

**No source is copied.** The DEFLATE decoder is written anew in KSPL from RFC 1951. It holds a canonical Huffman code as puff does: the count of each code length, and the symbols in code order. It reads the code one bit at a time, as puff does too. The notice is here for the reason the pico-sdk section gives.

| File | What it originates from |
| :-- | :-- |
| `ksagent/office/inflate.kspl` | how puff's `construct` and `decode` hold and read a canonical Huffman code |

```text
puff.h
  Copyright (C) 2002-2013 Mark Adler, all rights reserved
  version 2.3, 21 Jan 2013

  This software is provided 'as-is', without any express or implied
  warranty.  In no event will the author be held liable for any damages
  arising from the use of this software.

  Permission is granted to anyone to use this software for any purpose,
  including commercial applications, and to alter it and redistribute it
  freely, subject to the following restrictions:

  1. The origin of this software must not be misrepresented; you must not
     claim that you wrote the original software. If you use this software
     in a product, an acknowledgment in the product documentation would be
     appreciated but is not required.
  2. Altered source versions must be plainly marked as such, and must not be
     misrepresented as being the original software.
  3. This notice may not be removed or altered from any source distribution.

  Mark Adler    madler@alumni.caltech.edu
```

## python-docx and openpyxl (MIT)

* Origin: the `python-docx` package 1.2.0 and the `openpyxl` package 3.1.5, from PyPI
* Copyright holders: Steve Canny (python-docx); openpyxl
* License: MIT (the full texts are below)

**No program source is copied.** ksagent's two Office test files were written by these libraries, so each holds parts of the library's own. The document's styles, theme and settings come from python-docx's default template. The workbook's theme is the one openpyxl writes into every workbook.

| File | What it originates from |
| :-- | :-- |
| `ksagent/tests/office_data/rules.docx` | python-docx's default template: its styles, theme and settings parts |
| `ksagent/tests/office_data/leave.xlsx` | openpyxl's built-in theme part |

python-docx:

```text
The MIT License (MIT)
Copyright (c) 2013 Steve Canny, https://github.com/scanny

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

openpyxl:

```text
This software is under the MIT Licence
======================================

Copyright (c) 2010 openpyxl

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Public-domain origins

**No notice is owed for these.** They are listed so that every origin a source declares is found in one place (the caution above).

| File | What it originates from | Origin |
| :-- | :-- | :-- |
| `std/ds.kspl` | `fmix32`, MurmurHash3's finalizer (Austin Appleby) | `https://github.com/aappleby/smhasher` |

## What is not bundled

**What is listed here appears only by name; the content is not included.** No notice is owed, but a reader not told that it is missing goes looking for it.

| Name | Where it appears | What is not included |
| :-- | :-- | :-- |
| Freenove 4WD car kit | `ksos/boards/freenove_4wd_pico/` | The vendor material itself. **It is a rule not to copy it in** ("Where the facts come from" in [`ksos/docs/SPEC-board.md`](ksos/docs/SPEC-board.md)). Only hardware facts, such as pin numbers, are used, read from the official repository |
| Qwen | `ksai/qwen.kspl`, `ksai/examples/`, `tools/ai_assist/` | The weights. Only the code that reads or converts them is present. **Whoever downloads and uses them follows Qwen's own license** |
| Llama | `ksai/examples/llama_engine/` | Meta's weights. The bundled `mini_llama.safetensors` is made here, with a vocabulary of 12 and two layers; only the shape is borrowed |
| PyTorch / transformers / peft | `tools/ai_assist/*.py` | The packages themselves. The tools assume you install them on your own machine |
| OpenSSL | `ksbind/tls` | The library itself. Only the caller's declarations are present |

## Binary files

**Every file git treats as binary is here, with where it comes from.** A borrowed one is also listed in its license's section above, with the notice it owes.

| File | Where it comes from | License |
| :-- | :-- | :-- |
| `.vscode/extensions/kspl/kspl-file.ico` | Made here: the `.kspl` file icon, rendered at 16 to 256 pixels from [`.vscode/extensions/kspl/kspl-file.svg`](.vscode/extensions/kspl/kspl-file.svg), which reuses the brush strokes of [`docs/kspl-icon.svg`](docs/kspl-icon.svg) | This repository's |
| `.vscode/extensions/kspl/icon.png` | Made here: the VS Code extension's icon, rendered from [`docs/kspl-icon.svg`](docs/kspl-icon.svg). Its K was generated with OpenAI's image-generation tool and selected by Kanso System, then traced here into an outline that uses no font. The `.kspl` and `.ksmd` file icons reuse the same K | This repository's ([`LICENSE.md`](LICENSE.md)), to the extent copyright applies |
| `ksmd/port/desktop/ksmd.ico` | Made here: the file icon of `.ksmd` documents, rendered at 16 to 256 pixels from [`ksmd/port/desktop/ksmd.svg`](ksmd/port/desktop/ksmd.svg). That drawing reuses the brush-written K of [`docs/kspl-icon.svg`](docs/kspl-icon.svg) | This repository's |
| `ksagent/tests/office_data/deflate_cases.bin` | Made here: text and seeded random bytes, packed by Python's own `zlib` at each of its strategies, written by [`ksagent/tests/make_office_fixtures.py`](ksagent/tests/make_office_fixtures.py) | This repository's |
| `ksagent/tests/office_data/leave.xlsx` | Made here: a workbook written by openpyxl, with shared strings, a formula's cached value and furigana added by [`ksagent/tests/make_office_fixtures.py`](ksagent/tests/make_office_fixtures.py). Its theme part is the one openpyxl writes into every workbook | This repository's; the theme is openpyxl's (MIT, "python-docx and openpyxl" above) |
| `ksagent/tests/office_data/rules.docx` | Made here: a document written by python-docx, with list numbering, tracked changes, a text box and a footnote added by [`ksagent/tests/make_office_fixtures.py`](ksagent/tests/make_office_fixtures.py). Its styles, theme and settings come from python-docx's default template | This repository's; those parts are python-docx's (MIT, "python-docx and openpyxl" above) |
| `ksai/examples/llama_engine/mini_llama.safetensors` | Made here: tiny weights of Llama's shape (a vocabulary of 12, two layers), trained by this repository's own code | This repository's ([`LICENSE.md`](LICENSE.md)) |
| `ksai/tests/quant_data/bf16.bin` | Made here: seeded random numbers in GGUF's BF16 format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/dot_q3_k.bin` | Made here: seeded random weights in GGUF's Q3_K format and seeded input rows. llama.cpp's C library, in its Python package `llama_cpp`, rounded the inputs and computed the products. Written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/dot_q4_k.bin` | Made here: seeded random weights in GGUF's Q4_K format and seeded input rows. llama.cpp's C library, in its Python package `llama_cpp`, rounded the inputs and computed the products. Written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/dot_q5_0.bin` | Made here: seeded random weights in GGUF's Q5_0 format and seeded input rows. llama.cpp's C library, in its Python package `llama_cpp`, rounded the inputs and computed the products. Written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/dot_q5_k.bin` | Made here: seeded random weights in GGUF's Q5_K format and seeded input rows. llama.cpp's C library, in its Python package `llama_cpp`, rounded the inputs and computed the products. Written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/dot_q6_k.bin` | Made here: seeded random weights in GGUF's Q6_K format and seeded input rows. llama.cpp's C library, in its Python package `llama_cpp`, rounded the inputs and computed the products. Written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/dot_q8_0.bin` | Made here: seeded random weights in GGUF's Q8_0 format and seeded input rows. llama.cpp's C library, in its Python package `llama_cpp`, rounded the inputs and computed the products. Written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/f16.bin` | Made here: seeded random numbers in GGUF's F16 format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/q3_k.bin` | Made here: seeded random numbers in GGUF's Q3_K format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/q4_k.bin` | Made here: seeded random numbers in GGUF's Q4_K format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/q5_0.bin` | Made here: seeded random numbers in GGUF's Q5_0 format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/q5_k.bin` | Made here: seeded random numbers in GGUF's Q5_K format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/q6_k.bin` | Made here: seeded random numbers in GGUF's Q6_K format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/quant_data/q8_0.bin` | Made here: seeded random numbers in GGUF's Q8_0 format, and their reference values from llama.cpp's Python package `gguf`, written by [`tools/ai_assist/make_quant_fixtures.py`](tools/ai_assist/make_quant_fixtures.py) | This repository's |
| `ksai/tests/qwen_data/tiny_qwen3.gguf` | Made here: seeded random weights of Qwen3's shape (2 blocks, 32 wide), written by [`tools/ai_assist/make_qwen_fixtures.py`](tools/ai_assist/make_qwen_fixtures.py) through llama.cpp's Python package `gguf`. It carries Qwen3-4B-Instruct-2507's chat template (its section above) | This repository's; the chat template Apache-2.0 |
| `ksai/tests/qwen_data/tiny_qwen35.gguf` | Made here: seeded random weights of Qwen3.5's shape (4 blocks, 32 wide, two of them delta nets), written by [`tools/ai_assist/make_qwen35_fixtures.py`](tools/ai_assist/make_qwen35_fixtures.py) through llama.cpp's Python package `gguf`. It carries Qwen3.5-9B's chat template (its section above) | This repository's; the chat template Apache-2.0 |
| `ksos/demo/cortex_m/pilot_policy.safetensors` | Made here: the Edge AI car's piloting policy, trained on a PC by this repository's own code | This repository's |
| `ksplc/tests/prog/embed_data/raw.bin` | Made here: sample bytes for the `embed` tests | This repository's |

## Further reading

* [`LICENSE.md`](LICENSE.md) — the license for this repository as a whole.
* [`ksos/docs/DESIGN-rtos.md`](ksos/docs/DESIGN-rtos.md) — "The RP2040 port" says how the three files under `ksos/port/rp2040/` above compute their values. It also says how the values are confirmed. "🔧 The peripheral drivers" says what each driver originates from.
