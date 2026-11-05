#Requires -Version 5.1
<#
.SYNOPSIS
  Reports whether the pinned JM hostnames still serve JM, using anonymous requests.

.DESCRIPTION
  Reads the pinned lists from crates/source-network/src/lib.rs so this check cannot
  drift from the application. Nothing here uses or asks for account credentials.

    API hosts      GET /album?id=<sample>; a JSON body with a numeric "code" means
                   the JM API answered. HTML, redirects or 405 mean parked or retired.
    Image / cover  One GET of the site root. This only shows whether the host responds;
                   a 403 or 404 at the root is normal and does not prove images work.

  It then prints JM's current domain announcement for manual review. The announcement
  is encrypted with a fixed key, not signed, so treat it as a hint: review any change
  by hand before updating crates/source-network/src/lib.rs.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/check-jm-hosts.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$pinsPath = Join-Path $PSScriptRoot '..\crates\source-network\src\lib.rs'
$pins = Get-Content -Raw -LiteralPath $pinsPath -Encoding UTF8
$sampleId = '422866'
$userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

function Get-PinnedList {
    param([string] $Name)
    $match = [regex]::Match($pins, "pub const $Name`: &\[&str\] = &\[(.*?)\];", 'Singleline')
    if (-not $match.Success) { throw "Pinned list not found: $Name" }
    return [regex]::Matches($match.Groups[1].Value, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
}

function Get-PinnedHost {
    param([string] $Name)
    $match = [regex]::Match($pins, "pub const $Name`: &str = `"([^`"]+)`";")
    if (-not $match.Success) { throw "Pinned host not found: $Name" }
    return $match.Groups[1].Value
}

function Invoke-Probe {
    param([string] $Url, [string[]] $Headers = @())
    $arguments = @('-s', '-m', '20', '-o', '-', '-w', "`n%{http_code}", $Url, '-H', "user-agent: $userAgent")
    foreach ($header in $Headers) { $arguments += @('-H', $header) }
    $text = ((& curl.exe @arguments 2>$null) | Out-String).TrimEnd()
    $split = $text.LastIndexOf("`n")
    if ($split -lt 0) { return @{ Status = [int]('0' + $text.Trim()); Body = '' } }
    return @{ Status = [int]($text.Substring($split + 1).Trim()); Body = $text.Substring(0, $split) }
}

function Get-ApiVerdict {
    param([int] $Status, [string] $Body)
    if ($Status -eq 0) { return 'NO CONNECTION' }
    if ($Status -in 301, 302, 303, 307, 308) { return "PARKED (redirect $Status)" }
    if ($Status -eq 405) { return 'PARKED (405)' }
    if ($Body -match '^\s*\{.*"code"\s*:\s*"?\d+') { return 'JM API OK' }
    return "NOT JM API (HTTP $Status)"
}

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$md5 = [System.Security.Cryptography.MD5]::Create()
$token = ($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes("${timestamp}18comicAPP")) |
    ForEach-Object { $_.ToString('x2') }) -join ''
$apiHeaders = @("token: $token", "tokenparam: $timestamp,2.0.13")

Write-Host "`nPinned JM API hosts ($(Get-Date -Format o))" -ForegroundColor Cyan
$apiHosts = Get-PinnedList 'JM_API_HOSTS'
$apiResults = foreach ($name in $apiHosts) {
    $probe = Invoke-Probe -Url "https://$name/album?id=$sampleId" -Headers $apiHeaders
    [pscustomobject]@{
        Host    = $name
        Status  = $probe.Status
        Verdict = Get-ApiVerdict -Status $probe.Status -Body $probe.Body
    }
}
$apiResults | Format-Table -AutoSize

Write-Host 'Pinned JM image and cover hosts (reachability only)' -ForegroundColor Cyan
$mediaHosts = @(Get-PinnedHost 'JM_IMAGE_HOST') + @(Get-PinnedList 'JM_COVER_HOSTS')
$mediaHosts | ForEach-Object {
    $probe = Invoke-Probe -Url "https://$_/"
    [pscustomobject]@{
        Host   = $_
        Status = $probe.Status
        Result = if ($probe.Status -eq 0) { 'NO CONNECTION' } else { 'RESPONDS' }
    }
} | Format-Table -AutoSize

Write-Host 'JM domain announcement (encrypted, not signed: review by hand)' -ForegroundColor Cyan
$announcements = @(
    'https://rup4a04-c01.tos-ap-southeast-1.bytepluses.com/newsvr-2025.txt',
    'https://rup4a04-c02.tos-cn-hongkong.bytepluses.com/newsvr-2025.txt',
    'https://rup4a04-c03.tos-cn-beijing.bytepluses.com.cn/newsvr-2025.txt'
)
$decrypted = $null
foreach ($url in $announcements) {
    try {
        $text = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20).Content.Trim()
        while ($text.Length -gt 0 -and ([int][char]$text[0] -lt 32 -or [int][char]$text[0] -gt 126)) {
            $text = $text.Substring(1)
        }
        $data = [Convert]::FromBase64String($text)
        $key = ($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes('diosfjckwpqpdfjkvnqQjsik')) |
            ForEach-Object { $_.ToString('x2') }) -join ''
        $aes = [System.Security.Cryptography.Aes]::Create()
        $aes.Mode = [System.Security.Cryptography.CipherMode]::ECB
        $aes.Padding = [System.Security.Cryptography.PaddingMode]::None
        $aes.Key = [Text.Encoding]::UTF8.GetBytes($key)
        $plain = $aes.CreateDecryptor().TransformFinalBlock($data, 0, $data.Length)
        $padding = [int]$plain[$plain.Length - 1]
        $decrypted = [Text.Encoding]::UTF8.GetString($plain, 0, $plain.Length - $padding)
        break
    } catch {
        Write-Host "  failed: $url" -ForegroundColor DarkYellow
    }
}
if ($decrypted) { Write-Host $decrypted } else { Write-Host '  could not read the announcement' -ForegroundColor DarkYellow }

$broken = @($apiResults | Where-Object { $_.Verdict -ne 'JM API OK' })
if ($broken.Count -gt 0) {
    Write-Host "`nHosts to review in crates/source-network/src/lib.rs: $($broken.Host -join ', ')" -ForegroundColor Yellow
}
