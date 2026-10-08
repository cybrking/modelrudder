import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPrivatePathSync, protectPrivatePathSync } from '../src/private-files.ts';

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
