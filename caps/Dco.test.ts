#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'
import { join } from 'path'
import { rm, mkdir, writeFile, readFile, copyFile, access } from 'fs/promises'
import { constants, existsSync } from 'fs'
import { $ } from 'bun'

const WORK_DIR = join(import.meta.dir, '.~dco')

const {
    test: { describe, it, expect },
    dco,
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
                dco: {
                    type: CapsulePropertyTypes.Mapping,
                    value: './Dco'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/dco/caps/Dco.test'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

await rm(WORK_DIR, { recursive: true, force: true })
await mkdir(WORK_DIR, { recursive: true })

// ════════════════════════════════════════════════════════════════════════
//
//  DCO — Developer Certificate of Origin Capsule Tests
//
// ════════════════════════════════════════════════════════════════════════

// Helper: create a fresh git repo with DCO.md
async function createTestRepo(name: string): Promise<string> {
    const repoDir = join(WORK_DIR, name)
    await mkdir(repoDir, { recursive: true })
    await $`git init`.cwd(repoDir).quiet()
    await $`git config user.name "Test User"`.cwd(repoDir).quiet()
    await $`git config user.email "test@example.com"`.cwd(repoDir).quiet()
    await $`git checkout -b main`.cwd(repoDir).quiet().nothrow()

    // Copy DCO.md from the package
    const packageDir = join(import.meta.dir, '..')
    await copyFile(join(packageDir, 'DCO.md'), join(repoDir, 'DCO.md'))

    return repoDir
}

describe('Dco', function () {

    // ──────────────────────────────────────────────────────────────
    // 1. hasDco
    // ──────────────────────────────────────────────────────────────

    describe('1. hasDco', function () {

        it('should return true when DCO.md exists', async function () {
            const repoDir = await createTestRepo('has-dco-true')
            const result = await dco.hasDco({ repoDir })
            expect(result).toBe(true)
        })

        it('should return false when DCO.md does not exist', async function () {
            const repoDir = join(WORK_DIR, 'has-dco-false')
            await mkdir(repoDir, { recursive: true })
            const result = await dco.hasDco({ repoDir })
            expect(result).toBe(false)
        })
    })

    // ──────────────────────────────────────────────────────────────
    // 2. sign
    // ──────────────────────────────────────────────────────────────

    describe('2. sign', function () {

        it('should sign the DCO with --yes-signoff', async function () {
            const repoDir = await createTestRepo('sign-auto')

            await dco.sign({ repoDir, autoAgree: true })

            // Verify marker file was created
            const markerPath = join(repoDir, '.git/.dco-agreed')
            expect(existsSync(markerPath)).toBe(true)

            // Verify .dco-signatures was created
            const sigPath = join(repoDir, '.dco-signatures')
            expect(existsSync(sigPath)).toBe(true)
        })

        it('should throw when DCO.md is missing', async function () {
            const repoDir = join(WORK_DIR, 'sign-no-dco')
            await mkdir(repoDir, { recursive: true })

            let threw = false
            try {
                await dco.sign({ repoDir, autoAgree: true })
            } catch (e: any) {
                threw = true
                expect(e.message).toContain('DCO.md not found')
            }
            expect(threw).toBe(true)
        })
    })

    // ──────────────────────────────────────────────────────────────
    // 3. isSigned
    // ──────────────────────────────────────────────────────────────

    describe('3. isSigned', function () {

        it('should return signed: false for a fresh repo', async function () {
            const repoDir = await createTestRepo('is-signed-false')
            const result = await dco.isSigned({ repoDir })
            expect(result.signed).toBe(false)
        })

        it('should return signed: true after signing', async function () {
            const repoDir = await createTestRepo('is-signed-true')
            await dco.sign({ repoDir, autoAgree: true })

            const result = await dco.isSigned({ repoDir })
            expect(result.signed).toBe(true)
            expect(result.name).toBe('Test User')
            expect(result.email).toBe('test@example.com')
            expect(result.date).toBeDefined()
            expect(result.agreementCommit).toBeDefined()
        })
    })

    // ──────────────────────────────────────────────────────────────
    // 4. getSignatures
    // ──────────────────────────────────────────────────────────────

    describe('4. getSignatures', function () {

        it('should return found: false when no signatures file', async function () {
            const repoDir = await createTestRepo('sigs-none')
            const result = await dco.getSignatures({ repoDir })
            expect(result.found).toBe(false)
            expect(result.signatures).toEqual([])
        })

        it('should parse signatures after signing', async function () {
            const repoDir = await createTestRepo('sigs-parse')
            await dco.sign({ repoDir, autoAgree: true })

            const result = await dco.getSignatures({ repoDir })
            expect(result.found).toBe(true)
            expect(result.signatures.length).toBe(1)
            expect(result.signatures[0].name).toBe('Test User')
            expect(result.signatures[0].email).toBe('test@example.com')
            expect(result.signatures[0].signedDate).toBeDefined()
            expect(result.signatures[0].agreementCommit.length).toBeGreaterThan(0)
        })
    })

    // ──────────────────────────────────────────────────────────────
    // 5. signAndCommit
    // ──────────────────────────────────────────────────────────────

    describe('5. signAndCommit', function () {

        it('should sign DCO and commit changes with --signoff', async function () {
            const repoDir = await createTestRepo('sign-commit')

            // Create a test file to commit
            await writeFile(join(repoDir, 'README.md'), '# Test Project\n')

            await dco.signAndCommit({
                repoDir,
                message: 'Initial commit',
                autoAgree: true,
            })

            // Verify commits exist
            const logResult = await $`git log --oneline`.cwd(repoDir).quiet()
            const commits = logResult.text().trim().split('\n').filter(Boolean)
            // Should have: DCO.md commit + DCO signature commit + user commit
            expect(commits.length).toBe(3)

            // Verify the user commit has Signed-off-by
            const lastBody = await $`git log -1 --format=%b`.cwd(repoDir).quiet()
            expect(lastBody.text()).toContain('Signed-off-by:')
        })

        it('should copy .dco-signatures to projectSourceDir', async function () {
            const repoDir = await createTestRepo('sign-commit-copy')
            const projectDir = join(WORK_DIR, 'sign-commit-copy-source')
            await mkdir(projectDir, { recursive: true })

            await writeFile(join(repoDir, 'README.md'), '# Test\n')

            await dco.signAndCommit({
                repoDir,
                message: 'Test commit',
                autoAgree: true,
                projectSourceDir: projectDir,
            })

            // Verify .dco-signatures was copied to project source
            const copiedSigPath = join(projectDir, '.dco-signatures')
            expect(existsSync(copiedSigPath)).toBe(true)

            const content = await readFile(copiedSigPath, 'utf-8')
            expect(content).toContain('Test User')
        })
    })

    // ──────────────────────────────────────────────────────────────
    // 6. validate
    // ──────────────────────────────────────────────────────────────

    describe('6. validate', function () {

        it('should validate a properly signed repository', async function () {
            const repoDir = await createTestRepo('validate-pass')

            await writeFile(join(repoDir, 'README.md'), '# Test\n')

            await dco.signAndCommit({
                repoDir,
                message: 'Signed commit',
                autoAgree: true,
            })

            const result = await dco.validate({ repoDir })
            console.log('[TEST] Validation result:', JSON.stringify({
                valid: result.valid,
                exitCode: result.exitCode,
                stdoutLength: result.stdout?.length || 0,
                stderrLength: result.stderr?.length || 0,
                stdoutPreview: result.stdout?.substring(0, 200),
                stderrPreview: result.stderr?.substring(0, 200)
            }, null, 2))
            expect(result.valid).toBe(true)
        })

        it('should fail validation for unsigned commits', async function () {
            const repoDir = await createTestRepo('validate-fail')

            // Create a commit WITHOUT --signoff
            await writeFile(join(repoDir, 'README.md'), '# Test\n')
            await $`git add -A`.cwd(repoDir).quiet()
            await $`git commit -m "Unsigned commit"`.cwd(repoDir).quiet()

            const result = await dco.validate({ repoDir })
            expect(result.valid).toBe(false)
        })
    })

    // ──────────────────────────────────────────────────────────────
    // 7. Re-sign (idempotent)
    // ──────────────────────────────────────────────────────────────

    describe('7. Re-sign idempotent', function () {

        it('should not create additional commits on re-sign', async function () {
            const repoDir = await createTestRepo('re-sign')

            // First sign
            await dco.sign({ repoDir, autoAgree: true })
            const countAfterFirst = await $`git rev-list --count HEAD`.cwd(repoDir).quiet()

            // Second sign (should be idempotent)
            await dco.sign({ repoDir, autoAgree: true })
            const countAfterSecond = await $`git rev-list --count HEAD`.cwd(repoDir).quiet()

            expect(countAfterSecond.text().trim()).toBe(countAfterFirst.text().trim())
        })
    })
})
