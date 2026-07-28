param(
    [string]$Version
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageMetadata = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') |
    ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$packageMetadata.version
}

$runtimeDir = Join-Path $projectRoot 'assets\generated\runtime\v0.6.0'
$dynamicVideoSourceDir = Join-Path $projectRoot `
    'assets\media-pack\dynamic\v0.4.0\videos'
$heroPackDir = Join-Path $projectRoot "assets\media-pack\hero-draw\v$Version"
$wallpaperPackDir = Join-Path $projectRoot `
    "assets\media-pack\wallpaper-expansion\v$Version"
$suitePackDir = Join-Path $projectRoot "assets\media-pack\suite\v$Version"
$deliverableDir = Join-Path $projectRoot "deliverables\v$Version"

$fullScriptName = "linuxdo-theme-suite-v$Version-full.user.js"
$coreScriptName = "linuxdo-theme-suite-v$Version-core.user.js"
$suitePackName = "linuxdo-theme-suite-v$Version-suite-pack.zip"
$starterKitName = "linuxdo-theme-suite-v$Version-starter-kit.zip"
$manualName = "LINUX-DO-Theme-Suite-v$Version-User-Guide.zh-CN.md"
$starterKitStageDir = Join-Path $deliverableDir '.starter-kit-stage'

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

function Write-DirectoryHashes {
    param([Parameter(Mandatory)][string]$Directory)

    $hashLines = Get-ChildItem -LiteralPath $Directory -Recurse -File |
        Where-Object Name -ne 'SHA256SUMS.txt' |
        Sort-Object FullName |
        ForEach-Object {
            $relative = [System.IO.Path]::GetRelativePath(
                $Directory,
                $_.FullName
            ).Replace('\', '/')
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).
                Hash.ToLowerInvariant()
            "$hash  $relative"
        }
    $hashLines |
        Set-Content -LiteralPath (Join-Path $Directory 'SHA256SUMS.txt') `
            -Encoding utf8
}

$staticImages = [ordered]@{
    'crimson-duo' = 'theme-crimson-duo-white-safe.jpg'
    'shikoti-room' = 'theme-shikoti-pink-room.jpg'
    'erii-sunset' = 'theme-erii-sunset-city.jpg'
    'corgi-shop' = 'theme-corgi-pet-shop.jpg'
    'yamada-sky' = 'theme-yamada-blue-sky.jpg'
    'yamada-manga' = 'theme-yamada-manga-white.jpg'
    'yamada-window' = 'theme-yamada-window.jpg'
    'tayama' = 'theme-tayama-fence.jpg'
    'djgun-noise' = 'theme-djgun-noise.jpg'
    'miku-monitoring' = 'theme-miku-monitoring.jpg'
    'arona-classroom' = 'theme-arona-classroom.jpg'
}

$dynamicVideos = [ordered]@{
    'shikoti-room' = 'shikoti-room.mp4'
    'erii-sunset' = 'erii-sunset.mp4'
    'corgi-shop' = 'corgi-shop.mp4'
    'yamada-sky' = 'yamada-sky.mp4'
    'yamada-manga' = 'yamada-manga.mp4'
    'djgun-noise' = 'djgun-noise.mp4'
    'miku-monitoring' = 'miku-monitoring.mp4'
}

& npm.cmd run assets
if ($LASTEXITCODE -ne 0) { throw '主题图片生成失败。' }
& pwsh -NoProfile -File (Join-Path $PSScriptRoot 'prepare-hero-assets.ps1') `
    -Version $Version
if ($LASTEXITCODE -ne 0) { throw '英雄素材生成失败。' }
& pwsh -NoProfile -File `
    (Join-Path $PSScriptRoot 'prepare-wallpaper-expansion.ps1') `
    -Version $Version
if ($LASTEXITCODE -ne 0) { throw '常规壁纸扩展生成失败。' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'UserScript 构建失败。' }

Reset-ProjectDirectory -Path $suitePackDir
foreach ($directory in @('images', 'videos', 'backgrounds', 'companions')) {
    New-Item -ItemType Directory `
        -Path (Join-Path $suitePackDir $directory) -Force | Out-Null
}

$mediaThemes = [ordered]@{}
foreach ($theme in $staticImages.Keys) {
    $imageName = [string]$staticImages[$theme]
    Copy-Item -LiteralPath (Join-Path $runtimeDir $imageName) `
        -Destination (Join-Path $suitePackDir "images\$imageName") -Force
    $entry = [ordered]@{ image = "images/$imageName" }
    if ($dynamicVideos.Contains($theme)) {
        $videoPath = Join-Path $dynamicVideoSourceDir $dynamicVideos[$theme]
        if (-not (Test-Path -LiteralPath $videoPath -PathType Leaf)) {
            throw "缺少动态视频：$videoPath"
        }
        Copy-Item -LiteralPath $videoPath `
            -Destination (Join-Path $suitePackDir "videos\$($dynamicVideos[$theme])") `
            -Force
        $entry.video = "videos/$($dynamicVideos[$theme])"
    }
    $mediaThemes[$theme] = $entry
}

$wallpaperManifestPath = Join-Path $wallpaperPackDir 'manifest.json'
$wallpaperManifest = Get-Content -LiteralPath $wallpaperManifestPath -Raw |
    ConvertFrom-Json
foreach ($property in $wallpaperManifest.themes.PSObject.Properties) {
    $theme = $property.Name
    $imageRelative = [string]$property.Value.image
    $imageName = Split-Path -Leaf $imageRelative
    Copy-Item -LiteralPath (Join-Path $wallpaperPackDir $imageRelative) `
        -Destination (Join-Path $suitePackDir "images\$imageName") -Force
    $entry = [ordered]@{ image = "images/$imageName" }
    if ($property.Value.PSObject.Properties.Name -contains 'video') {
        $videoRelative = [string]$property.Value.video
        $videoName = Split-Path -Leaf $videoRelative
        Copy-Item -LiteralPath (Join-Path $wallpaperPackDir $videoRelative) `
            -Destination (Join-Path $suitePackDir "videos\$videoName") -Force
        $entry.video = "videos/$videoName"
    }
    $mediaThemes[$theme] = $entry
}
if ($mediaThemes.Count -ne 41) {
    throw "统一素材包主题数量异常：预期 41，实际 $($mediaThemes.Count)"
}

$heroes = [ordered]@{}
foreach ($number in 1..16) {
    $id = '{0:D3}' -f $number
    $backgroundName = "hero-$id-background.jpg"
    $companionName = "hero-$id-companion.png"
    foreach ($asset in @(
        [ordered]@{
            Source = Join-Path $heroPackDir "backgrounds\$backgroundName"
            Target = Join-Path $suitePackDir "backgrounds\$backgroundName"
        },
        [ordered]@{
            Source = Join-Path $heroPackDir "companions\$companionName"
            Target = Join-Path $suitePackDir "companions\$companionName"
        }
    )) {
        if (-not (Test-Path -LiteralPath $asset.Source -PathType Leaf)) {
            throw "缺少英雄素材：$($asset.Source)"
        }
        Copy-Item -LiteralPath $asset.Source -Destination $asset.Target -Force
    }
    $heroes[$id] = [ordered]@{
        background = "backgrounds/$backgroundName"
        companion = "companions/$companionName"
    }
}

$suiteManifest = [ordered]@{
    schemaVersion = 1
    packType = 'suite'
    packId = 'linuxdo-theme-suite'
    version = $Version
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    assetLicenseStatus = 'user-cleared-with-source-notice-required'
    media = [ordered]@{
        themes = $mediaThemes
    }
    hero = [ordered]@{
        heroes = $heroes
    }
}
$suiteManifest |
    ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath (Join-Path $suitePackDir 'manifest.json') `
        -Encoding utf8

@"
# LINUX DO Theme Suite v$Version 统一素材包

一次导入即可获得 41 套常规主题、可用动态背景及 16 套匿名随机英雄素材。资源只保存在当前浏览器的 IndexedDB 中，不会上传到网站。

解压后，在主题工具中点击“导入统一素材包”，选择本目录。不要直接选择 ZIP 文件。

素材来源与发布说明见 `ASSET-LICENSES.md`。
"@ | Set-Content -LiteralPath (Join-Path $suitePackDir 'README.md') `
    -Encoding utf8
Copy-Item -LiteralPath (Join-Path $projectRoot 'ASSET-SOURCES.md') `
    -Destination (Join-Path $suitePackDir 'ASSET-LICENSES.md') -Force
Write-DirectoryHashes -Directory $suitePackDir

Reset-ProjectDirectory -Path $deliverableDir
Copy-Item -LiteralPath (Join-Path $projectRoot `
        'dist\linuxdo-theme-suite.user.js') `
    -Destination (Join-Path $deliverableDir $fullScriptName) -Force
Copy-Item -LiteralPath (Join-Path $projectRoot `
        'dist\linuxdo-theme-suite-core.user.js') `
    -Destination (Join-Path $deliverableDir $coreScriptName) -Force
Compress-Archive -Path (Join-Path $suitePackDir '*') `
    -DestinationPath (Join-Path $deliverableDir $suitePackName) `
    -CompressionLevel Optimal
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\操作手册.md') `
    -Destination (Join-Path $deliverableDir $manualName) -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') `
    -Destination (Join-Path $deliverableDir 'LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'ASSET-SOURCES.md') `
    -Destination (Join-Path $deliverableDir 'ASSET-SOURCES.md') -Force

Reset-ProjectDirectory -Path $starterKitStageDir
Copy-Item -LiteralPath (Join-Path $deliverableDir $coreScriptName) `
    -Destination (Join-Path $starterKitStageDir '01-安装主题脚本.user.js') `
    -Force
Copy-Item -LiteralPath $suitePackDir `
    -Destination (Join-Path $starterKitStageDir '02-统一素材包') `
    -Recurse -Force
Copy-Item -LiteralPath (Join-Path $deliverableDir $manualName) `
    -Destination (Join-Path $starterKitStageDir '03-操作手册.md') -Force
Copy-Item -LiteralPath (Join-Path $deliverableDir 'LICENSE') `
    -Destination (Join-Path $starterKitStageDir 'LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $deliverableDir 'ASSET-SOURCES.md') `
    -Destination (Join-Path $starterKitStageDir 'ASSET-SOURCES.md') -Force
@"
LINUX DO Theme Suite V1 开始使用

本整合包只需下载和解压一次。

第一步：安装脚本
1. 浏览器先安装 Tampermonkey 或 Violentmonkey。
2. 打开“01-安装主题脚本.user.js”。
3. 扩展能识别 UserScript 时，点击安装；未自动识别时，在扩展中新建脚本，粘贴该文件全部内容并保存。

第二步：导入全部素材
1. 打开或刷新 https://linux.do/。
2. 点击页面上的主题工具悬浮按钮。
3. 点击“导入统一素材包”。
4. 选择本整合包中的“02-统一素材包”整个文件夹。

完成后可直接切换主题、调整背景强度和抽取 L 站英雄。
详细功能、更新和卸载步骤见“03-操作手册.md”。
"@ | Set-Content -LiteralPath (Join-Path $starterKitStageDir '00-开始使用.txt') `
    -Encoding utf8
Write-DirectoryHashes -Directory $starterKitStageDir
Compress-Archive -Path (Join-Path $starterKitStageDir '*') `
    -DestinationPath (Join-Path $deliverableDir $starterKitName) `
    -CompressionLevel Optimal
$starterKitStageAbsolute = [System.IO.Path]::GetFullPath($starterKitStageDir)
$deliverableAbsolute = [System.IO.Path]::GetFullPath($deliverableDir) +
    [System.IO.Path]::DirectorySeparatorChar
if (-not $starterKitStageAbsolute.StartsWith(
        $deliverableAbsolute,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "拒绝清理发布目录以外的暂存路径：$starterKitStageAbsolute"
}
Remove-Item -LiteralPath $starterKitStageAbsolute -Recurse -Force

@"
# LINUX DO Theme Suite v$Version 发布文件

- $starterKitName：首选下载的新手整合包；一次解压即可获得脚本、素材和操作手册。
- $coreScriptName：单独更新脚本时使用的轻量油猴脚本。
- $suitePackName：单独更新素材时使用的统一素材包。
- $fullScriptName：高级离线脚本，内置 41 套静态主题，文件较大。
- $manualName：安装、更新、使用、卸载和故障处理手册。
- `LICENSE`：代码许可证。
- `ASSET-SOURCES.md`：素材来源与发布说明。

使用 `SHA256SUMS.txt` 可核对发布文件完整性。
"@ | Set-Content -LiteralPath (Join-Path $deliverableDir 'README.md') `
    -Encoding utf8
Write-DirectoryHashes -Directory $deliverableDir

Get-ChildItem -LiteralPath $deliverableDir -File |
    Sort-Object Name |
    Select-Object Name, Length
