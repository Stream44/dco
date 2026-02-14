#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from 't44/workspace-rt'
import { join, dirname } from 'path'
import { rm, mkdir, writeFile, readFile, copyFile } from 'fs/promises'

const WORK_DIR = join(import.meta.dir, '.~dco-lifecycle')
const DCO_SH = join(import.meta.dir, '../../dco.sh')
const DCO_MD_SOURCE = join(import.meta.dir, '../../DCO.md')

const {
    test: { describe, it, expect },
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/WorkspaceTest',
                    options: {
                        '#': {
                            bunTest,
                            env: {}
                        }
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/dco/examples/01-Lifecycle'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

// ════════════════════════════════════════════════════════════════════════
//
//  DCO CLI Lifecycle Test
//
//  Exercises the full `dco.sh commit` and `dco.sh validate` CLI flow:
//    1. Author A initialises a repo, signs DCO with a signing key, commits
//    2. Author B signs DCO with a different key and identity, commits
//    3. Validate all commits pass DCO validation
//
// ════════════════════════════════════════════════════════════════════════

async function spawn(args: string[], opts: { cwd: string; env?: Record<string, string> }) {
    const proc = Bun.spawn(args, {
        cwd: opts.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...opts.env },
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode, output: stdout + stderr }
}

describe('DCO CLI Lifecycle', function () {

    const repoDir = join(WORK_DIR, 'repo')
    const keysDir = join(WORK_DIR, 'keys')

    let keyA: string
    let keyB: string

    // ──────────────────────────────────────────────────────────────
    // Setup: clean work dir, generate two SSH keys
    // ──────────────────────────────────────────────────────────────

    it('setup: prepare work directory and SSH keys', async function () {
        await rm(WORK_DIR, { recursive: true, force: true })
        await mkdir(repoDir, { recursive: true })
        await mkdir(keysDir, { recursive: true })

        // Generate key for Author A
        keyA = join(keysDir, 'author_a_ed25519')
        await spawn(['ssh-keygen', '-t', 'ed25519', '-f', keyA, '-N', '', '-C', 'author_a'], { cwd: keysDir })

        // Generate key for Author B
        keyB = join(keysDir, 'author_b_ed25519')
        await spawn(['ssh-keygen', '-t', 'ed25519', '-f', keyB, '-N', '', '-C', 'author_b'], { cwd: keysDir })

        // Init git repo as Author A
        await spawn(['git', 'init'], { cwd: repoDir })
        await spawn(['git', 'config', 'user.name', 'Author A'], { cwd: repoDir })
        await spawn(['git', 'config', 'user.email', 'a@example.com'], { cwd: repoDir })
        await spawn(['git', 'checkout', '-b', 'main'], { cwd: repoDir })

        // Copy DCO.md into the repo
        await copyFile(DCO_MD_SOURCE, join(repoDir, 'DCO.md'))
    })

    // ──────────────────────────────────────────────────────────────
    // 1. Author A: `dco.sh commit` with signing key
    // ──────────────────────────────────────────────────────────────

    it('Author A: dco.sh commit --signing-key --yes-signoff', async function () {
        const result = await spawn(
            ['bash', DCO_SH, 'commit', '--signing-key', keyA, '--yes-signoff'],
            { cwd: repoDir }
        )

        if (result.exitCode !== 0) {
            console.error('sign output:', result.output)
        }
        expect(result.exitCode).toBe(0)

        // Verify .dco-signatures was created and contains Author A
        const sigContent = await readFile(join(repoDir, '.dco-signatures'), 'utf-8')
        expect(sigContent).toContain('Author A')
        expect(sigContent).toContain('a@example.com')
        expect(sigContent).toContain('signature: SHA256:')
    })

    // ──────────────────────────────────────────────────────────────
    // 2. Author A: commit some code with --signoff
    // ──────────────────────────────────────────────────────────────

    it('Author A: commit code with --signoff', async function () {
        await writeFile(join(repoDir, 'README.md'), '# Test Project\n')
        await spawn(['git', 'add', '-A'], { cwd: repoDir })

        const result = await spawn(
            ['git', '-c', 'gpg.format=ssh', '-c', `user.signingkey=${keyA}`, 'commit', '--gpg-sign', '--signoff', '-m', 'feat: initial code by Author A'],
            { cwd: repoDir }
        )

        if (result.exitCode !== 0) {
            console.error('commit output:', result.output)
        }
        expect(result.exitCode).toBe(0)
    })

    // ──────────────────────────────────────────────────────────────
    // 3. Author B: switch identity, sign DCO, commit
    // ──────────────────────────────────────────────────────────────

    it('Author B: switch identity and dco.sh commit', async function () {
        // Switch git identity to Author B
        await spawn(['git', 'config', 'user.name', 'Author B'], { cwd: repoDir })
        await spawn(['git', 'config', 'user.email', 'b@example.com'], { cwd: repoDir })

        // Remove the marker so Author B gets prompted
        const markerPath = join(repoDir, '.git', '.dco-agreed')
        await rm(markerPath, { force: true })

        const result = await spawn(
            ['bash', DCO_SH, 'commit', '--signing-key', keyB, '--yes-signoff'],
            { cwd: repoDir }
        )

        if (result.exitCode !== 0) {
            console.error('sign B output:', result.output)
        }
        expect(result.exitCode).toBe(0)

        // Verify .dco-signatures now contains both authors
        const sigContent = await readFile(join(repoDir, '.dco-signatures'), 'utf-8')
        expect(sigContent).toContain('Author A')
        expect(sigContent).toContain('Author B')
        expect(sigContent).toContain('b@example.com')
    })

    it('Author B: commit code with --signoff', async function () {
        await writeFile(join(repoDir, 'CONTRIBUTING.md'), '# Contributing\n')
        await spawn(['git', 'add', '-A'], { cwd: repoDir })

        const result = await spawn(
            ['git', '-c', 'gpg.format=ssh', '-c', `user.signingkey=${keyB}`, 'commit', '--gpg-sign', '--signoff', '-m', 'docs: contributing guide by Author B'],
            { cwd: repoDir }
        )

        if (result.exitCode !== 0) {
            console.error('commit B output:', result.output)
        }
        expect(result.exitCode).toBe(0)
    })

    // ──────────────────────────────────────────────────────────────
    // 4. Validate: `dco.sh validate` should pass
    // ──────────────────────────────────────────────────────────────

    it('dco.sh validate passes on fully signed repo', async function () {
        const result = await spawn(
            ['bash', DCO_SH, 'validate', '', 'HEAD'],
            { cwd: repoDir }
        )

        if (result.exitCode !== 0) {
            console.error('validate output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('All commits are properly signed!')
    })

    // ──────────────────────────────────────────────────────────────
    // 5. Negative: unsigned commit should fail validation
    // ──────────────────────────────────────────────────────────────

    it('dco.sh validate fails on unsigned commit', async function () {
        // Create a commit WITHOUT --signoff
        await writeFile(join(repoDir, 'unsigned.txt'), 'no signoff\n')
        await spawn(['git', 'add', '-A'], { cwd: repoDir })
        await spawn(['git', 'commit', '-m', 'bad: no signoff'], { cwd: repoDir })

        const result = await spawn(
            ['bash', DCO_SH, 'validate', '', 'HEAD'],
            { cwd: repoDir }
        )

        expect(result.exitCode).not.toBe(0)
        expect(result.output).toContain('DCO validation failed')
    })
})
