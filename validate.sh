#!/usr/bin/env bash
#
# DCO Signature Validator for GitHub Actions
# ===========================================
# This script validates that all commits in a PR have proper DCO sign-offs.
#

set -e

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color
readonly BOLD='\033[1m'

# Verbose mode: set VERBOSE=1 or pass --verbose
VERBOSE="${VERBOSE:-0}"
ENFORCE_SIGNATURE_FINGERPRINTS=0
for arg in "$@"; do
    [[ "$arg" == "--verbose" ]] && VERBOSE=1
    [[ "$arg" == "--enforce-signature-fingerprints" ]] && ENFORCE_SIGNATURE_FINGERPRINTS=1
done

verbose_log() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo -e "${YELLOW}[VERBOSE] $*${NC}"
    fi
}

# Determine base and head refs
# If called from GitHub Actions, use environment variables
# Otherwise use command line arguments
if [[ -n "${GITHUB_EVENT_NAME:-}" ]]; then
    if [[ "$GITHUB_EVENT_NAME" == "pull_request" ]]; then
        BASE_BRANCH="origin/${GITHUB_BASE_REF}"
        HEAD_REF="${GITHUB_HEAD_SHA}"
    else
        # Push event
        if [[ "${GITHUB_BEFORE}" != "0000000000000000000000000000000000000000" ]]; then
            BASE_BRANCH="${GITHUB_BEFORE}"
            HEAD_REF="${GITHUB_SHA}"
        else
            # New branch/repo — validate all commits
            BASE_BRANCH=""
            HEAD_REF="${GITHUB_SHA}"
        fi
    fi
else
    # Manual invocation
    BASE_BRANCH="${1:-origin/main}"
    HEAD_REF="${2:-HEAD}"
fi

echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  DCO Signature Validation${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

verbose_log "GITHUB_EVENT_NAME=${GITHUB_EVENT_NAME:-}"
verbose_log "GITHUB_BASE_REF=${GITHUB_BASE_REF:-}"
verbose_log "GITHUB_HEAD_SHA=${GITHUB_HEAD_SHA:-}"
verbose_log "GITHUB_BEFORE=${GITHUB_BEFORE:-}"
verbose_log "GITHUB_SHA=${GITHUB_SHA:-}"
verbose_log "BASE_BRANCH=$BASE_BRANCH"
verbose_log "HEAD_REF=$HEAD_REF"
verbose_log "Git log (last 10):"
if [[ "$VERBOSE" == "1" ]]; then
    git log --oneline -10 2>&1 | while IFS= read -r l; do verbose_log "  $l"; done
    echo
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}" >&2
    exit 1
fi

# Get list of commits to check
echo -e "${BLUE}Checking commits between ${BOLD}$BASE_BRANCH${NC}${BLUE} and ${BOLD}$HEAD_REF${NC}"
echo

# Get the commit range
if [[ -n "$BASE_BRANCH" ]]; then
    COMMITS=$(git rev-list "$BASE_BRANCH..$HEAD_REF" 2>/dev/null || git rev-list "$HEAD_REF")
else
    # No base branch (new repo/branch) — validate all commits
    COMMITS=$(git rev-list "$HEAD_REF")
fi

if [[ -z "$COMMITS" ]]; then
    echo -e "${GREEN}✓ No commits to validate${NC}"
    exit 0
fi

COMMIT_COUNT=$(echo "$COMMITS" | wc -l | tr -d ' ')
echo -e "${BLUE}Found ${BOLD}$COMMIT_COUNT${NC}${BLUE} commit(s) to validate${NC}"
echo

# Track validation status
FAILED_COMMITS=()
VALID_COMMITS=0

# Validate each commit
while IFS= read -r commit; do
    # Get commit info
    commit_short=$(git rev-parse --short "$commit")
    commit_author=$(git log -1 --format='%an' "$commit")
    commit_email=$(git log -1 --format='%ae' "$commit")
    commit_subject=$(git log -1 --format='%s' "$commit")
    commit_body=$(git log -1 --format='%b' "$commit")
    
    # Check for Signed-off-by trailer
    signoff_line=$(echo "$commit_body" | grep -i "^Signed-off-by:" | head -1 || true)
    
    if [[ -z "$signoff_line" ]]; then
        # No sign-off found
        FAILED_COMMITS+=("$commit")
        echo -e "${RED}✗ FAIL${NC} $commit_short - ${YELLOW}$commit_subject${NC}"
        echo -e "        Author: $commit_author <$commit_email>"
        echo -e "        ${RED}Missing: Signed-off-by trailer${NC}"
        echo
    else
        # Validate that the sign-off matches the author
        signoff_name=$(echo "$signoff_line" | sed 's/^Signed-off-by: //' | sed 's/ <.*//')
        signoff_email=$(echo "$signoff_line" | sed 's/.*<\(.*\)>/\1/')
        
        if [[ "$signoff_name" != "$commit_author" ]] || [[ "$signoff_email" != "$commit_email" ]]; then
            # Sign-off doesn't match author
            FAILED_COMMITS+=("$commit")
            echo -e "${RED}✗ FAIL${NC} $commit_short - ${YELLOW}$commit_subject${NC}"
            echo -e "        Author:     $commit_author <$commit_email>"
            echo -e "        Signed-off: $signoff_name <$signoff_email>"
            echo -e "        ${RED}Mismatch: Sign-off must match commit author${NC}"
            echo
        else
            # Valid sign-off
            ((VALID_COMMITS++)) || true
            echo -e "${GREEN}✓ PASS${NC} $commit_short - $commit_subject"
            echo -e "        Signed-off-by: $signoff_name <$signoff_email>"
            echo
        fi
    fi
done <<< "$COMMITS"

# Print summary
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  Validation Summary${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Validate .dco-signatures entries
SIG_FILE_VALID=true
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
SIG_FILE="$GIT_ROOT/.dco-signatures"

if [[ -f "$SIG_FILE" ]]; then
    echo
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  DCO Signature File Validation${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    
    while IFS= read -r line; do
        # Skip empty lines, comments, headers, and separator
        [[ -z "$line" ]] && continue
        [[ "$line" =~ ^# ]] && continue
        [[ "$line" =~ ^--- ]] && continue
        [[ "$line" == "This "* ]] && continue
        [[ "$line" == "Each "* ]] && continue
        [[ "$line" == "Format:"* ]] && continue
        
        # Parse signature line: name <email> | signed: <date> | agreement: <commit> (<dco_change_date>)
        sig_identity=$(echo "$line" | sed 's/ | signed:.*//')
        sig_agreement_commit=$(echo "$line" | sed -n 's/.*| agreement: \([a-f0-9]*\).*/\1/p')
        
        if [[ -z "$sig_agreement_commit" ]]; then
            echo -e "${RED}✗ FAIL${NC} $sig_identity"
            echo -e "        ${RED}Missing agreement commit reference in signature${NC}"
            SIG_FILE_VALID=false
            continue
        fi
        
        # Verify the commit exists
        if ! git cat-file -e "$sig_agreement_commit" 2>/dev/null; then
            echo -e "${RED}✗ FAIL${NC} $sig_identity"
            echo -e "        ${RED}Agreement commit $sig_agreement_commit does not exist${NC}"
            SIG_FILE_VALID=false
            continue
        fi
        
        # Verify DCO.md was present in that commit
        if ! git show "$sig_agreement_commit:DCO.md" >/dev/null 2>&1; then
            echo -e "${RED}✗ FAIL${NC} $sig_identity"
            echo -e "        ${RED}DCO.md not found in commit $sig_agreement_commit${NC}"
            SIG_FILE_VALID=false
            continue
        fi
        
        echo -e "${GREEN}✓ PASS${NC} $sig_identity"
        echo -e "        Agreement commit: ${CYAN}$(git rev-parse --short "$sig_agreement_commit")${NC}"
    done < "$SIG_FILE"
    echo
fi

# ── SSH Signature Fingerprint Enforcement (--enforce-signature-fingerprints) ──
SIG_VALIDATION_FAILED=false
if [[ "$ENFORCE_SIGNATURE_FINGERPRINTS" == "1" ]]; then
    echo
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  Enforce Signature Fingerprints${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo

    # Build a map of contributor email → expected fingerprint from .dco-signatures
    declare -A EXPECTED_FINGERPRINTS
    if [[ -f "$SIG_FILE" ]]; then
        while IFS= read -r line; do
            [[ -z "$line" ]] && continue
            [[ "$line" =~ ^# ]] && continue
            [[ "$line" =~ ^--- ]] && continue
            [[ "$line" == "This "* ]] && continue
            [[ "$line" == "Each "* ]] && continue
            [[ "$line" == "Format:"* ]] && continue

            # Extract email and fingerprint
            local_email=$(echo "$line" | sed -n 's/.*<\(.*\)>.*/\1/p')
            local_fp=$(echo "$line" | sed -n 's/.*| signature: \([^ ]*\).*/\1/p')
            if [[ -n "$local_email" ]] && [[ -n "$local_fp" ]]; then
                EXPECTED_FINGERPRINTS["$local_email"]="$local_fp"
                verbose_log "Expected fingerprint for $local_email: $local_fp"
            elif [[ -n "$local_email" ]]; then
                echo -e "${RED}✗ FAIL${NC} Contributor $local_email has no signature fingerprint in .dco-signatures"
                SIG_VALIDATION_FAILED=true
            fi
        done < "$SIG_FILE"
    else
        echo -e "${RED}✗ FAIL${NC} --enforce-signature-fingerprints specified but .dco-signatures file not found"
        SIG_VALIDATION_FAILED=true
    fi

    # Extract the SSH signing fingerprint directly from the raw commit object.
    # This avoids depending on gpg.ssh.allowedSignersFile which is typically
    # not configured on GitHub Actions runners, causing %G? to report 'N'
    # even when the commit contains a valid SSH signature.
    extract_ssh_fingerprint() {
        local commit_hash="$1"
        local raw_commit
        raw_commit=$(git cat-file commit "$commit_hash" 2>/dev/null)

        # Check if the commit contains an SSH signature
        if ! echo "$raw_commit" | grep -q "BEGIN SSH SIGNATURE"; then
            echo ""
            return
        fi

        # Extract the signature block, decode it, and compute the public key fingerprint
        local sig_pem
        sig_pem=$(echo "$raw_commit" | sed -n '/-----BEGIN SSH SIGNATURE-----/,/-----END SSH SIGNATURE-----/p' | sed 's/^gpgsig //' | sed 's/^ //')

        python3 -c "
import base64, hashlib, struct, sys
lines = [l for l in sys.stdin.read().strip().split('\n') if not l.startswith('-----')]
raw = base64.b64decode(''.join(lines))
# SSHSIG format: magic 'SSHSIG' (6) + version uint32 (4) + public key string
idx = 10
pk_len = struct.unpack('>I', raw[idx:idx+4])[0]
pk_blob = raw[idx+4:idx+4+pk_len]
fp = base64.b64encode(hashlib.sha256(pk_blob).digest()).decode().rstrip('=')
print(f'SHA256:{fp}')
" <<< "$sig_pem"
    }

    # Verify each commit has a valid SSH signature matching the expected fingerprint
    if [[ "$SIG_VALIDATION_FAILED" == "false" ]]; then
        while IFS= read -r commit; do
            commit_short=$(git rev-parse --short "$commit")
            commit_email=$(git log -1 --format='%ae' "$commit")
            commit_subject=$(git log -1 --format='%s' "$commit")

            # Extract the SSH signature fingerprint directly from the raw commit
            sig_fingerprint=$(extract_ssh_fingerprint "$commit")

            verbose_log "Commit $commit_short: sig_fingerprint=$sig_fingerprint email=$commit_email"

            if [[ -z "$sig_fingerprint" ]]; then
                echo -e "${RED}✗ FAIL${NC} $commit_short - ${YELLOW}$commit_subject${NC}"
                echo -e "        ${RED}Missing SSH signature on commit${NC}"
                SIG_VALIDATION_FAILED=true
                continue
            fi

            # Check if we have an expected fingerprint for this contributor
            expected_fp="${EXPECTED_FINGERPRINTS[$commit_email]:-}"
            if [[ -n "$expected_fp" ]]; then
                # Compare the fingerprint from the commit signature with the expected one
                if [[ "$sig_fingerprint" == "$expected_fp" ]]; then
                    echo -e "${GREEN}✓ PASS${NC} $commit_short - $commit_subject"
                    echo -e "        SSH signature: ${CYAN}$sig_fingerprint${NC}"
                else
                    echo -e "${RED}✗ FAIL${NC} $commit_short - ${YELLOW}$commit_subject${NC}"
                    echo -e "        Expected fingerprint: ${CYAN}$expected_fp${NC}"
                    echo -e "        Actual fingerprint:   ${CYAN}$sig_fingerprint${NC}"
                    echo -e "        ${RED}SSH signature fingerprint mismatch${NC}"
                    SIG_VALIDATION_FAILED=true
                fi
            else
                # No expected fingerprint for this email — just verify it has a signature
                echo -e "${GREEN}✓ PASS${NC} $commit_short - $commit_subject"
                echo -e "        SSH signature: ${CYAN}$sig_fingerprint${NC} (no fingerprint in .dco-signatures to cross-check)"
            fi
        done <<< "$COMMITS"
    fi
    echo
fi

if [[ ${#FAILED_COMMITS[@]} -eq 0 ]] && [[ "$SIG_FILE_VALID" == "true" ]] && [[ "$SIG_VALIDATION_FAILED" == "false" ]]; then
    echo -e "${GREEN}${BOLD}✓ All commits are properly signed!${NC}"
    echo -e "${GREEN}  Valid commits: $VALID_COMMITS/$COMMIT_COUNT${NC}"
    if [[ "$ENFORCE_SIGNATURE_FINGERPRINTS" == "1" ]]; then
        echo -e "${GREEN}  Signature fingerprints: enforced${NC}"
    fi
    echo
    exit 0
else
    echo -e "${RED}${BOLD}✗ DCO validation failed!${NC}"
    echo -e "${RED}  Valid commits:   $VALID_COMMITS/$COMMIT_COUNT${NC}"
    echo -e "${RED}  Invalid commits: ${#FAILED_COMMITS[@]}/$COMMIT_COUNT${NC}"
    echo
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  How to Fix${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "${BLUE}Step 1: Revert the last commit and restore changes to working copy${NC}"
    echo -e "  ${BOLD}git reset HEAD~1${NC}"
    echo -e "  (This undoes the commit and unstages your changes)"
    echo
    echo -e "${BLUE}Step 2: Choose one of the following options:${NC}"
    echo
    echo -e "${BLUE}Option A: Use the commit wrapper script (recommended)${NC}"
    echo -e "  1. Stage your changes:"
    echo -e "     ${BOLD}git add .${NC}  (or stage specific files)"
    echo
    echo -e "  2. Commit with the wrapper script:"
    echo -e "     ${BOLD}./commit.sh -m \"Your commit message\"${NC}"
    echo
    echo -e "  This will:"
    echo -e "  • Automatically add the sign-off to your commit"
    echo -e "  • Update the .dco-signatures file (if first time)"
    echo -e "  • Create a DCO signature commit"
    echo
    echo -e "${BLUE}Option B: Add sign-off manually${NC}"
    echo -e "  1. Update .dco-signatures file manually:"
    echo -e "     Add this entry to ${BOLD}.dco-signatures${NC}:"
    echo -e "     ${CYAN}**Your Name** <your@email.com>${NC}"
    echo -e "     ${CYAN}Signed: $(date -u +"%Y-%m-%d %H:%M:%S UTC")${NC}"
    echo
    echo -e "  2. Stage ONLY the signatures file:"
    echo -e "     ${BOLD}git add .dco-signatures${NC}"
    echo
    echo -e "  3. Commit the signature record with sign-off:"
    echo -e "     ${BOLD}git commit -s -m \"DCO: Add signature for Your Name <your@email.com>\"${NC}"
    echo
    echo -e "  4. Stage your original changes:"
    echo -e "     ${BOLD}git add .${NC}  (or stage specific files)"
    echo
    echo -e "  5. Commit your original changes with sign-off:"
    echo -e "     ${BOLD}git commit -s -m \"Your original commit message\"${NC}"
    echo
    echo -e "${BLUE}What is a DCO signature?${NC}"
    echo -e "  A DCO (Developer Certificate of Origin) is your certification that you"
    echo -e "  have the right to submit your contribution under the project's license."
    echo -e "  See: ${CYAN}https://developercertificate.org/${NC}"
    echo
    exit 1
fi
