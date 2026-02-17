#!/usr/bin/env bash
#
# DCO Commit Script Test
# ======================
# Tests the commit.sh workflow to ensure proper DCO handling
#

set -e

# Clear GitHub-specific env vars to isolate test repos from CI environment
# These would otherwise cause validate.sh to use the wrong commit SHAs
export GITHUB_EVENT_NAME=
export GITHUB_BASE_REF=
export GITHUB_HEAD_SHA=
export GITHUB_BEFORE=
export GITHUB_SHA=

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'
readonly BOLD='\033[1m'

# Test directory
readonly TEST_DIR="$PWD/.~test"
readonly TIMESTAMP=$(date +%Y%m%d-%H%M%S)
readonly TEST_PATH="$TEST_DIR/$TIMESTAMP"

echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  DCO Commit Script Test${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Cleanup function
cleanup() {
    if [[ -d "$TEST_PATH" ]]; then
        echo -e "${BLUE}Cleaning up test directory...${NC}"
        rm -rf "$TEST_PATH"
    fi
    # Clean up signed repo and keys dirs
    rm -rf "$TEST_DIR/$TIMESTAMP-signed" "$TEST_DIR/$TIMESTAMP-keys" 2>/dev/null || true
    # Also remove parent test directory if empty
    if [[ -d "$TEST_DIR" ]] && [[ -z "$(ls -A "$TEST_DIR" 2>/dev/null)" ]]; then
        rm -rf "$TEST_DIR"
    fi
}

# Setup trap for cleanup
trap cleanup EXIT

# Create test directory
echo -e "${BLUE}Setting up test environment: $TEST_PATH${NC}"
mkdir -p "$TEST_PATH"

# Get the directory where this test script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Copy files to test directory (excluding .dco-signatures and test.sh)
echo -e "${BLUE}Copying files to test directory...${NC}"
for file in "$SCRIPT_DIR"/*; do
    filename=$(basename "$file")
    # Skip .dco-signatures, test.sh, and directories
    if [[ "$filename" != ".dco-signatures" ]] && \
       [[ "$filename" != "test.sh" ]] && \
       [[ "$filename" != ".git" ]] && \
       [[ -f "$file" ]]; then
        cp "$file" "$TEST_PATH/"
        echo -e "  Copied: $filename"
    fi
done

# Copy .github directory if it exists
if [[ -d "$SCRIPT_DIR/.github" ]]; then
    cp -r "$SCRIPT_DIR/.github" "$TEST_PATH/"
    echo -e "  Copied: .github/"
fi

# Copy github-action directory if it exists
if [[ -d "$SCRIPT_DIR/github-action" ]]; then
    cp -r "$SCRIPT_DIR/github-action" "$TEST_PATH/"
    echo -e "  Copied: github-action/"
fi

echo

# Change to test directory
cd "$TEST_PATH"

# Initialize git repository
echo -e "${BLUE}Initializing git repository...${NC}"
git init 2>&1
git config user.name "Test User"
git config user.email "test@example.com"
# Ensure we're on main branch
git checkout -b main 2>/dev/null || git branch -M main 2>/dev/null || true
echo -e "${GREEN}✓ Git repository initialized${NC}"
echo

# Create some test files
echo -e "${BLUE}Creating test files...${NC}"
echo "# Test Project" > README-TEST.md
echo "console.log('test');" > test.js
echo -e "${GREEN}✓ Test files created${NC}"
echo

# Stage all files
echo -e "${BLUE}Staging all files...${NC}"
git add .
echo -e "${GREEN}✓ Files staged${NC}"
echo

# Run commit script with --yes-signoff (sign-only, no user commit)
echo -e "${BOLD}${YELLOW}Running commit.sh with --yes-signoff (sign only)...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
./commit.sh --yes-signoff
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Now commit user code separately
echo -e "${BOLD}${YELLOW}Committing user code with --signoff...${NC}"
git commit --signoff -m "Initial test commit"
echo

# Verify the results
echo -e "${BOLD}${CYAN}Verifying results...${NC}"
echo

# Check number of commits (1 DCO.md + 1 DCO signature + 1 user commit = 3)
COMMIT_COUNT=$(git rev-list --count HEAD)
echo -e "${BLUE}Commit count: ${BOLD}$COMMIT_COUNT${NC}"

if [[ $COMMIT_COUNT -ne 3 ]]; then
    echo -e "${RED}✗ FAIL: Expected 3 commits, found $COMMIT_COUNT${NC}"
    echo
    echo -e "${YELLOW}Git log:${NC}"
    git log --oneline
    exit 1
fi

echo -e "${GREEN}✓ Correct number of commits (3)${NC}"
echo

# Check first commit (DCO.md auto-committed by commit.sh)
echo -e "${BLUE}Checking first commit (DCO.md auto-commit):${NC}"
FIRST_COMMIT=$(git rev-list --max-parents=0 HEAD)
FIRST_MSG=$(git log -1 --format='%s' "$FIRST_COMMIT")
FIRST_BODY=$(git log -1 --format='%b' "$FIRST_COMMIT")
FIRST_FILES=$(git diff-tree --no-commit-id --name-only --root -r "$FIRST_COMMIT")

echo -e "  Subject: ${CYAN}$FIRST_MSG${NC}"

if [[ ! "$FIRST_MSG" =~ ^\[DCO\]\ Set\ DCO\.md\ Policy\ by\ .+ ]]; then
    echo -e "${RED}✗ FAIL: First commit should be '[DCO] Set DCO.md Policy by <Name>', got: $FIRST_MSG${NC}"
    exit 1
fi

if [[ ! "$FIRST_BODY" =~ Signed-off-by ]]; then
    echo -e "${RED}✗ FAIL: First commit missing Signed-off-by trailer${NC}"
    exit 1
fi

echo -e "${GREEN}✓ First commit auto-commits DCO.md with --signoff${NC}"
echo

# Check second commit (DCO signature)
echo -e "${BLUE}Checking second commit (DCO signature):${NC}"
SIG_COMMIT=$(git rev-list HEAD | tail -2 | head -1)
SIG_MSG=$(git log -1 --format='%s' "$SIG_COMMIT")
SIG_BODY=$(git log -1 --format='%b' "$SIG_COMMIT")
SIG_FILES=$(git diff-tree --no-commit-id --name-only -r "$SIG_COMMIT")

echo -e "  Subject: ${CYAN}$SIG_MSG${NC}"

if [[ ! "$SIG_MSG" =~ ^\[DCO\]\ DCO\.md\ signed\ by\ .+ ]]; then
    echo -e "${RED}✗ FAIL: Second commit should be '[DCO] DCO.md signed by <Name>', got: $SIG_MSG${NC}"
    exit 1
fi

if [[ ! "$SIG_BODY" =~ Signed-off-by ]]; then
    echo -e "${RED}✗ FAIL: Second commit missing Signed-off-by trailer${NC}"
    exit 1
fi

# Check that signature commit only contains .dco-signatures
echo -e "  Files in commit:"
echo "$SIG_FILES" | while read -r f; do echo -e "    - $f"; done

if [[ "$SIG_FILES" != ".dco-signatures" ]]; then
    echo -e "${RED}✗ FAIL: Signature commit should only contain .dco-signatures${NC}"
    echo -e "${RED}  Expected: .dco-signatures${NC}"
    echo -e "${RED}  Found:${NC}"
    echo "$SIG_FILES" | while read -r f; do echo -e "${RED}    - $f${NC}"; done
    exit 1
fi

echo -e "${GREEN}✓ Second commit is valid DCO signature commit${NC}"
echo -e "${GREEN}✓ Contains only .dco-signatures file${NC}"
echo

# Check third commit (actual user changes)
echo -e "${BLUE}Checking third commit (user changes):${NC}"
THIRD_COMMIT=$(git rev-list HEAD | head -1)
THIRD_MSG=$(git log -1 --format='%s' "$THIRD_COMMIT")
THIRD_BODY=$(git log -1 --format='%b' "$THIRD_COMMIT")
THIRD_FILES=$(git diff-tree --no-commit-id --name-only -r "$THIRD_COMMIT" | sort)

echo -e "  Subject: ${CYAN}$THIRD_MSG${NC}"

if [[ "$THIRD_MSG" != "Initial test commit" ]]; then
    echo -e "${RED}✗ FAIL: Third commit message incorrect${NC}"
    exit 1
fi

if [[ ! "$THIRD_BODY" =~ Signed-off-by ]]; then
    echo -e "${RED}✗ FAIL: Third commit missing Signed-off-by trailer${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Third commit message is correct${NC}"
echo -e "${GREEN}✓ Third commit has Signed-off-by trailer${NC}"
echo

# Verify .dco-signatures file exists and has content
if [[ ! -f ".dco-signatures" ]]; then
    echo -e "${RED}✗ FAIL: .dco-signatures file not found${NC}"
    exit 1
fi

if ! grep -q "Test User.*test@example.com" ".dco-signatures"; then
    echo -e "${RED}✗ FAIL: .dco-signatures doesn't contain correct signature${NC}"
    exit 1
fi

# Verify signature line format: name <email> | signed: <date> | agreement: <commit> (<dco_change_date>)
SIG_LINE=$(grep "Test User" ".dco-signatures")
echo -e "  Signature: ${CYAN}$SIG_LINE${NC}"

if [[ ! "$SIG_LINE" =~ \|\ signed: ]]; then
    echo -e "${RED}✗ FAIL: Signature missing 'signed:' field${NC}"
    exit 1
fi

if [[ ! "$SIG_LINE" =~ \|\ agreement:\ [a-f0-9] ]]; then
    echo -e "${RED}✗ FAIL: Signature missing 'agreement:' commit reference${NC}"
    exit 1
fi

# Extract and verify the agreement commit from the signature
SIG_AGREEMENT_COMMIT=$(echo "$SIG_LINE" | sed -n 's/.*| agreement: \([a-f0-9]*\).*/\1/p')
if ! git cat-file -e "$SIG_AGREEMENT_COMMIT" 2>/dev/null; then
    echo -e "${RED}✗ FAIL: Agreement commit $SIG_AGREEMENT_COMMIT in signature does not exist${NC}"
    exit 1
fi

if ! git show "$SIG_AGREEMENT_COMMIT:DCO.md" >/dev/null 2>&1; then
    echo -e "${RED}✗ FAIL: DCO.md not found in referenced commit $SIG_AGREEMENT_COMMIT${NC}"
    exit 1
fi

echo -e "${GREEN}✓ .dco-signatures file contains correct signature${NC}"
echo -e "${GREEN}✓ Signature format is valid (single line with name, date, agreement commit)${NC}"
echo -e "${GREEN}✓ Agreement commit reference is valid and contains DCO.md${NC}"
echo

# Display full git log
echo -e "${BOLD}${CYAN}Full git log:${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
git log --format="%h - %s%n       Author: %an <%ae>%n       %b" | head -20
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Test re-running sign (should show already signed with details)
echo -e "${BOLD}${YELLOW}Testing re-sign (should show already signed)...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
RESIGN_OUTPUT=$(./commit.sh --yes-signoff 2>&1)
echo "$RESIGN_OUTPUT"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

if ! echo "$RESIGN_OUTPUT" | grep -q "DCO Already Signed"; then
    echo -e "${RED}✗ FAIL: Re-sign should show 'DCO Already Signed'${NC}"
    exit 1
fi

if ! echo "$RESIGN_OUTPUT" | grep -q "Signer:"; then
    echo -e "${RED}✗ FAIL: Re-sign should show signer details${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Re-sign correctly shows already signed with details${NC}"
echo

# Test second user commit (sign + commit separately)
echo -e "${BOLD}${YELLOW}Testing second user commit...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "# Second change" >> README-TEST.md
git add README-TEST.md
git commit --signoff -m "Second commit"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Verify we now have 4 commits total (1 DCO.md + 1 DCO sig + 1 first user + 1 second user)
COMMIT_COUNT=$(git rev-list --count HEAD)
if [[ $COMMIT_COUNT -ne 4 ]]; then
    echo -e "${RED}✗ FAIL: Expected 4 commits after second commit, found $COMMIT_COUNT${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Second user commit successful (no new DCO signature commit)${NC}"
echo

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# ══════════════════════════════════════════════════════════════════
# Test: --require-signatures with SSH-signed commits
# ══════════════════════════════════════════════════════════════════

echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${CYAN}  Testing --require-signatures (SSH-signed DCO)${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Create a fresh repo for the SSH signing test
SIGNED_REPO="$TEST_DIR/$TIMESTAMP-signed"
mkdir -p "$SIGNED_REPO"

# Generate an SSH signing key
SSH_KEY_DIR="$TEST_DIR/$TIMESTAMP-keys"
mkdir -p "$SSH_KEY_DIR"
ssh-keygen -t ed25519 -f "$SSH_KEY_DIR/test_signing_ed25519" -N "" -q
SIGNING_KEY="$SSH_KEY_DIR/test_signing_ed25519"
SIGNING_FP=$(ssh-keygen -lf "$SIGNING_KEY" | awk '{print $2}')
echo -e "${BLUE}Generated SSH signing key: $SIGNING_FP${NC}"

# Copy files to signed repo
for file in "$SCRIPT_DIR"/*; do
    filename=$(basename "$file")
    if [[ "$filename" != ".dco-signatures" ]] && \
       [[ "$filename" != "test.sh" ]] && \
       [[ "$filename" != ".git" ]] && \
       [[ -f "$file" ]]; then
        cp "$file" "$SIGNED_REPO/"
    fi
done

cd "$SIGNED_REPO"
git init -q
git config user.name "Test Signer"
git config user.email "signer@example.com"
git checkout -b main 2>/dev/null || git branch -M main 2>/dev/null || true

# Create test files
echo "# Signed Test" > README.md
git add .

# Run commit.sh with --signing-key
echo -e "${BOLD}${YELLOW}Running commit.sh with --signing-key ...${NC}"
./commit.sh --yes-signoff --signing-key "$SIGNING_KEY"
echo

# Commit user code with SSH signing
git add -A
git -c gpg.format=ssh -c "user.signingkey=$SIGNING_KEY" commit --gpg-sign --signoff -m "Signed user commit"
echo

# Verify .dco-signatures has the fingerprint
SIG_LINE=$(grep "Test Signer" ".dco-signatures")
echo -e "  Signature line: ${CYAN}$SIG_LINE${NC}"

if [[ ! "$SIG_LINE" =~ \|\ signature:\ SHA256: ]]; then
    echo -e "${RED}✗ FAIL: .dco-signatures should contain 'signature: SHA256:...' when signing key is used${NC}"
    exit 1
fi
echo -e "${GREEN}✓ .dco-signatures contains SSH key fingerprint${NC}"
echo

# Verify the fingerprint in .dco-signatures matches the actual key
SIG_FILE_FP=$(echo "$SIG_LINE" | sed -n 's/.*| signature: \([^ ]*\).*/\1/p')
if [[ "$SIG_FILE_FP" != "$SIGNING_FP" ]]; then
    echo -e "${RED}✗ FAIL: Fingerprint in .dco-signatures ($SIG_FILE_FP) does not match signing key ($SIGNING_FP)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Fingerprint in .dco-signatures matches the signing key${NC}"
echo

# Test validate.sh --enforce-signature-fingerprints should FAIL on unsigned commits
echo -e "${BOLD}${YELLOW}Testing --enforce-signature-fingerprints on unsigned repo (should fail)...${NC}"
cd "$TEST_PATH"
if ./validate.sh "" HEAD --enforce-signature-fingerprints >/dev/null 2>&1; then
    echo -e "${RED}✗ FAIL: --enforce-signature-fingerprints should fail on unsigned commits${NC}"
    exit 1
fi
echo -e "${GREEN}✓ --enforce-signature-fingerprints correctly fails on unsigned commits${NC}"
echo

# Test validate.sh --enforce-signature-fingerprints on the signed repo WITHOUT allowedSignersFile
# This simulates the GitHub Actions environment where gpg.ssh.allowedSignersFile is not configured.
# The fix extracts SSH fingerprints directly from raw commit objects instead of relying on %G?/%GK.
echo -e "${BOLD}${YELLOW}Testing --enforce-signature-fingerprints WITHOUT allowedSignersFile (GitHub Actions scenario)...${NC}"
cd "$SIGNED_REPO"

# Ensure allowedSignersFile is NOT set (simulates GitHub Actions)
git config --unset gpg.ssh.allowedSignersFile 2>/dev/null || true

VALIDATE_OUTPUT=$(./validate.sh "" HEAD --enforce-signature-fingerprints 2>&1) || {
    echo -e "${RED}✗ FAIL: --enforce-signature-fingerprints should pass without allowedSignersFile${NC}"
    echo "$VALIDATE_OUTPUT"
    exit 1
}
echo "$VALIDATE_OUTPUT"

if ! echo "$VALIDATE_OUTPUT" | grep -q "Signature fingerprints: enforced"; then
    echo -e "${RED}✗ FAIL: Output should contain 'Signature fingerprints: enforced'${NC}"
    exit 1
fi
echo -e "${GREEN}✓ --enforce-signature-fingerprints passes WITHOUT allowedSignersFile (raw commit extraction)${NC}"
echo

# Test validate.sh --enforce-signature-fingerprints on the signed repo WITH allowedSignersFile
echo -e "${BOLD}${YELLOW}Testing --enforce-signature-fingerprints on signed repo (with allowedSignersFile)...${NC}"
cd "$SIGNED_REPO"

# Set up allowed signers for git to verify SSH signatures
ALLOWED_SIGNERS_FILE="$SSH_KEY_DIR/allowed_signers"
echo "signer@example.com $(cat "$SIGNING_KEY.pub")" > "$ALLOWED_SIGNERS_FILE"
git config gpg.ssh.allowedSignersFile "$ALLOWED_SIGNERS_FILE"

VALIDATE_OUTPUT=$(./validate.sh "" HEAD --enforce-signature-fingerprints 2>&1) || {
    echo -e "${RED}✗ FAIL: --enforce-signature-fingerprints should pass on signed repo${NC}"
    echo "$VALIDATE_OUTPUT"
    exit 1
}
echo "$VALIDATE_OUTPUT"

if ! echo "$VALIDATE_OUTPUT" | grep -q "Signature fingerprints: enforced"; then
    echo -e "${RED}✗ FAIL: Output should contain 'Signature fingerprints: enforced'${NC}"
    exit 1
fi
echo -e "${GREEN}✓ --enforce-signature-fingerprints passes on SSH-signed repo with matching fingerprints${NC}"
echo

# Final success message
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  ✓ ALL TESTS PASSED!${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${BLUE}Test directory: $TEST_PATH${NC}"
echo -e "${BLUE}(Will be cleaned up on exit)${NC}"
echo
