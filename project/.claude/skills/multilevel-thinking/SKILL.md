---
name: multilevel-thinking
description: Multi-strategy analysis using six parallel strategy-analyzer agents, each applying a different approach. Compare conclusions and implement the majority solution.
user-invocable: true
disable-model-invocation: true
---

# Multi-Strategy Analysis: $ARGUMENTS

Analyze the given problem using six parallel strategy-analyzer agents, each applying a different approach. Compare their conclusions and implement the majority solution.

## Process

### 1. Spawn Six Strategy Analyzers in Parallel

Each agent receives the same problem but a **different strategy**. Launch all six simultaneously using the Task tool with `subagent_type: strategy-analyzer`.

**Strategy 1 - Minimal Change**: Find the smallest, most targeted fix. Change as few lines as possible. Prioritize surgical precision over comprehensiveness.

**Strategy 2 - Root Cause Analysis**: Trace the problem to its fundamental root cause. Even if the fix is larger, address the underlying issue rather than symptoms.

**Strategy 3 - Pattern Matching**: Search the codebase for similar problems that were already solved. Apply the same pattern/approach that worked before.

**Strategy 4 - Security-First**: Analyze from a security perspective. What approach eliminates the most risk? What are the attack vectors? Choose the most secure solution.

**Strategy 5 - Performance-Optimized**: Evaluate the performance implications of each possible approach. Choose the solution with the best runtime/memory characteristics.

**Strategy 6 - Future-Proof Design**: Consider maintainability and extensibility. Which approach will cause the least friction for future changes?

### 2. Collect and Compare Results

After all six agents complete, analyze their outputs:

```
| Strategy           | Proposed Approach | Files Changed | Confidence |
|--------------------|-------------------|---------------|------------|
| Minimal Change     | ...               | ...           | ...        |
| Root Cause         | ...               | ...           | ...        |
| Pattern Matching   | ...               | ...           | ...        |
| Security-First     | ...               | ...           | ...        |
| Performance        | ...               | ...           | ...        |
| Future-Proof       | ...               | ...           | ...        |
```

### 3. Find the Majority Solution

- Group strategies that converge on similar approaches
- Identify the **majority consensus** (3+ agents agreeing)
- Note any outliers and their unique insights worth incorporating
- If no clear majority, weight Root Cause and Pattern Matching higher

### 4. Synthesize and Implement

- Take the majority approach as the base
- Incorporate valuable insights from minority strategies (e.g., security hardening from Strategy 4, performance tips from Strategy 5)
- Implement the synthesized solution

### 5. Report

Present the final analysis:
- Which strategies agreed and why
- Which strategies diverged and what unique insights they provided
- The chosen approach with rationale
- Any trade-offs acknowledged
