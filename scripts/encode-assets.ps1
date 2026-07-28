param(
    [ValidateRange(1, 100)]
    [int]$Quality = 84
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$wallpaperSourceDir = Join-Path $projectRoot 'assets\source\wallpaper-engine\v0.4.0\posters'
$prototypeSourceDir = Join-Path $projectRoot 'assets\generated\prototypes\v0.4.0'
$prototypeV060Dir = Join-Path $projectRoot 'assets\generated\prototypes\v0.6.0'
$outputDir = Join-Path $projectRoot 'assets\generated\runtime\v0.6.0'

$assets = @(
    [pscustomobject]@{
        Output = 'theme-crimson-duo-white-safe.jpg'
        Source = Join-Path $prototypeV060Dir 'theme-crimson-duo-white-safe-v0.6.0.png'
    }
    [pscustomobject]@{
        Output = 'theme-shikoti-pink-room.jpg'
        Source = Join-Path $wallpaperSourceDir 'shikoti-pink-room.jpg'
    }
    [pscustomobject]@{
        Output = 'theme-erii-sunset-city.jpg'
        Source = Join-Path $wallpaperSourceDir 'erii-sunset-city.jpg'
    }
    [pscustomobject]@{
        Output = 'theme-corgi-pet-shop.jpg'
        Source = Join-Path $wallpaperSourceDir 'corgi-pet-shop.jpg'
    }
    [pscustomobject]@{
        Output = 'theme-yamada-blue-sky.jpg'
        Source = Join-Path $wallpaperSourceDir 'yamada-blue-sky.jpg'
    }
    [pscustomobject]@{
        Output = 'theme-yamada-manga-white.jpg'
        Source = Join-Path $wallpaperSourceDir 'yamada-manga-white.jpg'
    }
    [pscustomobject]@{
        Output = 'theme-yamada-window.jpg'
        Source = Join-Path $prototypeSourceDir 'theme-yamada-window-wide-v0.4.0.png'
    }
    [pscustomobject]@{
        Output = 'theme-tayama-fence.jpg'
        Source = Join-Path $prototypeSourceDir 'theme-tayama-wide-v0.4.0.png'
    }
    [pscustomobject]@{
        Output = 'theme-djgun-noise.jpg'
        Source = Join-Path $prototypeSourceDir 'theme-djgun-noise-wide-v0.4.0.png'
    }
    [pscustomobject]@{
        Output = 'theme-miku-monitoring.jpg'
        Source = Join-Path $prototypeSourceDir 'theme-miku-monitoring-wide-v0.4.0.png'
    }
    [pscustomobject]@{
        Output = 'theme-arona-classroom.jpg'
        Source = Join-Path $prototypeSourceDir 'theme-arona-classroom-wide-v0.4.0.png'
    }
)

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Add-Type -AssemblyName System.Drawing

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object MimeType -eq 'image/jpeg' |
    Select-Object -First 1

if (-not $jpegCodec) {
    throw '当前系统没有可用的 JPEG 编码器。'
}

$results = foreach ($entry in $assets) {
    $sourcePath = $entry.Source
    $outputPath = Join-Path $outputDir $entry.Output

    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "缺少源图：$sourcePath"
    }

    if (-not $outputPath.StartsWith($outputDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "输出路径越界：$outputPath"
    }

    if (Test-Path -LiteralPath $outputPath) {
        Remove-Item -LiteralPath $outputPath -Force
    }

    $image = [System.Drawing.Image]::FromFile($sourcePath)
    $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $qualityParameter = [System.Drawing.Imaging.EncoderParameter]::new(
        [System.Drawing.Imaging.Encoder]::Quality,
        [long]$Quality
    )
    $encoderParameters.Param[0] = $qualityParameter

    try {
        $image.Save($outputPath, $jpegCodec, $encoderParameters)
    }
    finally {
        $qualityParameter.Dispose()
        $encoderParameters.Dispose()
        $image.Dispose()
    }

    $sourceFile = Get-Item -LiteralPath $sourcePath
    $outputFile = Get-Item -LiteralPath $outputPath
    [pscustomobject]@{
        Asset = $entry.Output
        SourceBytes = $sourceFile.Length
        OutputBytes = $outputFile.Length
        ReductionPercent = [math]::Round(
            (1 - ($outputFile.Length / $sourceFile.Length)) * 100,
            1
        )
    }
}

$results | Format-Table -AutoSize
