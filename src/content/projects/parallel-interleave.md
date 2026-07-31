---
title: "Parallel Interleave for MEC Decomposition"
category: "Systems / Hardware / Formal Methods"
date: "2026-01"
techStack: ["C++", "Python", "Storm", "perf", "Valgrind"]
description: "Parallelized a core algorithm in the Storm probabilistic model checker, achieving 2–5x speedup on the QVBS benchmark suite."
summary: "Reimplemented the Interleave algorithm for Maximal End Component decomposition in Storm, a widely used probabilistic model checker, with parallel execution. Hit 2–5x speedup over the sequential baseline across the full QVBS benchmark suite. Built a profiling pipeline from scratch: perf with DWARF call-graphs at 997 Hz, Valgrind instrumentation, flamegraph generation, and C++ template symbol demangling to make profilers see the right entry points."
featured: true
links: {}
---
