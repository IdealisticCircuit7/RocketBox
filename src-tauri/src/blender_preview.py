import bpy, sys, os
source, target = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
for image in bpy.data.images:
    if image.source == 'FILE' and image.filepath and not image.packed_file and not os.path.isfile(bpy.path.abspath(image.filepath)):
        raise RuntimeError('Dependência de imagem indisponível: ' + image.filepath)
for library in bpy.data.libraries:
    if library.filepath and not os.path.isfile(bpy.path.abspath(library.filepath)):
        raise RuntimeError('Biblioteca vinculada indisponível: ' + library.filepath)
if len(bpy.data.objects) > 10000:
    raise RuntimeError('Cena excede 10000 objetos')
vertices = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == 'MESH')
if vertices > 2000000:
    raise RuntimeError('Cena excede 2 milhões de vértices de origem')
# No save_mainfile, pack, bake or arbitrary source text execution.
bpy.ops.export_scene.gltf(filepath=target, export_format='GLB', export_animations=True,
                          export_skins=True, export_apply=False, export_lights=False,
                          export_cameras=False, export_materials='EXPORT',
                          export_draco_mesh_compression_enable=False,
                          will_save_settings=False)
if not os.path.isfile(target) or os.path.getsize(target) > 32 * 1024 * 1024:
    raise RuntimeError('Prévia excede 32 MiB ou não foi criada')
