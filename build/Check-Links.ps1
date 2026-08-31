# =====================================================================
#  LIBRARY LYCEUM — LINK CHECK
#
#  Every URL on the site, asked whether it is still there: the entries
#  in data/databases.csv and data/guides.csv, and the external links
#  written into the pages themselves. Nothing is written and nothing is
#  installed; the script only reads and reports.
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

# Shortens a transport failure to something that fits a column. The full
# text still goes into the summary object.
function Format-LyceumStatus {
    param($Result)
    if ($Result.Status) { return [string]$Result.Status }
    $note = ($Result.Note -replace '\s+', ' ')
    if ($note.Length -gt 11) { $note = $note.Substring(0, 11) }
    return $note
}

$LyceumFiles = @(
    @{ Path = Join-Path (Join-Path $LyceumRoot 'data') 'databases.csv'; Label = 'Name'  }
    @{ Path = Join-Path (Join-Path $LyceumRoot 'data') 'guides.csv';    Label = 'Title' }
)

$LyceumBad     = @()
$LyceumChecked = @{}   # every URL already asked, so nothing is asked twice


# =====================================================================
#  1. THE COLLECTIONS
# =====================================================================

foreach ($file in $LyceumFiles) {
    if (-not (Test-Path $file.Path)) {
        Write-Host ("  not found: {0}" -f $file.Path) -ForegroundColor Yellow
        Write-Host "  (run this from the repository root)" -ForegroundColor Yellow
        continue
    }

    $leaf = Split-Path $file.Path -Leaf
    $rows = @(Import-Csv -Path $file.Path)
    Write-Host ''
    $word = if ($rows.Count -eq 1) { 'entry' } else { 'entries' }
    Write-Host ("=== {0}: {1} {2} ===" -f $leaf, $rows.Count, $word)

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
        $LyceumChecked[$url] = $result.Ok

        if (-not $result.Ok) {
            # A transport failure has no status code, only a message, and
            # some of those messages run to several lines. Keep the column
            # narrow enough to stay readable; the full text is in $LyceumBad.
            $status = Format-LyceumStatus $result
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


# =====================================================================
#  2. THE PAGES
#
#  The collections are not the only links on the site. tools.html alone
#  carries a dozen — five sign-in pages and six sources for the quoted
#  vendor copy — and until now nothing checked any of them. A citation
#  that points at a moved page is worse than no citation: it looks
#  verified and is not.
#
#  The href values are pulled with a regular expression rather than a
#  parser. Reaching for one on arbitrary HTML would be a mistake, but
#  these are our own files, written by our own build, in one consistent
#  shape — and PowerShell 5.1 has no HTML parser to reach for anyway.
#  The pattern is deliberately narrow: an <a> tag whose href begins http.
# =====================================================================

function Get-LyceumPageLinks {
    param([string]$Path)

    $html = Get-Content -Path $Path -Raw -Encoding UTF8
    $out  = @()
    $re   = [regex]'(?is)<a\b[^>]*\bhref\s*=\s*(["''])(https?://[^"'']+)\1[^>]*>(.*?)</a>'

    foreach ($m in $re.Matches($html)) {
        # The link's own words, with any nested markup taken out, so the
        # report says which link on the page rather than only which page.
        # The screen-reader span goes first: "(opens in a new tab)" is on
        # every external link and would drown the report. build-index.js
        # drops it for the same reason when it builds search titles.
        $text = $m.Groups[3].Value -replace '(?is)<span[^>]*class="[^"]*visually-hidden[^"]*"[^>]*>.*?</span>', ' '
        $text = $text -replace '(?s)<[^>]+>', ' '
        $text = ($text -replace '&[a-zA-Z]+;|&#\d+;', ' ') -replace '\s+', ' '
        $text = $text.Trim()
        if ($text.Length -gt 44) { $text = $text.Substring(0, 44) + '...' }
        if (-not $text) { $text = '(no link text)' }

        $out += [pscustomobject]@{ Url = $m.Groups[2].Value; Text = $text }
    }
    return $out
}

$LyceumPageFiles = @()
$LyceumPageFiles += @(Get-ChildItem -Path $LyceumRoot -Filter '*.html' -File)

$LyceumNewsletter = Join-Path $LyceumRoot 'newsletter'
if (Test-Path $LyceumNewsletter) {
    $LyceumPageFiles += @(Get-ChildItem -Path $LyceumNewsletter -Filter '*.html' -File -Recurse)
}

# One entry per distinct URL, remembering everywhere it appears, so a
# link in the shared footer is asked about once and reported once.
$LyceumPageLinks = [ordered]@{}
$LyceumSkipped   = 0

foreach ($page in $LyceumPageFiles) {
    $rel = $page.FullName.Substring($LyceumRoot.Length).TrimStart('\', '/')

    # The issue template's links are placeholders, not destinations.
    if ($rel -match '(^|[\\/])_template([\\/]|$)') { continue }

    foreach ($link in (Get-LyceumPageLinks $page.FullName)) {
        if ($LyceumChecked.ContainsKey($link.Url)) { $LyceumSkipped++; continue }
        if (-not $LyceumPageLinks.Contains($link.Url)) {
            $LyceumPageLinks[$link.Url] = @()
        }
        $LyceumPageLinks[$link.Url] += [pscustomobject]@{ Page = $rel; Text = $link.Text }
    }
}

Write-Host ''
Write-Host ("=== pages: {0} link(s) across {1} file(s) ===" -f `
            $LyceumPageLinks.Count, $LyceumPageFiles.Count)
if ($LyceumSkipped -gt 0) {
    Write-Host ("  ({0} already checked above, as collection entries)" -f $LyceumSkipped) `
               -ForegroundColor DarkGray
}

$i = 0
foreach ($url in @($LyceumPageLinks.Keys)) {
    $i++
    $where = $LyceumPageLinks[$url]
    Write-Progress -Activity 'Checking page links' -Status $url `
                   -PercentComplete (($i / [Math]::Max(1, $LyceumPageLinks.Count)) * 100)

    $result = Test-LyceumUrl $url
    $LyceumChecked[$url] = $result.Ok
    if ($result.Ok) { continue }

    $status = Format-LyceumStatus $result
    foreach ($place in $where) {
        Write-Host ("  {0,-13} {1}" -f $status, $place.Text) -ForegroundColor Red
        Write-Host ("                on {0}" -f $place.Page) -ForegroundColor DarkGray
    }
    Write-Host ("                {0}" -f $url) -ForegroundColor DarkGray
    if ($result.Note) {
        Write-Host ("                {0}" -f ($result.Note -replace '\s+', ' ')) -ForegroundColor DarkGray
    }
    $LyceumBad += [pscustomobject]@{
        File   = ($where | ForEach-Object { $_.Page }) -join ', '
        Name   = $where[0].Text
        Url    = $url
        Status = $status
    }
}
Write-Progress -Activity 'Checking page links' -Completed


# =====================================================================
#  3. THE VERDICT
# =====================================================================

Write-Host ''
Write-Host ("  {0} address(es) asked." -f $LyceumChecked.Count)

if ($LyceumBad.Count -eq 0) {
    Write-Host '  Every link answered.' -ForegroundColor Green
} else {
    Write-Host ("  {0} link(s) did not answer:" -f $LyceumBad.Count) -ForegroundColor Red
    Write-Host ''
    # Written with Write-Host rather than Format-Table so the summary keeps
    # its place in the transcript when the window is copied or redirected;
    # pipeline output and Write-Host do not always interleave in order.
    foreach ($entry in $LyceumBad) {
        Write-Host ("    {0,-24} {1,-12} {2}" -f $entry.File, $entry.Status, $entry.Name)
    }
    Write-Host ''
    Write-Host '  Before editing anything, try the same run from the other'
    Write-Host '  network — vendor links often resolve on campus only.'
}
Write-Host ''
