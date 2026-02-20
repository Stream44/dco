#!/usr/bin/env bun
/// <reference types="bun" />
/// <reference types="node" />

import { resolve } from 'path'
import { Command } from 'commander'
import chalk from 'chalk'
import { CapsuleSpineFactory } from "@stream44.studio/encapsulate/spine-factories/CapsuleSpineFactory.v0"
import { CapsuleSpineContract } from "@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0/Membrane.v0"

async function bootCapsule() {
    const { encapsulate, freeze, CapsulePropertyTypes, makeImportStack, hoistSnapshot } = await CapsuleSpineFactory({
        spineFilesystemRoot: resolve(import.meta.dir),
        capsuleModuleProjectionRoot: import.meta.dir,
        enableCallerStackInference: false,
        spineContracts: {
            ['#' + CapsuleSpineContract['#']]: CapsuleSpineContract
        },
    })

    const spine = await encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                dco: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/dco/caps/Dco'
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: '@stream44.studio/dco/dco'
    })

    const snapshot = await freeze()
    const { run } = await hoistSnapshot({ snapshot })

    return { spine, run }
}

const program = new Command()
    .name('@stream44.studio/dco')
    .description('Developer Certificate of Origin (DCO) CLI')
    .version('0.3.0')

program
    .command('commit')
    .description('Sign the DCO and commit (default)')
    .option('--signing-key <path>', 'SSH key for cryptographic signing')
    .option('--yes-signoff', 'Auto-agree to DCO terms')
    .allowUnknownOption()
    .argument('[gitArgs...]', 'Additional arguments passed through to git commit (e.g. -m "message")')
    .action(async (gitArgs: string[], opts) => {
        const repoDir = resolve(process.cwd())

        const { spine, run } = await bootCapsule()

        await run({}, async ({ apis }: any) => {
            const dco = apis[spine.capsuleSourceLineRef].dco

            const result = await dco.sign({
                repoDir,
                autoAgree: opts.yesSignoff || false,
                signingKeyPath: opts.signingKey ? resolve(opts.signingKey) : undefined,
                gitArgs: gitArgs.length > 0 ? gitArgs : undefined,
            })

            if (!result.alreadySigned) {
                console.log()
                console.log(chalk.green('✓ DCO signed successfully'))
            }
        })
    })

program
    .command('validate')
    .description('Validate DCO signatures on commits')
    .option('--verbose', 'Show detailed output')
    .option('--enforce-signature-fingerprints', 'Require SSH signature fingerprints')
    .argument('[baseBranch]', 'Base branch for validation')
    .argument('[headRef]', 'Head ref for validation')
    .action(async (baseBranch, headRef, opts) => {
        const repoDir = resolve(process.cwd())

        const { spine, run } = await bootCapsule()

        await run({}, async ({ apis }: any) => {
            const dco = apis[spine.capsuleSourceLineRef].dco

            const result = await dco.validate({
                repoDir,
                baseBranch: baseBranch || undefined,
                headRef: headRef || undefined,
            })

            if (result.valid) {
                console.log(chalk.green('✓ DCO validation passed'))
            } else {
                console.log(chalk.red('✗ DCO validation failed'))
            }

            if (opts.verbose && result.stdout) {
                console.log(result.stdout)
            }
            if (result.stderr && !result.valid) {
                console.error(result.stderr)
            }

            if (!result.valid) {
                process.exit(1)
            }
        })
    })

program
    .command('status')
    .description('Check DCO signing status for the current repository')
    .action(async () => {
        const repoDir = resolve(process.cwd())

        const { spine, run } = await bootCapsule()

        await run({}, async ({ apis }: any) => {
            const dco = apis[spine.capsuleSourceLineRef].dco

            const hasDco = await dco.hasDco({ repoDir })
            if (!hasDco) {
                console.log(chalk.yellow('No DCO.md found in this repository'))
                return
            }

            console.log(chalk.green('✓ DCO.md found'))

            const signed = await dco.isSigned({ repoDir })
            if (signed.signed) {
                console.log(chalk.green('✓ DCO signed'))
                console.log(chalk.white(`  Name:  ${signed.name}`))
                console.log(chalk.white(`  Email: ${signed.email}`))
                console.log(chalk.white(`  Date:  ${signed.date}`))
            } else {
                console.log(chalk.yellow('✗ DCO not yet signed by current user'))
            }

            const sigs = await dco.getSignatures({ repoDir })
            if (sigs.found && sigs.signatures.length > 0) {
                console.log()
                console.log(chalk.blue(`Signatures (${sigs.signatures.length}):`))
                for (const sig of sigs.signatures) {
                    console.log(chalk.white(`  ${sig.name} <${sig.email}> — signed: ${sig.signedDate}`))
                }
            }
        })
    })

program
    .command('install-hook')
    .description('Install the DCO prepare-commit-msg git hook in the current repository')
    .action(async () => {
        const { writeFile, chmod, mkdir } = await import('fs/promises')
        const { existsSync } = await import('fs')
        const { join } = await import('path')

        const repoDir = resolve(process.cwd())
        const hooksDir = join(repoDir, '.git', 'hooks')
        const hookPath = join(hooksDir, 'prepare-commit-msg')

        if (!existsSync(join(repoDir, '.git'))) {
            console.error(chalk.red('Not a git repository'))
            process.exit(1)
        }

        const hookContent = '#!/usr/bin/env bash\nbunx @stream44.studio/dco commit "$@"\n'

        if (existsSync(hookPath)) {
            const { readFile } = await import('fs/promises')
            const existing = await readFile(hookPath, 'utf-8')
            if (existing === hookContent) {
                console.log(chalk.green(`✓ DCO commit hook already installed at ${hookPath}`))
                return
            }
            console.warn(chalk.yellow(`⚠ WARNING: A different hook already exists at ${hookPath}`))
            console.warn(chalk.yellow('  The DCO hook was NOT installed to avoid overwriting your existing hook.'))
            console.warn('')
            console.warn(chalk.white('  To integrate DCO signing, choose one of:'))
            console.warn('')
            console.warn(chalk.white('  A) Add to your existing hook:'))
            console.warn(chalk.cyan('       bunx @stream44.studio/dco commit "$@"'))
            console.warn('')
            console.warn(chalk.white('  B) Sign once manually (records your DCO agreement):'))
            console.warn(chalk.cyan('       bunx @stream44.studio/dco commit'))
            console.warn(chalk.white('     Then ensure your commits use --signoff and optionally --gpg-sign:'))
            console.warn(chalk.cyan('       git commit --signoff --gpg-sign -m "your message"'))
            console.warn('')
            return
        }

        await mkdir(hooksDir, { recursive: true })
        await writeFile(hookPath, hookContent, 'utf-8')
        await chmod(hookPath, 0o755)

        console.log(chalk.green(`✓ DCO commit hook installed at ${hookPath}`))
    })

program.parse(process.argv)
