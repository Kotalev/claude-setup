---
name: review-changes
description: Comprehensive code review of current changes focusing on security, stability, and performance.
user-invocable: true
disable-model-invocation: true
---

# Code Review: Security, Stability & Performance

Analyze the current changes in this repository and provide a comprehensive code review focusing on three key areas.

## Instructions

1. First, run `git diff` to see staged and unstaged changes, or `git diff HEAD~1` if changes are already committed
2. Review ALL changed files systematically

## Review Criteria

### Security (Critical Priority)
- **Input validation**: Are all user inputs properly sanitized and validated?
- **SQL/NoSQL injection**: Are queries parameterized? Any string concatenation risks?
- **XSS vulnerabilities**: Is output properly escaped? Any `dangerouslySetInnerHTML` or similar?
- **Authentication/Authorization**: Are auth checks in place? Any bypass possibilities?
- **Sensitive data exposure**: Are secrets, tokens, or PII properly handled? Any hardcoded credentials?
- **Dependency risks**: Any known vulnerable packages being added?
- **CSRF protection**: Are state-changing operations protected?
- **Path traversal**: Are file paths properly validated?

### Stability (High Priority)
- **Error handling**: Are errors caught and handled gracefully? Any unhandled promise rejections?
- **Null/undefined checks**: Are edge cases handled? Any potential runtime crashes?
- **Type safety**: Are types properly defined? Any `any` types that should be specific?
- **Race conditions**: Any async operations that could conflict?
- **Resource cleanup**: Are connections, listeners, and subscriptions properly cleaned up?
- **Backwards compatibility**: Will these changes break existing functionality?
- **Database migrations**: Are they reversible? Any data loss risks?
- **Boundary conditions**: Are array bounds, numeric limits checked?

### Performance (Medium Priority)
- **N+1 queries**: Any database calls in loops?
- **Unnecessary re-renders**: Are React components optimized? Missing `useMemo`/`useCallback`?
- **Memory leaks**: Any growing arrays, unclosed connections, or retained references?
- **Bundle size**: Are imports tree-shakeable? Any large dependencies added unnecessarily?
- **Caching opportunities**: Could any expensive operations be cached?
- **Async operations**: Are operations that could be parallel running sequentially?
- **Index usage**: Will database queries use indexes effectively?
- **Pagination**: Are large datasets properly paginated?

## Output Format

For each issue found, provide:

```
### [SEVERITY] Category: Brief Title

**File**: `path/to/file.ts:lineNumber`
**Risk**: High/Medium/Low

**Problem**:
Clear explanation of the issue

**Code**:
\`\`\`
problematic code snippet
\`\`\`

**Suggestion**:
\`\`\`
improved code snippet
\`\`\`
```

## Summary Requirements

At the end, provide:
1. **Critical issues** that MUST be fixed before merge
2. **Recommended improvements** that should be addressed
3. **Minor suggestions** for code quality
4. **Overall assessment**: Safe to merge? Needs changes?

---

Use elite-code-reviewer subagent
Now analyze the current changes and provide your review in Bulgarian language.
