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
    .command('sign')
    .description('Sign the DCO without committing user changes')
    .option('--signing-key <path>', 'SSH key for cryptographic signing')
    .option('--yes-signoff', 'Auto-agree to DCO terms')
    .action(async (opts) => {
        const repoDir = resolve(process.cwd())

        const { spine, run } = await bootCapsule()

        await run({}, async ({ apis }: any) => {
            const dco = apis[spine.capsuleSourceLineRef].dco

            const result = await dco.sign({
                repoDir,
                autoAgree: opts.yesSignoff || false,
                signingKeyPath: opts.signingKey ? resolve(opts.signingKey) : undefined,
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
    .command('push')
    .description('Combine unsigned branch commits into a single DCO-signed commit and push')
    .option('--signing-key <path>', 'SSH key for cryptographic signing')
    .option('--yes-signoff', 'Auto-agree to DCO terms')
    .option('-m, --message <message>', 'Override the squashed commit message')
    .option('--force', 'Force-push the branch')
    .argument('[pushArgs...]', 'Additional arguments passed through to git push')
    .action(async (pushArgs: string[], opts) => {
        const repoDir = resolve(process.cwd())

        const { spine, run } = await bootCapsule()

        await run({}, async ({ apis }: any) => {
            const dco = apis[spine.capsuleSourceLineRef].dco

            try {
                const result = await dco.push({
                    repoDir,
                    autoAgree: opts.yesSignoff || false,
                    signingKeyPath: opts.signingKey ? resolve(opts.signingKey) : undefined,
                    pushArgs: pushArgs.length > 0 ? pushArgs : undefined,
                    message: opts.message || undefined,
                    force: opts.force || false,
                })

                if (result.squashed) {
                    console.log(chalk.green(`✓ Squashed ${result.unsignedCount} unsigned commit(s) into a signed commit`))
                }
                console.log(chalk.green('✓ Pushed to remote'))
            } catch (err: any) {
                console.error(chalk.red(`✗ ${err.message}`))
                process.exit(1)
            }
        })
    })

program.parse(process.argv)
