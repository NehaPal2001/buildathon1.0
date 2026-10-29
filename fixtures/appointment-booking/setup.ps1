<#
.SYNOPSIS
  Materialise the appointment-booking fixture as a git repo: main plus two
  independent feature branches.

.DESCRIPTION
  Windows/PowerShell port of setup.sh. Same three branches, same commit
  messages. /cover reads a feature branch's commit message as the claim when no
  --ticket is passed, so the wording must not drift from setup.sh.

  node_modules and test-results are not copied (gitignored, and a copied
  node_modules holds the wrong OS's binaries). robocopy is used instead of
  Copy-Item because Copy-Item -Recurse nests onto an existing directory.

.PARAMETER Target
  Directory to create the repo in. Deleted first if it already exists.

.EXAMPLE
  .\fixtures\appointment-booking\setup.ps1 "$env:TEMP\booking-demo"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Target
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

# robocopy: 0-7 is success, 8+ is failure.
function Copy-Tree {
  param([string]$Source, [string]$Destination)
  $null = robocopy $Source $Destination /E /NFL /NDL /NJH /NJS /NP /XD node_modules test-results playwright-report
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy '$Source' -> '$Destination' failed with exit code $LASTEXITCODE"
  }
  $global:LASTEXITCODE = 0
}

$full = [System.IO.Path]::GetFullPath($Target)

# This script deletes $full outright. Refuse paths where a typo would do damage.
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

Copy-Tree -Source (Join-Path $here 'base') -Destination $full

Push-Location $full
try {
  Invoke-Git init -q -b main
  Invoke-Git add -A
  Invoke-Git -c user.name=demo -c user.email=demo@example.com `
    commit -q -m "Clinic booking: services, providers, booking, appointments, account"

  # Both branches start from this same main commit; neither contains the other.
  Invoke-Git checkout -q -b feature/BOOK-101-reschedule-cancel
  Copy-Tree -Source (Join-Path $here 'feature-reschedule') -Destination $full
  Invoke-Git add -A
  $body101 = @'
BOOK-101. Patients can move an appointment to another slot, once, up to 24
hours before it starts. Cancelling less than 24 hours before the appointment
shows a flat fee notice. If the new slot is taken, an error is shown.
'@
  Invoke-Git -c user.name=demo -c user.email=demo@example.com `
    commit -q -m "Add reschedule and late-cancellation fee: reschedule once, up to 24h before" -m $body101
  Invoke-Git checkout -q main

  Invoke-Git checkout -q -b feature/BOOK-102-recurring
  Copy-Tree -Source (Join-Path $here 'feature-recurring') -Destination $full
  Invoke-Git add -A
  $body102 = @'
BOOK-102. Patients can book the same provider weekly for 2 to 8 weeks. If any
occurrence is unavailable the whole booking fails and the conflicting date is
shown.
'@
  Invoke-Git -c user.name=demo -c user.email=demo@example.com `
    commit -q -m "Add recurring weekly appointments: 2 to 8 occurrences, all or nothing" -m $body102
  Invoke-Git checkout -q main
}
finally {
  Pop-Location
}

Write-Output "$full ready: branches main, feature/BOOK-101-reschedule-cancel, feature/BOOK-102-recurring (main checked out)"
Write-Output "next: cd $full; npm install; npx playwright install chromium; npx playwright test"
