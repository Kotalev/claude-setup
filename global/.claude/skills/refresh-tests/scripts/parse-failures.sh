#!/usr/bin/env bash
# parse-failures.sh — Phase 3 helper for refresh-tests
# Parse a test runner's stdout (read from stdin) into a unified failure list.
#
# Usage: parse-failures.sh <runner> < <runner-output>
#   runner: jest | vitest | mocha | ava | tap | pytest | unittest | go | rust | rspec | minitest | phpunit | junit | gradle | dotnet
#
# Stdout (one block per failed test, blank-line separated):
#   file: <relative path>
#   test: <describe + it / class.method / package.test>
#   kind: assertion | error | timeout | snapshot | type | other
#   message: <one-line summary, max 200 chars>
#
# If no failures found, exits 0 with no output.

set -euo pipefail

RUNNER="${1:-}"
if [[ -z "$RUNNER" ]]; then
  echo "usage: parse-failures.sh <runner>" >&2
  exit 2
fi

# Read all stdin into a buffer (some parsers need to look ahead/behind)
INPUT=$(cat)

emit() {
  local file="$1" test="$2" kind="$3" msg="$4"
  # Truncate message to 200 chars and replace newlines with spaces
  msg=$(printf '%s' "$msg" | tr '\n' ' ' | tr -s ' ' | cut -c1-200)
  printf 'file: %s\ntest: %s\nkind: %s\nmessage: %s\n\n' \
    "${file:-unknown}" "${test:-unknown}" "${kind:-other}" "$msg"
}

classify_kind() {
  local m="$1"
  case "$m" in
    *TypeError*|*"is not a function"*|*"Cannot read property"*|*"Cannot read properties"*)
      echo "type" ;;
    *"toMatchSnapshot"*|*"snapshot"*|*"Snapshot"*)
      echo "snapshot" ;;
    *timeout*|*Timeout*|*"exceeded timeout"*)
      echo "timeout" ;;
    *expect*|*assert*|*Assert*|*"to equal"*|*"to be"*)
      echo "assertion" ;;
    *Error*|*error*|*FAIL*)
      echo "error" ;;
    *)
      echo "other" ;;
  esac
}

case "$RUNNER" in
  jest)
    # Jest format:
    #   FAIL <path>
    #     ● <describe> > <it>
    #       <error msg>
    #         at ...
    printf '%s' "$INPUT" | awk '
      /^FAIL / {
        # Extract path after "FAIL "
        sub(/^FAIL /, "")
        sub(/ \([0-9.]+ s\)$/, "")
        file = $0
        next
      }
      /^[[:space:]]*● / {
        # Flush previous
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
        test_name = $0
        sub(/^[[:space:]]*● /, "", test_name)
        msg = ""
        in_msg = 1
        next
      }
      in_msg && /^[[:space:]]+at / {
        in_msg = 0
        next
      }
      in_msg && /^[[:space:]]/ {
        line = $0
        sub(/^[[:space:]]+/, "", line)
        if (msg == "") msg = line
        else msg = msg " " line
      }
      END {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
      }
    ' | while IFS=$'\t' read -r tag val; do
      case "$tag" in
        FILE) cur_file="$val" ;;
        TEST) cur_test="$val" ;;
        MSG)  cur_msg="$val" ;;
        END)  emit "$cur_file" "$cur_test" "$(classify_kind "$cur_msg")" "$cur_msg"
              cur_file=""; cur_test=""; cur_msg="" ;;
      esac
    done
    ;;

  vitest)
    # Vitest format:
    #   ❯ <path> > <describe> > <it> <duration>
    #     ⎯⎯⎯⎯ Failed Tests N ⎯⎯⎯⎯
    #     FAIL <path> > <describe> > <it>
    #     <ErrorType>: <message>
    printf '%s' "$INPUT" | awk '
      /^[[:space:]]*FAIL [^[:space:]]+/ {
        line = $0
        sub(/^[[:space:]]*FAIL /, "", line)
        # Split on first " > "
        idx = index(line, " > ")
        if (idx > 0) {
          file = substr(line, 1, idx - 1)
          test_name = substr(line, idx + 3)
        } else {
          file = line
          test_name = ""
        }
        getline next_line
        msg = next_line
        gsub(/^[[:space:]]+/, "", msg)
        printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
      }
    ' | while IFS=$'\t' read -r tag val; do
      case "$tag" in
        FILE) cur_file="$val" ;;
        TEST) cur_test="$val" ;;
        MSG)  cur_msg="$val" ;;
        END)  emit "$cur_file" "$cur_test" "$(classify_kind "$cur_msg")" "$cur_msg"
              cur_file=""; cur_test=""; cur_msg="" ;;
      esac
    done
    ;;

  mocha)
    # Mocha:
    #   N) <describe> <it>:
    #      <error message>
    printf '%s' "$INPUT" | awk '
      /^[[:space:]]*[0-9]+\) / {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", "unknown", test_name, msg
        }
        test_name = $0
        sub(/^[[:space:]]*[0-9]+\) /, "", test_name)
        sub(/:$/, "", test_name)
        msg = ""
        in_msg = 1
        next
      }
      in_msg && /^[[:space:]]+(at |Error:|AssertionError|TypeError)/ {
        if (msg == "" && /^[[:space:]]+(Error|AssertionError|TypeError)/) {
          line = $0
          sub(/^[[:space:]]+/, "", line)
          msg = line
        }
        if (/^[[:space:]]+at /) in_msg = 0
        next
      }
      in_msg && /^[[:space:]]/ {
        line = $0
        sub(/^[[:space:]]+/, "", line)
        if (msg == "") msg = line
      }
      END {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", "unknown", test_name, msg
        }
      }
    ' | while IFS=$'\t' read -r tag val; do
      case "$tag" in
        FILE) cur_file="$val" ;;
        TEST) cur_test="$val" ;;
        MSG)  cur_msg="$val" ;;
        END)  emit "$cur_file" "$cur_test" "$(classify_kind "$cur_msg")" "$cur_msg"
              cur_file=""; cur_test=""; cur_msg="" ;;
      esac
    done
    ;;

  pytest)
    # pytest:
    #   FAILED <path>::<class>::<method> - <reason>
    printf '%s' "$INPUT" | grep -E '^FAILED ' | while IFS= read -r line; do
      rest="${line#FAILED }"
      # Split on " - "
      if [[ "$rest" == *" - "* ]]; then
        location="${rest%% - *}"
        message="${rest#* - }"
      else
        location="$rest"
        message=""
      fi
      file="${location%%::*}"
      test_name="${location#*::}"
      [[ "$test_name" == "$location" ]] && test_name=""
      emit "$file" "$test_name" "$(classify_kind "$message")" "$message"
    done
    ;;

  go)
    # go test output:
    #   --- FAIL: TestName (Ns)
    #       <file>:<line>: <message>
    printf '%s' "$INPUT" | awk '
      /^--- FAIL: / {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
        test_name = $3
        file = ""; msg = ""
        in_fail = 1
        next
      }
      in_fail && /^[[:space:]]+[^[:space:]]+:[0-9]+:/ {
        # First file:line: line — capture file and message
        if (file == "") {
          line = $0
          sub(/^[[:space:]]+/, "", line)
          # Extract file (up to first colon)
          colon = index(line, ":")
          file = substr(line, 1, colon - 1)
          # Skip "<line>:" then take rest as msg
          rest = substr(line, colon + 1)
          colon = index(rest, ":")
          msg = substr(rest, colon + 2)
        }
      }
      /^=== RUN|^PASS$|^FAIL$|^ok |^FAIL\t/ {
        in_fail = 0
      }
      END {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
      }
    ' | while IFS=$'\t' read -r tag val; do
      case "$tag" in
        FILE) cur_file="$val" ;;
        TEST) cur_test="$val" ;;
        MSG)  cur_msg="$val" ;;
        END)  emit "$cur_file" "$cur_test" "$(classify_kind "$cur_msg")" "$cur_msg"
              cur_file=""; cur_test=""; cur_msg="" ;;
      esac
    done
    ;;

  rust|cargo)
    # cargo test:
    #   ---- <module>::<test> stdout ----
    #   thread 'main' panicked at '<msg>', <file>:<line>
    printf '%s' "$INPUT" | awk '
      /^---- .* stdout ----/ {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
        test_name = $0
        sub(/^---- /, "", test_name)
        sub(/ stdout ----$/, "", test_name)
        file = ""; msg = ""
        next
      }
      /panicked at/ {
        msg = $0
        # Try to extract file:line at end
        if (match($0, /[a-zA-Z0-9_./-]+:[0-9]+(:[0-9]+)?$/)) {
          file = substr($0, RSTART, RLENGTH)
          sub(/:[0-9]+(:[0-9]+)?$/, "", file)
        }
      }
      END {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
      }
    ' | while IFS=$'\t' read -r tag val; do
      case "$tag" in
        FILE) cur_file="$val" ;;
        TEST) cur_test="$val" ;;
        MSG)  cur_msg="$val" ;;
        END)  emit "$cur_file" "$cur_test" "$(classify_kind "$cur_msg")" "$cur_msg"
              cur_file=""; cur_test=""; cur_msg="" ;;
      esac
    done
    ;;

  rspec)
    # RSpec failure block:
    #   N) <description>
    #      Failure/Error: <code>
    #        <message>
    #      # ./<file>:<line>:in `<block>'
    printf '%s' "$INPUT" | awk '
      /^[[:space:]]*[0-9]+\) / {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
        test_name = $0
        sub(/^[[:space:]]*[0-9]+\) /, "", test_name)
        file = ""; msg = ""
        in_fe = 0
        next
      }
      /Failure\/Error:/ {
        in_fe = 1
        next
      }
      in_fe && /^[[:space:]]+#/ {
        # File line
        line = $0
        if (match(line, /\.\/[^:]+:[0-9]+/)) {
          file = substr(line, RSTART, RLENGTH)
          sub(/^\.\//, "", file)
          sub(/:[0-9]+$/, "", file)
        }
        in_fe = 0
        next
      }
      in_fe && /^[[:space:]]/ {
        line = $0
        sub(/^[[:space:]]+/, "", line)
        if (msg == "") msg = line
      }
      END {
        if (test_name != "") {
          printf "FILE\t%s\nTEST\t%s\nMSG\t%s\nEND\n", file, test_name, msg
        }
      }
    ' | while IFS=$'\t' read -r tag val; do
      case "$tag" in
        FILE) cur_file="$val" ;;
        TEST) cur_test="$val" ;;
        MSG)  cur_msg="$val" ;;
        END)  emit "$cur_file" "$cur_test" "$(classify_kind "$cur_msg")" "$cur_msg"
              cur_file=""; cur_test=""; cur_msg="" ;;
      esac
    done
    ;;

  *)
    # Generic fallback — extract any "FAIL" or "FAILED" line
    printf '%s' "$INPUT" | grep -iE 'FAIL|FAILED' | while IFS= read -r line; do
      emit "unknown" "$line" "$(classify_kind "$line")" "$line"
    done
    ;;
esac
