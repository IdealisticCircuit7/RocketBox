"""Normalize original brand geometry; never synthesize replacement brand marks.

Requires fontTools and Brotli as export tools only, not RocketBox dependencies.
Source files and provenance are documented in the icon package README.
"""
from pathlib import Path
import re
import sys
import tempfile
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(tempfile.gettempdir()) / 'rocketbox-icon-tools'))
from fontTools.misc.transform import Transform, Identity
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/icons/formats'
NS = {'s': 'http://www.w3.org/2000/svg'}

def svg_paths(filename, count=None, fill=None):
    root = ET.parse(OUT / 'official' / filename).getroot()
    parents = {child: parent for parent in root.iter() for child in parent}
    result = []
    for path in root.findall('.//s:path', NS)[:count]:
        chain, node = [], path
        while node is not None:
            chain.append(node)
            node = parents.get(node)
        transform = Identity
        for node in reversed(chain):
            value = node.get('transform')
            if value:
                match = re.fullmatch(r'matrix\(([^)]+)\)', value)
                if not match:
                    raise ValueError(f'Unsupported source transform: {value}')
                transform = transform.transform(Transform(*map(float, re.split(r'[,\s]+', match[1]))))
        color = fill
        if color is None:
            style = path.get('style', '')
            match = re.search(r'(?:^|;)fill:([^;]+)', style)
            color = path.get('fill') or (match[1] if match else 'black')
        if color.startswith('rgb('):
            values = list(map(int, re.findall(r'\d+', color)))
            color = '#' + ''.join(f'{value:02X}' for value in values)
        result.append((path.get('d'), transform, color))
    return result

def save(name, paths, description):
    bounds = []
    for d, transform, _ in paths:
        pen = BoundsPen(None)
        parse_path(d, TransformPen(pen, transform))
        if pen.bounds:
            bounds.append(pen.bounds)
    x0, y0 = min(b[0] for b in bounds), min(b[1] for b in bounds)
    x1, y1 = max(b[2] for b in bounds), max(b[3] for b in bounds)
    scale = 48 / max(x1-x0, y1-y0)
    normalizer = Transform(scale, 0, 0, scale, 32-scale*(x0+x1)/2, 32-scale*(y0+y1)/2)
    lines = ['<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64">',
             f'<title>{name.title()} official symbol</title>', f'<desc>{description}</desc>']
    for d, transform, color in paths:
        matrix = normalizer.transform(transform)
        values = ' '.join(format(value, '.12g') for value in matrix)
        lines.append(f'<path fill="{color}" fill-rule="nonzero" transform="matrix({values})" d="{d}"/>')
    lines.append('</svg>')
    (OUT / (name + '.svg')).write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(name, 'original vector geometry, square transparent canvas')

# The kit's first three paths are the isolated logomark: white surround, blue eye, orange outline.
save('blender', svg_paths('blender-original.svg', count=3),
     'Original symbol paths from the Blender Foundation official logo kit; original colors preserved.')
save('unity', svg_paths('unity-original.svg', fill='#FFFFFF'),
     'Original white cube path from Unity Brandfolder U_Cube_1C_White.svg; geometry and white color preserved.')

font = TTFont(OUT / 'official/unreal-eds-icons.woff2')
glyph_name = font.getBestCmap()[0xF146]  # Official CSS: .icon-unreal-engine:before {content:"\f146"}
glyphs = font.getGlyphSet()
pen = SVGPathPen(glyphs)
glyphs[glyph_name].draw(pen)
save('unreal', [(pen.getCommands(), Transform(1,0,0,-1,0,0), '#FFFFFF')],
     'Exact Unreal Engine glyph F146 from the Epic Developer Community EDS Icons font; exported as white paths without redesign.')
