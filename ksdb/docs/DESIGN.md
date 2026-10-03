# ksdb — the design

`ksdb` is a record kept inside a device. Three requirements decide nearly all of its shape.

* **It fits a freestanding microcontroller, with zero dependencies.** `std/db` passes the work to SQLite through FFI, which needs libsqlite3 and a C backend, so it does not fit.
* **The power may fail at any moment.** The one record being written at that instant may break, but the records finished before it must always read back.
* **The place is flash.** Writing can only turn bits to 0. Erasing works on a whole sector and must come before writing. The flash's life is counted in erase cycles.

## The design decisions

### It holds no rewriting, only appending

On flash, rewriting one record means erasing and rewriting its whole sector. **Every other record there is rewritten with it**, and a power loss in between loses them all. Appending erases a sector only once nothing in it is needed (`reset`).

Caution: **Do not erase a sector on the appending path.** Where `tail` is partway through a sector, erasing it erases the finished records there too.

Given up: deleting one record, and updating in place. A changing value such as a policy is appended again under the same `kind` and read with `last`, so the old one survives a power loss while the new one is written.

### The place is swapped through a struct of function pointers

`ksdb/log.kspls` does not know where it writes. It needs only "read", "write where erased", "erase a sector" and the sector's size, gathered into `Store` in `ksdb/store.kspls`. `Store` is not a trait (dynamic dispatch), so the caller picks the place explicitly, in one spot, with no hidden vtable or inheritance.

**No context pointer is held.** Every place holds one set of state per file, so none is needed. Add one when a device needs two media of the same kind.

### `Store` exposes flash's write and erase asymmetry as it is

`program` and `erase` work at different granularities, and hiding that stops the layer above from writing correctly. On most media, a write where nothing was erased returns no failure: bits merely turn to 0 and leave a garbled value. So `program_at` returning `true` cannot mean "written correctly", and **checking that the place was erased is `ksdb/log.kspls`'s job**.

### A record's layout — `len` comes first and `0xFFFF` is 'empty'

Erased flash has every bit at 1. With the length field at the head and `0xFFFF` as the empty marker, **the end is found without writing an extra marker**. With `crc` first instead, a record whose CRC happens to be `0xFFFFFFFF` would read as empty.

**The price is a content cap of `0xFFFE` bytes**, since the empty marker takes `0xFFFF` (`max_payload` in `log.kspls`). A small sector caps it lower ("One record is kept inside one sector" below).

**The CRC covers `len` and `kind` too.** Over the content alone, a garbled length would pass as a correct record of another length and shift every record after it.

A record's boundaries are aligned to 4 bytes. Unaligned, the head's 2-byte integer can sit at an odd address and fault on a target that reads it directly.

### The content is written first and the head last

A power loss can land anywhere, so **the order has to read correctly wherever it lands**. With the head written last, a record whose head is unwritten reads as empty to the scan, as if it never existed. The other order leaves a head naming a correct length over missing content.

### The scan does not cut off at a garbled record; it gives up that sector and jumps to the next

A half-written record fails its CRC. **A scan that stopped there would leave everything appended after one power loss unreadable forever.** Skipping costs only the rest of that sector.

For the same reason, the scan does not stop at an erased place either. Appending leaves a gap at a sector's end rather than straddle, and stopping there would miss the next sector's records.

**How it walks is written once, in `Cursor.next`.** `Log.open`, which finds the append position, uses the same `Cursor`. A copy would make these two rules that disagree wherever one skips a sector the other reads.

### `open` scans every time

An append position remembered elsewhere is a second source of truth, and it goes stale when the power fails. The scan reads the records themselves, so its answer is right even after a power loss.

### One record is kept inside one sector

A straddling record keeps only its head once the other sector is erased. So content that does not fit in one sector returns `too_large`, and a record that would straddle starts at the next sector's head instead, leaving a gap.

The content cap is therefore the **smaller** of "the sector's size − the 8-byte head − the padding" and `0xFFFE`. To keep more, the caller splits it into several records. `ksdb` does no splitting.

### A place that cannot be written is skipped. It does not stop

`append` checks that the place is erased before writing.

Caution: **Do not stop when it is not erased.** A half-written record from a power loss can sit in a sector beyond `tail`'s. It was sent there to avoid straddling, then cut off partway. `open` checks only the rest of `tail`'s sector, so that record is not found.

A stopping `append` would stop at the same place after every reopen. Nothing could be appended until `reset` threw everything away, yet appending after a power loss is what this record is for. So **an unerased place is skipped, and `append` looks further on**.

**Do not erase a sector here either** (erasing is `reset`'s job). Skipping on until nothing fits gives `full`.

### Full comes back as `full`, and nothing is silently overwritten

There is no machinery for erasing an old sector and going round.

Caution: **Do not make it overwrite silently.** A lost record cannot be recovered, and nobody can even notice it disappeared. Once nothing fits, `append` returns `full` and stops, with every record so far still readable. Once they are read off, `reset` empties the place.

### `last` reports a missing record as `not_found`, not as length 0

A record with empty content is legitimate (a marker can carry its kind alone). If "there is none" were length 0, **one empty record appended would answer "there is none"**. The writer would see only "written, yet unreadable", with nothing to trace the cause by. So `last` returns `Ksdb_error.not_found`, distinct from length 0.

**A caller that can use 0 when there is none writes `catch 0`.** A count kept across restarts takes that shape: the first start finds none and begins from 0.

Caution: **Do not append an empty record to a kind read with `catch 0`.** There the two cases merge.

### Power cuts are tested at every point, not at chosen ones

**"The records finished before it must always read back" is this package's promise**, and a hand-picked cut point tests only where it was picked. `tests/ksdb_test.kspls` cuts each write in turn, after 0, 1 and 4 bytes of it. It reopens each time and checks that the finished records read back in order and that more can be appended after them. Cutting at every write is affordable because the record only appends and has no index.

Where it cuts is not enough: **what was appended has to vary too, or the cut never hits**.

* Caution: **Do not drop the cut after one byte.** An erase check one byte off would still catch garbling from the second byte on.
* **Mix in a record with empty content.** Only its head is written, so a cut there leaves a sector where that one byte alone is not erased.
* **Mix in a length that straddles a sector.** Records that all fit neatly never build a cut right after a record is sent to the next sector's head.
* **Do not stop at one record appended after the cut.** Where the half-written record sits in a sector beyond `tail`'s, the next record still fits in the earlier sector. Only the one after it hits.

**Only the four together build the case that "A place that cannot be written is skipped" exists for.** A hand-chosen test misses it.

**Test bit corruption separately**, as SQLite does. Sweeping every cut point never produces a bit decayed with age.

### It holds no index

`last` walks every record oldest first and returns the last one found. A separate index would itself be a second truth that disagrees with the records after a power loss. **The walk grows with the record count**, which is enough for what a device keeps (a few sectors' worth).

### The RAM place keeps flash's constraints too

`program_at` in `ksdb/ram_store.kspls` **only turns bits to 0**.

Caution: **Do not make it a plain assignment because "it is RAM".** Loosened, it lets code above pass here and break on real flash. The imitation is there for the checks, not for convenience.

For the same reason it counts erases and writes for the tests to read. Erasing is flash's costliest operation and wears it out, so the tests check that appending erases no more than it has to. `arm_cut` causes on a host what a real device meets only at the instant of power loss. It names the write, and the byte count into it, where it cuts, so the tests can move the cut everywhere.
