# Export this controlled SVG's paths and circles using Windows' built-in vector renderer.
# This is intentionally not a general-purpose SVG parser. No external modules are needed.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase
$exportScriptDirectory = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location).Path 'scripts' }
$iconDirectory = Join-Path $exportScriptDirectory '..\src\assets\icons\formats'
[xml]$svg = Get-Content -LiteralPath (Join-Path $iconDirectory 'fbx.svg') -Raw
$ns = [System.Xml.XmlNamespaceManager]::new($svg.NameTable)
$ns.AddNamespace('s', 'http://www.w3.org/2000/svg')
function Get-Attribute($element, $name, $fallback) {
    while ($element -is [System.Xml.XmlElement]) {
        if ($element.HasAttribute($name)) { return $element.GetAttribute($name) }
        $element = $element.ParentNode
    }
    return $fallback
}
function New-Brush($value) {
    if ($value -eq 'none') { return $null }
    if ($value -match '^url\(#([a-z]+)\)$') {
        $gradient = $svg.SelectSingleNode("//s:linearGradient[@id='$($Matches[1])']", $ns)
        $brush = [System.Windows.Media.LinearGradientBrush]::new()
        $brush.MappingMode = [System.Windows.Media.BrushMappingMode]::Absolute
        $brush.StartPoint = [System.Windows.Point]::new([double]$gradient.x1, [double]$gradient.y1)
        $brush.EndPoint = [System.Windows.Point]::new([double]$gradient.x2, [double]$gradient.y2)
        foreach ($stop in $gradient.ChildNodes) {
            if ($stop.LocalName -ne 'stop') { continue }
            $offset = if ($stop.HasAttribute('offset')) { [double]::Parse($stop.offset, [cultureinfo]::InvariantCulture) } else { 0 }
            $color = [System.Windows.Media.ColorConverter]::ConvertFromString($stop.GetAttribute('stop-color'))
            $brush.GradientStops.Add([System.Windows.Media.GradientStop]::new($color, $offset))
        }
        return $brush
    }
    return [System.Windows.Media.SolidColorBrush]::new([System.Windows.Media.ColorConverter]::ConvertFromString($value))
}
foreach ($size in @(512, 256, 48, 32, 24)) {
    $visual = [System.Windows.Media.DrawingVisual]::new()
    $context = $visual.RenderOpen()
    $context.PushTransform([System.Windows.Media.ScaleTransform]::new($size / 64.0, $size / 64.0))
    foreach ($shape in $svg.SelectNodes('//s:path | //s:circle', $ns)) {
        $geometry = if ($shape.LocalName -eq 'path') {
            [System.Windows.Media.Geometry]::Parse($shape.d)
        } else {
            [System.Windows.Media.EllipseGeometry]::new([System.Windows.Point]::new([double]$shape.cx, [double]$shape.cy), [double]$shape.r, [double]$shape.r)
        }
        $fill = New-Brush (Get-Attribute $shape 'fill' 'none')
        $stroke = New-Brush (Get-Attribute $shape 'stroke' 'none')
        $pen = $null
        if ($null -ne $stroke) {
            $stroke.Opacity = [double]::Parse((Get-Attribute $shape 'stroke-opacity' '1'), [cultureinfo]::InvariantCulture)
            $width = [double]::Parse((Get-Attribute $shape 'stroke-width' '1'), [cultureinfo]::InvariantCulture)
            $pen = [System.Windows.Media.Pen]::new($stroke, $width)
            $pen.StartLineCap = $pen.EndLineCap = [System.Windows.Media.PenLineCap]::Round
            $pen.LineJoin = [System.Windows.Media.PenLineJoin]::Round
        }
        $context.DrawGeometry($fill, $pen, $geometry)
    }
    $context.Pop()
    $context.Close()
    $bitmap = [System.Windows.Media.Imaging.RenderTargetBitmap]::new($size, $size, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder = [System.Windows.Media.Imaging.PngBitmapEncoder]::new()
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $directory = if ($size -eq 512) { $iconDirectory } else { Join-Path $iconDirectory "$size" }
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    $output = Join-Path $directory 'fbx.png'
    $stream = [System.IO.File]::Create($output)
    try { $encoder.Save($stream) } finally { $stream.Dispose() }
    $pixels = [byte[]]::new($size * $size * 4)
    $bitmap.CopyPixels($pixels, $size * 4, 0)
    if ($pixels[3] -ne 0) { throw 'The transparent corner check failed.' }
    Write-Output "$size x $size PNG exported with transparent canvas."
}
