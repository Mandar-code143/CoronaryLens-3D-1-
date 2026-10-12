"""
Extract a coronary-focused cardiac scene from Z-Anatomy (CC BY-SA 4.0, derived from BodyParts3D
CC BY-SA 2.1 JP) and export it as a single optimized GLB with stable, named nodes.

Run with Blender 4.x as a Python module (pip install bpy==4.5.0 on Python 3.11):

    python build_heart_glb.py <Startup.blend> <out.glb> [manifest.json]

Source file: https://github.com/Z-Anatomy/Models-of-human-anatomy  (Z-Anatomy.zip -> Z-Anatomy/Startup.blend)
Modifications are documented in docs/ANATOMY_ASSET.md.
"""
import sys, json, math
import bpy, mathutils

src, out_glb = sys.argv[1], sys.argv[2]
out_manifest = sys.argv[3] if len(sys.argv) > 3 else out_glb.replace(".glb", ".manifest.json")

COR_SCALE = 1.8   # visual caliber multiplier for the epicardial coronary tubes (documented modification)
WORLD_SCALE = 10.0  # metres -> ~1 unit-sized heart in the viewer

# (source object name, exported node id, label, group, kind, target)
PARTS = [
 ("Left ventricle", "heart_left_ventricle", "Left ventricle", "heart", "chamber", None),
 ("Right ventricle", "heart_right_ventricle", "Right ventricle", "heart", "chamber", None),
 ("Left atrium", "heart_left_atrium", "Left atrium", "heart", "chamber", None),
 ("Right atrium", "heart_right_atrium", "Right atrium", "heart", "chamber", None),
 ("Ascending aorta", "aorta_ascending", "Ascending aorta", "aorta", "vessel", None),
 ("Aortic arch", "aorta_arch", "Aortic arch", "aorta", "vessel", None),
 ("Thoracic aorta", "aorta_descending", "Descending thoracic aorta", "aorta", "vessel", None),
 ("Brachiocephalic trunk", "aorta_brachiocephalic", "Brachiocephalic trunk", "aorta", "vessel", None),
 ("Pulmonary trunk", "pulmonary_trunk", "Pulmonary trunk", "pulmonary", "vessel", None),
 ("Bifurcation of pulmonary trunk", "pulmonary_bifurcation", "Pulmonary trunk bifurcation", "pulmonary", "vessel", None),
 ("Left pulmonary artery", "pulmonary_left_artery", "Left pulmonary artery", "pulmonary", "vessel", None),
 ("Right pulmonary artery", "pulmonary_right_artery", "Right pulmonary artery", "pulmonary", "vessel", None),
 ("Superior vena cava", "vein_svc", "Superior vena cava", "veins", "vessel", None),
 ("Right superior pulmonary vein", "vein_pulm_rs", "Right superior pulmonary vein", "veins", "vessel", None),
 ("Right inferior pulmonary vein", "vein_pulm_ri", "Right inferior pulmonary vein", "veins", "vessel", None),
 ("Left superior pulmonary vein", "vein_pulm_ls", "Left superior pulmonary vein", "veins", "vessel", None),
 ("Left inferior pulmonary vein", "vein_pulm_li", "Left inferior pulmonary vein", "veins", "vessel", None),
 ("Left coronary artery", "coronary_left_main", "Left main coronary artery", "coronary", "coronary", None),
 ("Anterior interventricular artery", "coronary_lad", "Left anterior descending (anterior interventricular) artery", "coronary", "coronary", "LAD"),
 ("Septal branches of anterior interventricular artery", "coronary_lad_septal", "Septal branches of the LAD", "coronary", "coronary", "LAD"),
 ("Circumflex artery of heart", "coronary_lcx", "Left circumflex artery", "coronary", "coronary", "LCX"),
 ("Right coronary artery", "coronary_rca", "Right coronary artery", "coronary", "coronary", "RCA"),
 ("Right inferolateral branch of right coronary artery", "coronary_rca_branch", "Right inferolateral branch of the RCA", "coronary", "coronary", "RCA"),
 ("Great cardiac vein", "cardiac_vein_great", "Great cardiac vein", "cardiac_veins", "vein", None),
 ("Middle cardiac vein", "cardiac_vein_middle", "Middle cardiac vein", "cardiac_veins", "vein", None),
 ("Coronary sinus", "cardiac_coronary_sinus", "Coronary sinus", "cardiac_veins", "vein", None),
]

bpy.ops.wm.open_mainfile(filepath=src)
dg = bpy.context.evaluated_depsgraph_get()

# Boost coronary caliber *before* evaluation
for srcname, nid, label, group, kind, target in PARTS:
    o = bpy.data.objects[srcname]
    if kind == "coronary" and o.type == "CURVE":
        o.data.bevel_depth *= COR_SCALE
dg.update()

# gather evaluated geometry in world space
dg = bpy.context.evaluated_depsgraph_get()
tmp = []
all_pts = []
meta = []
for srcname, nid, label, group, kind, target in PARTS:
    o = bpy.data.objects[srcname]
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    me.transform(ev.matrix_world)
    all_pts += [v.co.copy() for v in me.vertices]
    tmp.append((nid, me))
    meta.append((nid, label, group, kind, target, srcname))

mn = mathutils.Vector([min(p[i] for p in all_pts) for i in range(3)])
mx = mathutils.Vector([max(p[i] for p in all_pts) for i in range(3)])
center = (mn + mx) / 2
print("bounds(m)", [round(x, 4) for x in mn], [round(x, 4) for x in mx])

# purge everything from the source file; only the copied evaluated meshes survive
scn = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
for other in list(bpy.data.scenes):
    if other != scn:
        bpy.data.scenes.remove(other)
keep = {me.as_pointer() for _, me in tmp}
for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.images, bpy.data.node_groups, bpy.data.texts):
    for item in list(coll):
        if item.users == 0 and item.as_pointer() not in keep:
            coll.remove(item)
col = bpy.data.collections.new("CoronaryLensHeart")
scn.collection.children.link(col)
mats = {}
def mat(name, rgba, rough):
    if name not in mats:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = rgba
        b.inputs["Roughness"].default_value = rough
        mats[name] = m
    return mats[name]
MAT = {"chamber": ("myocardium", (0.55, 0.22, 0.2, 1), 0.55),
       "vessel": ("great_vessel", (0.62, 0.35, 0.3, 1), 0.5),
       "coronary": ("coronary", (0.75, 0.2, 0.18, 1), 0.4),
       "vein": ("cardiac_vein", (0.3, 0.32, 0.5, 1), 0.45)}
stats = {}
for (nid, me), (_, label, group, kind, target, srcname) in zip(tmp, meta):
    me.transform(mathutils.Matrix.Translation(-center))
    me.transform(mathutils.Matrix.Scale(WORLD_SCALE, 4))
    # smooth shading
    for p in me.polygons: p.use_smooth = True
    me.update()
    me.name = nid
    ob = bpy.data.objects.new(nid, me)
    mname, rgba, rough = MAT[kind]
    me.materials.append(mat(mname, rgba, rough))
    ob["cl_label"] = label; ob["cl_group"] = group; ob["cl_kind"] = kind
    ob["cl_target"] = target or ""; ob["cl_source"] = srcname
    col.objects.link(ob)
    stats[nid] = dict(label=label, group=group, kind=kind, target=target, source=srcname,
                      vertices=len(me.vertices), triangles=sum(len(p.vertices) - 2 for p in me.polygons))

# Blender (Z-up, patient faces -Y) -> glTF (Y-up, patient faces +Z) is handled by the exporter (+Y up).
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_apply=False,
    export_yup=True, export_normals=True, export_texcoords=False, export_materials="EXPORT",
    export_extras=True, use_selection=False, export_cameras=False, export_lights=False,
    export_draco_mesh_compression_enable=False)

import os
manifest = dict(
  source="Z-Anatomy Startup.blend (Models-of-human-anatomy repo, master)",
  license="CC BY-SA 4.0 (Z-Anatomy); derived from BodyParts3D, CC BY-SA 2.1 JP",
  world_scale=WORLD_SCALE, coronary_caliber_multiplier=COR_SCALE,
  bounds_m=dict(min=[round(x,5) for x in mn], max=[round(x,5) for x in mx]),
  glb_bytes=os.path.getsize(out_glb),
  total_vertices=sum(s["vertices"] for s in stats.values()),
  total_triangles=sum(s["triangles"] for s in stats.values()),
  nodes=stats)
json.dump(manifest, open(out_manifest, "w"), indent=2)
print("GLB bytes", manifest["glb_bytes"], "tris", manifest["total_triangles"])
