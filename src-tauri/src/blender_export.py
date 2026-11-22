import bpy, sys, os

source, target, fmt = sys.argv[sys.argv.index('--') + 1:][:3]
fmt = fmt.lower().strip()
ext = os.path.splitext(source)[1].lower().lstrip('.')

bpy.context.preferences.filepaths.use_scripts_auto_execute = False

if ext == 'blend':
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == 'fbx':
        bpy.ops.import_scene.fbx(filepath=source)
    elif ext == 'obj':
        if hasattr(bpy.ops.wm, 'obj_import'):
            bpy.ops.wm.obj_import(filepath=source)
        else:
            bpy.ops.import_scene.obj(filepath=source)
    elif ext in ('glb', 'gltf'):
        bpy.ops.import_scene.gltf(filepath=source)
    else:
        raise RuntimeError('Formato de origem não suportado para conversão: ' + ext)

if len(bpy.data.objects) > 10000:
    raise RuntimeError('Cena excede 10000 objetos')

if fmt == 'fbx':
    bpy.ops.export_scene.fbx(filepath=target, path_mode='COPY', embed_textures=True)
elif fmt == 'obj':
    if hasattr(bpy.ops.wm, 'obj_export'):
        bpy.ops.wm.obj_export(filepath=target)
    else:
        bpy.ops.export_scene.obj(filepath=target)
elif fmt == 'glb':
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format='GLB',
        export_materials='EXPORT',
        export_draco_mesh_compression_enable=False,
        will_save_settings=False,
    )
elif fmt == 'gltf':
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format='GLTF_SEPARATE',
        export_materials='EXPORT',
        export_draco_mesh_compression_enable=False,
        will_save_settings=False,
    )
else:
    raise RuntimeError('Formato de destino inválido: ' + fmt)

if not os.path.isfile(target) or os.path.getsize(target) == 0:
    raise RuntimeError('Arquivo convertido não foi gerado corretamente')
