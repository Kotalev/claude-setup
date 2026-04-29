---
name: commit-message
description: Generate a commit message for the current git changes, analyzing diffs and recent commit style.
user-invocable: true
disable-model-invocation: true
---

# Generate Commit Message

Generate a commit message for the current git changes.

## Process

1. **Analyze Changes**
   Run the following commands in parallel to understand the current state:
   - `git status` - see all modified and untracked files
   - `git diff --staged` - see staged changes
   - `git diff` - see unstaged changes
   - `git log --oneline -5` - see recent commit message style

2. **Classify the Change Type**
   Determine the primary nature of the changes:
   - `feat`: New feature or functionality
   - `fix`: Bug fix
   - `refactor`: Code restructuring without behavior change
   - `docs`: Documentation changes
   - `style`: Formatting, whitespace (no code change)
   - `test`: Adding or updating tests
   - `chore`: Maintenance, dependencies, build config

3. **Generate Commit Message**
   Create a concise commit message following this format:
   ```
   <short summary in imperative mood>

   <optional body with more details if needed>

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

   Guidelines:
   - First line max 72 characters
   - Use imperative mood ("Add feature" not "Added feature")
   - Focus on WHY and WHAT, not HOW
   - Be specific but concise

## Output Format

Present the commit message clearly:
```
Suggested commit message:

<summary>

<body if applicable>

Co-Authored-By: Claude <noreply@anthropic.com>
```

Then ask if the user wants to:
- Use this message and commit
- Modify the message
- Just see the message without committing

## Arguments

$ARGUMENTS - Optional flags:
- `--auto` or `-a`: Automatically stage all changes and commit without asking
- `--staged` or `-s`: Only analyze staged changes
- `--dry-run` or `-d`: Just show the message, don't offer to commit
