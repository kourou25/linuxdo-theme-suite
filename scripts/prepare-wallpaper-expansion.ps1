param(
    [string]$Version = '0.8.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$bundledFfmpeg = Join-Path $projectRoot `
    'tools\ffmpeg-8.1.2\ffmpeg-8.1.2-essentials_build\bin\ffmpeg.exe'
$ffmpeg = $bundledFfmpeg
$sourceRoot = Join-Path $projectRoot `
    'assets\source\wallpaper-expansion\v0.8.0'
$generatedRoot = Join-Path $projectRoot `
    'assets\generated\wallpaper-expansion\v0.8.0'
$outpaintedRoot = Join-Path $projectRoot `
    'assets\generated\wallpaper-expansion\v0.9.0\outpainted'
$runtimeRoot = Join-Path $generatedRoot 'runtime'
$imageRoot = Join-Path $runtimeRoot 'images'
$videoRoot = Join-Path $runtimeRoot 'videos'
$packRoot = Join-Path $projectRoot `
    "assets\media-pack\wallpaper-expansion\v$Version"

if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) {
    $ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if (-not $ffmpegCommand) {
        throw "缺少 FFmpeg：$bundledFfmpeg，系统 PATH 中也未找到 ffmpeg。"
    }
    $ffmpeg = $ffmpegCommand.Source
}

function Reset-ProjectDirectory {
    param([Parameter(Mandatory)][string]$Path)

    $absolute = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetFullPath($projectRoot) +
        [System.IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith(
            $root,
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
        throw "拒绝清理项目目录以外的路径：$absolute"
    }
    if (Test-Path -LiteralPath $absolute) {
        Remove-Item -LiteralPath $absolute -Recurse -Force
    }
    New-Item -ItemType Directory -Path $absolute -Force | Out-Null
}

function Invoke-FFmpeg {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & $ffmpeg -hide_banner -loglevel error -y @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "FFmpeg 处理失败：$($Arguments -join ' ')"
    }
}

function Convert-ExactWideImage {
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath
    )

    Invoke-FFmpeg -Arguments @(
        '-i', $InputPath,
        '-vf',
        'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080',
        '-frames:v', '1',
        '-q:v', '3',
        $OutputPath
    )
}

function Convert-SafeImage {
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath,
        [string]$PreFilter,
        [string]$FrontFilter
    )

    $filter = ''
    if (-not [string]::IsNullOrWhiteSpace($PreFilter)) {
        $filter = "$PreFilter,"
    }
    $filter +=
        'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,' +
        'crop=1920:1080'
    if (-not [string]::IsNullOrWhiteSpace($FrontFilter)) {
        $filter += ",$FrontFilter"
    }
    $filter += ',format=yuv420p'

    Invoke-FFmpeg -Arguments @(
        '-i', $InputPath,
        '-vf', $filter,
        '-frames:v', '1',
        '-q:v', '3',
        $OutputPath
    )
}

function Get-WorkshopFile {
    param(
        [Parameter(Mandatory)][string]$WorkshopId,
        [Parameter(Mandatory)][string]$RelativePath
    )

    return Join-Path $sourceRoot "workshop\$WorkshopId\$RelativePath"
}

function Get-UploadedSource {
    param([Parameter(Mandatory)][string]$Number)

    $match = Get-ChildItem -LiteralPath `
        (Join-Path $sourceRoot 'uploaded\originals') `
        -File |
        Where-Object BaseName -eq "wallpaper-$Number-source" |
        Select-Object -First 1
    if (-not $match) {
        throw "缺少上传原图：wallpaper-$Number-source"
    }
    return $match.FullName
}

function New-VideoPoster {
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath,
        [string]$Timestamp = '00:00:03'
    )

    Invoke-FFmpeg -Arguments @(
        '-ss', $Timestamp,
        '-i', $InputPath,
        '-vf', 'scale=1920:1080',
        '-frames:v', '1',
        '-q:v', '3',
        $OutputPath
    )
}

function Convert-PerformanceVideo {
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath
    )

    Invoke-FFmpeg -Arguments @(
        '-i', $InputPath,
        '-an',
        '-vf',
        'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p,fps=30',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '25',
        '-movflags', '+faststart',
        $OutputPath
    )
}

Reset-ProjectDirectory -Path $runtimeRoot
New-Item -ItemType Directory -Path $imageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $videoRoot -Force | Out-Null

$videoSources = [ordered]@{
    'hinata-night' = Get-WorkshopFile `
        -WorkshopId '3762075986' `
        -RelativePath '【Naruto 火影忍者】Hinata 雏田 - 01.mp4'
    'sketch-twintail' = Get-WorkshopFile `
        -WorkshopId '3710628489' `
        -RelativePath '【哲风壁纸】动漫线稿-双马尾.mp4'
    'xinruyin-summer' = Get-WorkshopFile `
        -WorkshopId '3738784457' `
        -RelativePath '辛如音 缤纷夏日.mp4'
}

foreach ($theme in $videoSources.Keys) {
    $videoSource = $videoSources[$theme]
    New-VideoPoster `
        -InputPath $videoSource `
        -OutputPath (Join-Path $imageRoot "$theme.jpg")
    Convert-PerformanceVideo `
        -InputPath $videoSource `
        -OutputPath (Join-Path $videoRoot "$theme.mp4")
}

$sceneImages = [ordered]@{
    'cloud-guitar' = Join-Path $generatedRoot `
        'scene-fallbacks\cloud-guitar.png'
    'pretty-girl' = Get-WorkshopFile `
        -WorkshopId '3746340629' `
        -RelativePath 'extracted\materials\pretty girl.png'
    'yuki-ink' = Get-WorkshopFile `
        -WorkshopId '3751623072' `
        -RelativePath 'extracted\materials\mm.png'
    'sofa-midnight' = Get-WorkshopFile `
        -WorkshopId '3748122615' `
        -RelativePath `
            'extracted\materials\supawork-c51746f1d4af4a93b6d8d7026da80763.png'
    'kisaki-summer' = Get-WorkshopFile `
        -WorkshopId '3757242839' `
        -RelativePath 'extracted\materials\146272975_p0.jpg'
    # Stable capture derived from review\workshop-3757374198-rendered.png.
    'cinderella-crystal' = Join-Path $generatedRoot `
        'scene-fallbacks\cinderella-crystal.png'
    'summer-window' = Join-Path $generatedRoot `
        'scene-fallbacks\summer-window.png'
}

foreach ($theme in $sceneImages.Keys) {
    Convert-ExactWideImage `
        -InputPath $sceneImages[$theme] `
        -OutputPath (Join-Path $imageRoot "$theme.jpg")
}

$rotatedUploads = [ordered]@{
    'chain-sunset' = [ordered]@{ Number = '001'; CropRight = 400 }
    'mirror-cyan' = [ordered]@{ Number = '002'; CropRight = 320 }
    'red-halo-sea' = [ordered]@{ Number = '003'; CropRight = 400 }
    'lantern-blue' = [ordered]@{ Number = '004'; CropRight = 400 }
    'white-feather-shore' = [ordered]@{
        Number = '007'
        CropRight = 400
    }
    'strawhat-sword' = [ordered]@{ Number = '009'; CropRight = 260 }
}

foreach ($theme in $rotatedUploads.Keys) {
    $item = $rotatedUploads[$theme]
    Convert-SafeImage `
        -InputPath (Get-UploadedSource -Number $item.Number) `
        -OutputPath (Join-Path $imageRoot "$theme.jpg") `
        -PreFilter "transpose=2,crop=iw-$($item.CropRight):ih:0:0"
}

$directUploads = [ordered]@{
    'mist-boat' = [ordered]@{
        Number = '013'
        Filter = 'crop=iw:trunc(iw*9/16/2)*2:0:0'
        FrontFilter = ''
    }
    'mist-pagoda' = [ordered]@{
        Number = '014'
        Filter = 'crop=iw:trunc(iw*9/16/2)*2:0:0'
        FrontFilter = ''
    }
}

foreach ($theme in $directUploads.Keys) {
    $item = $directUploads[$theme]
    Convert-SafeImage `
        -InputPath (Get-UploadedSource -Number $item.Number) `
        -OutputPath (Join-Path $imageRoot "$theme.jpg") `
        -PreFilter $item.Filter `
        -FrontFilter $item.FrontFilter
}

$outpaintedImages = [ordered]@{
    'misa-black-gold' = 'misa-black-gold.png'
    'palace-flock' = 'palace-flock.png'
    'leaf-shadow' = 'leaf-shadow.png'
    'red-umbrella' = 'red-umbrella.png'
    'bamboo-wall' = 'bamboo-wall.png'
    'water-angel' = 'water-angel.png'
    'carousel-duo' = 'carousel-duo.png'
    'train-duo' = 'train-duo.png'
    'forest-sword' = 'forest-sword.png'
    'alpine-angel' = 'alpine-angel.png'
    'ocean-angel' = 'ocean-angel.png'
    'sky-headphones' = 'sky-headphones.png'
}

foreach ($theme in $outpaintedImages.Keys) {
    $plate = Join-Path $outpaintedRoot $outpaintedImages[$theme]
    if (-not (Test-Path -LiteralPath $plate -PathType Leaf)) {
        throw "缺少 v0.9 横向补景资源：$plate"
    }
    Convert-ExactWideImage `
        -InputPath $plate `
        -OutputPath (Join-Path $imageRoot "$theme.jpg")
}

$allThemes = [ordered]@{}
foreach ($theme in @(
    $videoSources.Keys +
    $sceneImages.Keys +
    $rotatedUploads.Keys +
    $directUploads.Keys +
    $outpaintedImages.Keys
)) {
    $entry = [ordered]@{ image = "images/$theme.jpg" }
    if ($videoSources.Contains($theme)) {
        $entry.video = "videos/$theme.mp4"
    }
    $allThemes[$theme] = $entry
}

if ($allThemes.Count -ne 30) {
    throw "常规壁纸数量异常：预期 30，实际 $($allThemes.Count)"
}

Reset-ProjectDirectory -Path $packRoot
Copy-Item -LiteralPath $imageRoot `
    -Destination (Join-Path $packRoot 'images') -Recurse -Force
Copy-Item -LiteralPath $videoRoot `
    -Destination (Join-Path $packRoot 'videos') -Recurse -Force

$manifest = [ordered]@{
    schemaVersion = 1
    packId = 'linuxdo-theme-suite-wallpaper-expansion'
    version = $Version
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    assetLicenseStatus = 'user-cleared-with-source-notice-required'
    themes = $allThemes
}
$manifest |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath (Join-Path $packRoot 'manifest.json') `
        -Encoding utf8

@"
# LINUX DO Theme Suite 常规壁纸扩展

本包包含 30 套常规壁纸：3 套采用 1920×1080、30fps、无音轨的 H.264 动态背景，其余采用 1920×1080 JPEG 静态背景。竖幅素材已使用横向补景资源构造成连续宽屏场景，运行时采用 cover 填充，不再使用模糊底图叠加。

安装时解压 ZIP，在 LINUX DO 右下角主题面板中点击“导入素材包”，选择解压后的整个目录。资源只保存在当前浏览器的 IndexedDB 中。

素材来源说明与发布要求见 `ASSET-LICENSES.md`。发布时必须保留来源说明。
"@ | Set-Content -LiteralPath (Join-Path $packRoot 'README.md') -Encoding utf8

Copy-Item -LiteralPath (Join-Path $projectRoot 'ASSET-SOURCES.md') `
    -Destination (Join-Path $packRoot 'ASSET-LICENSES.md') -Force

$hashLines = Get-ChildItem -LiteralPath $packRoot -Recurse -File |
    Where-Object Name -ne 'SHA256SUMS.txt' |
    Sort-Object FullName |
    ForEach-Object {
        $relative = [System.IO.Path]::GetRelativePath(
            $packRoot,
            $_.FullName
        ).Replace('\', '/')
        $hash = (
            Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
        ).Hash.ToLowerInvariant()
        "$hash  $relative"
    }
$hashLines |
    Set-Content -LiteralPath (Join-Path $packRoot 'SHA256SUMS.txt') `
        -Encoding ascii

[pscustomobject]@{
    Themes = $allThemes.Count
    Images = (Get-ChildItem -LiteralPath $imageRoot -File).Count
    Videos = (Get-ChildItem -LiteralPath $videoRoot -File).Count
    Pack = $packRoot
}
