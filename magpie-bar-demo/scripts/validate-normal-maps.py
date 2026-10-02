"""Verify relief direction independently of RGB sign conventions.

Uses an exported mesh's UV basis, displaced-surface cross products, and the
actual ceramic PNG/JPEG assets. Add --check-glb after re-exporting the model to
also check that the browser GLB embeds the current, verified normal images.
"""
import argparse
import ast
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

BASE = Path(__file__).resolve().parents[1]


def unit(vector):
    return vector / np.linalg.norm(vector, axis=-1, keepdims=True)


def generator():
    # Load only the pure height-to-normal function; importing the texture
    # authoring script would otherwise overwrite assets during validation.
    tree = ast.parse((BASE / 'scripts/make-assets.py').read_text(encoding='utf-8'))
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'normal')
    scope = {'np': np}
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<normal-generator>', 'exec'), scope)
    return scope['normal']


def load_glb():
    data = (BASE / 'models/magpie-bar.glb').read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    json_length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    return gltf, data[28 + json_length:]


def attribute(gltf, binary, index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[accessor['componentType']]
    size = np.dtype(dtype).itemsize
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    return np.ndarray((accessor['count'], width), dtype=dtype, buffer=binary,
                      offset=view.get('byteOffset', 0) + accessor.get('byteOffset', 0),
                      strides=(view.get('byteStride', size * width), size)).copy()


def exported_basis(gltf, binary, material_name):
    material_index = next(i for i, mat in enumerate(gltf['materials']) if mat['name'] == material_name)
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            if primitive.get('material') != material_index:
                continue
            positions = attribute(gltf, binary, primitive['attributes']['POSITION'])
            normals = attribute(gltf, binary, primitive['attributes']['NORMAL'])
            uv = attribute(gltf, binary, primitive['attributes']['TEXCOORD_0'])
            indices = attribute(gltf, binary, primitive['indices']).reshape(-1, 3)
            for triangle in indices:
                p, n, st = positions[triangle], normals[triangle], uv[triangle]
                # A planar face, avoiding curved or degenerate triangles.
                if np.min(n @ n[0]) < .999 or np.linalg.norm(np.cross(p[1]-p[0], p[2]-p[0])) < 1e-6:
                    continue
                q0, q1 = p[1]-p[0], p[2]-p[0]
                st0, st1 = st[1]-st[0], st[2]-st[0]
                surf = unit(n.mean(axis=0))
                # Same derivative construction as Three ShaderChunk's
                # getTangentFrame; no baked assumption about green/up/down.
                q1perp, q0perp = np.cross(q1, surf), np.cross(surf, q0)
                tangent = q1perp * st0[0] + q0perp * st1[0]
                bitangent = q1perp * st0[1] + q0perp * st1[1]
                if min(np.linalg.norm(tangent), np.linalg.norm(bitangent)) < 1e-6:
                    continue
                return unit(tangent), unit(bitangent), surf
    raise AssertionError('No usable UV face for ' + material_name)


def relief_against_geometry(normal_function, basis):
    tangent, bitangent, surf = basis
    rows, cols = np.mgrid[-32:33, -32:33]
    # An asymmetric depression and raised detail ensure neither one-sided
    # mirroring nor simply swapping bump/dent can accidentally pass.
    height = (-1.4 * np.exp(-((cols+9)**2 / 74 + (rows-5)**2 / 145))
              + .7 * np.exp(-((cols-14)**2 / 55 + (rows+12)**2 / 92)))
    strength = 2.7
    points = (cols[..., None]*tangent + rows[..., None]*bitangent
              + (height*2*strength)[..., None]*surf)
    du = points[1:-1, 2:] - points[1:-1, :-2]
    dv = points[2:, 1:-1] - points[:-2, 1:-1]
    geometric = np.cross(du, dv)
    geometric *= np.sign(np.dot(np.cross(tangent, bitangent), surf))
    geometric = unit(geometric)
    encoded = normal_function(height, strength)[1:-1, 1:-1] / 127.5 - 1
    actual = unit(encoded[..., 0, None]*tangent + encoded[..., 1, None]*bitangent + encoded[..., 2, None]*surf)
    angle = np.degrees(np.arccos(np.clip(np.sum(actual*geometric, axis=-1), -1, 1)))
    assert angle.max() < .03, f'Relief direction disagrees with actual displaced geometry: {angle.max():.4f} degrees'
    # Sensitivity: a reversed green channel must fail by a visible angle.
    wrong = encoded.copy()
    wrong[..., 1] *= -1
    wrong_world = unit(wrong[..., 0, None]*tangent + wrong[..., 1, None]*bitangent + wrong[..., 2, None]*surf)
    wrong_angle = np.degrees(np.arccos(np.clip(np.sum(wrong_world*geometric, axis=-1), -1, 1)))
    assert wrong_angle.max() > 30, 'The relief fixture does not detect an inverted green channel'
    return {'maxErrorDegrees': round(float(angle.max()), 6), 'invertedGreenErrorDegrees': round(float(wrong_angle.max()), 3)}


def ceramic_grooves():
    encoded = np.asarray(Image.open(BASE / 'textures/tiles-normal.png').convert('RGB'), dtype=float) / 127.5 - 1
    color = np.asarray(Image.open(BASE / 'textures/tiles.jpg').convert('RGB'), dtype=float).mean(axis=-1)
    rows, cols = np.indices(color.shape)
    checks = {}
    # The color asset locates actual grout independently of height-generation
    # math: dark seams transition to bright ceramic in both image directions.
    for axis, component, away_from_crossing, label in [
        (1, 0, (rows % 64 > 12) & (rows % 64 < 52), 'verticalGrout'),
        (0, 1, (cols % 64 > 12) & (cols % 64 < 52), 'horizontalGrout')]:
        slope = np.roll(color, -1, axis=axis) - np.roll(color, 1, axis=axis)
        mask = away_from_crossing & (np.abs(slope) > 20) & (np.abs(encoded[..., component]) > .08)
        assert mask.sum() > 500, 'Too few actual ceramic bevel samples'
        # A bevel's normal points back toward its lower, dark grout side.
        agreement = np.mean(encoded[..., component][mask] * slope[mask] < 0)
        assert agreement > .995, f'{label} protrudes instead of receding: {agreement:.2%}'
        checks[label] = {'samples': int(mask.sum()), 'recessDirectionAgreement': float(agreement)}
    return checks


def current_assets_in_glb(gltf, binary):
    checked = set()
    for material in gltf['materials']:
        if 'normalTexture' not in material:
            continue
        texture = gltf['textures'][material['normalTexture']['index']]
        image = gltf['images'][texture['source']]
        name = Path(image['name']).name
        disk = BASE / 'textures' / name
        view = gltf['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        payload = binary[start:start + view['byteLength']]
        assert payload == disk.read_bytes(), f'GLB normal is stale: {name}; re-export the model'
        decoded = np.asarray(Image.open(io.BytesIO(payload)).convert('RGB'))
        assert decoded.shape == (512, 512, 3) and decoded[..., 2].min() >= 200
        checked.add(name)
    assert len(checked) >= 5, f'Missing normal assets: {checked}'
    return sorted(checked)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check-glb', action='store_true')
    args = parser.parse_args()
    gltf, binary = load_glb()
    normal_function = generator()
    result = {'geometryComparison': {name: relief_against_geometry(normal_function, exported_basis(gltf, binary, name))
                                   for name in ['Ceramic floor tile', 'Walnut furniture']},
              'actualTextureGrooves': ceramic_grooves()}
    if args.check_glb:
        result['embeddedCurrentNormals'] = current_assets_in_glb(gltf, binary)
    result['result'] = 'PASS'
    print(json.dumps(result, indent=2))
