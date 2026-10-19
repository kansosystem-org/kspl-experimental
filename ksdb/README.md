# ksdb

ksdb stores an append-only log with no external dependencies. Completed records remain readable even if power fails during a write. *Append-only* means adding records at the end without changing existing records. Devices can use it to retain sensor readings and received settings across power failures. Desktop programs can use it for a document's change history.

Use ksdb for a small, durable log, especially on a microcontroller with flash memory. [`ksdb/docs/DESIGN-storage.md`](docs/DESIGN-storage.md) explains the append-only design and record layout. It also explains the choice against SQLite through a foreign function interface (FFI), which calls C code from KSPL.

## Run it

Run `make test` from this folder with `ksplc` ([`ksdb/Makefile`](Makefile)). [`ksdb/ksplc.cfg`](ksplc.cfg) declares the package name. A copy of this folder runs the same tests independently. [`ksdb/docs/DESIGN-storage.md`](docs/DESIGN-storage.md) explains how the tests simulate power failures at every point.

This example assigns a `kind` number to each record. It appends one record, then reads records from oldest to newest. Finally, it requests the newest record of a specified kind:

```kspl
import "ksdb/log" as ksdblog
import "ksdb/ram_store" as ram
import "std/io"

const KIND_SAMPLE: U16 = 1
const KIND_POLICY: U16 = 2

$buf: U8[8192]

fn main()
    store: = ram.make(U8$[]::buf, 4096) // a 4KB sector
    $lg: = ksdblog.Log.open(store) // scans the place and settles where it can append

    lg.append(KIND_SAMPLE, "dist=180 line=2") catch
        return

    // Reading it back, oldest first.
    $payload: U8[64] = ::{}
    $it: = lg.iter()
    for it.next()
        // it.kind and it.len are the kind and content length of the record now pointed at. A
        // record longer than `payload` throws `too_small`, as `last` does, instead of being cut.
        n: = it.read(U8$[]::payload) catch
            continue
        io.out().s("kind \{it.kind\}: \{n\} bytes\n")

    // "The newest one" per kind. This is the shape for taking the policy handed down.
    // With not one record it throws `not_found`, which is not length 0.
    $policy: U8[2048] = ::{}
    n: = lg.last(KIND_POLICY, U8$[]::policy) catch
        return
    io.out().s("the policy holds \{n\} bytes\n")
```

The caller defines each `kind`. ksdb matches kinds without interpreting the record content.

## What is here

`Log` writes through a `Store`, which provides operations to read, write, and erase memory. The diagram shows these layers. The dashed line identifies the part that the caller supplies.

```mermaid
flowchart TD
    P["your program"] -->|"append / iter / last"| L["Log (ksdb/log.kspl)"]
    L -->|"read / write where erased / erase a sector"| S["Store (ksdb/store.kspl)"]
    S --> R["RAM held to flash's rules<br/>(ksdb/ram_store.kspl)"]
    S -.-> F["a device's flash,<br/>built by the caller from its own driver"]
```

| File | Content |
| :-- | :-- |
| [`ksdb/log.kspl`](log.kspl) | The log implementation. |
| [`ksdb/store.kspl`](store.kspl) | The storage interface: read, write to erased memory, and erase a sector. It also defines the sector size. A *sector* is the smallest block that flash can erase at once. |
| [`ksdb/ram_store.kspl`](ram_store.kspl) | Storage in RAM that follows flash constraints. Without an erase, a write can only change bits to 0. |
| [`ksdb/tests/ksdb_test.kspl`](tests/ksdb_test.kspl) | Tests using RAM with flash constraints. |

`ksplc doc ksdb/log` lists methods and failure cases directly from the source.

ksdb does not rewrite records, delete individual records, reuse old sectors, or maintain an index. When the log is full, it returns `full` without overwriting records. [`ksdb/docs/DESIGN-storage.md`](docs/DESIGN-storage.md) explains these limits.

## Adding a place

To use another kind of memory, create a `Store` from [`ksdb/store.kspl`](store.kspl). Pass it to `Log.open`. `ksplc doc ksdb/store.Store` describes each field's requirements.

`ksdb/ram_store.kspl` works on hosts and devices. For device flash, supply functions from your own driver, called `flash` below. This approach supports storage such as the RP2040's QSPI flash without device names in ksdb.

```kspl
store: = Store::{
    .read_at = flash.read_at,
    .program_at = flash.program_at,
    .erase_sector = flash.erase_sector,
    .capacity = flash.region_size,
    .sector_size = flash.sector_size,
}
```

## Further reading

* [`ksdb/docs/DESIGN-storage.md`](docs/DESIGN-storage.md) explains the append-only design and record layout.
* [`ksdb/SURFACE.txt`](SURFACE.txt) records the published API. `make surface` writes it. `make test-surface` checks it. See [`docs/SPEC-gates.md`](../docs/SPEC-gates.md).
* [std](../std/README.md) introduces ksdb's only dependency. `ksplc doc std` lists its published files.
