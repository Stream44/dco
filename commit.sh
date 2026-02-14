#!/usr/bin/env bash
#
# DCO-enabled Git Commit Wrapper
# ===============================
# This script wraps `git commit` to automatically add --signoff
# and shows the DCO terms on first use.
#

set -e

# Color codes for better UX
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly MAGENTA='\033[0;35m'
readonly NC='\033[0m' # No Color
readonly BOLD='\033[1m'

# Verbose logging
VERBOSE=false

# SSH signing key path (optional, set via --signing-key)
SIGNING_KEY=""

# Build git commit args with optional SSH signing
git_commit_with_sign() {
    local sign_args=()
    if [[ -n "$SIGNING_KEY" ]]; then
        sign_args+=(-c 'gpg.format=ssh' -c "user.signingkey=$SIGNING_KEY")
    fi
    git "${sign_args[@]}" commit "$@"
}
verbose_log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[verbose]${NC} $*" >&2
    fi
}

# Resolve package version from package.json next to this script
get_package_version() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$script_dir/package.json" ]]; then
        sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$script_dir/package.json" | head -1
    else
        echo "unknown"
    fi
}
readonly DCO_VERSION=$(get_package_version)

# Find the git repository root
find_git_root() {
    local dir
    dir=$(git rev-parse --show-toplevel 2>/dev/null) || {
        echo -e "${RED}Error: Not in a git repository${NC}" >&2
        exit 1
    }
    echo "$dir"
}

# Record DCO signature in git tree for permanent record
record_dco_signature() {
    local git_root="$1"
    local name="$2"
    local email="$3"
    local date="$4"
    local agreement_commit="$5"
    local agreement_change_date="$6"
    local sig_file="$git_root/.dco-signatures"
    
    # Create or append to the signatures file
    if [[ ! -f "$sig_file" ]]; then
        cat > "$sig_file" <<EOF
# DCO Signatures

This file contains a permanent record of all Developer Certificate of Origin (DCO) agreements.
Each contributor who has agreed to the DCO.md is listed below with their signing date.
Format: name <email> | signed: <date> | agreement: <commit> (<agreement_change_date>) [| signature: <key_fingerprint>]

---

EOF
    fi
    
    # Append the new signature (single line with all info)
    local sig_line="$name <$email> | signed: $date | agreement: $agreement_commit ($agreement_change_date)"
    if [[ -n "$SIGNING_KEY" ]]; then
        local fingerprint
        fingerprint=$(ssh-keygen -lf "$SIGNING_KEY" 2>/dev/null | awk '{print $2}')
        if [[ -n "$fingerprint" ]]; then
            sig_line="$sig_line | signature: $fingerprint"
        fi
    fi
    echo "$sig_line" >> "$sig_file"
    
    # Commit the signature to git
    # Save list of currently staged files (excluding .dco-signatures)
    local staged_files
    staged_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -v "^\.dco-signatures$" || true)
    verbose_log "record_dco_signature: staged files to preserve: $(echo "$staged_files" | tr '\n' ' ')"
    
    # Unstage everything
    git reset >/dev/null 2>&1 || true
    
    # Stage ONLY the signature file
    git add "$sig_file" 2>/dev/null || true
    
    # Create a commit for the DCO signature (should only contain .dco-signatures)
    local sign_args=()
    if [[ -n "$SIGNING_KEY" ]]; then
        sign_args+=(--gpg-sign)
    fi
    if git_commit_with_sign --signoff --no-verify "${sign_args[@]}" -m "[DCO] DCO.md signed by $name" -m "Developer Certificates of Origin established using https://github.com/Stream44/dco" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Signature recorded in repository history${NC}"
    else
        echo -e "${YELLOW}Note: Signature file already up to date${NC}"
    fi
    
    # Restore the originally staged files
    if [[ -n "$staged_files" ]]; then
        echo "$staged_files" | while IFS= read -r file; do
            git add "$file" 2>/dev/null || true
        done
    fi
}

# Show the DCO and get user agreement
show_dco_first_time() {
    local git_root="$1"
    local auto_agree="$2"
    local dco_file="$git_root/DCO.md"
    local marker_file="$git_root/.git/.dco-agreed"

    # Check if user has already agreed
    if [[ -f "$marker_file" ]]; then
        # Verify the current git user matches the one who signed
        local current_name current_email
        current_name=$(git config user.name 2>/dev/null || echo "")
        current_email=$(git config user.email 2>/dev/null || echo "")
        
        local stored_name stored_email stored_date stored_agreement_commit stored_agreement_change_date
        stored_name=$(grep "^name=" "$marker_file" | cut -d'=' -f2-)
        stored_email=$(grep "^email=" "$marker_file" | cut -d'=' -f2-)
        stored_date=$(grep "^date=" "$marker_file" | cut -d'=' -f2-)
        stored_agreement_commit=$(grep "^agreement_commit=" "$marker_file" | cut -d'=' -f2-)
        stored_agreement_change_date=$(grep "^agreement_change_date=" "$marker_file" | cut -d'=' -f2-)
        
        if [[ "$current_name" != "$stored_name" ]] || [[ "$current_email" != "$stored_email" ]]; then
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
            echo -e "${RED}${BOLD}  DCO Identity Mismatch${NC}" >&2
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
            echo >&2
            echo -e "${YELLOW}The DCO was originally signed by:${NC}" >&2
            echo -e "  Name:  ${CYAN}$stored_name${NC}" >&2
            echo -e "  Email: ${CYAN}$stored_email${NC}" >&2
            echo >&2
            echo -e "${YELLOW}But you are currently configured as:${NC}" >&2
            echo -e "  Name:  ${CYAN}$current_name${NC}" >&2
            echo -e "  Email: ${CYAN}$current_email${NC}" >&2
            echo >&2
            echo -e "${BLUE}To sign with a different identity, please remove the DCO agreement file:${NC}" >&2
            echo -e "  ${BOLD}rm $marker_file${NC}" >&2
            echo >&2
            echo -e "${BLUE}Then run this script again to sign the DCO with your current identity.${NC}" >&2
            echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" >&2
            exit 1
        fi
        
        # Verify the signature exists in .dco-signatures file
        local sig_file="$git_root/.dco-signatures"
        local sig_valid="false"
        if [[ -f "$sig_file" ]]; then
            local sig_line
            sig_line=$(grep "$stored_name.*<$stored_email>" "$sig_file" || true)
            if [[ -n "$sig_line" ]]; then
                sig_valid="true"
                # Re-create marker from signature line if marker data is stale/empty
                if [[ -z "$stored_agreement_commit" ]]; then
                    verbose_log "Marker missing agreement data, restoring from .dco-signatures"
                    local restored_agreement_commit restored_agreement_change_date restored_signed_date
                    restored_agreement_commit=$(echo "$sig_line" | sed -n 's/.*| agreement: \([a-f0-9]*\).*/\1/p')
                    restored_agreement_change_date=$(echo "$sig_line" | sed -n 's/.*| agreement: [a-f0-9]* (\(.*\))/\1/p')
                    restored_signed_date=$(echo "$sig_line" | sed -n 's/.*| signed: \([^|]*\) |.*/\1/p')
                    cat > "$marker_file" <<EOF
name=$stored_name
email=$stored_email
date=$restored_signed_date
agreement_commit=$restored_agreement_commit
agreement_change_date=$restored_agreement_change_date
EOF
                    stored_date="$restored_signed_date"
                    stored_agreement_commit="$restored_agreement_commit"
                    stored_agreement_change_date="$restored_agreement_change_date"
                    echo -e "${GREEN}✓ DCO marker restored from existing signature${NC}"
                fi
            else
                verbose_log "Signature not found in .dco-signatures, will re-sign"
            fi
        else
            verbose_log ".dco-signatures missing, will re-sign"
        fi
        
        if [[ "$sig_valid" == "false" ]]; then
            # Auto-recover: remove stale marker and fall through to re-sign
            echo -e "${YELLOW}DCO signature record missing or out of sync. Re-signing...${NC}"
            rm -f "$marker_file"
            # Fall through to the signing flow below
        else
        
        # Already signed - display details
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${GREEN}${BOLD}  DCO Already Signed${NC}"
            echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo
            echo -e "  ${BOLD}Signer:${NC}           $stored_name <$stored_email>"
            echo -e "  ${BOLD}Signed:${NC}           $stored_date"
            if [[ -n "$stored_agreement_commit" ]]; then
                echo -e "  ${BOLD}Agreement commit:${NC} $(git rev-parse --short "$stored_agreement_commit" 2>/dev/null || echo "$stored_agreement_commit")"
            fi
            if [[ -n "$stored_agreement_change_date" ]]; then
                echo -e "  ${BOLD}Agreement date:${NC}   $stored_agreement_change_date"
            fi
            echo
            return 0
        fi
    fi

    # No marker file — check if .dco-signatures already has this user's signature
    local sig_file="$git_root/.dco-signatures"
    if [[ -f "$sig_file" ]]; then
        local current_name current_email
        current_name=$(git config user.name 2>/dev/null || echo "")
        current_email=$(git config user.email 2>/dev/null || echo "")
        local existing_sig
        existing_sig=$(grep "$current_name.*<$current_email>" "$sig_file" || true)
        if [[ -n "$existing_sig" ]]; then
            verbose_log "Found existing signature in .dco-signatures, restoring marker"
            local restored_agreement_commit restored_agreement_change_date restored_signed_date
            restored_agreement_commit=$(echo "$existing_sig" | sed -n 's/.*| agreement: \([a-f0-9]*\).*/\1/p')
            restored_agreement_change_date=$(echo "$existing_sig" | sed -n 's/.*| agreement: [a-f0-9]* (\(.*\))/\1/p')
            restored_signed_date=$(echo "$existing_sig" | sed -n 's/.*| signed: \([^|]*\) |.*/\1/p')
            cat > "$marker_file" <<EOF
name=$current_name
email=$current_email
date=$restored_signed_date
agreement_commit=$restored_agreement_commit
agreement_change_date=$restored_agreement_change_date
EOF
            echo -e "${GREEN}✓ DCO marker restored from existing signature${NC}"
            return 0
        fi
    fi

    # Check if DCO.md exists on disk
    if [[ ! -f "$dco_file" ]]; then
        echo -e "${RED}Error: DCO.md not found in repository root${NC}" >&2
        echo -e "${RED}Cannot proceed without DCO file${NC}" >&2
        exit 1
    fi
    
    # Check if DCO.md is committed to git; if not, commit it automatically
    local has_dco_commits="false"
    # git log fails on repos with no commits at all, so handle that
    if git rev-parse HEAD >/dev/null 2>&1; then
        # Repo has at least one commit - check if DCO.md is tracked
        if [[ -n "$(git log --oneline -1 -- "$dco_file" 2>/dev/null)" ]]; then
            has_dco_commits="true"
        fi
    fi
    verbose_log "DCO.md has commits: $has_dco_commits"
    
    if [[ "$has_dco_commits" == "false" ]]; then
        echo -e "${YELLOW}DCO.md is not yet committed to git. Committing it now...${NC}"
        
        # Save currently staged files (excluding DCO.md)
        local staged_files
        staged_files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep -v "^DCO\.md$" || true)
        verbose_log "Staged files to preserve: $(echo "$staged_files" | tr '\n' ' ')"
        
        # Unstage everything (may fail on empty repos, that's ok)
        if git rev-parse HEAD >/dev/null 2>&1; then
            git reset >/dev/null 2>&1 || true
        else
            # Empty repo: unstage individually
            verbose_log "Empty repo detected, unstaging files individually"
            if [[ -n "$staged_files" ]]; then
                echo "$staged_files" | while IFS= read -r file; do
                    git rm --cached "$file" >/dev/null 2>&1 || true
                done
            fi
        fi
        
        # Stage and commit only DCO.md
        git add "$dco_file"
        verbose_log "Staging DCO.md for commit"
        local sign_args=()
        if [[ -n "$SIGNING_KEY" ]]; then
            sign_args+=(--gpg-sign)
        fi
        if git_commit_with_sign --signoff --no-verify "${sign_args[@]}" -m "[DCO] Set DCO.md Policy by $(git config user.name)" -m "Developer Certificates of Origin established using https://github.com/Stream44/dco" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ DCO.md committed to repository${NC}"
        else
            echo -e "${RED}Error: Failed to commit DCO.md${NC}" >&2
            exit 1
        fi
        
        # Restore originally staged files
        if [[ -n "$staged_files" ]]; then
            verbose_log "Restoring staged files"
            echo "$staged_files" | while IFS= read -r file; do
                git add "$file" 2>/dev/null || true
            done
        fi
    fi

    # Display the DCO
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  DEVELOPER CERTIFICATE OF ORIGIN (DCO)${NC} - tools version ${CYAN}${DCO_VERSION}${NC}"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "${BLUE}This is your first commit to this repository.${NC}"
    echo -e "${BLUE}Please read and agree to the Developer Certificate of Origin below.${NC}"
    echo
    
    # Ask if ready to review (unless auto-agreeing)
    if [[ "$auto_agree" != "true" ]]; then
        while true; do
            echo -e -n "${YELLOW}Are you ready to review the DCO? (yes/no): ${NC}"
            read -r ready_response
            case "$ready_response" in
                [Yy]es|[Yy])
                    echo
                    break
                    ;;
                [Nn]o|[Nn])
                    echo -e "${RED}✗ DCO review required to commit${NC}" >&2
                    exit 1
                    ;;
                *)
                    echo -e "${RED}Please answer 'yes' or 'no'${NC}"
                    ;;
            esac
        done
    else
        echo -e "${GREEN}Auto-agreeing to DCO (--yes-signoff)${NC}"
        echo
    fi
    
    cat "$dco_file"
    echo
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    echo -e "${MAGENTA}NOTE: You will only be asked to agree once and all future commits will be signed off automatically.${NC}"
    echo
    
    # Show who is signing
    local git_name git_email
    git_name=$(git config user.name 2>/dev/null || echo "")
    git_email=$(git config user.email 2>/dev/null || echo "")
    
    if [[ -n "$git_name" ]] && [[ -n "$git_email" ]]; then
        echo -e "${BLUE}You are signing as:${NC}"
        echo -e "  ${BOLD}$git_name <$git_email>${NC}"
        if [[ -n "$SIGNING_KEY" ]]; then
            local key_fingerprint
            key_fingerprint=$(ssh-keygen -lf "$SIGNING_KEY" 2>/dev/null | awk '{print $2}')
            echo -e "  ${BOLD}Signing key:${NC} ${CYAN}${key_fingerprint}${NC}"
            echo -e "  ${BOLD}Key path:${NC}    ${CYAN}${SIGNING_KEY}${NC}"
        fi
        echo
    fi

    # Ask for agreement (unless auto-agreeing)
    if [[ "$auto_agree" != "true" ]]; then
        while true; do
            echo -e -n "${YELLOW}Do you agree to the DCO terms above? (yes/no): ${NC}"
            read -r response
            case "$response" in
                [Yy]es|[Yy])
                    break
                    ;;
                [Nn]o|[Nn])
                    echo -e "${RED}✗ DCO agreement required to commit${NC}" >&2
                    exit 1
                    ;;
                *)
                    echo -e "${RED}Please answer 'yes' or 'no'${NC}"
                    ;;
            esac
        done
    fi
    
    # Record the agreement
    echo -e "${GREEN}✓ DCO agreement accepted${NC}"
    local git_name git_email sign_date agreement_commit agreement_change_date
    git_name=$(git config user.name 2>/dev/null || echo "")
    git_email=$(git config user.email 2>/dev/null || echo "")
    sign_date=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    
    # Get the last commit that changed DCO.md and its date
    agreement_commit=$(git log -1 --format='%H' -- "$dco_file")
    agreement_change_date=$(git log -1 --format='%ai' -- "$dco_file")
    
    cat > "$marker_file" <<EOF
name=$git_name
email=$git_email
date=$sign_date
agreement_commit=$agreement_commit
agreement_change_date=$agreement_change_date
EOF
    
    # Record the DCO signature in the git tree for permanent record
    record_dco_signature "$git_root" "$git_name" "$git_email" "$sign_date" "$agreement_commit" "$agreement_change_date"
    
    echo
    return 0
}

# Main function
main() {
    local git_root
    git_root=$(find_git_root)
    
    # Parse flags; collect remaining args for git commit
    local auto_agree="false"
    local git_args=()
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --yes-signoff)
                auto_agree="true"
                ;;
            --verbose)
                VERBOSE=true
                ;;
            --signing-key)
                shift
                SIGNING_KEY="$1"
                ;;
            *)
                git_args+=("$1")
                ;;
        esac
        shift
    done

    verbose_log "git_root: $git_root"
    verbose_log "auto_agree: $auto_agree"
    verbose_log "git_args: ${git_args[*]}"

    # Sign the DCO (sign-only, does not commit user code)
    show_dco_first_time "$git_root" "$auto_agree"

    # If git arguments were provided, run git commit with --signoff
    if [[ ${#git_args[@]} -gt 0 ]]; then
        verbose_log "Running git commit with signoff and args: ${git_args[*]}"
        local sign_args=()
        if [[ -n "$SIGNING_KEY" ]]; then
            sign_args+=(-c 'gpg.format=ssh' -c "user.signingkey=$SIGNING_KEY" --gpg-sign)
        fi
        git_commit_with_sign --signoff "${sign_args[@]}" "${git_args[@]}"
    fi
}

# Run main function
main "$@"
