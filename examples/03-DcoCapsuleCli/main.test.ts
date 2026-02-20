#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'
import { join } from 'path'
import { mkdir, writeFile, readFile, copyFile, rm } from 'fs/promises'
import { existsSync } from 'fs'
import { $ } from 'bun'

const DCO_TS = join(import.meta.dir, '../../dco.ts')
const DCO_MD_SOURCE = join(import.meta.dir, '../../DCO.md')

const {
    test: { describe, it, expect, workbenchDir },
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
        capsuleName: '@stream44.studio/dco/examples/03-DcoCapsuleCli'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

// Helper: create a fresh git repo with DCO.md
async function createTestRepo(name: string): Promise<string> {
    const repoDir = join(workbenchDir, name)
    await mkdir(repoDir, { recursive: true })
    await $`git init`.cwd(repoDir).quiet()
    await $`git config user.name "Test User"`.cwd(repoDir).quiet()
    await $`git config user.email "test@example.com"`.cwd(repoDir).quiet()
    await $`git checkout -b main`.cwd(repoDir).quiet().nothrow()

    // Copy DCO.md from the package
    await copyFile(DCO_MD_SOURCE, join(repoDir, 'DCO.md'))

    return repoDir
}

// Helper: spawn the dco.ts CLI
async function spawnDco(args: string[], opts: { cwd: string; env?: Record<string, string> }) {
    const env = { ...process.env, ...opts.env }
    delete env.GITHUB_EVENT_NAME
    delete env.GITHUB_BASE_REF
    delete env.GITHUB_HEAD_SHA
    delete env.GITHUB_BEFORE
    delete env.GITHUB_SHA

    const proc = Bun.spawn(['bun', DCO_TS, ...args], {
        cwd: opts.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env,
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode, output: stdout + stderr }
}

describe('DCO CLI', function () {

    it('should display help', async function () {
        const result = await spawnDco(['--help'], { cwd: workbenchDir })
        const output = result.output
        expect(output).toContain('Developer Certificate of Origin (DCO) CLI')
        expect(output).toContain('commit')
        expect(output).toContain('validate')
        expect(output).toContain('status')
    })

    it('should display version', async function () {
        const result = await spawnDco(['--version'], { cwd: workbenchDir })
        expect(result.output.trim()).toContain('0.3.0')
    })

    it('should sign DCO with commit --yes-signoff', async function () {
        const repoDir = await createTestRepo('cli-commit')

        const result = await spawnDco(['commit', '--yes-signoff'], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO signed successfully')

        // Verify marker file was created
        expect(existsSync(join(repoDir, '.git/.dco-agreed'))).toBe(true)

        // Verify .dco-signatures was created
        expect(existsSync(join(repoDir, '.dco-signatures'))).toBe(true)
    })

    it('should sign DCO with commit --signing-key --yes-signoff', async function () {
        const repoDir = await createTestRepo('cli-commit-key')
        const keysDir = join(workbenchDir, 'cli-keys')
        await mkdir(keysDir, { recursive: true })

        // Generate test SSH key
        const keyPath = join(keysDir, 'test_ed25519')
        if (!existsSync(keyPath)) {
            const keygen = Bun.spawn(['ssh-keygen', '-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'test_cli'], {
                stdout: 'pipe',
                stderr: 'pipe',
            })
            await keygen.exited
        }

        const result = await spawnDco(['commit', '--signing-key', keyPath, '--yes-signoff'], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO signed successfully')

        // Verify .dco-signatures contains signature fingerprint
        const sigContent = await readFile(join(repoDir, '.dco-signatures'), 'utf-8')
        expect(sigContent).toContain('Test User')
        expect(sigContent).toContain('test@example.com')
    })

    it('should commit with -m message after signing', async function () {
        const repoDir = await createTestRepo('cli-commit-message')

        // Stage a file so git commit has something to commit
        await writeFile(join(repoDir, 'README.md'), '# Test\n')
        await $`git add -A`.cwd(repoDir).quiet()

        const result = await spawnDco(['commit', '--yes-signoff', '-m', 'feat: my commit message'], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO signed successfully')

        // Verify the commit was made with the provided message
        const log = await $`git log --oneline`.cwd(repoDir).text()
        expect(log).toContain('feat: my commit message')
    })

    it('should validate a properly signed repository', async function () {
        const repoDir = await createTestRepo('cli-validate-pass')

        // Sign DCO first
        const signResult = await spawnDco(['commit', '--yes-signoff'], { cwd: repoDir })
        expect(signResult.exitCode).toBe(0)

        // Add a file and commit with --signoff
        await writeFile(join(repoDir, 'README.md'), '# Test\n')
        await $`git add -A`.cwd(repoDir).quiet()
        await $`git commit --signoff -m "feat: initial"`.cwd(repoDir).quiet()

        // Validate (no args — defaults to origin/main..HEAD, falls back to all commits)
        const result = await spawnDco(['validate'], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO validation passed')
    })

    it('should fail validation on unsigned commits', async function () {
        const repoDir = await createTestRepo('cli-validate-fail')

        // Sign DCO first so there are valid initial commits
        const signResult = await spawnDco(['commit', '--yes-signoff'], { cwd: repoDir })
        expect(signResult.exitCode).toBe(0)

        // Then add a commit WITHOUT --signoff
        await writeFile(join(repoDir, 'README.md'), '# Test\n')
        await $`git add -A`.cwd(repoDir).quiet()
        await $`git commit -m "bad: no signoff"`.cwd(repoDir).quiet()

        // Validate (no args — defaults to origin/main..HEAD, falls back to all commits)
        const result = await spawnDco(['validate'], { cwd: repoDir })

        expect(result.exitCode).not.toBe(0)
        expect(result.output).toContain('DCO validation failed')
    })

    it('should show status for a repo with DCO.md', async function () {
        const repoDir = await createTestRepo('cli-status')

        const result = await spawnDco(['status'], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO.md found')
        expect(result.output).toContain('DCO not yet signed')
    })

    it('should show signed status after signing', async function () {
        const repoDir = await createTestRepo('cli-status-signed')

        // Sign first
        const signResult = await spawnDco(['commit', '--yes-signoff'], { cwd: repoDir })
        expect(signResult.exitCode).toBe(0)

        const result = await spawnDco(['status'], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO.md found')
        expect(result.output).toContain('DCO signed')
        expect(result.output).toContain('Test User')
        expect(result.output).toContain('test@example.com')
        expect(result.output).toContain('Signatures (1)')
    })

    it('should show no DCO.md for a repo without one', async function () {
        const repoDir = join(workbenchDir, 'cli-status-no-dco')
        await mkdir(repoDir, { recursive: true })

        const result = await spawnDco(['status'], { cwd: repoDir })

        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('No DCO.md found')
    })

    it('should auto-select signing key with GordianOpenIntegrity.yaml and --yes-signoff', async function () {
        const repoDir = await createTestRepo('cli-gordian-auto')
        const fakeHome = join(workbenchDir, 'cli-gordian-auto-home')
        await mkdir(fakeHome, { recursive: true })

        // Create .o/GordianOpenIntegrity.yaml
        await mkdir(join(repoDir, '.o'), { recursive: true })
        await writeFile(join(repoDir, '.o/GordianOpenIntegrity.yaml'), '# Gordian Open Integrity\n')

        // Stage a file
        await writeFile(join(repoDir, 'README.md'), '# Test\n')
        await $`git add -A`.cwd(repoDir).quiet()

        const result = await spawnDco(['commit', '--yes-signoff', '-m', 'feat: gordian commit'], {
            cwd: repoDir,
            env: { HOME_DIR: fakeHome }
        })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO signed successfully')

        // Verify the commit was made
        const log = await $`git log --oneline`.cwd(repoDir).text()
        expect(log).toContain('feat: gordian commit')

        // Verify signing key was used (fingerprint in .dco-signatures)
        const sigContent = await readFile(join(repoDir, '.dco-signatures'), 'utf-8')
        expect(sigContent).toContain('SHA256:')
    })

    it('should use explicit --signing-key with GordianOpenIntegrity.yaml', async function () {
        const repoDir = await createTestRepo('cli-gordian-explicit')
        const keysDir = join(workbenchDir, 'cli-gordian-keys')
        await mkdir(keysDir, { recursive: true })

        // Create .o/GordianOpenIntegrity.yaml
        await mkdir(join(repoDir, '.o'), { recursive: true })
        await writeFile(join(repoDir, '.o/GordianOpenIntegrity.yaml'), '# Gordian Open Integrity\n')

        // Generate test SSH key
        const keyPath = join(keysDir, 'gordian_ed25519')
        if (!existsSync(keyPath)) {
            const keygen = Bun.spawn(['ssh-keygen', '-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'test_gordian', '-q'], { stdout: 'pipe', stderr: 'pipe' })
            await keygen.exited
        }

        const result = await spawnDco(['commit', '--yes-signoff', '--signing-key', keyPath], { cwd: repoDir })

        if (result.exitCode !== 0) {
            console.error('CLI output:', result.output)
        }
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('DCO signed successfully')

        // Verify the specific key's fingerprint is in .dco-signatures
        const fpProc = Bun.spawn(['ssh-keygen', '-lf', keyPath], { stdout: 'pipe', stderr: 'pipe' })
        const fpOutput = await new Response(fpProc.stdout).text()
        await fpProc.exited
        const expectedFp = fpOutput.trim().split(/\s+/)[1]

        const sigContent = await readFile(join(repoDir, '.dco-signatures'), 'utf-8')
        expect(sigContent).toContain(expectedFp)
    })

    describe('push', function () {

        // Helper: create a repo with a file-based bare origin, DCO pre-signed, on main
        async function createPushTestRepo(name: string): Promise<{ repoDir: string; bareDir: string }> {
            // Create a bare repo as the "remote"
            const bareDir = join(workbenchDir, `${name}-bare`)
            await mkdir(bareDir, { recursive: true })
            await $`git init --bare`.cwd(bareDir).quiet()

            // Clone it into a working repo
            const repoDir = join(workbenchDir, name)
            await $`git clone ${bareDir} ${repoDir}`.quiet()
            await $`git config user.name "Test User"`.cwd(repoDir).quiet()
            await $`git config user.email "test@example.com"`.cwd(repoDir).quiet()

            // Create initial signed commit on main with DCO
            await copyFile(DCO_MD_SOURCE, join(repoDir, 'DCO.md'))
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit --signoff -m "initial: add DCO.md"`.cwd(repoDir).quiet()

            // Pre-sign the DCO so push tests don't trigger first-time agreement
            const signResult = await spawnDco(['commit', '--yes-signoff'], { cwd: repoDir })
            if (signResult.exitCode !== 0) {
                throw new Error(`Failed to pre-sign DCO: ${signResult.output}`)
            }

            await $`git push -u origin main`.cwd(repoDir).quiet()

            return { repoDir, bareDir }
        }

        it('should fail when on main branch', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-main')

            const result = await spawnDco(['push', '--yes-signoff'], { cwd: repoDir })

            expect(result.exitCode).not.toBe(0)
            expect(result.output).toContain("Cannot push from 'main'")
        })

        it('should fail when there are uncommitted changes', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-dirty')

            await $`git checkout -b feat/dirty`.cwd(repoDir).quiet()
            await writeFile(join(repoDir, 'dirty.txt'), 'uncommitted\n')

            const result = await spawnDco(['push', '--yes-signoff'], { cwd: repoDir })

            expect(result.exitCode).not.toBe(0)
            expect(result.output).toContain('uncommitted changes')
        })

        it('should just push when all commits are already signed', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-already-signed')

            await $`git checkout -b feat/signed`.cwd(repoDir).quiet()
            await writeFile(join(repoDir, 'file.txt'), 'content\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit --signoff -m "feat: already signed"`.cwd(repoDir).quiet()

            const result = await spawnDco(['push', '--yes-signoff'], { cwd: repoDir })

            if (result.exitCode !== 0) {
                console.error('CLI output:', result.output)
            }
            expect(result.exitCode).toBe(0)
            expect(result.output).toContain('Pushed to remote')

            // Verify the commit is on the remote
            const bareLog = await $`git log --oneline feat/signed`.cwd(join(workbenchDir, 'cli-push-already-signed-bare')).text()
            expect(bareLog).toContain('already signed')
        })

        it('should squash a single unsigned commit and push', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-single')

            await $`git checkout -b feat/single`.cwd(repoDir).quiet()
            await writeFile(join(repoDir, 'feature.txt'), 'new feature\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "feat: unsigned work"`.cwd(repoDir).quiet()

            const result = await spawnDco(['push', '--yes-signoff'], { cwd: repoDir })

            if (result.exitCode !== 0) {
                console.error('CLI output:', result.output)
            }
            expect(result.exitCode).toBe(0)
            expect(result.output).toContain('Squashed 1 unsigned commit')
            expect(result.output).toContain('Pushed to remote')

            // Verify the commit on the branch has Signed-off-by
            const log = await $`git log -1 --format=%B`.cwd(repoDir).text()
            expect(log).toContain('Signed-off-by:')

            // Verify the file content is preserved
            const content = await readFile(join(repoDir, 'feature.txt'), 'utf-8')
            expect(content).toBe('new feature\n')
        })

        it('should squash multiple unsigned commits and push', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-multi')

            await $`git checkout -b feat/multi`.cwd(repoDir).quiet()

            await writeFile(join(repoDir, 'a.txt'), 'aaa\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "feat: first change"`.cwd(repoDir).quiet()

            await writeFile(join(repoDir, 'b.txt'), 'bbb\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "feat: second change"`.cwd(repoDir).quiet()

            await writeFile(join(repoDir, 'c.txt'), 'ccc\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "feat: third change"`.cwd(repoDir).quiet()

            const result = await spawnDco(['push', '--yes-signoff'], { cwd: repoDir })

            if (result.exitCode !== 0) {
                console.error('CLI output:', result.output)
            }
            expect(result.exitCode).toBe(0)
            expect(result.output).toContain('Squashed 3 unsigned commit')
            expect(result.output).toContain('Pushed to remote')

            // Verify all files are present
            expect(existsSync(join(repoDir, 'a.txt'))).toBe(true)
            expect(existsSync(join(repoDir, 'b.txt'))).toBe(true)
            expect(existsSync(join(repoDir, 'c.txt'))).toBe(true)

            // Verify the squashed commit has Signed-off-by
            const log = await $`git log -1 --format=%B`.cwd(repoDir).text()
            expect(log).toContain('Signed-off-by:')
        })

        it('should use custom message with -m flag', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-custom-msg')

            await $`git checkout -b feat/custom-msg`.cwd(repoDir).quiet()
            await writeFile(join(repoDir, 'file.txt'), 'content\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "wip: messy commit"`.cwd(repoDir).quiet()

            const result = await spawnDco(['push', '--yes-signoff', '-m', 'feat: clean commit message'], { cwd: repoDir })

            if (result.exitCode !== 0) {
                console.error('CLI output:', result.output)
            }
            expect(result.exitCode).toBe(0)

            // Verify the custom message was used
            const log = await $`git log -1 --format=%s`.cwd(repoDir).text()
            expect(log.trim()).toBe('feat: clean commit message')
        })

        it('should only squash commits back to the last signed one', async function () {
            const { repoDir } = await createPushTestRepo('cli-push-partial')

            await $`git checkout -b feat/partial`.cwd(repoDir).quiet()

            // First commit — signed
            await writeFile(join(repoDir, 'signed.txt'), 'signed\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit --signoff -m "feat: signed commit"`.cwd(repoDir).quiet()

            // Second commit — unsigned
            await writeFile(join(repoDir, 'unsigned1.txt'), 'unsigned1\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "wip: unsigned 1"`.cwd(repoDir).quiet()

            // Third commit — unsigned
            await writeFile(join(repoDir, 'unsigned2.txt'), 'unsigned2\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "wip: unsigned 2"`.cwd(repoDir).quiet()

            const result = await spawnDco(['push', '--yes-signoff'], { cwd: repoDir })

            if (result.exitCode !== 0) {
                console.error('CLI output:', result.output)
            }
            expect(result.exitCode).toBe(0)
            expect(result.output).toContain('Squashed 2 unsigned commit')

            // Verify the signed commit is still intact
            const log = await $`git log --oneline`.cwd(repoDir).text()
            expect(log).toContain('feat: signed commit')

            // Verify all files are present
            expect(existsSync(join(repoDir, 'signed.txt'))).toBe(true)
            expect(existsSync(join(repoDir, 'unsigned1.txt'))).toBe(true)
            expect(existsSync(join(repoDir, 'unsigned2.txt'))).toBe(true)
        })

    })

})
