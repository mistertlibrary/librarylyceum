# =====================================================================
#  LIBRARY LYCEUM — REMOVE THE STRAY NESTED ISSUES FOLDER
#
#  On 3 September the composer wrote the first edition of Knightly Muse
#  to newsletter\issues\issues\ instead of newsletter\issues\ — one
#  directory too deep, because the folder picker had been aimed at
#  newsletter\issues rather than newsletter. The issue has since been
#  copied to the right place. This removes what is left behind.
#
#  IT VERIFIES BEFORE IT DELETES. Every file in the stray folder is
#  hashed and compared with its twin in the kept location. If a single
#  file is missing a twin, or differs from it by one byte, nothing is
#  deleted and the script says which file. A duplicate is safe to remove;
#  anything else is not, and this cannot tell the difference by looking
#  at names alone.
#
#  HOW TO RUN IT
#    Open PowerShell, change to the repository root, then either
#      . .\build\Remove-StrayIssues.ps1     (if script files are permitted)
#    or — and this always works — select this entire file, copy it, and
#    paste it into the PowerShell window. Execution policy governs script
#    *files*; commands pasted at the prompt are not affected by it.
#
#  Works in Windows PowerShell 5.1 and in PowerShell 7.
# =====================================================================

$LyceumRoot  = (Get-Location).Path
$LyceumStray = Join-Path $LyceumRoot 'newsletter\issues\issues'
$LyceumKept  = Join-Path $LyceumRoot 'newsletter\issues'

Write-Host ''

# --- Are we where we think we are? -----------------------------------
if (-not (Test-Path (Join-Path $LyceumRoot '.nojekyll'))) {
    Write-Host '  This does not look like the librarylyceum repository root.' -ForegroundColor Yellow
    Write-Host ('  Looked in: {0}' -f $LyceumRoot) -ForegroundColor DarkGray
    Write-Host '  Change to the folder containing .nojekyll and run it again.' -ForegroundColor Yellow
    return
}

if (-not (Test-Path $LyceumStray)) {
    Write-Host '  Nothing to do — newsletter\issues\issues\ does not exist.' -ForegroundColor Green
    Write-Host ''
    return
}

# --- Compare every file with its twin --------------------------------
$LyceumFiles    = @(Get-ChildItem -Path $LyceumStray -Recurse -File)
$LyceumMatched  = @()
$LyceumProblems = @()

foreach ($file in $LyceumFiles) {
    $relative = $file.FullName.Substring($LyceumStray.Length).TrimStart('\', '/')
    $twin     = Join-Path $LyceumKept $relative

    if (-not (Test-Path $twin)) {
        $LyceumProblems += [pscustomobject]@{ File = $relative; Why = 'no twin in the kept folder' }
        continue
    }

    $a = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash
    $b = (Get-FileHash -Path $twin          -Algorithm SHA256).Hash

    if ($a -ne $b) {
        $LyceumProblems += [pscustomobject]@{ File = $relative; Why = 'twin differs' }
    } else {
        $LyceumMatched += $relative
    }
}

Write-Host ('  {0} file(s) in newsletter\issues\issues\' -f $LyceumFiles.Count)

if ($LyceumProblems.Count -gt 0) {
    Write-Host ''
    Write-Host '  NOT DELETING. These are not duplicates:' -ForegroundColor Red
    foreach ($p in $LyceumProblems) {
        Write-Host ('    {0,-52} {1}' -f $p.File, $p.Why) -ForegroundColor Red
    }
    Write-Host ''
    Write-Host '  Look at those files before removing anything.' -ForegroundColor Yellow
    Write-Host ''
    return
}

foreach ($m in $LyceumMatched) {
    Write-Host ('    {0,-52} identical twin kept' -f $m) -ForegroundColor DarkGray
}

Write-Host ''
Write-Host ('  All {0} verified as exact duplicates of files in newsletter\issues\.' -f $LyceumMatched.Count) -ForegroundColor Green
Write-Host ''

# --- Ask, then delete ------------------------------------------------
$LyceumAnswer = Read-Host '  Delete newsletter\issues\issues\ and everything in it? (yes/no)'

if ($LyceumAnswer -ne 'yes') {
    Write-Host '  Left alone.' -ForegroundColor Yellow
    Write-Host ''
    return
}

try {
    Remove-Item -Path $LyceumStray -Recurse -Force -ErrorAction Stop
}
catch {
    Write-Host ('  Could not remove it: {0}' -f $_.Exception.Message) -ForegroundColor Red
    Write-Host '  Close anything that has those files open and try again.' -ForegroundColor Yellow
    Write-Host ''
    return
}

if (Test-Path $LyceumStray) {
    Write-Host '  It is still there. Something is holding it open.' -ForegroundColor Red
} else {
    Write-Host '  Gone.' -ForegroundColor Green
    Write-Host '  Your issue remains at newsletter\issues\welcome-back-2026\.' -ForegroundColor DarkGray
    Write-Host '  Commit the deletion in GitHub Desktop along with everything else.' -ForegroundColor DarkGray
}
Write-Host ''
