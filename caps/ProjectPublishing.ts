
import { join, dirname } from 'path'
import { access, copyFile } from 'fs/promises'
import { constants } from 'fs'
import chalk from 'chalk'

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {
                tags: {
                    type: CapsulePropertyTypes.Constant,
                    value: ['git'],
                },
                Dco: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/dco/caps/Dco'
                },
                SigningKey: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/SigningKey'
                },
                ProjectRepository: {
                    type: CapsulePropertyTypes.Mapping,
                    value: '@stream44.studio/t44/caps/ProjectRepository'
                },
                validateSource: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: { config: any, ctx: any }) {
                        const sourceDir = ctx.repoConfig.sourceDir
                        const destPath = join(sourceDir, 'DCO.md')
                        try {
                            await access(destPath, constants.F_OK)
                        } catch {
                            // DCO.md missing — copy from own package
                            const packageRoot = dirname(dirname(this['#@stream44.studio/encapsulate/structs/Capsule'].moduleFilepath))
                            const srcPath = join(packageRoot, 'DCO.md')
                            await copyFile(srcPath, destPath)
                            console.log(`  [DCO] Copied DCO.md to ${destPath}`)
                        }
                    }
                },
                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, { config, ctx }: { config: any, ctx: any }) {
                        const gitMeta = ctx.metadata['@stream44.studio/t44/caps/patterns/git-scm.com/ProjectPublishing']
                        if (!gitMeta?.stageDir) return

                        const stageDir = gitMeta.stageDir
                        const projectSourceDir = ctx.repoConfig.sourceDir

                        // Skip if dangerouslyResetMain was handled by blockchaincommons (OI did its own DCO)
                        const oiMeta = ctx.metadata['@stream44.studio/t44-blockchaincommons.com/caps/ProjectPublishing']
                        if (oiMeta?.handledResetPush) {
                            // OI reset already handled DCO signing during its inception flow
                            // But we still need to copy .dco-signatures back
                            const stageSigFile = join(stageDir, '.dco-signatures')
                            try {
                                await access(stageSigFile, constants.F_OK)
                                if (projectSourceDir) {
                                    await copyFile(stageSigFile, join(projectSourceDir, '.dco-signatures'))
                                }
                            } catch { }
                            return
                        }

                        // Skip if dangerouslyResetMain without OI (git-scm handles squash)
                        if (ctx.options.dangerouslyResetMain) return

                        // Check if there are new changes to commit
                        const hasNewChanges = await this.ProjectRepository.addAll({ rootDir: stageDir })
                        if (!hasNewChanges) {
                            // Store that we didn't commit (git-scm needs to know)
                            ctx.metadata[capsule['#']] = { committed: false, hasNewChanges: false }
                            return
                        }

                        // Check if DCO.md exists in the stage dir
                        const hasDco = await this.Dco.hasDco({ repoDir: stageDir })

                        if (hasDco) {
                            console.log(chalk.cyan(`DCO.md detected — running DCO signing process ...`))

                            // Resolve signing key from workspace SigningKey capsule
                            let signingKeyPath: string | undefined
                            const skPath = await this.SigningKey.getKeyPath()
                            if (skPath) {
                                signingKeyPath = skPath
                            }

                            await this.Dco.signAndCommit({
                                repoDir: stageDir,
                                message: 'Published using @Stream44 Studio',
                                autoAgree: ctx.options.yesSignoff,
                                signingKeyPath,
                                projectSourceDir,
                            })

                            ctx.metadata[capsule['#']] = { committed: true, hasNewChanges: true, usedDco: true }
                        } else {
                            // No DCO — just commit normally
                            await this.ProjectRepository.commit({
                                rootDir: stageDir,
                                message: 'Published using @Stream44 Studio'
                            })

                            ctx.metadata[capsule['#']] = { committed: true, hasNewChanges: true, usedDco: false }
                        }

                        console.log(`New changes committed`)
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = '@stream44.studio/dco/caps/ProjectPublishing'
