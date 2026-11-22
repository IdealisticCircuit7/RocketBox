param([string[]]$Names = @())
# Controlled local SVG subset: paths, circles, linear gradients and matrix transforms.
# Windows WPF exports real transparent PNGs without adding application dependencies.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase
$scriptDirectory = if ($PSScriptRoot) { $PSScriptRoot } else { Join-Path (Get-Location).Path 'scripts' }
$iconDirectory = Join-Path $scriptDirectory '..\src\assets\icons\formats'
function Number($value) { [double]::Parse($value, [cultureinfo]::InvariantCulture) }
function Attribute($element, $name, $fallback) {
    while ($element -is [Xml.XmlElement]) {
        if ($element.HasAttribute($name)) { return $element.GetAttribute($name) }
        $style = $element.GetAttribute('style')
        $match = [regex]::Match($style, '(?:^|;)\s*' + [regex]::Escape($name) + '\s*:\s*([^;]+)')
        if ($match.Success) { return $match.Groups[1].Value.Trim() }
        $element = $element.ParentNode
    }
    return $fallback
}
function Brush($value) {
    if ($value -eq 'none') { return $null }
    if ($value -match '^url\(#([a-z]+)\)$') {
        $gradient = $svg.SelectSingleNode("//s:linearGradient[@id='$($Matches[1])']", $ns)
        if (!$gradient) { throw "Undefined gradient: $value" }
        $brush = [Windows.Media.LinearGradientBrush]::new()
        $brush.MappingMode = [Windows.Media.BrushMappingMode]::Absolute
        $brush.StartPoint = [Windows.Point]::new((Number $gradient.x1), (Number $gradient.y1))
        $brush.EndPoint = [Windows.Point]::new((Number $gradient.x2), (Number $gradient.y2))
        foreach ($stop in $gradient.SelectNodes('s:stop', $ns)) {
            $offset = if ($stop.HasAttribute('offset')) { Number $stop.offset } else { 0 }
            $color = [Windows.Media.ColorConverter]::ConvertFromString($stop.GetAttribute('stop-color'))
            $brush.GradientStops.Add([Windows.Media.GradientStop]::new($color, $offset))
        }
        return $brush
    }
    return [Windows.Media.SolidColorBrush]::new([Windows.Media.ColorConverter]::ConvertFromString($value))
}
function Matrix-For($element) {
    $combined = [Windows.Media.Matrix]::Identity
    while ($element -is [Xml.XmlElement]) {
        $value = $element.GetAttribute('transform')
        if ($value) {
            if ($value -notmatch '^matrix\(([^)]+)\)$') { throw "Unsupported transform: $value" }
            $values = [regex]::Split($Matches[1].Trim(), '[,\s]+') | ForEach-Object { Number $_ }
            $combined.Append([Windows.Media.Matrix]::new($values[0],$values[1],$values[2],$values[3],$values[4],$values[5]))
        }
        $element = $element.ParentNode
    }
    return $combined
}
$reports = @()
$files = Get-ChildItem -LiteralPath $iconDirectory -Filter '*.svg'
if ($Names.Count) { $files = $files | Where-Object { $_.BaseName -in $Names } }
foreach ($file in $files) {
    [xml]$svg = Get-Content -LiteralPath $file.FullName -Raw
    if ($svg.svg.viewBox -ne '0 0 64 64') { throw "Unexpected viewBox: $($file.Name)" }
    $ns = [Xml.XmlNamespaceManager]::new($svg.NameTable)
    $ns.AddNamespace('s', 'http://www.w3.org/2000/svg')
    if ($svg.SelectNodes('//s:image | //s:script | //s:foreignObject | //s:text | //s:use', $ns).Count) { throw 'Unsupported or non-vector content.' }
    foreach ($size in @(512, 256, 48, 32, 24)) {
        $visual = [Windows.Media.DrawingVisual]::new()
        $context = $visual.RenderOpen()
        $context.PushTransform([Windows.Media.ScaleTransform]::new($size / 64.0, $size / 64.0))
        foreach ($shape in $svg.SelectNodes('//s:path | //s:circle', $ns)) {
            $geometry = if ($shape.LocalName -eq 'path') { [Windows.Media.Geometry]::Parse($shape.d) } else {
                [Windows.Media.EllipseGeometry]::new([Windows.Point]::new((Number $shape.cx), (Number $shape.cy)), (Number $shape.r), (Number $shape.r))
            }
            if ($geometry -is [Windows.Media.PathGeometry]) { $geometry.FillRule = if ((Attribute $shape 'fill-rule' 'nonzero') -eq 'evenodd') { [Windows.Media.FillRule]::EvenOdd } else { [Windows.Media.FillRule]::Nonzero } }
            $fill = Brush (Attribute $shape 'fill' 'black')
            if ($fill) { $fill.Opacity = Number (Attribute $shape 'fill-opacity' '1') }
            $stroke = Brush (Attribute $shape 'stroke' 'none')
            $pen = $null
            if ($stroke) {
                $stroke.Opacity = Number (Attribute $shape 'stroke-opacity' '1')
                $pen = [Windows.Media.Pen]::new($stroke, (Number (Attribute $shape 'stroke-width' '1')))
                $pen.StartLineCap = $pen.EndLineCap = [Windows.Media.PenLineCap]::Round
                $pen.LineJoin = [Windows.Media.PenLineJoin]::Round
            }
            $context.PushTransform([Windows.Media.MatrixTransform]::new((Matrix-For $shape)))
            $context.DrawGeometry($fill, $pen, $geometry)
            $context.Pop()
        }
        $context.Pop(); $context.Close()
        $bitmap = [Windows.Media.Imaging.RenderTargetBitmap]::new($size,$size,96,96,[Windows.Media.PixelFormats]::Pbgra32)
        $bitmap.Render($visual)
        $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new()
        $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
        $directory = if ($size -eq 512) { $iconDirectory } else { Join-Path $iconDirectory "$size" }
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $stream = [IO.File]::Create((Join-Path $directory ($file.BaseName + '.png')))
        try { $encoder.Save($stream) } finally { $stream.Dispose() }
        $pixels = [byte[]]::new($size * $size * 4)
        $bitmap.CopyPixels($pixels, $size * 4, 0)
        $transparent=0; $visible=0; $boundary=0
        for ($y=0; $y -lt $size; $y++) { for ($x=0; $x -lt $size; $x++) {
            $alpha=$pixels[($y*$size+$x)*4+3]
            if (!$alpha) { $transparent++ } else { $visible++; if ($x -eq 0 -or $y -eq 0 -or $x -eq ($size-1) -or $y -eq ($size-1)) { $boundary++ } }
        } }
        if (!$transparent -or !$visible -or $boundary) { throw "Invalid transparency or clipped artwork: $($file.Name) $size" }
        $reports += [pscustomobject]@{icon=$file.BaseName;size=$size;transparentPixels=$transparent;visiblePixels=$visible;boundaryPixels=$boundary}
    }
    Write-Output ($file.BaseName + ': 512, 256, 48, 32, 24 verified')
}
$reports | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $iconDirectory 'export-validation.json') -Encoding utf8
