import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync } from 'node:fs';

// Paths travel through an environment variable, never PowerShell source or a shell command.
const aclPrelude = `
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security') -ErrorAction Stop
$path = $env:MODEL_RUDDER_ACL_PATH
$item = Get-Item -LiteralPath $path -Force
if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Reparse point' }
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl = Get-Acl -LiteralPath $path
`;
const protectAcl = `${aclPrelude}
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in $acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])) { [void]$acl.RemoveAccessRuleSpecific($rule) }
$inheritance = [Security.AccessControl.InheritanceFlags]::None
if ($item.PSIsContainer) { $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' }
$rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, [Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
$acl.AddAccessRule($rule)
$acl.SetOwner($sid)
Set-Acl -LiteralPath $path -AclObject $acl
`;
const checkAcl = `${aclPrelude}
$allowed = @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { Write-Output 'false'; exit }
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
    $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($allowed -notcontains $ruleSid) { Write-Output 'false'; exit }
  }
}
Write-Output 'true'
`;
function aclCommand(script: string, path: string): string {
  return execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
    env: { ...process.env, MODEL_RUDDER_ACL_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function matchingPath(path: string, directory: boolean): boolean {
  const info = lstatSync(path);
  return !info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile());
}
/** Only use on application-owned paths: replaces Windows ACLs with current-user access. */
export function protectPrivatePathSync(path: string, directory = false): void {
  if (!matchingPath(path, directory)) throw new Error('Private storage must be a real file or directory.');
  if (process.platform !== 'win32') { chmodSync(path, directory ? 0o700 : 0o600); return; }
  try {
    aclCommand(protectAcl, path);
    if (aclCommand(checkAcl, path) !== 'true') throw new Error('Verification failed');
  } catch (cause) { throw new Error('Unable to enforce private Windows storage permissions.', { cause }); }
}
/** Always reads permissions again; failures, unrecognized identities and reparse points fail closed. */
export function isPrivatePathSync(path: string, directory = false): boolean {
  try {
    if (!matchingPath(path, directory)) return false;
    return process.platform === 'win32'
      ? aclCommand(checkAcl, path) === 'true'
      : (lstatSync(path).mode & 0o077) === 0;
  } catch { return false; }
}
