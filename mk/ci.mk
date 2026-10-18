# ==================================================================
# mk/ci.mk — the CI's entry points (ci / ci-macos / ci-shard-*)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# **The gates, their order and which job runs each are `tools/ci_gates.kspl`'s table**; each
# target here only names its set, spelt as the target (`tools/ci.kspl`). The seed runs it, so a
# compiler the round is checking never decides what is checked.
# ==================================================================
TEST_JOBS ?= $(HOST_CORES)
# Native macOS's make 3.81 cannot keep the shared suites' output grouped; Homebrew names GNU make
# `gmake`. The macOS workflow's smaller set also works with the system make when gmake is absent.
ci_make = $(if $(filter darwin,$(PLATFORM)),$(shell command -v gmake 2>/dev/null || echo '$(MAKE)'),$(MAKE))

# --- The time cap on every gate, in seconds ---
# **A gate past it is stopped with all it started, and named as the cause** (`run_capped` in
# `tools/ci_gates.kspl`), where otherwise the CI job's `timeout-minutes` cancels the whole job
# naming no gate, and a local `make ci` waits for ever. 20 minutes is above a whole job's run and
# below each job's `timeout-minutes` in `.github/workflows/ci.yml` by about the time the job's other
# gates take ("How CI runs" in `docs/SPEC-gates.md`), so a hang is named first. A slower machine
# raises it on the command line (`make ci CI_GATE_CAP=3600`).
CI_GATE_CAP := 1200

# `--platform`: a SKIP that platform's rows in `tools/ci_gates.kspl` do not expect fails its gate.
# `--relaxed`: the switches a person turned off where the platform requires them (`mk/test.mk`).
ci_run = ./$(SEED_EXE) run tools/ci.kspl --make='$(ci_make)' --jobs=$(TEST_JOBS) --platform=$(PLATFORM) \
  --relaxed='$(strip $(require_relaxed))' --cap=$(CI_GATE_CAP)

## Gates|ci|Every gate this host runs natively (each platform's set is in `docs/SPEC-gates.md`)
## Gates|ci-macos|Every gate run on macOS
ci ci-macos: $(SEED_EXE)
	@$(ci_run) $@

## Gates|ci-shard-*|One job's share of `ci` (the names are `Shard` in `tools/ci_gates.kspl`)
ci-shard-%: $(SEED_EXE)
	@$(ci_run) $@

# Caution: **With no seed, say so and return 0**: the step runs after a fall, whose cause is the
# step above.
## Measure-and-inspect|ci-summary|Emit the previous round's gate listing again
ci-summary:
	@if [ -x $(SEED_EXE) ]; then $(ci_run) summary --title="$${TITLE:-ci}"; else \
	  echo "no gate log: the round fell before a gate ran (the cause is the step above)" \
	    >> "$${GITHUB_STEP_SUMMARY:-/dev/stdout}"; fi

.PHONY: ci ci-macos ci-summary
