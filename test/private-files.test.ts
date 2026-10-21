import test from 'node:test';
import childProcess, { execFileSync, type ChildProcess, type ExecFileException, type ExecFileOptionsWithStringEncoding } from 'node:child_process';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPrivatePath, isPrivatePathSync, protectPrivatePath, protectPrivatePathSync } from '../src/private-files.ts';

test('canceled asynchronous privacy checks fail closed before filesystem mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-private-cancel-'));
  const controller = new AbortController(); controller.abort();
  try {
    const path = join(root, 'missing');
    assert.equal(await isPrivatePath(path, false, controller.signal), false);
    await assert.rejects(protectPrivatePath(path, false, controller.signal), { name: 'AbortError' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

async function within<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

for (const operation of ['check', 'protect'] as const) {
  test(`Windows asynchronous privacy ${operation} cancels an active ACL child promptly`, {
    skip: process.platform !== 'win32', timeout: 25_000,
  }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'router-active-acl-cancel-'));
    const path = join(root, 'fixture');
    const controller = new AbortController();
    const originalExecFile = childProcess.execFile;
    let markReady!: () => void;
    let failReady!: (reason: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => { markReady = resolve; failReady = reject; });
    let child: ChildProcess | undefined;
    let closed: Promise<void> | undefined;
    let settled = false;
    // Replace only the ACL payload, not the executable, options, signal or callback.
    // This real PowerShell process stays alive without reading or changing any ACL.
    const script = "[Console]::Out.WriteLine('ACL_READY'); [Console]::Out.Flush(); Start-Sleep -Seconds 60";
    childProcess.execFile = ((file: string, args: readonly string[], options: ExecFileOptionsWithStringEncoding,
      callback: (error: ExecFileException | null, stdout: string, stderr: string) => void) => {
      assert.equal(file, 'powershell.exe');
      assert.equal(args.at(-2), '-EncodedCommand');
      child = originalExecFile(file, [...args.slice(0, -1), Buffer.from(script, 'utf16le').toString('base64')], options, callback);
      closed = new Promise(resolve => child!.once('close', () => resolve()));
      let output = '';
      child.stdout!.on('data', chunk => {
        output += chunk;
        if (output.includes('ACL_READY')) markReady();
      });
      child.once('error', failReady);
      child.once('close', () => failReady(new Error('ACL child exited before readiness')));
      return child;
    }) as typeof childProcess.execFile;
    syncBuiltinESMExports();
    try {
      writeFileSync(path, 'TEST=only-a-fixture\n');
      const outcome = (operation === 'check'
        ? isPrivatePath(path, false, controller.signal)
        : protectPrivatePath(path, false, controller.signal)).then(
        value => { settled = true; return { status: 'fulfilled' as const, value }; },
        reason => { settled = true; return { status: 'rejected' as const, reason }; },
      );
      assert.ok(child, 'The ACL command must start before cancellation');
      assert.ok(closed);
      // Startup plus cancellation bounds stay below the production 15-second timeout.
      await within(ready, 8_000, 'PowerShell ACL fixture did not become ready');
      assert.equal(settled, false);
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, null);
      const completion = within(Promise.all([outcome, closed]), 3_000, 'Cancellation did not settle and close the active ACL child promptly');
      controller.abort();
      const [result] = await completion;
      if (operation === 'check') {
        assert.deepEqual(result, { status: 'fulfilled', value: false });
      } else {
        assert.equal(result.status, 'rejected');
        if (result.status === 'rejected') assert.equal(result.reason?.name, 'AbortError');
      }
    } finally {
      childProcess.execFile = originalExecFile;
      syncBuiltinESMExports();
      try {
        // Also reap the fixture if an assertion fails or signal forwarding regresses.
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        if (closed) await within(closed, 5_000, 'PowerShell ACL fixture did not close during cleanup');
      } finally { rmSync(root, { recursive: true, force: true }); }
    }
  });
}

test('private storage verifies ownership permissions and refuses wrong types or aliases', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-private-'));
  try {
    const directory = join(root, 'private directory');
    mkdirSync(directory);
    protectPrivatePathSync(directory, true);
    assert.equal(isPrivatePathSync(directory, true), true);
    assert.equal(isPrivatePathSync(directory), false);
    const file = join(directory, "env 'quoted' & literal");
    writeFileSync(file, 'TEST=only-a-fixture\n');
    protectPrivatePathSync(file);
    assert.equal(isPrivatePathSync(file), true);
    assert.equal(isPrivatePathSync(file, true), false);
    assert.equal(isPrivatePathSync(join(root, 'missing')), false);
    assert.throws(() => protectPrivatePathSync(directory), /real file or directory/);
    const alias = join(root, 'alias');
    symlinkSync(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(isPrivatePathSync(alias, true), false);
    assert.throws(() => protectPrivatePathSync(alias, true), /real file or directory/);
    if (process.platform !== 'win32') {
      chmodSync(file, 0o644);
      assert.equal(isPrivatePathSync(file), false);
      protectPrivatePathSync(file);
      assert.equal(isPrivatePathSync(file), true);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('Windows private storage rejects explicit access for Everyone and repairs it', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'router-acl-'));
  try {
    const file = join(root, 'env');
    writeFileSync(file, 'TEST=fixture\n');
    protectPrivatePathSync(file);
    const script = `$ErrorActionPreference = 'Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security') -ErrorAction Stop; $path = $env:MODEL_RUDDER_ACL_PATH; $acl = Get-Acl -LiteralPath $path; $sid = [Security.Principal.SecurityIdentifier]::new('S-1-1-0'); $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::Read, [Security.AccessControl.AccessControlType]::Allow); $acl.AddAccessRule($rule); Set-Acl -LiteralPath $path -AclObject $acl`;
    execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env: { ...process.env, MODEL_RUDDER_ACL_PATH: file }, stdio: 'pipe', timeout: 15_000, windowsHide: true });
    assert.equal(isPrivatePathSync(file), false);
    protectPrivatePathSync(file);
    assert.equal(isPrivatePathSync(file), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

