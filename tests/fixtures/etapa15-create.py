import bpy, sys, os
root = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, 'simple.blend'))
bpy.ops.mesh.primitive_uv_sphere_add(location=(3, 0, 0))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, 'multiple.blend'))
material = bpy.data.materials.new('Fixture Copper')
material.diffuse_color = (0.8, 0.25, 0.05, 1)
bpy.context.object.data.materials.append(material)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, 'materials.blend'))
mesh = bpy.context.object
bpy.ops.object.armature_add()
rig = bpy.context.object
modifier = mesh.modifiers.new('Fixture Armature', 'ARMATURE')
modifier.object = rig
group = mesh.vertex_groups.new(name='Bone')
group.add(list(range(len(mesh.data.vertices))), 1.0, 'REPLACE')
bone = rig.pose.bones['Bone']
bone.rotation_mode = 'XYZ'
bone.rotation_euler.z = 0
bone.keyframe_insert(data_path='rotation_euler', frame=1)
bone.rotation_euler.z = 0.8
bone.keyframe_insert(data_path='rotation_euler', frame=24)
bpy.context.scene.frame_end = 24
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, 'rig.blend'))
# Real FBX with a clip, produced by the installed exporter for the worker regression.
bpy.ops.export_scene.fbx(filepath=os.path.join(root, 'animated.fbx'), bake_anim=True)
material.use_nodes = True
tex = material.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.new('Missing fixture', 1, 1)
tex.image.source = 'FILE'
tex.image.filepath = '//missing-fixture.png'
material.node_tree.links.new(tex.outputs['Color'], material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, 'missing.blend'))
