const fs = require('node:fs');
const path = require('node:path');

const runtimeNames = [
  'msvcp140.dll',
  'msvcp140_1.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll',
];

function copyIfDifferent(sourcePath, targetPath) {
  const source = fs.statSync(sourcePath);
  const targetExists = fs.existsSync(targetPath);

  if (targetExists) {
    const target = fs.statSync(targetPath);
    // Electron keeps loaded runtime DLLs locked on Windows. Timestamps are not
    // a reliable change detector here: npm may install the exact same bytes
    // with an older mtime, which used to trigger an unnecessary locked write.
    if (
      target.size === source.size &&
      fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath))
    ) {
      return false;
    }
  }

  try {
    fs.copyFileSync(sourcePath, targetPath);
  } catch (error) {
    if (error && (error.code === 'EBUSY' || error.code === 'EPERM')) {
      const wrapped = new Error(
        `[prepare-electron-runtime] cannot update ${path.basename(targetPath)} because it is in use. ` +
        'Close every Electron/WeFlow process and run the command again.'
      );
      wrapped.code = error.code;
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
  return true;
}

function main() {
  if (process.platform !== 'win32') {
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  // Runtime DLLs are architecture-specific: an arm64 host must never load the
  // x64 vcruntime140.dll from next to its executable, which fails with
  // ERROR_BAD_EXE_FORMAT. Keep them in per-arch directories and stay silent
  // when the current arch has no DLLs to offer (matches the `${arch}` macro
  // used for the packaged win.extraFiles).
  const archDirName = `win32-${process.arch}`;
  const sourceDir = path.join(projectRoot, 'resources', 'runtime', archDirName);
  const targetDir = path.join(projectRoot, 'node_modules', 'electron', 'dist');

  if (!fs.existsSync(sourceDir)) {
    console.log(`[prepare-electron-runtime] no resources/runtime/${archDirName}, skipping`);
    return;
  }

  if (!fs.existsSync(targetDir)) {
    return;
  }

  let copiedCount = 0;

  for (const name of runtimeNames) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    if (copyIfDifferent(sourcePath, targetPath)) {
      copiedCount += 1;
    }
  }

  if (copiedCount > 0) {
    console.log(`[prepare-electron-runtime] synced ${copiedCount} runtime DLL(s) to ${targetDir}`);
  }
}

main();
