---
Intended for Jira/GitHub tasks or other task management systems to break down and plan the implementation.
---

# Task Template v2 - Information Dense with Validation Loops

> Concise, executable tasks with embedded context and validation commands

## Format

```
[ACTION] path/to/file:
  - [OPERATION]: [DETAILS]
  - VALIDATE: [COMMAND]
  - IF_FAIL: [DEBUG_HINT]
```

## Actions keywords to use when creating tasks for concise and meaningful descriptions

- **READ**: Understand existing patterns
- **CREATE**: New file with specific content
- **UPDATE**: Modify existing file
- **DELETE**: Remove file/code
- **FIND**: Search for patterns
- **TEST**: Verify behavior
- **FIX**: Debug and repair

## Critical Context Section

```yaml
# Include these BEFORE tasks when context is crucial
context:
  docs:
    - url: [API documentation]
      focus: [specific method/section]

  patterns:
    - file: existing/example.js
      copy: [pattern name]

  gotchas:
    - issue: "Library X requires Y"
      fix: "Always do Z first"
```

## Task Examples with Validation

### Implementation Tasks

````
UPDATE path/to/file:
  - FIND: MODEL_REGISTRY = {
  - ADD: "new-model": NewModelClass,
  - VALIDATE: test functionality
  - IF_FAIL: Check import statement for NewModelClass

CREATE path/to/file:
  - COPY_PATTERN: path/to/other/file
  - IMPLEMENT:
   - [Detailed description of what needs to be implemented based on codebase intelligence]
  - VALIDATE:  test functionality
````

## Validation Checkpoints

```
CHECKPOINT syntax:
  - RUN: yarn dev
  - FIX: Any reported issues
  - CONTINUE: Only when clean and everything is worked
```

## Common Task examples

### Add New Feature

```
1. READ existing similar feature
2. CREATE new feature file (COPY pattern)
3. UPDATE registry/router to include
4. Check the feature is worked
```

### Fix Bug

```
3. READ relevant code to understand
4. UPDATE code with fix
7. UPDATE changelog
```

### Refactor Code

```
1. READ relevant code to understand
2. CREATE new structure (don't delete old yet)
3. UPDATE one usage to new structure
```

## Tips for Effective Tasks

- Use VALIDATE after every change
- Include IF_FAIL hints for common issues
- Reference specific line numbers or patterns
- Keep validation commands simple and fast
- Chain related tasks with clear dependencies
- Always include rollback/undo steps for risky changes
