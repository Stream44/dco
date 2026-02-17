
import { join, dirname } from 'path'
import { readFile, writeFile, access, mkdir, copyFile } from 'fs/promises'
import { constants } from 'fs'
import { $ } from 'bun'


// ── Constants ────────────────────────────────────────────────────────

const DCO_FILE = 'DCO.md'
const SIGNATURES_FILE = '.dco-signatures'
const MARKER_FILE = '.git/.dco-agreed'


// ── Capsule ──────────────────────────────────────────────────────────

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

                // ══════════════════════════════════════════════════════
                // sign — Run the DCO signing process
                // ══════════════════════════════════════════════════════

                sign: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                        autoAgree?: boolean
                        signingKeyPath?: string
                    }) {
                        const { repoDir, autoAgree } = context

                        // Verify DCO.md exists
                        const dcoPath = join(repoDir, DCO_FILE)
                        try {
                            await access(dcoPath, constants.F_OK)
                        } catch {
                            throw new Error(`DCO.md not found in ${repoDir}`)
                        }

                        // Resolve commit.sh from this package
                        const packageDir = dirname(dirname(this['#@stream44.studio/encapsulate/structs/Capsule'].moduleFilepath))
                        const dcoScript = join(packageDir, 'dco.sh')

                        const args = ['bash', dcoScript, 'commit']
                        if (autoAgree) {
                            args.push('--yes-signoff')
                        }
                        if (context.signingKeyPath) {
                            args.push('--signing-key', context.signingKeyPath)
                        }

                        // Clear GitHub-specific env vars to prevent test repos from using main repo commit SHAs
                        const env = { ...process.env }
                        delete env.GITHUB_EVENT_NAME
                        delete env.GITHUB_BASE_REF
                        delete env.GITHUB_HEAD_SHA
                        delete env.GITHUB_BEFORE
                        delete env.GITHUB_SHA

                        const proc = Bun.spawn(args, {
                            cwd: repoDir,
                            stdin: autoAgree ? 'pipe' : 'inherit',
                            stdout: 'inherit',
                            stderr: 'inherit',
                            env,
                        })
                        const exitCode = await proc.exited

                        if (exitCode !== 0) {
                            throw new Error(`DCO signing failed with exit code ${exitCode}`)
                        }

                        return { signed: true }
                    }
                },

                // ══════════════════════════════════════════════════════
                // validate — Validate DCO sign-offs on commits
                // ══════════════════════════════════════════════════════

                validate: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                        baseBranch?: string
                        headRef?: string
                    }) {
                        try {
                            console.log('[DCO] === VALIDATE START ===')
                            console.log('[DCO] context.repoDir:', context.repoDir)
                            console.log('[DCO] context.baseBranch:', context.baseBranch)
                            console.log('[DCO] context.headRef:', context.headRef)

                            let packageDir: string
                            const capsuleStruct = this['#@stream44.studio/encapsulate/structs/Capsule']
                            console.log('[DCO] capsuleStruct exists:', !!capsuleStruct)
                            console.log('[DCO] moduleFilepath exists:', !!capsuleStruct?.moduleFilepath)

                            if (capsuleStruct?.moduleFilepath) {
                                packageDir = dirname(dirname(capsuleStruct.moduleFilepath))
                                console.log('[DCO] Using moduleFilepath:', capsuleStruct.moduleFilepath)
                                console.log('[DCO] Resolved packageDir:', packageDir)
                            } else {
                                // Fallback: use import.meta.url
                                console.log('[DCO] Using fallback - import.meta.url:', import.meta.url)
                                const url = new URL(import.meta.url)
                                packageDir = dirname(dirname(url.pathname))
                                console.log('[DCO] Fallback packageDir:', packageDir)
                            }

                            const dcoScript = join(packageDir, 'dco.sh')
                            console.log('[DCO] dcoScript path:', dcoScript)

                            // Check if script exists
                            try {
                                await access(dcoScript, constants.F_OK)
                                console.log('[DCO] dco.sh exists: YES')
                            } catch {
                                console.log('[DCO] dco.sh exists: NO - THIS IS THE PROBLEM!')
                            }

                            const args = ['bash', dcoScript, 'validate']
                            if (context.baseBranch) args.push(context.baseBranch)
                            if (context.headRef) args.push(context.headRef)
                            console.log('[DCO] spawn args:', args)

                            // Clear GitHub-specific env vars to prevent test repos from using main repo commit SHAs
                            const env = { ...process.env }
                            delete env.GITHUB_EVENT_NAME
                            delete env.GITHUB_BASE_REF
                            delete env.GITHUB_HEAD_SHA
                            delete env.GITHUB_BEFORE
                            delete env.GITHUB_SHA
                            console.log('[DCO] Cleared GitHub env vars for test isolation')

                            const proc = Bun.spawn(args, {
                                cwd: context.repoDir,
                                stdout: 'pipe',
                                stderr: 'pipe',
                                env,
                            })
                            const exitCode = await proc.exited
                            const stdout = await new Response(proc.stdout).text()
                            const stderr = await new Response(proc.stderr).text()

                            console.log('[DCO] exitCode:', exitCode)
                            console.log('[DCO] stdout length:', stdout.length)
                            console.log('[DCO] stderr length:', stderr.length)

                            if (exitCode !== 0) {
                                console.log('[DCO] ========== VALIDATION FAILED ==========')
                                console.log('[DCO] Exit code:', exitCode)
                                console.log('[DCO] Working directory:', context.repoDir)
                                console.log('[DCO] Script path:', dcoScript)
                                console.log('[DCO] Full stdout:')
                                console.log(stdout)
                                console.log('[DCO] Full stderr:')
                                console.log(stderr)
                                console.log('[DCO] ==========================================')
                            } else {
                                console.log('[DCO] Validation PASSED')
                            }
                            console.log('[DCO] === VALIDATE END ===')

                            return {
                                valid: exitCode === 0,
                                exitCode,
                                stdout,
                                stderr,
                            }
                        } catch (error: any) {
                            console.error('[DCO] EXCEPTION in validate:', error.message)
                            console.error('[DCO] Stack:', error.stack)
                            throw error
                        }
                    }
                },

                // ══════════════════════════════════════════════════════
                // hasDco — Check if a repository has DCO.md
                // ══════════════════════════════════════════════════════

                hasDco: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                    }) {
                        const dcoPath = join(context.repoDir, DCO_FILE)
                        try {
                            await access(dcoPath, constants.F_OK)
                            return true
                        } catch {
                            return false
                        }
                    }
                },

                // ══════════════════════════════════════════════════════
                // isSigned — Check if the current user has signed the DCO
                // ══════════════════════════════════════════════════════

                isSigned: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                    }) {
                        const markerPath = join(context.repoDir, MARKER_FILE)
                        try {
                            await access(markerPath, constants.F_OK)
                            const content = await readFile(markerPath, 'utf-8')
                            const name = content.match(/^name=(.*)$/m)?.[1] || ''
                            const email = content.match(/^email=(.*)$/m)?.[1] || ''
                            const date = content.match(/^date=(.*)$/m)?.[1] || ''
                            const agreementCommit = content.match(/^agreement_commit=(.*)$/m)?.[1] || ''
                            return {
                                signed: true,
                                name,
                                email,
                                date,
                                agreementCommit,
                            }
                        } catch {
                            return { signed: false }
                        }
                    }
                },

                // ══════════════════════════════════════════════════════
                // getSignatures — Read all signatures from .dco-signatures
                // ══════════════════════════════════════════════════════

                getSignatures: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                    }) {
                        const sigPath = join(context.repoDir, SIGNATURES_FILE)
                        try {
                            const content = await readFile(sigPath, 'utf-8')
                            const signatures: Array<{
                                name: string
                                email: string
                                signedDate: string
                                agreementCommit: string
                                agreementChangeDate: string
                            }> = []

                            for (const line of content.split('\n')) {
                                // Skip empty lines, comments, headers, separator
                                if (!line.trim()) continue
                                if (line.startsWith('#')) continue
                                if (line.startsWith('---')) continue
                                if (line.startsWith('This ')) continue
                                if (line.startsWith('Each ')) continue
                                if (line.startsWith('Format:')) continue

                                // Parse: name <email> | signed: <date> | agreement: <commit> (<date>)
                                const nameMatch = line.match(/^(.+?)\s*<(.+?)>/)
                                const signedMatch = line.match(/\|\s*signed:\s*(.+?)\s*\|/)
                                const agreementMatch = line.match(/\|\s*agreement:\s*([a-f0-9]+)\s*\((.+?)\)/)

                                if (nameMatch) {
                                    signatures.push({
                                        name: nameMatch[1].trim(),
                                        email: nameMatch[2].trim(),
                                        signedDate: signedMatch?.[1]?.trim() || '',
                                        agreementCommit: agreementMatch?.[1]?.trim() || '',
                                        agreementChangeDate: agreementMatch?.[2]?.trim() || '',
                                    })
                                }
                            }

                            return { found: true, signatures }
                        } catch {
                            return { found: false, signatures: [] }
                        }
                    }
                },

                // ══════════════════════════════════════════════════════
                // signAndCommit — Full DCO flow for publishing pipelines
                // ══════════════════════════════════════════════════════

                signAndCommit: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                        message: string
                        autoAgree?: boolean
                        signingKeyPath?: string
                        projectSourceDir?: string
                    }) {
                        const { repoDir, message } = context

                        // 1. Run DCO signing process
                        await this.sign({
                            repoDir,
                            autoAgree: context.autoAgree,
                            signingKeyPath: context.signingKeyPath,
                        })

                        // 2. Stage all files and commit with --signoff
                        await $`git add -A`.cwd(repoDir).quiet()
                        if (context.signingKeyPath) {
                            await $`git -c gpg.format=ssh -c user.signingkey=${context.signingKeyPath} commit --gpg-sign --signoff -m ${message}`.cwd(repoDir).quiet().nothrow()
                        } else {
                            await $`git commit --signoff -m ${message}`.cwd(repoDir).quiet().nothrow()
                        }

                        // 3. Copy .dco-signatures back to project source if provided
                        if (context.projectSourceDir) {
                            const stageSigFile = join(repoDir, SIGNATURES_FILE)
                            try {
                                await access(stageSigFile, constants.F_OK)
                                await copyFile(stageSigFile, join(context.projectSourceDir, SIGNATURES_FILE))
                            } catch { }
                        }

                        return { committed: true }
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
capsule['#'] = '@stream44.studio/dco/caps/Dco'
