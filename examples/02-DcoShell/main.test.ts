#!/usr/bin/env bun test

import * as bunTest from 'bun:test'
import { run } from '@stream44.studio/t44/standalone-rt'
import { join } from 'path'

const TEST_SH = join(import.meta.dir, 'test.sh')

const {
    test: { describe, it, expect, workbenchDir },
} = await run(async ({ encapsulate, CapsulePropertyTypes, makeImportStack }: any) => {
    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                test: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectTest',
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
        capsuleName: '@stream44.studio/dco/examples/02-DcoShell'
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
    // Clear GitHub-specific env vars to isolate test repos from CI environment
    const env = { ...process.env, ...opts.env }
    delete env.GITHUB_EVENT_NAME
    delete env.GITHUB_BASE_REF
    delete env.GITHUB_HEAD_SHA
    delete env.GITHUB_BEFORE
    delete env.GITHUB_SHA

    const proc = Bun.spawn(args, {
        cwd: opts.cwd,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
        env,
    })
    const exitCode = await proc.exited
    return { exitCode }
}

describe('DCO Shell Test', function () {

    it('should run test.sh successfully', async function () {
        const result = await spawn(
            ['bash', TEST_SH],
            { cwd: import.meta.dir }
        )

        expect(result.exitCode).toBe(0)
    })
})
