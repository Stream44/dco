
import { join, dirname, basename } from 'path'
import { readFile, writeFile, access, mkdir, copyFile, readdir } from 'fs/promises'
import { constants, existsSync } from 'fs'
import { $ } from 'bun'


// ── Constants ────────────────────────────────────────────────────────

const DCO_FILE = 'DCO.md'
const SIGNATURES_FILE = '.dco-signatures'
const MARKER_FILE = '.git/.dco-agreed'
const GORDIAN_FILE = '.o/GordianOpenIntegrity.yaml'


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
                // selectKey — List and select an SSH ed25519 signing key
                // ══════════════════════════════════════════════════════

                selectKey: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                        autoAgree?: boolean
                    }): Promise<{ keyPath: string }> {
                        const chalk = (await import('chalk')).default
                        const homeDir = process.env.HOME_DIR || process.env.HOME || require('os').homedir()
                        const sshDir = join(homeDir, '.ssh')

                        // 1. Check .dco-signatures for existing fingerprint for this user
                        const currentEmail = (await $`git config user.email`.cwd(context.repoDir).text()).trim()
                        const sigs = await this.getSignatures({ repoDir: context.repoDir })
                        let existingFingerprint: string | undefined
                        if (sigs.found) {
                            const userSig = sigs.signatures.find((s: any) => s.email === currentEmail && s.fingerprint)
                            if (userSig?.fingerprint) {
                                existingFingerprint = userSig.fingerprint
                            }
                        }

                        // 2. List ed25519 private keys from ~/.ssh
                        let keyFiles: string[] = []
                        try {
                            const files = await readdir(sshDir)
                            for (const f of files) {
                                // Skip .pub files, known_hosts, config, authorized_keys, agent socket
                                if (f.endsWith('.pub') || f === 'known_hosts' || f === 'config' ||
                                    f === 'authorized_keys' || f === 'agent' || f.startsWith('.')) continue
                                const fullPath = join(sshDir, f)
                                try {
                                    const content = await readFile(fullPath, 'utf-8')
                                    if (content.includes('OPENSSH PRIVATE KEY')) {
                                        // Check if it's ed25519 by reading the .pub file or checking key type
                                        const pubPath = fullPath + '.pub'
                                        try {
                                            const pubContent = await readFile(pubPath, 'utf-8')
                                            if (pubContent.startsWith('ssh-ed25519')) {
                                                keyFiles.push(fullPath)
                                            }
                                        } catch {
                                            // No .pub file — try ssh-keygen to check type
                                            const result = await $`ssh-keygen -lf ${fullPath}`.quiet().nothrow()
                                            if (result.exitCode === 0 && result.text().includes('ED25519')) {
                                                keyFiles.push(fullPath)
                                            }
                                        }
                                    }
                                } catch { /* skip non-readable files */ }
                            }
                        } catch { /* ~/.ssh doesn't exist */ }

                        // 3. If existing fingerprint found, try to auto-match
                        if (existingFingerprint) {
                            for (const keyPath of keyFiles) {
                                const fpResult = await $`ssh-keygen -lf ${keyPath}`.quiet().nothrow()
                                if (fpResult.exitCode === 0) {
                                    const fp = fpResult.text().trim().split(/\s+/)[1]
                                    if (fp === existingFingerprint) {
                                        console.log(chalk.green(`✓ Auto-selected signing key matching existing signature: ${basename(keyPath)}`))
                                        return { keyPath }
                                    }
                                }
                            }
                            // Fingerprint exists but no key matches
                            console.error(chalk.red(`\nNone of the SSH keys in ${sshDir} match the fingerprint of the original signature (${existingFingerprint})`))
                            console.error(chalk.red('ABORT'))
                            process.exit(1)
                        }

                        // 4. If --yes-signoff (autoAgree), auto-create a key
                        if (context.autoAgree) {
                            if (keyFiles.length > 0) {
                                // Use first available key
                                console.log(chalk.green(`✓ Auto-selected signing key: ${basename(keyFiles[0])}`))
                                return { keyPath: keyFiles[0] }
                            }
                            // Create a new key
                            const keyName = 'dco_signing_ed25519'
                            const keyPath = join(sshDir, keyName)
                            await mkdir(sshDir, { recursive: true })
                            const keygen = Bun.spawn(['ssh-keygen', '-t', 'ed25519', '-f', keyPath, '-N', '', '-C', 'dco_signing', '-q'], { stdout: 'pipe', stderr: 'pipe' })
                            await keygen.exited
                            console.log(chalk.green(`✓ Created new signing key: ${keyName}`))
                            return { keyPath }
                        }

                        // 5. Interactive: present list of keys
                        const inquirer = await import('inquirer')

                        const choices: Array<{ name: string; value: any }> = []
                        for (const keyPath of keyFiles) {
                            const fpResult = await $`ssh-keygen -lf ${keyPath}`.quiet().nothrow()
                            const fp = fpResult.exitCode === 0 ? fpResult.text().trim().split(/\s+/)[1] : ''
                            choices.push({
                                name: `${basename(keyPath)}  ${chalk.gray(fp)}`,
                                value: { type: 'existing', keyPath }
                            })
                        }
                        choices.push({
                            name: chalk.yellow('+ Create a new ed25519 signing key'),
                            value: { type: 'create' }
                        })

                        const selected = await inquirer.default.prompt([{
                            type: 'list',
                            name: 'value',
                            message: 'Select an SSH signing key for Developer Certificate of Origin (DCO):',
                            choices,
                            pageSize: 15
                        }])

                        if (selected.value.type === 'existing') {
                            return { keyPath: selected.value.keyPath }
                        }

                        // Create new key
                        const { value: keyName } = await inquirer.default.prompt([{
                            type: 'input',
                            name: 'value',
                            message: 'Enter a name for the new signing key:',
                            default: 'dco_signing_ed25519',
                            validate: (input: string) => {
                                if (!input || input.trim().length === 0) return 'Key name cannot be empty'
                                if (!/^[a-zA-Z0-9_-]+$/.test(input)) return 'Key name can only contain letters, numbers, underscores, and hyphens'
                                return true
                            }
                        }])

                        const newKeyPath = join(sshDir, keyName)
                        await mkdir(sshDir, { recursive: true })
                        const keygen = Bun.spawn(['ssh-keygen', '-t', 'ed25519', '-f', newKeyPath, '-N', '', '-C', 'dco_signing', '-q'], { stdout: 'pipe', stderr: 'pipe' })
                        await keygen.exited
                        console.log(chalk.green(`✓ Created new signing key: ${keyName}`))
                        return { keyPath: newKeyPath }
                    }
                },

                // ══════════════════════════════════════════════════════
                // sign — Run the DCO signing process
                // ══════════════════════════════════════════════════════

                sign: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                        autoAgree?: boolean
                        signingKeyPath?: string
                        gitArgs?: string[]
                    }) {
                        const { repoDir, autoAgree } = context

                        // Verify DCO.md exists
                        const dcoPath = join(repoDir, DCO_FILE)
                        try {
                            await access(dcoPath, constants.F_OK)
                        } catch {
                            throw new Error(`DCO.md not found in ${repoDir}`)
                        }

                        // Check for .o/GordianOpenIntegrity.yaml — if present, signing key is required
                        let signingKeyPath = context.signingKeyPath
                        const gordianPath = join(repoDir, GORDIAN_FILE)
                        const hasGordian = existsSync(gordianPath)
                        if (hasGordian && !signingKeyPath) {
                            const result = await this.selectKey({ repoDir, autoAgree })
                            signingKeyPath = result.keyPath
                        }

                        // Resolve commit.sh from this package
                        const packageDir = dirname(dirname(this['#@stream44.studio/encapsulate/structs/Capsule'].moduleFilepath))
                        const dcoScript = join(packageDir, 'dco.sh')

                        const args = ['bash', dcoScript, 'commit']
                        if (autoAgree) {
                            args.push('--yes-signoff')
                        }
                        if (signingKeyPath) {
                            args.push('--signing-key', signingKeyPath)
                        }
                        if (context.gitArgs && context.gitArgs.length > 0) {
                            args.push(...context.gitArgs)
                        }

                        // Create clean env without GitHub vars for test isolation
                        const env = { ...process.env }
                        delete env.GITHUB_EVENT_NAME
                        delete env.GITHUB_BASE_REF
                        delete env.GITHUB_HEAD_SHA
                        delete env.GITHUB_BEFORE
                        delete env.GITHUB_SHA

                        const proc = Bun.spawn(args, {
                            cwd: repoDir,
                            stdin: autoAgree ? 'pipe' : 'inherit',
                            stdout: 'pipe',
                            stderr: 'pipe',
                            env,
                        })

                        const chunks: Uint8Array[] = []
                        const errChunks: Uint8Array[] = []

                        const stdoutReader = proc.stdout.getReader()
                        const stderrReader = proc.stderr.getReader()

                        await Promise.all([
                            (async () => {
                                while (true) {
                                    const { done, value } = await stdoutReader.read()
                                    if (done) break
                                    chunks.push(value)
                                    process.stdout.write(value)
                                }
                            })(),
                            (async () => {
                                while (true) {
                                    const { done, value } = await stderrReader.read()
                                    if (done) break
                                    errChunks.push(value)
                                    process.stderr.write(value)
                                }
                            })(),
                        ])

                        const exitCode = await proc.exited
                        const output = Buffer.concat(chunks).toString()
                        const errOutput = Buffer.concat(errChunks).toString()
                        const combined = output + errOutput

                        // git commit exits 1 when there is nothing to commit — treat as success
                        const nothingToCommit = combined.includes('nothing to commit') || combined.includes('working tree clean')
                        if (exitCode !== 0 && !nothingToCommit) {
                            throw new Error(`DCO signing failed with exit code ${exitCode}`)
                        }

                        const alreadySigned = output.includes('DCO Already Signed')
                        return { signed: true, alreadySigned }
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
                        const capsuleStruct = this['#@stream44.studio/encapsulate/structs/Capsule']
                        const packageDir = dirname(dirname(capsuleStruct.moduleFilepath))

                        const dcoScript = join(packageDir, 'dco.sh')
                        const args = ['bash', dcoScript, 'validate']
                        if (context.baseBranch) args.push(context.baseBranch)
                        if (context.headRef) args.push(context.headRef)

                        const env = { ...process.env }
                        delete env.GITHUB_EVENT_NAME
                        delete env.GITHUB_BASE_REF
                        delete env.GITHUB_HEAD_SHA
                        delete env.GITHUB_BEFORE
                        delete env.GITHUB_SHA

                        const proc = Bun.spawn(args, {
                            cwd: context.repoDir,
                            stdout: 'pipe',
                            stderr: 'pipe',
                            env,
                        })
                        const exitCode = await proc.exited
                        const stdout = await new Response(proc.stdout).text()
                        const stderr = await new Response(proc.stderr).text()

                        return {
                            valid: exitCode === 0,
                            exitCode,
                            stdout,
                            stderr,
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
                                fingerprint: string
                            }> = []

                            for (const line of content.split('\n')) {
                                // Skip empty lines, comments, headers, separator
                                if (!line.trim()) continue
                                if (line.startsWith('#')) continue
                                if (line.startsWith('---')) continue
                                if (line.startsWith('This ')) continue
                                if (line.startsWith('Each ')) continue
                                if (line.startsWith('Format:')) continue

                                // Parse: name <email> | signed: <date> | agreement: <commit> (<date>) [| signature: <fingerprint>]
                                const nameMatch = line.match(/^(.+?)\s*<(.+?)>/)
                                const signedMatch = line.match(/\|\s*signed:\s*(.+?)\s*\|/)
                                const agreementMatch = line.match(/\|\s*agreement:\s*([a-f0-9]+)\s*\((.+?)\)/)
                                const fingerprintMatch = line.match(/\|\s*signature:\s*(\S+)/)

                                if (nameMatch) {
                                    signatures.push({
                                        name: nameMatch[1].trim(),
                                        email: nameMatch[2].trim(),
                                        signedDate: signedMatch?.[1]?.trim() || '',
                                        agreementCommit: agreementMatch?.[1]?.trim() || '',
                                        agreementChangeDate: agreementMatch?.[2]?.trim() || '',
                                        fingerprint: fingerprintMatch?.[1]?.trim() || '',
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
                // push — Combine unsigned branch commits into a signed
                //         commit and push to remote
                // ══════════════════════════════════════════════════════

                push: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, context: {
                        repoDir: string
                        autoAgree?: boolean
                        signingKeyPath?: string
                        pushArgs?: string[]
                        message?: string
                    }) {
                        const { repoDir } = context

                        // 1. Verify we are on a branch (not main/master)
                        const branch = (await $`git rev-parse --abbrev-ref HEAD`.cwd(repoDir).text()).trim()
                        if (branch === 'main' || branch === 'master') {
                            throw new Error(`Cannot push from '${branch}'. Switch to a feature branch first.`)
                        }

                        // 2. Verify no pending uncommitted changes
                        const status = (await $`git status --porcelain`.cwd(repoDir).text()).trim()
                        if (status.length > 0) {
                            throw new Error('Working directory has uncommitted changes. Commit or stash them first.')
                        }

                        // 3. Find the last commit with Signed-off-by, walking back from HEAD
                        const logOutput = (await $`git log --format=%H%n%B%n---END---`.cwd(repoDir).text()).trim()
                        const entries = logOutput.split('---END---').filter((e: string) => e.trim())

                        let lastSignedHash: string | null = null
                        let unsignedCount = 0

                        for (const entry of entries) {
                            const lines = entry.trim().split('\n')
                            const hash = lines[0].trim()
                            const body = lines.slice(1).join('\n')
                            if (body.includes('Signed-off-by:')) {
                                lastSignedHash = hash
                                break
                            }
                            unsignedCount++
                        }

                        if (unsignedCount === 0) {
                            // All commits are already signed — just push
                            const pushArgs = context.pushArgs || []
                            await $`git push -u origin HEAD ${pushArgs}`.cwd(repoDir)
                            return { pushed: true, squashed: false, unsignedCount: 0 }
                        }

                        // 4. Collect commit messages from unsigned commits for the squashed message
                        const unsignedMessages: string[] = []
                        for (let i = 0; i < unsignedCount; i++) {
                            const lines = entries[i].trim().split('\n')
                            const msgLines = lines.slice(1).filter((l: string) => l.trim())
                            unsignedMessages.push(msgLines.join('\n'))
                        }

                        // Build the squashed commit message (reverse to chronological order)
                        unsignedMessages.reverse()
                        const squashMessage = context.message || (
                            unsignedCount === 1
                                ? unsignedMessages[0]
                                : unsignedMessages.map((m: string, i: number) => `${i + 1}. ${m.split('\n')[0]}`).join('\n')
                        )

                        // 5. Soft-reset to the last signed commit (or to root if none found)
                        if (lastSignedHash) {
                            await $`git reset --soft ${lastSignedHash}`.cwd(repoDir)
                        } else {
                            // No signed commits at all — reset to the very beginning
                            // Use --soft to keep all changes staged
                            await $`git update-ref -d HEAD`.cwd(repoDir)
                        }

                        // 6. Run DCO commit with all the staged changes
                        await this.sign({
                            repoDir,
                            autoAgree: context.autoAgree,
                            signingKeyPath: context.signingKeyPath,
                            gitArgs: ['-m', squashMessage],
                        })

                        // 7. Push to remote
                        const pushArgs = context.pushArgs || []
                        await $`git push -u origin HEAD ${pushArgs}`.cwd(repoDir)

                        return { pushed: true, squashed: true, unsignedCount }
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
