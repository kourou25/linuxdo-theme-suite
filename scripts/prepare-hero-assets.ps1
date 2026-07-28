param(
    [string]$Version = '0.8.0',
    [string]$AssetVersion = '0.7.0',
    [string]$ActionAssetVersion = '1.0.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$generatedRoot = Join-Path $projectRoot `
    "assets\generated\hero-draw\v$AssetVersion"
$sourceRoot = Join-Path $projectRoot "assets\source\hero-draw\v$AssetVersion"
$packRoot = Join-Path $projectRoot "assets\media-pack\hero-draw\v$Version"
$backgroundPackRoot = Join-Path $packRoot 'backgrounds'
$companionPackRoot = Join-Path $packRoot 'companions'
$genericBackground = Join-Path $generatedRoot 'hero-002-generic-moonlight.png'
$fallbackBackground = Join-Path $generatedRoot 'backgrounds\hero-002-background.png'
$fallbackCompanion = Join-Path $generatedRoot 'companions\hero-002-companion.png'
$animatedCompanionSource = Join-Path $projectRoot `
    "assets\generated\hero-draw\v$ActionAssetVersion\actions\hero-001-companion.png"

foreach ($directory in @(
    (Join-Path $generatedRoot 'backgrounds'),
    (Join-Path $generatedRoot 'companions'),
    $backgroundPackRoot,
    $companionPackRoot
)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

function New-RoundedRectanglePath {
    param(
        [Parameter(Mandatory)][System.Drawing.RectangleF]$Rectangle,
        [Parameter(Mandatory)][float]$Radius
    )

    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
    $path.AddArc(
        $Rectangle.Right - $diameter,
        $Rectangle.Y,
        $diameter,
        $diameter,
        270,
        90
    )
    $path.AddArc(
        $Rectangle.Right - $diameter,
        $Rectangle.Bottom - $diameter,
        $diameter,
        $diameter,
        0,
        90
    )
    $path.AddArc(
        $Rectangle.X,
        $Rectangle.Bottom - $diameter,
        $diameter,
        $diameter,
        90,
        90
    )
    $path.CloseFigure()
    return $path
}

function Set-HighQualityDrawing {
    param([Parameter(Mandatory)][System.Drawing.Graphics]$Graphics)

    $Graphics.CompositingMode =
        [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $Graphics.CompositingQuality =
        [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $Graphics.InterpolationMode =
        [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $Graphics.SmoothingMode =
        [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $Graphics.PixelOffsetMode =
        [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
}

function Save-Jpeg {
    param(
        [Parameter(Mandatory)][System.Drawing.Image]$Image,
        [Parameter(Mandatory)][string]$Path,
        [int]$Quality = 84
    )

    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object MimeType -eq 'image/jpeg' |
        Select-Object -First 1
    $parameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
    $qualityParameter = [System.Drawing.Imaging.EncoderParameter]::new(
        [System.Drawing.Imaging.Encoder]::Quality,
        [long]$Quality
    )
    $parameters.Param[0] = $qualityParameter
    try {
        $Image.Save($Path, $encoder, $parameters)
    }
    finally {
        $qualityParameter.Dispose()
        $parameters.Dispose()
    }
}

function Clear-LowAlphaPixels {
    param(
        [Parameter(Mandatory)][System.Drawing.Bitmap]$Bitmap,
        [byte]$Threshold = 40
    )

    $rectangle = [System.Drawing.Rectangle]::new(
        0,
        0,
        $Bitmap.Width,
        $Bitmap.Height
    )
    $data = $Bitmap.LockBits(
        $rectangle,
        [System.Drawing.Imaging.ImageLockMode]::ReadWrite,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    try {
        $byteCount = [Math]::Abs($data.Stride) * $data.Height
        $pixels = [byte[]]::new($byteCount)
        [System.Runtime.InteropServices.Marshal]::Copy(
            $data.Scan0,
            $pixels,
            0,
            $byteCount
        )
        for ($row = 0; $row -lt $data.Height; $row += 1) {
            $rowOffset = $row * [Math]::Abs($data.Stride)
            for ($column = 0; $column -lt $data.Width; $column += 1) {
                $alphaOffset = $rowOffset + ($column * 4) + 3
                if ($pixels[$alphaOffset] -le $Threshold) {
                    $pixels[$alphaOffset] = 0
                }
            }
        }
        [System.Runtime.InteropServices.Marshal]::Copy(
            $pixels,
            0,
            $data.Scan0,
            $byteCount
        )
    }
    finally {
        $Bitmap.UnlockBits($data)
    }
}

if (-not (Test-Path -LiteralPath $genericBackground -PathType Leaf)) {
    throw "缺少猫面具月夜底图：$genericBackground"
}

$catSourcePath = Join-Path $sourceRoot 'hero-002-source.png'
$moonlight = [System.Drawing.Bitmap]::FromFile($genericBackground)
$catSource = [System.Drawing.Bitmap]::FromFile($catSourcePath)
try {
    $composite = [System.Drawing.Bitmap]::new(
        $moonlight.Width,
        $moonlight.Height,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($composite)
    try {
        Set-HighQualityDrawing -Graphics $graphics
        $graphics.DrawImage(
            $moonlight,
            [System.Drawing.Rectangle]::new(
                0,
                0,
                $moonlight.Width,
                $moonlight.Height
            )
        )
        $portraitRect = [System.Drawing.RectangleF]::new(1120, 220, 455, 455)
        $portraitPath = New-RoundedRectanglePath `
            -Rectangle $portraitRect `
            -Radius 28
        try {
            $graphics.SetClip($portraitPath)
            $graphics.DrawImage($catSource, $portraitRect)
            $graphics.ResetClip()
            $border = [System.Drawing.Pen]::new(
                [System.Drawing.Color]::FromArgb(175, 189, 220, 238),
                4
            )
            try {
                $graphics.DrawPath($border, $portraitPath)
            }
            finally {
                $border.Dispose()
            }
        }
        finally {
            $portraitPath.Dispose()
        }
    }
    finally {
        $graphics.Dispose()
    }
    $composite.Save($fallbackBackground, [System.Drawing.Imaging.ImageFormat]::Png)
    $composite.Dispose()

    $companionCanvas = [System.Drawing.Bitmap]::new(
        640,
        640,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $companionGraphics = [System.Drawing.Graphics]::FromImage($companionCanvas)
    try {
        Set-HighQualityDrawing -Graphics $companionGraphics
        $companionGraphics.Clear([System.Drawing.Color]::Transparent)
        $glow = [System.Drawing.SolidBrush]::new(
            [System.Drawing.Color]::FromArgb(80, 112, 179, 223)
        )
        try {
            $companionGraphics.FillEllipse($glow, 34, 34, 572, 572)
        }
        finally {
            $glow.Dispose()
        }
        $circlePath = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $circlePath.AddEllipse(70, 70, 500, 500)
        try {
            $companionGraphics.SetClip($circlePath)
            $companionGraphics.DrawImage(
                $catSource,
                [System.Drawing.RectangleF]::new(70, 70, 500, 500)
            )
            $companionGraphics.ResetClip()
            $ring = [System.Drawing.Pen]::new(
                [System.Drawing.Color]::FromArgb(220, 198, 227, 243),
                6
            )
            try {
                $companionGraphics.DrawPath($ring, $circlePath)
            }
            finally {
                $ring.Dispose()
            }
        }
        finally {
            $circlePath.Dispose()
        }
    }
    finally {
        $companionGraphics.Dispose()
    }
    $companionCanvas.Save(
        $fallbackCompanion,
        [System.Drawing.Imaging.ImageFormat]::Png
    )
    $companionCanvas.Dispose()
}
finally {
    $moonlight.Dispose()
    $catSource.Dispose()
}

foreach ($number in 1..16) {
    $id = '{0:D3}' -f $number
    $backgroundSource = Join-Path $generatedRoot `
        "backgrounds\hero-$id-background.png"
    $companionSource = Join-Path $generatedRoot `
        "companions\hero-$id-companion.png"
    if (-not (Test-Path -LiteralPath $backgroundSource -PathType Leaf)) {
        throw "缺少英雄背景：$backgroundSource"
    }
    if (-not (Test-Path -LiteralPath $companionSource -PathType Leaf)) {
        throw "缺少英雄伙伴：$companionSource"
    }

    $background = [System.Drawing.Bitmap]::FromFile($backgroundSource)
    try {
        Save-Jpeg `
            -Image $background `
            -Path (Join-Path $backgroundPackRoot "hero-$id-background.jpg")
    }
    finally {
        $background.Dispose()
    }

    if (
        $id -eq '001' -and
        (Test-Path -LiteralPath $animatedCompanionSource -PathType Leaf)
    ) {
        Copy-Item `
            -LiteralPath $animatedCompanionSource `
            -Destination (Join-Path $companionPackRoot 'hero-001-companion.png') `
            -Force
        continue
    }

    $companion = [System.Drawing.Bitmap]::FromFile($companionSource)
    try {
        $runtimeCompanion = [System.Drawing.Bitmap]::new(
            640,
            640,
            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
        )
        $runtimeGraphics = [System.Drawing.Graphics]::FromImage($runtimeCompanion)
        try {
            Set-HighQualityDrawing -Graphics $runtimeGraphics
            $runtimeGraphics.Clear([System.Drawing.Color]::Transparent)
            $runtimeGraphics.DrawImage(
                $companion,
                [System.Drawing.Rectangle]::new(0, 0, 640, 640)
            )
        }
        finally {
            $runtimeGraphics.Dispose()
        }
        Clear-LowAlphaPixels -Bitmap $runtimeCompanion
        $runtimeCompanion.Save(
            (Join-Path $companionPackRoot "hero-$id-companion.png"),
            [System.Drawing.Imaging.ImageFormat]::Png
        )
        $runtimeCompanion.Dispose()
    }
    finally {
        $companion.Dispose()
    }
}

Get-ChildItem -LiteralPath $packRoot -Recurse -File |
    Sort-Object FullName |
    Select-Object FullName, Length
