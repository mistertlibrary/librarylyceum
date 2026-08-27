# =====================================================================
#  LIBRARY LYCEUM — LINK CHECK
#
#  Every URL in data/databases.csv and data/guides.csv, asked whether it
#  is still there. Nothing is written and nothing is installed; the
#  script only reads and reports.
#
#  HOW TO RUN IT
#    Open PowerShell, change to the repository root, then either
#      . .\build\Check-Links.ps1          (if script files are permitted)
#    or — and this always works — select this entire file, copy it, and
#    paste it into the PowerShell window. Execution policy governs script
#    *files*; commands typed or pasted at the prompt are not affected by
#    it. That is why there is no param() block below: a param() block
#    would make the file unpasteable.
#
#  RUN IT TWICE: once on the school network and once off it. EBSCO
#  profile links resolve differently on and off campus, so a link that
#  fails at home may be perfectly healthy in the building.
#
#  Works in Windows PowerShell 5.1 and in PowerShell 7.
# =====================================================================

$LyceumRoot    = (Get-Location).Path
$LyceumTimeout = 20
$LyceumAgent   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                 '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

# A note on TLS: no protocol is pinned here on purpose. Since .NET
# Framework 4.7 the default is SecurityProtocolType.SystemDefault, which
# lets Windows choose; forcing Tls12 would freeze the script out of
# TLS 1.3 and would age badly.

function Test-LyceumUrl {
    param([string]$Url)

    foreach ($method in 'Head', 'Get') {
        try {
            $res = Invoke-WebRequest -Uri $Url -Method $method -UseBasicParsing `
                       -TimeoutSec $LyceumTimeout -MaximumRedirection 10 `
                       -UserAgent $LyceumAgent -ErrorAction Stop
            return [pscustomobject]@{
                Ok = $true; Status = [int]$res.StatusCode; Note = ''
            }
        }
        catch {
            # Windows PowerShell 5.1 throws on any non-2xx; PowerShell 7
            # does too unless -SkipHttpErrorCheck is passed, and that
            # switch does not exist in 5.1. So: catch, and read the code
            # off the response when there is one.
            $code = $null
            if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response) {
                try { $code = [int]$_.Exception.Response.StatusCode } catch { }
            }
            if ($method -eq 'Get') {
                if ($code) {
                    return [pscustomobject]@{
                        Ok = ($code -ge 200 -and $code -lt 400); Status = $code; Note = ''
                    }
                }
                return [pscustomobject]@{
                    Ok = $false; Status = 0; Note = $_.Exception.Message
                }
            }
            # A HEAD refusal (405, and some servers simply hang up) is not
            # a dead link. Fall through and ask again with GET.
        }
    }
}

$LyceumFiles = @(
    @{ Path = Join-Path $LyceumRoot 'data\databases.csv'; Label = 'Name'  }
    @{ Path = Join-Path $LyceumRoot 'data\guides.csv';    Label = 'Title' }
)

$LyceumBad = @()

foreach ($file in $LyceumFiles) {
    if (-not (Test-Path $file.Path)) {
        Write-Host ("  not found: {0}" -f $file.Path) -ForegroundColor Yellow
        Write-Host "  (run this from the repository root)" -ForegroundColor Yellow
        continue
    }

    $leaf = Split-Path $file.Path -Leaf
    $rows = @(Import-Csv -Path $file.Path)
    Write-Host ''
    Write-Host ("=== {0}: {1} entries ===" -f $leaf, $rows.Count)

    $i = 0
    foreach ($row in $rows) {
        $i++
        $name = $row.($file.Label)
        $url  = $row.URL
        Write-Progress -Activity ("Checking {0}" -f $leaf) -Status $name `
                       -PercentComplete (($i / $rows.Count) * 100)

        if ([string]::IsNullOrWhiteSpace($url)) {
            Write-Host ("  MISSING URL   {0}" -f $name) -ForegroundColor Red
            $LyceumBad += [pscustomobject]@{
                File = $leaf; Name = $name; Url = ''; Status = 'no URL'
            }
            continue
        }

        $result = Test-LyceumUrl $url
        if (-not $result.Ok) {
            # A transport failure has no status code, only a message, and
            # some of those messages run to several lines. Keep the column
            # narrow enough to stay readable; the full text is in $LyceumBad.
            if ($result.Status) {
                $status = [string]$result.Status
            } else {
                $status = ($result.Note -replace '\s+', ' ')
                if ($status.Length -gt 11) { $status = $status.Substring(0, 11) }
            }
            Write-Host ("  {0,-13} {1}" -f $status, $name) -ForegroundColor Red
            Write-Host ("                {0}" -f $url) -ForegroundColor DarkGray
            if ($result.Note) {
                Write-Host ("                {0}" -f ($result.Note -replace '\s+', ' ')) -ForegroundColor DarkGray
            }
            $LyceumBad += [pscustomobject]@{
                File = $leaf; Name = $name; Url = $url; Status = $status
            }
        }
    }
    Write-Progress -Activity ("Checking {0}" -f $leaf) -Completed
}

Write-Host ''
if ($LyceumBad.Count -eq 0) {
    Write-Host '  Every link answered.' -ForegroundColor Green
} else {
    Write-Host ("  {0} link(s) did not answer:" -f $LyceumBad.Count) -ForegroundColor Red
    Write-Host ''
    # Written with Write-Host rather than Format-Table so the summary keeps
    # its place in the transcript when the window is copied or redirected;
    # pipeline output and Write-Host do not always interleave in order.
    foreach ($entry in $LyceumBad) {
        Write-Host ("    {0,-15} {1,-12} {2}" -f $entry.File, $entry.Status, $entry.Name)
    }
    Write-Host ''
    Write-Host '  Before editing anything, try the same run from the other'
    Write-Host '  network — vendor links often resolve on campus only.'
}
Write-Host ''
