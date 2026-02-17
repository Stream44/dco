#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from 't44/standalone-rt'
import { join } from 'path'

// Clear GitHub-specific env vars to isolate test repos from CI environment
// These would otherwise cause validate.sh to use the wrong commit SHAs
delete process.env.GITHUB_EVENT_NAME
delete process.env.GITHUB_BASE_REF
delete process.env.GITHUB_HEAD_SHA
delete process.env.GITHUB_BEFORE
delete process.env.GITHUB_SHA

const TEST_SH = join(import.meta.dir, '../../test.sh')

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
        capsuleName: '@stream44.studio/dco/examples/02-ShellTest'
    })
    return { spine }
}, async ({ spine, apis }: any) => {
    return apis[spine.capsuleSourceLineRef]
}, {
    importMeta: import.meta
})

// ════════════════════════════════════════════════════════════════════════
//
//  DCO Shell Test
//
//  Tests the test.sh script to ensure it runs successfully
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

describe('DCO Shell Test', function () {

    it('should run test.sh successfully', async function () {
        const result = await spawn(
            ['bash', TEST_SH],
            { cwd: import.meta.dir }
        )

        if (result.exitCode !== 0) {
            console.error('test.sh output:', result.output)
        }
        
        expect(result.exitCode).toBe(0)
        expect(result.output).toContain('All tests passed')
    })
})
