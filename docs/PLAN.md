# What is left

**What is left in one package is in its own `docs/PLAN.md`, listed below; what spans packages is here.** A package with nothing left to do has no plan ("Document naming" in [`SPEC-documents.md`](SPEC-documents.md)).

| Plan | What it covers |
| :-- | :-- |
| [`ksos/docs/PLAN.md`](../ksos/docs/PLAN.md) | The OS: its kernel and its ports |
| [`kssrv/docs/PLAN.md`](../kssrv/docs/PLAN.md) | The server, and the local server's protocol |
| [`kspage/docs/PLAN.md`](../kspage/docs/PLAN.md) | The editing system |
| [`tools/docs/PLAN.md`](../tools/docs/PLAN.md) | The coding assistant |

## Gesture recognition on the RP2040

**The car recognizes a hand waved over it, with the same KSPL from training on a PC to the chip, and with only the sensors it already carries.** Elsewhere this takes three tools in a row: a model trained in Python, a converter to the runtime's format, and an interpreter on the chip, whose memory is sized by trial until "the arena is too small" stops. Here the model, the readings' preprocessing and the chip's code are one source, and the PC's answer is the chip's. The input is the car's two light sensors and its ultrasonic distance ([`ksos/docs/SPEC-board.md`](../ksos/docs/SPEC-board.md)), so nothing is bought or wired. The gestures are a few, such as a swipe from left to right, one from right to left, and a push towards the car. The chip is the RP2040 alone (ksai, ksos, and the comparison's tools).

| | What is left | What marks it as done |
| :-- | :-- | :-- |
| stage 1 | **The gesture clips, recorded on the car.** Nothing records a window of readings with its label. Missing: sampling the light sensors at a fixed rate with the distance beside them, and keeping each window in the record inside the device with the gesture named by a key on the remote, then reading the record out to the PC | A labelled set recorded on the car under daylight, lamp light and dim light, with a fifth held out from training |
| stage 2 | **The model, trained here.** ksai has no convolution (only fully connected layers and attention). Missing: a one-dimensional convolution over time with its backward pass, and the readings' normalization, written once for both the PC and the chip | Trained in ksai, it names the held-out clips' gestures at the accuracy fixed before training, the readings normalized by the code the chip runs |
| stage 3 | **The model on the RP2040, at int8.** The RP2040 is a Cortex-M0+ with no floating-point unit, so a float model runs in software: the model is quantized to int8 (`ksai/quant.kspls` holds the per-row weights; activations and the int8 kernels are missing). The held-out clips are burned into flash with `embed` | Under ksos on the board, every burned-in clip gets the class the PC's int8 run gives, the same scores bit for bit, with the time per inference measured |
| stage 4 | **The comparison with TensorFlow Lite Micro on the same board.** The same model, converted to its format, run on the same RP2040 | A table of time per inference, RAM, flash and accuracy for both, kept whichever side comes out ahead ("What has been checked on real hardware" in [`ksos/README.md`](../ksos/README.md)) |
| stage 5 | **The memory known before it runs.** The arena the model needs is found today only by running it | The build prints the most RAM one inference takes, the board never exceeds it, and a check holds both |
| stage 6 | **Live gestures.** A hand waved over the car, not clips burned in | The car names a gesture made over it at the accuracy the burned-in clips reach, and acts on it: a swipe turns it, a push stops it |

### Not yet settled

* **Which gestures, and the accuracy to reach.** No public dataset or benchmark covers these sensors, so the clips are ours and no outside score applies. The held-out accuracy is fixed before training, so the result cannot choose its own bar.
* **The sampling rate, and how the two sensors share a window.** The light sensors can be read far faster than a hand moves. The ultrasonic can be read only about every 72 ms: a measurement takes up to 36 ms and needs 36 ms before the next ("What the self-driving probe does, and where its judgement lives" in [`ksos/docs/DESIGN.md`](../ksos/docs/DESIGN.md)). So a window holds many light readings to each distance.
* **How the room's light is taken out**: normalizing each window by its own level, or leaving the lighting to the data recorded in stage 1.
* **Whether the recorded clips are committed.** They are recorded here, so no attribution is owed; what weighs is their size against reproducing stage 2 without the car.
* **Whether stage 3's int8 kernels are tuned further for the Cortex-M0+** (as Arm's CMSIS-NN is for its cores) waits on stage 4's numbers.
