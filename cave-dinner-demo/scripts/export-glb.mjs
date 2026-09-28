/**
 * Deterministic, renderer-free glTF 2.0 / GLB export for the restaurant builder.
 * Run from any directory: node scripts/export-glb.mjs
 * Supported: static Groups/Meshes, indexed or non-indexed triangle geometry,
 * material groups, PBR materials, local PNG/JPEG textures and punctual lights.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../vendor/three.module.min.js';

const demoDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const byteSizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const typeSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const align4 = value => Math.ceil(value / 4) * 4;
const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`Non-finite ${label}: ${value}`);
  return value;
};

function jsonData(value) {
  if (value === undefined || value === null) return undefined;
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (typeof entry === 'function' || typeof entry === 'symbol') return undefined;
    if (typeof entry === 'number' && !Number.isFinite(entry)) return undefined;
    if (entry && typeof entry === 'object') {
      if (entry.isObject3D || entry.isMaterial || entry.isTexture || entry.isBufferGeometry) return undefined;
      if (seen.has(entry)) return undefined;
      seen.add(entry);
    }
    return entry;
  }) ?? 'null');
}

function cleanExtras(value) {
  const data = jsonData(value);
  return data && Object.keys(data).length ? data : undefined;
}

/** Export an already-built Three.js scene without WebGL or a DOM. */
export async function exportSceneToGlb(root, metadata = {}, options = {}) {
  if (!root?.isObject3D) throw new Error('buildRestaurant() must return an Object3D in root.');
  const assetRoot = resolve(options.assetRoot ?? demoDirectory);
  const gltf = {
    asset: { version: '2.0', generator: 'Cave Restaurant static scene exporter 2.0' },
    scene: 0,
    scenes: [{ name: root.name || 'Cave Restaurant', nodes: [] }],
    nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };
  const chunks = [];
  let binaryLength = 0;
  const materialCache = new Map();
  const meshCache = new Map();
  const attributeCache = new Map();
  const imageCache = new Map();
  const textureCache = new Map();
  const samplerCache = new Map();
  const extensions = new Set();
  const warnings = new Set();
  const stats = { nodes: 0, meshes: 0, primitives: 0, vertices: 0, triangles: 0, materials: 0, images: 0, imageBytes: 0, lights: 0, meshInstances: 0 };

  function bufferView(bytes, target, name) {
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = align4(binaryLength);
    if (offset > binaryLength) chunks.push(Buffer.alloc(offset - binaryLength));
    chunks.push(data);
    binaryLength = offset + data.length;
    const view = { buffer: 0, byteOffset: offset, byteLength: data.length };
    if (target !== undefined) view.target = target;
    if (name) view.name = name;
    return gltf.bufferViews.push(view) - 1;
  }

  function attributeAccessor(geometry, sourceName, semantic, itemSize) {
    const key = `${geometry.uuid}:${sourceName}:${itemSize}`;
    if (attributeCache.has(key)) return attributeCache.get(key);
    const source = geometry.getAttribute(sourceName);
    if (!source) return undefined;
    if (source.itemSize < itemSize || !source.count) throw new Error(`Invalid ${semantic} attribute in ${geometry.name || geometry.uuid}`);
    const values = new Float32Array(source.count * itemSize);
    const minimum = Array(itemSize).fill(Infinity);
    const maximum = Array(itemSize).fill(-Infinity);
    for (let i = 0; i < source.count; i++) {
      for (let component = 0; component < itemSize; component++) {
        const value = finite(source.getComponent(i, component), `${semantic}[${i},${component}]`);
        values[i * itemSize + component] = value;
        minimum[component] = Math.min(minimum[component], values[i * itemSize + component]);
        maximum[component] = Math.max(maximum[component], values[i * itemSize + component]);
      }
    }
    const accessor = {
      bufferView: bufferView(values, 34962, semantic),
      componentType: 5126, count: source.count, type: `VEC${itemSize}`,
    };
    if (semantic === 'POSITION') { accessor.min = minimum; accessor.max = maximum; }
    const index = gltf.accessors.push(accessor) - 1;
    attributeCache.set(key, index);
    return index;
  }

  function indexAccessor(geometry, start, count) {
    const key = `${geometry.uuid}:indices:${start}:${count}`;
    if (attributeCache.has(key)) return attributeCache.get(key);
    const source = geometry.getIndex();
    const vertexCount = geometry.getAttribute('position').count;
    const values = new Array(count);
    let maximum = 0;
    for (let i = 0; i < count; i++) {
      const value = source ? source.getX(start + i) : start + i;
      if (!Number.isInteger(value) || value < 0 || value >= vertexCount) throw new Error(`Index ${value} outside geometry vertex range ${vertexCount}.`);
      values[i] = value;
      maximum = Math.max(maximum, value);
    }
    const typed = maximum < 65536 ? new Uint16Array(values) : new Uint32Array(values);
    const accessor = {
      bufferView: bufferView(typed, 34963, 'indices'),
      componentType: maximum < 65536 ? 5123 : 5125,
      count, type: 'SCALAR',
    };
    const index = gltf.accessors.push(accessor) - 1;
    attributeCache.set(key, index);
    return index;
  }

  async function exportTexture(texture) {
    const uri = texture.userData?.uri;
    if (!uri || typeof uri !== 'string') throw new Error(`Texture ${texture.name || texture.uuid} needs userData.uri pointing to a local PNG/JPEG.`);
    const texturePath = resolve(assetRoot, uri);
    const relativePath = relative(assetRoot, texturePath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error(`Texture path outside demo: ${uri}`);
    let imageIndex = imageCache.get(texturePath);
    if (imageIndex === undefined) {
      const bytes = await readFile(texturePath);
      const extension = extname(texturePath).toLowerCase();
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpg) throw new Error(`Only valid PNG/JPEG textures can be embedded: ${uri} (${extension})`);
      imageIndex = (gltf.images ??= []).push({
        name: texture.name || relativePath.replaceAll('\\', '/'),
        bufferView: bufferView(bytes, undefined, relativePath.replaceAll('\\', '/')),
        mimeType: png ? 'image/png' : 'image/jpeg',
      }) - 1;
      imageCache.set(texturePath, imageIndex);
      stats.imageBytes += bytes.length;
    }
    const sampler = {
      magFilter: texture.magFilter === THREE.NearestFilter ? 9728 : 9729,
      minFilter: new Map([
        [THREE.NearestFilter, 9728], [THREE.LinearFilter, 9729],
        [THREE.NearestMipmapNearestFilter, 9984], [THREE.LinearMipmapNearestFilter, 9985],
        [THREE.NearestMipmapLinearFilter, 9986], [THREE.LinearMipmapLinearFilter, 9987],
      ]).get(texture.minFilter) ?? 9987,
      wrapS: new Map([[THREE.RepeatWrapping, 10497], [THREE.ClampToEdgeWrapping, 33071], [THREE.MirroredRepeatWrapping, 33648]]).get(texture.wrapS) ?? 33071,
      wrapT: new Map([[THREE.RepeatWrapping, 10497], [THREE.ClampToEdgeWrapping, 33071], [THREE.MirroredRepeatWrapping, 33648]]).get(texture.wrapT) ?? 33071,
    };
    const samplerKey = JSON.stringify(sampler);
    let samplerIndex = samplerCache.get(samplerKey);
    if (samplerIndex === undefined) {
      samplerIndex = (gltf.samplers ??= []).push(sampler) - 1;
      samplerCache.set(samplerKey, samplerIndex);
    }
    const key = `${imageIndex}:${samplerIndex}`;
    let textureIndex = textureCache.get(key);
    if (textureIndex === undefined) {
      textureIndex = (gltf.textures ??= []).push({ source: imageIndex, sampler: samplerIndex }) - 1;
      textureCache.set(key, textureIndex);
    }
    return textureIndex;
  }

  async function textureInfo(texture) {
    const info = { index: await exportTexture(texture) };
    if (texture.channel) info.texCoord = texture.channel;
    const offset = texture.offset?.toArray() ?? [0, 0];
    const repeat = texture.repeat?.toArray() ?? [1, 1];
    const rotation = texture.rotation ?? 0;
    if (rotation !== 0 && (texture.center?.x || texture.center?.y)) throw new Error('Texture center plus rotation must be baked into UVs before export.');
    if (texture.flipY !== false) warnings.add(`Texture ${texture.userData.uri} has flipY=true; builder should use flipY=false for glTF-native UVs.`);
    if (offset.some(value => value !== 0) || repeat.some(value => value !== 1) || rotation !== 0) {
      extensions.add('KHR_texture_transform');
      const transform = {};
      if (offset.some(value => value !== 0)) transform.offset = offset;
      if (repeat.some(value => value !== 1)) transform.scale = repeat;
      if (rotation !== 0) transform.rotation = rotation;
      info.extensions = { KHR_texture_transform: transform };
    }
    return info;
  }

  async function exportMaterial(material) {
    if (materialCache.has(material.uuid)) return materialCache.get(material.uuid);
    const color = material.color?.toArray() ?? [1, 1, 1];
    const result = {
      name: material.name || `Material ${gltf.materials.length + 1}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...color, material.opacity ?? 1],
        metallicFactor: material.metalness ?? 0,
        roughnessFactor: material.roughness ?? 1,
      },
    };
    const pbr = result.pbrMetallicRoughness;
    if (material.map) pbr.baseColorTexture = await textureInfo(material.map);
    if (material.roughnessMap || material.metalnessMap) {
      if (material.roughnessMap && material.metalnessMap && material.roughnessMap.userData?.uri !== material.metalnessMap.userData?.uri) {
        throw new Error(`Material ${result.name}: roughness/metalness need one packed ARM texture.`);
      }
      pbr.metallicRoughnessTexture = await textureInfo(material.roughnessMap || material.metalnessMap);
    }
    if (material.normalMap) {
      result.normalTexture = await textureInfo(material.normalMap);
      const scale = material.normalScale?.x ?? 1;
      if (material.normalScale && Math.abs(material.normalScale.x - material.normalScale.y) > 1e-7) {
        warnings.add(`Material ${result.name}: glTF normalScale uses X; non-uniform normal scale needs baking for exact fidelity.`);
      }
      result.normalTexture.scale = scale;
    }
    if (material.aoMap) { result.occlusionTexture = await textureInfo(material.aoMap); result.occlusionTexture.strength = material.aoMapIntensity ?? 1; }
    const emissive = material.emissive?.toArray() ?? [0, 0, 0];
    if (emissive.some(value => value > 0) || material.emissiveMap) {
      const intensity = material.emissiveIntensity ?? 1;
      result.emissiveFactor = emissive.map(value => value * Math.min(1, intensity));
      if (intensity > 1) {
        extensions.add('KHR_materials_emissive_strength');
        (result.extensions ??= {}).KHR_materials_emissive_strength = { emissiveStrength: intensity };
      }
      if (material.emissiveMap) result.emissiveTexture = await textureInfo(material.emissiveMap);
    }
    if (material.alphaTest > 0) { result.alphaMode = 'MASK'; result.alphaCutoff = material.alphaTest; }
    else if (material.transparent) result.alphaMode = 'BLEND';
    if (material.side === THREE.DoubleSide || material.side === THREE.BackSide) result.doubleSided = true;
    if (material.side === THREE.BackSide) warnings.add(`Material ${result.name}: BackSide exported double-sided; normals should face inward in the builder.`);
    if (material.isMeshBasicMaterial) { extensions.add('KHR_materials_unlit'); (result.extensions ??= {}).KHR_materials_unlit = {}; }
    if (material.isMeshPhysicalMaterial) {
      if (material.transmission > 0) {
        extensions.add('KHR_materials_transmission');
        (result.extensions ??= {}).KHR_materials_transmission = { transmissionFactor: material.transmission };
        if (material.transmissionMap) result.extensions.KHR_materials_transmission.transmissionTexture = await textureInfo(material.transmissionMap);
      }
      if (material.thickness > 0) {
        extensions.add('KHR_materials_volume');
        const volume = { thicknessFactor: material.thickness, attenuationColor: material.attenuationColor.toArray() };
        if (Number.isFinite(material.attenuationDistance)) volume.attenuationDistance = material.attenuationDistance;
        if (material.thicknessMap) volume.thicknessTexture = await textureInfo(material.thicknessMap);
        (result.extensions ??= {}).KHR_materials_volume = volume;
      }
      if (material.ior && material.ior !== 1.5) {
        extensions.add('KHR_materials_ior');
        (result.extensions ??= {}).KHR_materials_ior = { ior: material.ior };
      }
      if (material.clearcoat > 0) {
        extensions.add('KHR_materials_clearcoat');
        (result.extensions ??= {}).KHR_materials_clearcoat = { clearcoatFactor: material.clearcoat, clearcoatRoughnessFactor: material.clearcoatRoughness };
      }
    }
    result.extras = cleanExtras(material.userData);
    if (!result.extras) delete result.extras;
    const index = gltf.materials.push(result) - 1;
    materialCache.set(material.uuid, index);
    return index;
  }

  async function exportMesh(object) {
    const geometry = object.geometry;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const key = `${geometry.uuid}:${materials.map(material => material.uuid).join(',')}`;
    if (meshCache.has(key)) return meshCache.get(key);
    if (object.isSkinnedMesh) throw new Error('Skinned meshes are not supported by the static restaurant exporter.');
    if (Object.keys(geometry.morphAttributes).length) throw new Error('Morph targets must be baked before static export.');
    if (!geometry.getAttribute('position')) throw new Error(`Mesh ${object.name} has no positions.`);
    const attributes = { POSITION: attributeAccessor(geometry, 'position', 'POSITION', 3) };
    for (const [name, semantic, size] of [['normal', 'NORMAL', 3], ['uv', 'TEXCOORD_0', 2], ['uv1', 'TEXCOORD_1', 2], ['uv2', 'TEXCOORD_2', 2], ['tangent', 'TANGENT', 4]]) {
      const accessor = attributeAccessor(geometry, name, semantic, size);
      if (accessor !== undefined) attributes[semantic] = accessor;
    }
    const colorAttribute = geometry.getAttribute('color');
    const colorAccessor = colorAttribute ? attributeAccessor(geometry, 'color', 'COLOR_0', Math.min(4, colorAttribute.itemSize)) : undefined;
    const total = geometry.getIndex()?.count ?? geometry.getAttribute('position').count;
    const drawStart = geometry.drawRange.start ?? 0;
    const drawEnd = Math.min(total, drawStart + geometry.drawRange.count);
    const groups = Array.isArray(object.material) && geometry.groups.length ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const primitives = [];
    for (const group of groups) {
      const start = Math.max(drawStart, group.start);
      const end = Math.min(drawEnd, group.start + group.count);
      const count = end - start;
      if (count <= 0) continue;
      if (count % 3 !== 0) throw new Error(`Mesh ${object.name}: triangle index count ${count} is not divisible by 3.`);
      const material = materials[group.materialIndex ?? 0];
      if (!material) throw new Error(`Mesh ${object.name}: missing material ${group.materialIndex}.`);
      const primitive = { attributes: { ...attributes }, material: await exportMaterial(material), mode: 4 };
      if (colorAccessor !== undefined && material.vertexColors) primitive.attributes.COLOR_0 = colorAccessor;
      if (geometry.getIndex() || start !== 0 || count !== total) primitive.indices = indexAccessor(geometry, start, count);
      primitives.push(primitive);
      stats.triangles += count / 3;
    }
    if (!primitives.length) throw new Error(`Mesh ${object.name} has an empty draw range.`);
    const mesh = { name: object.name || geometry.name || `Mesh ${gltf.meshes.length + 1}`, primitives };
    const geometryExtras = cleanExtras(geometry.userData);
    if (geometryExtras) mesh.extras = geometryExtras;
    const index = gltf.meshes.push(mesh) - 1;
    meshCache.set(key, index);
    stats.primitives += primitives.length;
    stats.vertices += geometry.getAttribute('position').count;
    return index;
  }

  function exportLight(object, node) {
    const type = object.isPointLight ? 'point' : object.isSpotLight ? 'spot' : object.isDirectionalLight ? 'directional' : null;
    if (!type) { warnings.add(`Ambient light ${object.name || object.type} is a renderer setting and is not part of glTF punctual lights.`); return; }
    extensions.add('KHR_lights_punctual');
    const lights = ((gltf.extensions ??= {}).KHR_lights_punctual ??= { lights: [] }).lights;
    const light = { name: object.name || `${type} ${lights.length + 1}`, type, color: object.color.toArray(), intensity: finite(object.intensity, 'light intensity') };
    if (object.distance > 0 && type !== 'directional') light.range = object.distance;
    if (type === 'spot') light.spot = { innerConeAngle: object.angle * (1 - object.penumbra), outerConeAngle: Math.min(Math.PI / 2, object.angle) };
    const lightIndex = lights.push(light) - 1;
    stats.lights++;
    const lightExtension = { KHR_lights_punctual: { light: lightIndex } };
    if (type === 'point') node.extensions = { ...node.extensions, ...lightExtension };
    else {
      // Three's spot/directional light points at target independently of node rotation.
      const position = object.getWorldPosition(new THREE.Vector3());
      object.target.updateWorldMatrix(true, false);
      const target = object.target.getWorldPosition(new THREE.Vector3());
      const desired = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, object.up));
      const local = object.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired).normalize();
      const orientedNode = { name: `${light.name} direction`, rotation: local.toArray(), extensions: lightExtension };
      (node.children ??= []).push(gltf.nodes.push(orientedNode) - 1);
    }
  }

  async function exportNode(object) {
    if (object.isInstancedMesh) throw new Error(`InstancedMesh ${object.name} must be expanded or merged before export.`);
    const node = { name: object.name || object.type };
    if (object.matrixAutoUpdate) object.updateMatrix();
    const matrix = object.matrix.toArray().map((value, i) => finite(value, `${node.name} matrix[${i}]`));
    if (!matrix.every((value, i) => Math.abs(value - identity[i]) < 1e-12)) node.matrix = matrix;
    const extras = cleanExtras(object.userData);
    if (extras) node.extras = extras;
    // Visibility is intentionally not a filter: complete shell and cutaway parts export.
    const nodeIndex = gltf.nodes.push(node) - 1;
    if (object.isMesh) { node.mesh = await exportMesh(object); stats.meshInstances++; }
    else if (object.isLine || object.isPoints) warnings.add(`${object.type} ${object.name} omitted; exporter supports architectural triangle geometry.`);
    if (object.isLight) exportLight(object, node);
    for (const child of object.children) (node.children ??= []).push(await exportNode(child));
    return nodeIndex;
  }

  root.updateMatrixWorld(true);
  gltf.scenes[0].nodes = [await exportNode(root)];
  const metadataCopy = jsonData(metadata);
  if (metadataCopy) gltf.scenes[0].extras = metadataCopy;
  if (extensions.size) gltf.extensionsUsed = [...extensions].sort();
  gltf.buffers[0].byteLength = binaryLength;
  const binary = Buffer.concat(chunks, binaryLength);
  validateDocument(gltf, binary);
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonLength = align4(json.length), binLength = align4(binary.length);
  const glb = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonLength, 12); glb.writeUInt32LE(0x4e4f534a, 16);
  glb.fill(0x20, 20, 20 + jsonLength); json.copy(glb, 20);
  const binHeader = 20 + jsonLength;
  glb.writeUInt32LE(binLength, binHeader); glb.writeUInt32LE(0x004e4942, binHeader + 4); binary.copy(glb, binHeader + 8);
  validateGlb(glb);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  stats.nodes = gltf.nodes.length; stats.meshes = gltf.meshes.length;
  stats.materials = gltf.materials.length; stats.images = gltf.images?.length ?? 0;
  const manifest = {
    ...metadataCopy,
    format: 'glTF 2.0 binary', file: 'cave-restaurant.glb', byteLength: glb.length,
    allTexturesEmbedded: true, fullShellIncluded: true,
    statistics: stats,
    approximateModelBounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray(), units: 'metres (inferred model scale; not a site survey)' },
    extensionsUsed: gltf.extensionsUsed ?? [],
    warnings: [...warnings],
  };
  return { glb, manifest, document: gltf };
}

/** Lightweight structural checks; catches offsets, index bounds and NaN vertices. */
export function validateDocument(gltf, binary) {
  if (gltf.asset?.version !== '2.0') throw new Error('Expected glTF 2.0.');
  if (gltf.buffers?.length !== 1 || gltf.buffers[0].byteLength > binary.length) throw new Error('Invalid binary buffer length.');
  for (const [index, view] of (gltf.bufferViews ?? []).entries()) {
    const offset = view.byteOffset ?? 0;
    if (view.buffer !== 0 || offset % 4 !== 0 || offset < 0 || view.byteLength < 0 || offset + view.byteLength > gltf.buffers[0].byteLength) throw new Error(`Invalid bufferView ${index}.`);
  }
  function accessorValues(index) {
    const accessor = gltf.accessors[index];
    if (!accessor) throw new Error(`Missing accessor ${index}.`);
    const view = gltf.bufferViews[accessor.bufferView];
    const componentBytes = byteSizes[accessor.componentType], components = typeSizes[accessor.type];
    const stride = view?.byteStride ?? componentBytes * components;
    const start = (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const endInView = (accessor.byteOffset ?? 0) + Math.max(0, accessor.count - 1) * stride + componentBytes * components;
    if (!view || !componentBytes || !components || !Number.isInteger(accessor.count) || accessor.count <= 0 || endInView > view.byteLength || start % componentBytes) throw new Error(`Invalid accessor ${index}.`);
    const read = {
      5120: offset => binary.readInt8(offset), 5121: offset => binary.readUInt8(offset),
      5122: offset => binary.readInt16LE(offset), 5123: offset => binary.readUInt16LE(offset),
      5125: offset => binary.readUInt32LE(offset), 5126: offset => binary.readFloatLE(offset),
    }[accessor.componentType];
    return { accessor, at: (i, component = 0) => read(start + i * stride + component * componentBytes), components };
  }
  for (let index = 0; index < gltf.accessors.length; index++) {
    const values = accessorValues(index);
    for (let i = 0; i < values.accessor.count; i++) for (let c = 0; c < values.components; c++) finite(values.at(i, c), `accessor ${index}`);
  }
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives) {
    const position = gltf.accessors[primitive.attributes.POSITION];
    if (!position?.min || !position?.max) throw new Error('POSITION bounds are required.');
    for (const index of Object.values(primitive.attributes)) if (gltf.accessors[index]?.count !== position.count) throw new Error('Primitive attribute counts differ.');
    if (primitive.indices !== undefined) {
      const values = accessorValues(primitive.indices);
      for (let i = 0; i < values.accessor.count; i++) if (values.at(i) >= position.count || values.at(i) < 0) throw new Error('Primitive index exceeds vertex bounds.');
    }
    if (primitive.material !== undefined && !gltf.materials[primitive.material]) throw new Error('Missing primitive material.');
  }
  for (const node of gltf.nodes ?? []) {
    for (const child of node.children ?? []) if (!gltf.nodes[child]) throw new Error('Missing child node.');
    if (node.mesh !== undefined && !gltf.meshes[node.mesh]) throw new Error('Missing mesh.');
    for (const value of [...(node.matrix ?? []), ...(node.translation ?? []), ...(node.rotation ?? []), ...(node.scale ?? [])]) finite(value, 'node transform');
  }
  for (const image of gltf.images ?? []) if (!gltf.bufferViews[image.bufferView]) throw new Error('Missing embedded image bufferView.');
  for (const sampler of gltf.samplers ?? []) {
    if (![10497, 33071, 33648].includes(sampler.wrapS) || ![10497, 33071, 33648].includes(sampler.wrapT)) throw new Error('Invalid glTF texture wrapping.');
  }
  for (const texture of gltf.textures ?? []) {
    if (!gltf.images?.[texture.source] || !gltf.samplers?.[texture.sampler]) throw new Error('Missing texture source/sampler.');
  }
  return true;
}

export function validateGlb(glb) {
  if (glb.length < 28 || glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length) throw new Error('Invalid GLB header.');
  const jsonLength = glb.readUInt32LE(12);
  if (jsonLength % 4 || glb.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Invalid GLB JSON chunk.');
  const jsonEnd = 20 + jsonLength;
  if (jsonEnd + 8 > glb.length) throw new Error('Truncated GLB.');
  const document = JSON.parse(glb.subarray(20, jsonEnd).toString('utf8').trim());
  const binLength = glb.readUInt32LE(jsonEnd);
  if (binLength % 4 || glb.readUInt32LE(jsonEnd + 4) !== 0x004e4942 || jsonEnd + 8 + binLength !== glb.length) throw new Error('Invalid GLB BIN chunk.');
  validateDocument(document, glb.subarray(jsonEnd + 8));
  return document;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { buildRestaurant } = await import('../scene-builder.mjs');
  const { root, metadata } = await buildRestaurant();
  const { glb, manifest } = await exportSceneToGlb(root, metadata);
  const output = resolve(demoDirectory, 'models');
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'cave-restaurant.glb'), glb);
  await writeFile(resolve(output, 'scene-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ output, bytes: glb.length, ...manifest.statistics, warnings: manifest.warnings }, null, 2));
}
