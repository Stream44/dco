<table>
  <tr>
    <td><a href="https://Stream44.Systems"><img src=".o/stream44.studio/assets/Icon-v1.svg" width="42" height="42"></a></td>
    <td><strong><a href="https://Stream44.Systems">Stream44 Systems</a></strong><br/>Open Development Project</td>
    <td>Preview release for community feedback.<br/>Get in touch on <a href="https://discord.gg/9eBcQXEJAN">discord</a>.</td>
    <td>Designed by Hand<br/><b>AI assisted Code</a></td>
  </tr>
</table>

⚠️ **Disclaimer:** Under active development. Code has not been audited. APIs and interfaces are subject to change!

Developer Certificate of Origin (DCO) Tools [![Tests](https://github.com/Stream44/dco/actions/workflows/test.yaml/badge.svg)](https://github.com/Stream44/dco/actions/workflows/test.yaml?query=branch%3Amain)
===

DCOs are a simple way to have contributors agree to terms present in a `DCO.md` file whenever they commit to your repository.

It is assurance for you that every commit adheres to the terms present in git at the time of the commit.

This project contains tools to facilitate a DCO process for any project.

**No outside service is required. Use github actions for signature verification on pull requests.**


Usage
---

### Setup

Create a `DCO.md` file and sign.

A great template for open source projects is: [https://developercertificate.org](https://developercertificate.org)


### Signing

```
# Run once to sign DCO
bunx @stream44.studio/dco sign [--signing-key ~/.ssh/key]

# Like 'git commit' but with signature
bunx @stream44.studio/dco commit [--signing-key ~/.ssh/key] <git arguments>
```

See [Git Commit Script](#git-commit-script) below.


### Verifying

```
bunx @stream44.studio/dco validate
```

Also see [Github Action](#github-action) below.


### Pushing

Use `dco push` to combine unsigned local commits on a branch into a single DCO-signed commit and push:

```
bunx @stream44.studio/dco push [-m "<commit message>"] [--force] [-- <git push args>]
```

This is the recommended workflow for contributors:

1. Work on a feature branch, committing freely without `--signoff`
2. When ready to push, run `dco push`
3. The tool finds the last signed commit on the branch, soft-resets to it, runs the DCO signing process, and creates a single signed commit with all your changes
4. The signed commit is then pushed to the remote

The push command will:
- Verify you are on a feature branch (not `main` or `master`)
- Verify there are no pending uncommitted changes
- Find the last `Signed-off-by` commit on the branch
- Soft-reset to that commit, preserving all changes in the working tree
- Run the DCO commit process to create a single signed commit
- Push to the remote with any additional arguments you provide

Use `--force` to force-push the branch, ignoring what exists on the remote. This is useful when you have rewritten history locally and need to overwrite the remote branch.


Tools
---

### Git Commit Script

The script provides a nice experience for contributors of your project. 

Instead of running `git commit ...`, run `commit.sh ...`.

The **first time** you run the script you will see the DCO terms of the repository you are comitting to so you can agree.

It will add an entry in `.dco-signatures` to record the signature and commit the change.

It will then always add `--signoff` to every `git commit` invocation in order to **sign off** on the commit.

These are the details from `git commit --help`:

```
-s, --signoff, --no-signoff
    Add a Signed-off-by trailer by the committer at the end of the commit log message.
    The meaning of a signoff depends on the project to which you’re committing.
    For example, it may certify that the committer has the rights to submit the work under the project’s license
    or agrees to some contributor representation, such as a Developer Certificate of Origin.
    (See https://developercertificate.org for the one used by the Linux kernel and Git projects.)
    Consult the documentation or leadership of the project to which you’re contributing to understand how
    the signoffs are used in that project.
```

Optionally a signing key can be supplied to cryptographically sign commits as well. The fingreprint of the signing
key will be sored in the `.dco-signatures` file.

A project can choose to require signing keys or not by setting `enforceSignatureFingerprints` for the github action.

### Verification Script

Ensures all commits were signed off my signatures recorded in `.dco-signatures`.

### Github Action

The github action enforces DCO sign-offs by ensuring all commits have a `Signed-off-by: Jane Doe <jane@example.com>`
line in the respective commit messages and the same is found in `.dco-signatures`.

Add to `.github/workflows/dco.yaml` in your repository:

```yaml
name: DCO Signatures
on: [push, pull_request]
jobs:
  dco:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Stream44/dco@main
        with:
          enforceSignatureFingerprints: true
```

Provenance
===

[![Gordian Open Integrity](https://github.com/Stream44/dco/actions/workflows/gordian-open-integrity.yaml/badge.svg)](https://github.com/Stream44/dco/actions/workflows/gordian-open-integrity.yaml?query=branch%3Amain) [![DCO Signatures](https://github.com/Stream44/dco/actions/workflows/dco.yaml/badge.svg)](https://github.com/Stream44/dco/actions/workflows/dco.yaml?query=branch%3Amain)

Repository DID: `did:repo:e3dba74f7c42b469939efd8ab6aef8358c496cbd`

<table>
  <tr>
    <td><strong>Inception Mark</strong></td>
    <td><img src=".o/GordianOpenIntegrity-InceptionLifehash.svg" width="64" height="64"></td>
    <td><strong>Current Mark</strong></td>
    <td><img src=".o/GordianOpenIntegrity-CurrentLifehash.svg" width="64" height="64"></td>
    <td>Trust established using<br/><a href="https://github.com/Stream44/t44-blockchaincommons.com">Stream44/t44-BlockchainCommons.com</a></td>
  </tr>
</table>

(c) 2026 [Christoph.diy](https://christoph.diy) • Code: [MIT](./LICENSE.txt) • Text: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) • Created with [Stream44.Studio](https://Stream44.Studio)
