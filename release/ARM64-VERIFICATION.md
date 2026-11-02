# ARM64 local execution verification

Result: **passed under QEMU user-mode emulation** on the local x86_64 Windows/WSL Ubuntu PC.

The actual official Node v22.23.4 `linux-arm64` executable reported `process.arch === 'arm64'`.
Its tarball SHA256 matched Node's official SHASUMS256 manifest. QEMU aarch64 10.2.1 and
the ARM64 libc/libstdc++/libgcc packages came from Ubuntu's signed package repositories.
They were extracted into task-private directories. No system installation, binfmt/kernel
interpreter registration, production deployment or production database access was needed.

## Passed

- Package builder accepted the ARM64 ELF executable and produced an ARM64 manifest.
- Runtime check verified Linux, ARM64, Node 22, web assets and tracing bootstrap.
- Version check executed under the ARM64 runtime.
- The application started using the bundled Node/tracing/application entry points.
- HTTP health readiness, frontend HTML, and its referenced built JavaScript/CSS assets passed.
- The process stopped and disposable JSON storage was cleaned up.
- Existing AMD64 smoke checks were repeated against the same updated harness.
- 21 package/release-gate unit tests passed, including rejection of incorrect runtime architectures.

## Repeating the emulated smoke check

With a prepared ARM64 bundle, QEMU executable and ARM64 library sysroot:

```sh
cd /path/to/arm64-bundle
/path/to/qemu-aarch64 -L /path/to/sysroot ./runtime/node -p 'process.arch'
/path/to/qemu-aarch64 -L /path/to/sysroot ./runtime/node ./check.cjs
KUBIQ_SMOKE_EMULATOR=/path/to/qemu-aarch64 \
KUBIQ_SMOKE_SYSROOT=/path/to/sysroot \
/path/to/host-node /path/to/repo/scripts/smoke-linux.cjs /path/to/arm64-bundle
```

Without the emulator variables, the smoke harness invokes the shipped launcher normally.
On an ARM64 Linux host the launcher runs directly; no QEMU settings ship in the bundle.

## Limits

This verifies ARM64 execution of the locally built JavaScript bundle and tracing dependency tree.
It does not claim a fresh ARM64-native dependency installation/build, execution of the complete
GitHub ZIP workflow, native ARM hardware performance, or every database/Kubernetes integration.
The release workflow's ARM64 build and smoke checks still need to pass on the final release commit.
No UI animation changes are part of this work.
