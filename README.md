⚠️ **WARNING:** This repository may get squashed and force-pushed if the [GordianOpenIntegrity](https://github.com/Stream44/t44-blockchaincommons.com) implementation must change in incompatible ways. Keep your diffs until the **GordianOpenIntegrity** system is stable.

🔷 **Open Development Project:** The implementation is a preview release for community feedback.

⚠️ **Disclaimer:** Under active development. Code has not been audited, APIs and interfaces are subject to change.

Developer Certificate of Origin (DCO) Tools
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
bunx @stream44.studio/dco commit [--signing-key ~/.ssh/key] <git arguments>
```

### Verifying

```
bunx @stream44.studio/dco validate
```

Also see [Github Actions](#github-action) below.


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


### Github Actions

The github action enforces DCO sign-offs by ensuring all commits have a `Signed-off-by: Jane Doe <jane@example.com>`
line in the respective commit messages and the same is found in `.dco-signatures`.


Add to `.github/workflows/dco.yml` in your repository:

```yaml
name: Validate DCO Signatures
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

Repository DID: `did:repo:d241cef226ebb7495bcbe8422c889ffc088c2b50`

<table>
  <tr>
    <td><strong>Inception Mark</strong></td>
    <td><img src=".o/GordianOpenIntegrity-InceptionLifehash.svg" width="64" height="64"></td>
    <td><strong>Current Mark</strong></td>
    <td><img src=".o/GordianOpenIntegrity-CurrentLifehash.svg" width="64" height="64"></td>
    <td>Trust established using<br/><a href="https://github.com/Stream44/t44-blockchaincommons.com">Stream44/t44-BlockchainCommons.com</a></td>
  </tr>
</table>

(c) 2026 [Christoph.diy](https://christoph.diy) • Code: `Apache 2.0` • Text: `CC-BY` • Created with [Stream44.Studio](https://Stream44.Studio)
