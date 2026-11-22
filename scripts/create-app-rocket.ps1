Add-Type -AssemblyName PresentationCore,WindowsBase
$group=[Windows.Media.DrawingGroup]::new()
$parts=@(@('M12 1C7 5 6 10 7 17L12 19 17 17C18 10 17 5 12 1Z','#E6F2FA'),@('M7 12 2 18 2 23 8 19Z','#55DDF5'),@('M17 12 22 18 22 23 16 19Z','#9980E8'),@('M9 19 12 25 15 19Z','#40D8F5'))
foreach($part in $parts){$geometry=[Windows.Media.Geometry]::Parse($part[0]);$brush=[Windows.Media.BrushConverter]::new().ConvertFromString($part[1]);$group.Children.Add([Windows.Media.GeometryDrawing]::new($brush,$null,$geometry))}
$eye=[Windows.Media.EllipseGeometry]::new([Windows.Point]::new(12,10),2.5,2.5)
$group.Children.Add([Windows.Media.GeometryDrawing]::new([Windows.Media.BrushConverter]::new().ConvertFromString('#102B43'),[Windows.Media.Pen]::new([Windows.Media.BrushConverter]::new().ConvertFromString('#45DFF5'),.8),$eye))
$group.Transform=[Windows.Media.RotateTransform]::new(40,12,12)
$bounds=$group.Bounds;$scale=960/[Math]::Max($bounds.Width,$bounds.Height)
$visual=[Windows.Media.DrawingVisual]::new();$dc=$visual.RenderOpen()
$dc.PushTransform([Windows.Media.TranslateTransform]::new(512-$bounds.X*$scale-$bounds.Width*$scale/2,512-$bounds.Y*$scale-$bounds.Height*$scale/2))
$dc.PushTransform([Windows.Media.ScaleTransform]::new($scale,$scale));$dc.DrawDrawing($group);$dc.Pop();$dc.Pop();$dc.Close()
$bitmap=[Windows.Media.Imaging.RenderTargetBitmap]::new(1024,1024,96,96,[Windows.Media.PixelFormats]::Pbgra32);$bitmap.Render($visual)
$encoder=[Windows.Media.Imaging.PngBitmapEncoder]::new();$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
$stream=[IO.File]::Create((Join-Path (Get-Location) 'src-tauri/icons/rocket-source.png'));try{$encoder.Save($stream)}finally{$stream.Dispose()}