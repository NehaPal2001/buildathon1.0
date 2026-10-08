<#
.SYNOPSIS
  Materialise the demo-shop fixture as a git repo with two branches.

.DESCRIPTION
  Windows/PowerShell port of setup.sh. Produces the same two commits on the
  same two branches, with the same commit messages — /cover reads the feature
  branch's commit message as the claim when no --ticket is passed, so the
  wording here is load-bearing and must not drift from setup.sh.

  Two deliberate differences from setup.sh:

  * node_modules and test-results are NOT copied. Both are gitignored inside
    the fixture, so neither ever reaches a commit and the resulting repo is
    identical. Copying them costs 69MB, and the checked-in node_modules holds
    macOS binaries whose node_modules/.bin/tsx is a dead symlink on Windows —
    which `npx tsx` then finds and fails on, breaking the extractors.
  * Uses robocopy rather than Copy-Item, because `Copy-Item -Recurse` onto an
    existing directory of the same name nests it (target\src\src) instead of
    merging, which the feature overlay depends on.

.PARAMETER Target
  Directory to create the demo repo in. Deleted first if it already exists.

.EXAMPLE
  .\fixtures\setup.ps1 "$env:TEMP\recon-demo"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Target
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Native commands do not throw on failure and do not set $ErrorActionPreference,
# so every git call goes through here or a non-zero exit would pass silently.
function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

# robocopy reports success as 0-7 (1 = files copied, 2 = extra dirs, 3 = both);
# only 8 and above are genuine failures, so $LASTEXITCODE cannot be compared
# against 0 the way it is for git.
function Copy-Tree {
  param([string]$Source, [string]$Destination)
  $null = robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP /XD node_modules test-results
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy '$Source' -> '$Destination' failed with exit code $LASTEXITCODE"
  }
  $global:LASTEXITCODE = 0
}

$full = [System.IO.Path]::GetFullPath($Target)

# This function deletes $full outright. Refuse the paths where a mistyped or
# empty argument would do real damage rather than wipe a scratch directory.
if ($full.Length -le 3) { throw "Refusing to use a drive root as the target: $full" }
foreach ($guard in @($env:USERPROFILE, $env:SystemRoot, $env:TEMP, $here)) {
  if ($guard -and $full.TrimEnd('\') -eq $guard.TrimEnd('\')) {
    throw "Refusing to use '$full' as the target: it is a directory you did not mean to replace."
  }
}

if (Test-Path -LiteralPath $full) {
  Remove-Item -LiteralPath $full -Recurse -Force
}
$null = New-Item -ItemType Directory -Path $full -Force

Copy-Tree -Source (Join-Path $here 'demo-shop\base') -Destination $full

Push-Location $full
try {
  Invoke-Git init -q -b main
  Invoke-Git add -A
  Invoke-Git -c user.name=demo -c user.email=demo@example.com `
    commit -q -m "Shop: catalogue, search, account, cart, checkout, orders"

  Invoke-Git checkout -q -b feature/PROJ-4821
  Copy-Tree -Source (Join-Path $here 'demo-shop\feature') -Destination $full
  Invoke-Git add -A

  # Subject and body are read as the claim by /cover when --ticket is omitted.
  # Single-quoted here-string: the body must stay literal, and the closing '@
  # has to sit at column 0.
  $body = @'
PROJ-4821. Users can apply a coupon at checkout. Percentage and flat
discounts are supported. Invalid codes show an error.
'@
  Invoke-Git -c user.name=demo -c user.email=demo@example.com `
    commit -q -m "Add coupon codes: percent and flat, one coupon per order" -m $body

  Invoke-Git checkout -q main
}
finally {
  Pop-Location
}

Write-Output "$full ready: branches main, feature/PROJ-4821 (main checked out)"
Write-Output "next: cd $full; npm install; npx playwright test"
