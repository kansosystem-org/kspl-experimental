# ==================================================================
# mk/ci.mk — the CI's entry points (ci / ci-linux / ci-linux-only / ci-macos / ci-shard-*)
# Taken in by the root Makefile; the rule for including is in the header of its `include mk/ci.mk`.
# **The gates, their order and which job runs each are `tools/ci_gates.kspls`'s table**; each
# target here only names its set, spelt as the target (`tools/ci.kspls`). The seed runs it, so a
# compiler the round is checking never decides what is checked.
# ==================================================================
TEST_JOBS ?= $(HOST_CORES)

ci_run = ./$(SEED_EXE) run tools/ci.kspls --make='$(MAKE)' --jobs=$(TEST_JOBS)

## Gates|ci|Every gate runnable on this environment
## Gates|ci-linux|Every Linux gate (`ci` plus what has its tool on Linux only)
## Gates|ci-linux-only|Only what has its tool on Linux alone
## Gates|ci-macos|Every gate run on macOS
ci ci-linux ci-linux-only ci-macos: $(SEED_EXE)
	@$(ci_run) $@

## Gates|ci-shard-*|One job's share of `ci` (the names are `Shard` in `tools/ci_gates.kspls`)
ci-shard-%: $(SEED_EXE)
	@$(ci_run) $@

# Caution: **With no seed, say so and return 0**: the step runs after a fall, whose cause is the
# step above.
## Measure-and-inspect|ci-summary|Emit the previous round's gate listing again
ci-summary:
	@if [ -x $(SEED_EXE) ]; then $(ci_run) summary --title="$${TITLE:-ci}"; else \
	  echo "no gate log: the round fell before a gate ran (the cause is the step above)" \
	    >> "$${GITHUB_STEP_SUMMARY:-/dev/stdout}"; fi

.PHONY: ci ci-linux ci-linux-only ci-macos ci-summary
