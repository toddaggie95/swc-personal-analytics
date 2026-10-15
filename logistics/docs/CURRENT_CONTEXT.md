# SWC Logistics Research — Current Context

Status: initial setup; travel formulas not yet verified.

## Purpose
Develop a reproducible model for sublight and hyperspace travel, pilot skill effects, distances, ship cargo capacity, and material collection optimization.

## Architecture
Keep logistics independent of SWC API integration. Manual observations, CSV exports, Sheets, and future API clients are interchangeable data sources. Do not reorganize existing API files.

## Evidence rules
Label mechanics as official/documented, observed, inferred, hypothesis, or rejected. Record source, date, inputs, units, actual travel ETA, and rounding. Do not treat unverified formulas as facts. Preserve discrepancies and add regression tests for corrections.

## Research sequence
1. Document sublight travel mechanics and collect measured examples.
2. Validate pilot skill modifiers and rounding.
3. Document and validate hyperspace mechanics and inter-system distances.
4. Model cargo, round trips, material demand, and fleet allocation.

## Session handoff
Read this file first when resuming logistics work. Update verified findings, open questions, and next steps after substantive sessions.
